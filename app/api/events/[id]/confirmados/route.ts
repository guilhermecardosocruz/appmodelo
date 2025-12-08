/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
// Agora busca em EventGuest apenas quem já confirmou (confirmedAt != null)
// e devolve no formato que o ConfirmadosClient espera.
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const id = await getEventIdFromContext(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 }
      );
    }

    const guests = await prisma.eventGuest.findMany({
      where: {
        eventId: id,
        confirmedAt: {
          not: null,
        },
      },
      orderBy: {
        confirmedAt: "asc",
      },
    });

    const confirmations = guests.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.confirmedAt ?? g.createdAt,
    }));

    return NextResponse.json(
      { confirmations },
      { status: 200 }
    );
  } catch (err) {
    console.error(
      "[GET /api/events/[id]/confirmados] Erro inesperado:",
      err
    );
    return NextResponse.json(
      { error: "Erro ao carregar lista de confirmados." },
      { status: 500 }
    );
  }
}

// POST /api/events/[id]/confirmados
// Usado pelo convite genérico (/convite/[slug]) para registrar uma presença.
// Cria um EventGuest com slug gerado e confirmedAt = agora.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const id = await getEventIdFromContext(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Nome é obrigatório para confirmar presença." },
        { status: 400 }
      );
    }

    // garante que o evento existe
    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 }
      );
    }

    const now = new Date();
    const randomPart = Math.random().toString(36).slice(2, 8);
    const slug = `${id.slice(0, 6)}-c-${randomPart}`;

    const guest = await prisma.eventGuest.create({
      data: {
        eventId: event.id,
        name,
        slug,          // string, nunca null → corrige o erro do build
        confirmedAt: now,
      },
    });

    return NextResponse.json(
      {
        id: guest.id,
        name: guest.name,
        createdAt: guest.confirmedAt ?? guest.createdAt,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error(
      "[POST /api/events/[id]/confirmados] Erro inesperado:",
      err
    );
    return NextResponse.json(
      { error: "Erro ao registrar confirmação de presença." },
      { status: 500 }
    );
  }
}
