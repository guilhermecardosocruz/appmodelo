import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};
  if (rawParams && typeof (rawParams as { then?: unknown }).then === "function") {
    rawParams = await (rawParams as Promise<{ id?: string }>);
  }
  const paramsObj = rawParams as { id?: string } | undefined;
  return String(paramsObj?.id ?? "").trim();
}

// POST /api/events/[id]/post-payments
// Registra um pagamento do racha (base para integrar Zoop)
// Body: { participantId: string, amount: number | string }
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

    const body = (await request.json().catch(() => null)) as
      | { participantId?: unknown; amount?: unknown }
      | null;

    const participantId = String(body?.participantId ?? "").trim();
    const rawAmount = body?.amount;

    if (!participantId) {
      return NextResponse.json(
        { error: "Participante é obrigatório." },
        { status: 400 },
      );
    }

    if (rawAmount === null || rawAmount === undefined) {
      return NextResponse.json(
        { error: "Valor do pagamento é obrigatório." },
        { status: 400 },
      );
    }

    const amountNumber =
      typeof rawAmount === "number"
        ? rawAmount
        : Number(String(rawAmount).replace(".", "").replace(",", "."));

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return NextResponse.json(
        { error: "Valor do pagamento deve ser maior que zero." },
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
        { error: "Pagamentos pós-pago só existem em eventos POS_PAGO." },
        { status: 400 },
      );
    }

    if (!event.isClosed) {
      return NextResponse.json(
        {
          error:
            "O racha ainda não foi encerrado. Os pagamentos só podem ser feitos depois do encerramento.",
        },
        { status: 400 },
      );
    }

    const participant = await prisma.postEventParticipant.findFirst({
      where: {
        id: participantId,
        eventId,
        isActive: true,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!participant) {
      return NextResponse.json(
        {
          error:
            "Participante não encontrado neste evento ou removido do racha.",
        },
        { status: 404 },
      );
    }

    const isOrganizer =
      !event.organizerId || event.organizerId === user.id;
    const isSelf = participant.userId === user.id;

    if (!isOrganizer && !isSelf) {
      return NextResponse.json(
        {
          error:
            "Você não tem permissão para registrar pagamento para este participante.",
        },
        { status: 403 },
      );
    }

    // TODO: aqui vamos integrar com a API da Zoop (criar cobrança, PIX, cartão, etc.)
    // Por enquanto, apenas registramos um pagamento pendente no banco.
    const payment = await prisma.postEventPayment.create({
      data: {
        eventId,
        participantId: participant.id,
        amount: amountNumber,
        status: "PENDING",
        provider: "ZOOP",
      },
    });

    return NextResponse.json(
      {
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        message:
          "Pagamento registrado como pendente. Integração com Zoop ainda será configurada.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/events/[id]/post-payments] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao registrar pagamento." },
      { status: 500 },
    );
  }
}
