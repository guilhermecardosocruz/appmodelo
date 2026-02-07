import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type NextContext = {
  params: Promise<{ id: string }>;
};

type Body = {
  participantId?: string;
  amount?: number | string;
};

export async function POST(req: NextRequest, context: NextContext) {
  try {
    const { id: eventId } = await context.params;

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => null)) as Body | null;

    const participantId = (body?.participantId ?? "").toString().trim();

    if (!participantId) {
      return NextResponse.json(
        { error: "ID do participante é obrigatório." },
        { status: 400 },
      );
    }

    const rawAmount = body?.amount;
    let amountNumber: number;

    if (typeof rawAmount === "number") {
      amountNumber = rawAmount;
    } else if (typeof rawAmount === "string") {
      const normalized = rawAmount.replace(".", "").replace(",", ".");
      amountNumber = Number(normalized);
    } else {
      amountNumber = NaN;
    }

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
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
        {
          error:
            "Participante não encontrado neste racha. Peça para o organizador conferir a lista.",
        },
        { status: 404 },
      );
    }

    if (participant.event.type !== "POS_PAGO") {
      return NextResponse.json(
        { error: "Pagamentos só estão disponíveis para eventos pós-pagos." },
        { status: 400 },
      );
    }

    if (!participant.event.isClosed) {
      return NextResponse.json(
        {
          error:
            "O racha ainda não foi encerrado. Peça para o organizador encerrar o racha antes de pagar.",
        },
        { status: 400 },
      );
    }

    const amountDecimal = amountNumber.toFixed(2);

    const payment = await prisma.postEventPayment.create({
      data: {
        eventId,
        participantId,
        amount: amountDecimal,
        status: "PENDING",
        provider: "ZOOP_MOCK",
        providerPaymentId: null,
        providerPayload: {
          simulated: true,
          version: 1,
        },
      },
    });

    const redirectUrl = `https://example.com/zoop-mock-checkout/${payment.id}`;

    return NextResponse.json(
      {
        payment: {
          id: payment.id,
          eventId: payment.eventId,
          participantId: payment.participantId,
          amount: payment.amount,
          status: payment.status,
        },
        redirectUrl,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/events/[id]/post-payments] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao iniciar pagamento." },
      { status: 500 },
    );
  }
}
