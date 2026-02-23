import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

const VALID_TYPES = ["PRE_PAGO", "POS_PAGO", "FREE"] as const;
type EventType = (typeof VALID_TYPES)[number];

type RoleForCurrentUser = "ORGANIZER" | "POST_PARTICIPANT" | "INVITED";

async function isAdminUser(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return u?.role === "ADMIN";
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

async function purgeExpiredHiddenForUser(userId: string) {
  const now = new Date();
  await prisma.hiddenEvent.deleteMany({
    where: { userId, purgeAt: { not: null, lte: now } },
  });
}

async function safeAutoPurgeExpiredEvents() {
  const now = new Date();

  const expired = await prisma.event.findMany({
    where: {
      deletedAt: { not: null },
      purgeAt: { not: null, lte: now },
    },
    select: { id: true, type: true, isClosed: true },
    orderBy: { purgeAt: "asc" },
    take: 50,
  });

  for (const ev of expired) {
    const [ticketCount, paymentCount] = await Promise.all([
      prisma.ticket.count({ where: { eventId: ev.id } }),
      prisma.payment.count({ where: { eventId: ev.id } }),
    ]);
    if (ticketCount > 0 || paymentCount > 0) continue;

    if (ev.type === "POS_PAGO") {
      if (!ev.isClosed) continue;

      const pendingPostPays = await prisma.postEventPayment.count({
        where: { eventId: ev.id, status: { not: "PAID" } },
      });
      if (pendingPostPays > 0) continue;

      const expCount = await prisma.postEventExpense.count({
        where: { eventId: ev.id },
      });
      if (expCount > 0) continue;
    }

    try {
      await prisma.event.delete({ where: { id: ev.id } });
    } catch (err) {
      console.error("[AUTO PURGE] Falhou ao apagar evento:", ev.id, err);
    }
  }
}

// GET /api/events
// - por padrão: NÃO retorna eventos na lixeira (deletedAt) e NÃO retorna eventos ocultos (HiddenEvent)
// - se includeDeleted=1: retorna também lixeira do evento e lixeira pessoal, para montar a aba "Lixeira"
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const includeDeleted = url.searchParams.get("includeDeleted") === "1";

  // housekeeping
  try {
    await purgeExpiredHiddenForUser(user.id);
  } catch (err) {
    console.error("[GET /api/events] purge hidden falhou:", err);
  }
  try {
    await safeAutoPurgeExpiredEvents();
  } catch (err) {
    console.error("[GET /api/events] auto purge falhou:", err);
  }

  // Backfill organizerId
  try {
    await prisma.event.updateMany({
      where: { organizerId: null },
      data: { organizerId: user.id },
    });
  } catch (err) {
    console.error("[GET /api/events] backfill organizerId falhou:", err);
  }

  // carrega ocultos do usuário (para filtrar / ou marcar)
  const hidden = await prisma.hiddenEvent.findMany({
    where: { userId: user.id },
    select: { eventId: true, hiddenAt: true, purgeAt: true },
  });
  const hiddenByEventId = new Map(hidden.map((h) => [h.eventId, h]));

  const notDeletedFilter = includeDeleted ? {} : { deletedAt: null as null };
  const notHiddenFilter = includeDeleted
    ? {}
    : {
        NOT: { hiddenBy: { some: { userId: user.id } } },
      };

  const organizerEvents = await prisma.event.findMany({
    where: { organizerId: user.id, ...notDeletedFilter, ...notHiddenFilter },
    orderBy: { createdAt: "desc" },
  });

  const participantEvents = await prisma.event.findMany({
    where: {
      type: "POS_PAGO",
      postParticipants: { some: { userId: user.id } },
      ...notDeletedFilter,
      ...notHiddenFilter,
    },
    orderBy: { createdAt: "desc" },
  });

  // ✅ Eventos FREE onde o usuário foi convidado explicitamente (EventGuest.userId)
  const invitedFreeEvents = await prisma.event.findMany({
    where: {
      type: "FREE",
      guests: { some: { userId: user.id } },
      ...notDeletedFilter,
      ...notHiddenFilter,
    },
    orderBy: { createdAt: "desc" },
  });

  // ✅ Tickets do usuário (para marcar eventos com ingresso)
  const ticketsForUser = await prisma.ticket.findMany({
    where: { userId: user.id },
    select: { id: true, eventId: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  function mapEventWithRole(
    ev: (typeof organizerEvents)[number],
    role: RoleForCurrentUser,
    isOrganizer: boolean,
  ) {
    const h = hiddenByEventId.get(ev.id);
    return {
      ...ev,
      roleForCurrentUser: role,
      isOrganizer,
      hiddenAt: h?.hiddenAt ?? null,
      hiddenPurgeAt: h?.purgeAt ?? null,
    };
  }

  const byId = new Map<string, ReturnType<typeof mapEventWithRole>>();

  // ORGANIZER
  for (const ev of organizerEvents) {
    byId.set(ev.id, mapEventWithRole(ev, "ORGANIZER", true));
  }

  // POS_PAGO - participante do racha
  for (const ev of participantEvents) {
    if (byId.has(ev.id)) continue;
    byId.set(ev.id, mapEventWithRole(ev, "POST_PARTICIPANT", false));
  }

  // Se includeDeleted=1, também precisamos adicionar os ocultos (mesmo que filtro acima não os traga)
  if (includeDeleted) {
    const hiddenEventIds = hidden.map((h) => h.eventId);
    if (hiddenEventIds.length) {
      const hiddenEvents = await prisma.event.findMany({
        where: {
          id: { in: hiddenEventIds },
        },
        orderBy: { createdAt: "desc" },
      });

      for (const ev of hiddenEvents) {
        // Se já tiver (organizer/participant), mantém. Se não tiver, adiciona como "POST_PARTICIPANT" falso.
        if (!byId.has(ev.id)) {
          byId.set(ev.id, mapEventWithRole(ev, "POST_PARTICIPANT", false));
        }
      }
    }
  }

  // ✅ Adiciona eventos FREE em que o usuário foi convidado (convite pendente ou com ingresso)
  for (const ev of invitedFreeEvents) {
    if (byId.has(ev.id)) {
      const existing = byId.get(ev.id)!;
      // se ele não é organizador nem participante POS, garante que tenha papel de convidado
      if (!existing.isOrganizer && existing.roleForCurrentUser !== "POST_PARTICIPANT") {
        existing.roleForCurrentUser =
          (existing.roleForCurrentUser as RoleForCurrentUser | undefined) ??
          "INVITED";
      }
      continue;
    }

    byId.set(ev.id, mapEventWithRole(ev as any, "INVITED", false));
  }

  // ✅ Marca eventos que possuem ingresso para o usuário atual
  const ticketByEventId = new Map<string, { id: string; status: string }>();
  for (const t of ticketsForUser) {
    if (!ticketByEventId.has(t.eventId)) {
      ticketByEventId.set(t.eventId, { id: t.id, status: t.status });
    }
  }

  for (const [eventId, ticketInfo] of ticketByEventId) {
    const ev = byId.get(eventId);
    if (!ev) continue;

    (ev as any).hasTicketForCurrentUser = true;
    (ev as any).ticketIdForCurrentUser = ticketInfo.id;

    // Para FREE onde o usuário não é organizador, assume papel de convidado com ingresso
    if (!ev.isOrganizer && ev.type === "FREE") {
      ev.roleForCurrentUser =
        (ev.roleForCurrentUser as RoleForCurrentUser | undefined) ?? "INVITED";
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });

  return NextResponse.json(merged, { status: 200 });
}

// POST /api/events – cria evento
export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "").toUpperCase() as EventType;

    if (!name) {
      return NextResponse.json(
        { error: "Nome do evento é obrigatório." },
        { status: 400 },
      );
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "Tipo de evento inválido." },
        { status: 400 },
      );
    }

    if (type === "PRE_PAGO") {
      const admin = await isAdminUser(user.id);
      if (!admin) {
        return NextResponse.json(
          {
            error:
              "Evento pré-pago ainda não está disponível para sua conta.",
          },
          { status: 403 },
        );
      }
    }

    let event = await prisma.event.create({
      data: { name, type, organizerId: user.id },
    });

    const shouldGenerateInviteSlug =
      type === "PRE_PAGO" || type === "POS_PAGO";
    if (shouldGenerateInviteSlug) {
      const randomPart = Math.random().toString(36).slice(2, 8);
      const middle = type === "PRE_PAGO" ? "o" : "r";
      const inviteSlug = `${event.id.slice(0, 6)}-${middle}-${randomPart}`;
      event = await prisma.event.update({
        where: { id: event.id },
        data: { inviteSlug },
      });
    }

    if (type === "POS_PAGO") {
      try {
        await prisma.postEventParticipant.create({
          data: { eventId: event.id, userId: user.id, name: user.name },
        });
      } catch (err) {
        console.error(
          "[POST /api/events] erro ao criar participante do organizador:",
          err,
        );
      }
    }

    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    console.error("Erro ao criar evento:", err);
    return NextResponse.json(
      { error: "Erro ao criar evento." },
      { status: 500 },
    );
  }
}

