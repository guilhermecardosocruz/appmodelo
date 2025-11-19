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
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const id = await getEventIdFromContext(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 }
      );
    }

    const confirmations = await prisma.eventConfirmation.findMany({
      where: { eventId: id },
      orderBy: { createdAt: "asc" },
    });

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

    const confirmation = await prisma.eventConfirmation.create({
      data: {
        eventId: event.id,
        name,
      },
    });

    return NextResponse.json(confirmation, { status: 201 });
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
