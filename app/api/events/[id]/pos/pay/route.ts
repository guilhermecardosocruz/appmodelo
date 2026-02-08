import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

/**
 * NEXT 16+ route typing:
 * context.params é agora: Promise<{ id: string }>
 */
type NextContext = {
  params: Promise<{ id: string }>;
};

type PostBody = {
  participantId?: string;
  rawAmount?: string;
  amount?: number;
};

/**
 * POST /api/events/[id]/pos/pay
 *
 * Corpo esperado:
 * {
 *   "participantId": "cml9dk8o0003l50436zofdb5",
 *   "rawAmount": "86.66",
 *   "amount": 86.66
 * }
 *
 * Nesta primeira versão:
 * - valida participante ativo no evento;
 * - cria um PostEventPayment com status PAID (mock);
 * - grava o payload completo em providerPayload para debug.
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

    const body = (await req.json()) as PostBody;

    const participantId = body.participantId;
    const rawAmount =
      typeof body.rawAmount === "string"
        ? body.rawAmount
        : typeof body.amount === "number"
          ? body.amount.toFixed(2)
          : undefined;

    if (!participantId) {
      return NextResponse.json(
        { error: "participantId é obrigatório." },
        { status: 400 },
      );
    }

    if (!rawAmount) {
      return NextResponse.json(
        { error: "amount/rawAmount é obrigatório." },
        { status: 400 },
      );
    }

    const numericAmount = Number(rawAmount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: "Valor inválido para o pagamento." },
        { status: 400 },
      );
    }

    // Garante que o participante existe, é do evento e está ativo
    const participant = await prisma.postEventParticipant.findFirst({
      where: {
        id: participantId,
        eventId,
        isActive: true,
      },
    });

    if (!participant) {
      return NextResponse.json(
        {
          error:
            "Participante não encontrado para este evento ou está inativo.",
        },
        { status: 404 },
      );
    }

    // Cria o pagamento mock já como PAID (simulação bem-sucedida)
    const payment = await prisma.postEventPayment.create({
      data: {
        eventId,
        participantId,
        amount: new Prisma.Decimal(
          numericAmount.toFixed(2), // evita problemas de float
        ),
        status: "PAID",
        provider: "ZOOP_MOCK",
        providerPaymentId: null,
        providerPayload: body,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        payment,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/events/[id]/pos/pay] error:", error);
    return NextResponse.json(
      { error: "Erro ao registrar pagamento do racha." },
      { status: 500 },
    );
  }
}