// PATCH /api/events – atualização genérica (mantido bem próximo do seu padrão)
export async function PATCH(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const id = String(body.id ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório para atualizar." },
        { status: 400 },
      );
    }

    const existing = await prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true, deletedAt: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (existing.deletedAt) {
      return NextResponse.json(
        { error: "Este evento está na lixeira. Restaure para editar." },
        { status: 400 },
      );
    }

    if (existing.organizerId && existing.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Você não tem permissão para alterar este evento." },
        { status: 403 },
      );
    }

    const data: {
      name?: string;
      description?: string | null;
      location?: string | null;
      inviteSlug?: string | null;
      eventDate?: Date | null;
      ticketPrice?: string | null;
      paymentLink?: string | null;
      salesStart?: Date | null;
      salesEnd?: Date | null;
      organizerId?: string;
    } = {};

    if (typeof body.name === "string") {
      const v = body.name.trim();
      if (!v) {
        return NextResponse.json(
          { error: "Nome do evento não pode ser vazio." },
          { status: 400 },
        );
      }
      data.name = v;
    }

    if (
      typeof body.description === "string" ||
      body.description === null
    ) {
      data.description = body.description;
    }
    if (typeof body.location === "string" || body.location === null) {
      data.location = body.location;
    }

    if (typeof body.inviteSlug === "string") {
      const v = body.inviteSlug.trim();
      if (!v || v.toLowerCase() === "undefined" || v.toLowerCase() === "null") {
        data.inviteSlug = null;
      } else {
        data.inviteSlug = v;
      }
    } else if (body.inviteSlug === null) {
      data.inviteSlug = null;
    }

    if (
      typeof body.ticketPrice === "string" ||
      body.ticketPrice === null
    ) {
      data.ticketPrice = body.ticketPrice;
    }
    if (
      typeof body.paymentLink === "string" ||
      body.paymentLink === null
    ) {
      data.paymentLink = body.paymentLink;
    }

    if (typeof body.eventDate === "string" || body.eventDate === null) {
      if (!body.eventDate) {
        data.eventDate = null;
      } else {
        const d = new Date(body.eventDate);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Data do evento inválida." },
            { status: 400 },
          );
        }
        data.eventDate = d;
      }
    }

    if (typeof body.salesStart === "string" || body.salesStart === null) {
      if (!body.salesStart) {
        data.salesStart = null;
      } else {
        const d = new Date(body.salesStart);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Data de início das vendas inválida." },
            { status: 400 },
          );
        }
        data.salesStart = d;
      }
    }

    if (typeof body.salesEnd === "string" || body.salesEnd === null) {
      if (!body.salesEnd) {
        data.salesEnd = null;
      } else {
        const d = new Date(body.salesEnd);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Data de fim das vendas inválida." },
            { status: 400 },
          );
        }
        data.salesEnd = d;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo para atualizar." },
        { status: 400 },
      );
    }

    if (!existing.organizerId) {
      data.organizerId = user.id;
    }

    const updated = await prisma.event.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error("Erro ao atualizar evento:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar evento." },
      { status: 500 },
    );
  }
}

// DELETE /api/events – compat: manda pra lixeira do evento (organizador)
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const existing = await prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true, deletedAt: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (existing.organizerId && existing.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Somente o organizador pode excluir este evento." },
        { status: 403 },
      );
    }

    if (existing.deletedAt) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const now = new Date();
    await prisma.event.update({
      where: { id },
      data: {
        deletedAt: now,
        purgeAt: addDays(now, 30),
        organizerId: existing.organizerId ?? user.id,
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Erro ao excluir evento:", err);
    return NextResponse.json(
      { error: "Erro ao excluir evento." },
      { status: 500 },
    );
  }
}
