import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  const maybeParams = (context as { params?: unknown })?.params;

  // Next pode entregar params direto ou como Promise
  const raw =
    maybeParams && typeof (maybeParams as { then?: unknown }).then === "function"
      ? await (maybeParams as Promise<{ id?: string }>)
      : (maybeParams as { id?: string } | undefined);

  return String(raw?.id ?? "").trim();
}

// GET /api/events/[id]/confirmados
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        type: true,
        eventDate: true,
        location: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    const confirmations = await prisma.eventConfirmation.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        event,
        confirmations: confirmations.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt,
          // sem userId no model atual -> não dá pra inferir aqui
          authenticated: false,
        })),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/[id]/confirmados] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro ao carregar confirmações do evento." }, { status: 500 });
  }
}

// POST /api/events/[id]/confirmados
// - cria EventConfirmation
// - se estiver logado, cria um Ticket NOVO (vários por evento)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, type: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (event.type !== "FREE") {
      return NextResponse.json(
        { error: "Confirmação pelo link aberto disponível apenas para eventos FREE." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = String((body as { name?: unknown })?.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Nome é obrigatório para confirmar a presença." }, { status: 400 });
    }

    const sessionUser = await getSessionUser(request);

    // 1) confirma presença (sem userId, pois o model atual não tem)
    const confirmation = await prisma.eventConfirmation.create({
      data: {
        eventId: event.id,
        name,
      },
    });

    // 2) se estiver logado, cria Ticket NOVO (não atualiza ticket antigo)
    if (sessionUser?.id) {
      await prisma.ticket.create({
        data: {
          eventId: event.id,
          userId: sessionUser.id,
          attendeeName: name,
          status: "ACTIVE",
        },
      });
    }

    return NextResponse.json(
      {
        id: confirmation.id,
        name: confirmation.name,
        createdAt: confirmation.createdAt,
        authenticated: !!sessionUser?.id,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/events/[id]/confirmados] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro ao registrar a confirmação de presença." }, { status: 500 });
  }
}
