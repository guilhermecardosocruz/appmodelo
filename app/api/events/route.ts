import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

const VALID_TYPES = ["PRE_PAGO", "POS_PAGO", "FREE"] as const;
type EventType = (typeof VALID_TYPES)[number];

type EventRole = "ORGANIZER" | "POST_PARTICIPANT";

// GET /api/events – lista eventos do usuário:
// - como ORGANIZADOR
// - ou como PARTICIPANTE pós-pago
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

  const events = await prisma.event.findMany({
    where: {
      OR: [
        // eventos em que o usuário é organizador
        { organizerId: user.id },
        // eventos pós-pago em que o usuário é participante
        {
          postParticipants: {
            some: {
              userId: user.id,
            },
          },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      organizerId: true,
    },
  });

  const payload = events.map((event) => {
    const roleForCurrentUser: EventRole =
      event.organizerId === user.id ? "ORGANIZER" : "POST_PARTICIPANT";

    return {
      id: event.id,
      name: event.name,
      type: event.type,
      createdAt: event.createdAt,
      roleForCurrentUser,
    };
  });

  return NextResponse.json(payload, { status: 200 });
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

    // Cria o evento base
    const event = await prisma.event.create({
      data: { name, type, organizerId: user.id },
    });

    // Para eventos PRE_PAGO, já gera automaticamente um inviteSlug
    // para uso no link aberto de convite (/convite/[slug]).
    // Ex.: abc123-o-xyz789
    if (type === "PRE_PAGO") {
      const randomPart = Math.random().toString(36).slice(2, 8);
      const inviteSlug = `${event.id.slice(0, 6)}-o-${randomPart}`;

      const updated = await prisma.event.update({
        where: { id: event.id },
        data: { inviteSlug },
      });

      return NextResponse.json(updated, { status: 201 });
    }

    // Para FREE e POS_PAGO, por enquanto mantém o comportamento atual
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

    if (typeof body.inviteSlug === "string" || body.inviteSlug === null) {
      data.inviteSlug = body.inviteSlug;
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
