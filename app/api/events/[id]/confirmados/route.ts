/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  const id = String(rawParams?.id ?? "").trim();
  return id;
}

// GET /api/events/[id]/confirmados
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const id = await getEventIdFromContext(context);

    if (!id) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

    const guests = await prisma.eventGuest.findMany({
      where: { eventId: id, confirmedAt: { not: null } },
      orderBy: { confirmedAt: "asc" },
    });

    const confirmations = guests.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.confirmedAt ?? g.createdAt,
    }));

    return NextResponse.json({ confirmations }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/events/[id]/confirmados] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro ao carregar lista de confirmados." }, { status: 500 });
  }
}

// POST /api/events/[id]/confirmados
// - registra presença (EventGuest confirmado)
// - se estiver logado: cria Ticket (eventId+userId) caso não exista, com attendeeName
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const id = await getEventIdFromContext(context);

    if (!id) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json({ error: "Nome é obrigatório para confirmar presença." }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true, type: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (event.type !== "FREE") {
      return NextResponse.json(
        { error: "Confirmação genérica está disponível apenas para eventos FREE." },
        { status: 400 }
      );
    }

    const now = new Date();
    const randomPart = Math.random().toString(36).slice(2, 8);
    const slug = `${id.slice(0, 6)}-c-${randomPart}`;

    const guest = await prisma.eventGuest.create({
      data: { eventId: event.id, name, slug, confirmedAt: now },
    });

    const sessionUser = getSessionUser(request);

    if (sessionUser?.id) {
      const existing = await prisma.ticket.findFirst({
        where: { eventId: event.id, userId: sessionUser.id },
        select: { id: true },
      });

      if (!existing) {
        await prisma.ticket.create({
          data: {
            eventId: event.id,
            userId: sessionUser.id,
            attendeeName: name,
          },
        });
      } else {
        await prisma.ticket.update({
          where: { id: existing.id },
          data: { attendeeName: name, status: "ACTIVE" },
        });
      }
    }

    return NextResponse.json(
      { id: guest.id, name: guest.name, slug: guest.slug, createdAt: guest.confirmedAt ?? guest.createdAt },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/events/[id]/confirmados] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro ao registrar confirmação de presença." }, { status: 500 });
  }
}
