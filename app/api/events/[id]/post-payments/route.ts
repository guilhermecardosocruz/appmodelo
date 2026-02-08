import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PostEventPaymentStatus } from "@prisma/client";

/**
 * NEXT 16+ route typing:
 * context.params é agora: Promise<{ id: string }>
 */
type NextContext = {
  params: Promise<{ id: string }>;
};

type PostBody = {
  participantId?: string;
  amount?: number;
};

/**
 * GET /api/events/[id]/post-payments?participantId=...
 *
 * Retorna o último pagamento (status PAID) de um participante nesse evento.
 */
export async function GET(req: NextRequest, context: NextContext) {
  try {
    const { id: eventId } = await context.params;
    const participantId =
      req.nextUrl.searchParams.get("participantId") ?? "";

    if (!eventId || !participantId) {
      return NextResponse.json(
        { error: "Evento e participante são obrigatórios." },
        { status: 400 },
      );
    }

    const payment = await prisma.postEventPayment.findFirst({
      where: {
        eventId,
        participantId,
        status: PostEventPaymentStatus.PAID,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!payment) {
      return NextResponse.json(
        { error: "Nenhum pagamento encontrado para este participante." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      payment: {
        id: payment.id,
        eventId: payment.eventId,
        participantId: payment.participantId,
        amount: Number(payment.amount),
        status: payment.status,
        createdAt: payment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error(
      "[GET /api/events/[id]/post-payments] erro ao carregar comprovante:",
      error,
    );
    return NextResponse.json(
      { error: "Erro ao carregar comprovante de pagamento." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/events/[id]/post-payments
 *
 * Cria um pagamento de acerto do racha.
 * Como é mock, já marcamos como PAID.
 */
export async function POST(req: NextRequest, context: NextContext) {
  try {
    const { id: eventId } = await context.params;

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as PostBody;
    const participantId = (body.participantId ?? "").trim();
    const amount = Number(body.amount);

    if (!participantId) {
      return NextResponse.json(
        { error: "ID do participante é obrigatório." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Valor de pagamento inválido." },
        { status: 400 },
      );
    }

    const participant = await prisma.postEventParticipant.findFirst({
      where: {
        id: participantId,
        eventId,
        isActive: true,
      },
      include: {
        event: true,
      },
    });

    if (!participant || !participant.event) {
      return NextResponse.json(
        { error: "Participante ou evento não encontrado." },
        { status: 404 },
      );
    }

    if (!participant.event.isClosed) {
      return NextResponse.json(
        {
          error:
            "O racha ainda não foi encerrado. Só é possível pagar depois do encerramento.",
        },
        { status: 400 },
      );
    }

    // Como é mock da Zoop, já marcamos como PAID
    const payment = await prisma.postEventPayment.create({
      data: {
        eventId,
        participantId,
        amount,
        status: PostEventPaymentStatus.PAID,
        provider: "ZOOP_MOCK",
        providerPaymentId: null,
        providerPayload: {
          source: "mock",
          requestedAmount: amount,
        },
      },
    });

    return NextResponse.json({
      payment: {
        id: payment.id,
        status: payment.status,
        amount: Number(payment.amount),
      },
    });
  } catch (error) {
    console.error(
      "[POST /api/events/[id]/post-payments] erro ao criar pagamento:",
      error,
    );
    return NextResponse.json(
      { error: "Erro ao iniciar pagamento do racha." },
      { status: 500 },
    );
  }
}
