import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

const VALID_TYPES = ["PRE_PAGO", "POS_PAGO", "FREE"] as const;
type EventType = (typeof VALID_TYPES)[number];

type RoleForCurrentUser = "ORGANIZER" | "POST_PARTICIPANT";

async function isAdminUser(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return u?.role === "ADMIN";
}

// GET /api/events – lista eventos do organizador + eventos pós-pago onde o usuário é participante
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // 🔁 Backfill: eventos antigos sem organizerId voltam para o usuário atual
  try {
    await prisma.event.updateMany({
      where: { organizerId: null },
      data: { organizerId: user.id },
    });
  } catch (err) {
    console.error(
      "[GET /api/events] Erro ao vincular eventos antigos ao organizador:",
      err,
    );
  }

  // 1) Eventos em que o usuário é ORGANIZADOR
  const organizerEvents = await prisma.event.findMany({
    where: { organizerId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // 2) Eventos POS_PAGO em que o usuário é participante no módulo pós-pago
  const participantEvents = await prisma.event.findMany({
    where: {
      type: "POS_PAGO",
      postParticipants: {
        some: {
          userId: user.id,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 3) Merge sem duplicar, e marcando a role/isOrganizer
  function mapEventWithRole(
    event: (typeof organizerEvents)[number],
    role: RoleForCurrentUser,
    isOrganizer: boolean,
  ) {
    return {
      ...event,
      roleForCurrentUser: role,
      isOrganizer,
    };
  }

  const byId = new Map<string, ReturnType<typeof mapEventWithRole>>();

  for (const ev of organizerEvents) {
    byId.set(ev.id, mapEventWithRole(ev, "ORGANIZER", true));
  }

  for (const ev of participantEvents) {
    if (byId.has(ev.id)) {
      // já veio como ORGANIZER, mantemos como organizador
      continue;
    }
    byId.set(ev.id, mapEventWithRole(ev, "POST_PARTICIPANT", false));
  }

  const merged = Array.from(byId.values()).sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da; // mais recentes primeiro
  });

  return NextResponse.json(merged, { status: 200 });
}

// POST /api/events – cria um evento
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

    // 🔒 Gate: PRE_PAGO só para ADMIN
    if (type === "PRE_PAGO") {
      const admin = await isAdminUser(user.id);
      if (!admin) {
        return NextResponse.json(
          { error: "Evento pré-pago ainda não está disponível para sua conta." },
          { status: 403 },
        );
      }
    }

    // Cria o evento base com organizerId
    let event = await prisma.event.create({
      data: { name, type, organizerId: user.id },
    });

    // Para eventos PRE_PAGO e POS_PAGO, gera automaticamente um inviteSlug
    const shouldGenerateInviteSlug = type === "PRE_PAGO" || type === "POS_PAGO";

    if (shouldGenerateInviteSlug) {
      const randomPart = Math.random().toString(36).slice(2, 8);
      const middle = type === "PRE_PAGO" ? "o" : "r";
      const inviteSlug = `${event.id.slice(0, 6)}-${middle}-${randomPart}`;

      event = await prisma.event.update({
        where: { id: event.id },
        data: { inviteSlug },
      });
    }

    // Para eventos POS_PAGO, o organizador já entra como participante do racha
    if (type === "POS_PAGO") {
      try {
        await prisma.postEventParticipant.create({
          data: {
            eventId: event.id,
            userId: user.id,
            name: user.name,
          },
        });
      } catch (err) {
        console.error(
          "[POST /api/events] Erro ao criar participante padrão do organizador:",
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

// PATCH /api/events – atualiza um evento
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
      select: { id: true, organizerId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
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

    if (typeof body.description === "string" || body.description === null) {
      data.description = body.description;
    }

    if (typeof body.location === "string" || body.location === null) {
      data.location = body.location;
    }

    // 🔐 inviteSlug: nunca gravar "undefined" / "null" como string
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

    if (typeof body.ticketPrice === "string" || body.ticketPrice === null) {
      data.ticketPrice = body.ticketPrice;
    }

    if (typeof body.paymentLink === "string" || body.paymentLink === null) {
      data.paymentLink = body.paymentLink;
    }

    // Trata eventDate vindo da tela (string "YYYY-MM-DD" ou ISO ou null)
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

    // Trata salesStart
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

    // Trata salesEnd
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

    // Se era um evento antigo sem dono, "adota" para o usuário atual
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

// DELETE /api/events – exclui um evento
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const existing = await prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (existing.organizerId && existing.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Você não tem permissão para excluir este evento." },
        { status: 403 },
      );
    }

    await prisma.event.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Erro ao excluir evento:", err);
    return NextResponse.json(
      { error: "Erro ao excluir evento." },
      { status: 500 },
    );
  }
}
