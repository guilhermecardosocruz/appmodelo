import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createPixCharge } from "@/lib/pagarme";

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
 *   "rawAmount": "86.66" | "86,66",
 *   "amount": 86.66
 * }
 *
 * Nesta versão:
 * - valida participante ativo no evento POS_PAGO;
 * - cria uma cobrança Pix na Pagar.me;
 * - registra PostEventPayment com status PENDING e payload do provedor;
 * - retorna dados para o client exibir o Pix (copia e cola / QR).
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
    const rawAmountStr =
      typeof body.rawAmount === "string"
        ? body.rawAmount
        : typeof body.amount === "number"
          ? body.amount.toFixed(2)
          : "";

    if (!participantId) {
      return NextResponse.json(
        { error: "participantId é obrigatório." },
        { status: 400 },
      );
    }

    if (!rawAmountStr.trim()) {
      return NextResponse.json(
        { error: "amount/rawAmount é obrigatório." },
        { status: 400 },
      );
    }

    const numericAmount = Number(
      rawAmountStr.replace(/\./g, "").replace(",", "."),
    );
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: "Valor inválido para o pagamento." },
        { status: 400 },
      );
    }

    // Garante que o evento existe e é POS_PAGO
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        type: true,
        organizerId: true,
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
            "Pagamento de racha só pode ser iniciado para eventos POS_PAGO.",
        },
        { status: 400 },
      );
    }

    // Participante deve ser do evento e estar ativo
    const participant = await prisma.postEventParticipant.findFirst({
      where: {
        id: participantId,
        eventId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        userId: true,
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

    // Dados básicos do "cliente" para mandar para a Pagar.me (opcionais)
    let customerName: string | null = participant.name;
    let customerEmail: string | null = null;

    if (participant.userId) {
      const payerUser = await prisma.user.findUnique({
        where: { id: participant.userId },
        select: { name: true, email: true },
      });

      if (payerUser) {
        customerName = payerUser.name ?? customerName;
        customerEmail = payerUser.email ?? null;
      }
    }

    // Cria cobrança Pix na Pagar.me
    const amountInCents = Math.round(numericAmount * 100);
    let pix;

    try {
      pix = await createPixCharge({
        amountInCents,
        customerName,
        customerEmail,
        metadata: {
          module: "POS_PAGO",
          eventId,
          participantId,
        },
      });
    } catch (err) {
      console.error(
        "[POST /api/events/[id]/pos/pay] erro ao criar cobrança Pix na Pagar.me:",
        err,
      );
      return NextResponse.json(
        {
          error:
            "Erro ao criar cobrança Pix. Tente novamente em instantes. Se o problema persistir, fale com o organizador.",
        },
        { status: 502 },
      );
    }

    // Registra pagamento como PENDING; status será atualizado depois (webhook / processo manual)
    const payment = await prisma.postEventPayment.create({
      data: {
        eventId,
        participantId,
        amount: new Prisma.Decimal(numericAmount.toFixed(2)),
        status: "PENDING",
        provider: "PAGARME_PIX",
        providerPaymentId: pix.id,
        providerPayload: pix.raw as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        payment: {
          id: payment.id,
          status: payment.status,
          amount: Number(payment.amount),
        },
        pix: {
          qrCode: pix.pixQrCode,
          copyPaste: pix.pixCopyPaste,
          providerPaymentId: pix.id,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "[POST /api/events/[id]/pos/pay] erro inesperado:",
      error,
    );
    return NextResponse.json(
      { error: "Erro ao registrar pagamento do racha." },
      { status: 500 },
    );
  }
}
