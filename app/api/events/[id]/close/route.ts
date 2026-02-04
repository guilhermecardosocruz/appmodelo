import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};

  if (
    rawParams &&
    typeof (rawParams as { then?: unknown }).then === "function"
  ) {
    rawParams = await (rawParams as Promise<{ id?: string }>);
  }

  const paramsObj = rawParams as { id?: string } | undefined;
  return String(paramsObj?.id ?? "").trim();
}

// POST /api/events/[id]/close
// Apenas organizador de evento POS_PAGO pode encerrar o racha.
// Depois de encerrado, o fluxo de pagamento é liberado na UI.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const eventId = await getEventIdFromContext(context);
    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        type: true,
        organizerId: true,
        isClosed: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (event.type !== "POS_PAGO") {
      return NextResponse.json(
        {
          error:
            "Encerramento de racha só é permitido em eventos POS_PAGO.",
        },
        { status: 400 },
      );
    }

    const isOrganizer =
      !event.organizerId || event.organizerId === user.id;

    if (!isOrganizer) {
      return NextResponse.json(
        {
          error:
            "Apenas o organizador pode encerrar o racha deste evento.",
        },
        { status: 403 },
      );
    }

    // Se já estiver encerrado, apenas devolve o estado atual
    if (event.isClosed) {
      return NextResponse.json(
        {
          id: event.id,
          isClosed: true,
        },
        { status: 200 },
      );
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data: {
        isClosed: true,
        // Adota eventos antigos sem dono para o organizador atual
        organizerId: event.organizerId ?? user.id,
      },
      select: {
        id: true,
        isClosed: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error("[POST /api/events/[id]/close] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao encerrar o racha do evento." },
      { status: 500 },
    );
  }
}
