import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PostEventPaymentStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/session";

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
  transfers?: {
    toParticipantId: string;
    toName: string;
    toPixKey: string | null;
    amount: number;
    description?: string;
  }[];
};

/**
 * GET /api/events/[id]/post-payments?participantId=...
 *
 * Retorna o último pagamento (status PAID) de um participante nesse evento.
 * (usado como comprovante declaratório)
 */
export async function GET(req: NextRequest, context: NextContext) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id: eventId } = await context.params;
    const participantId = (req.nextUrl.searchParams.get("participantId") ?? "").trim();

    if (!eventId || !participantId) {
      return NextResponse.json(
        { error: "Evento e participante são obrigatórios." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, type: true, organizerId: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (event.type !== "POS_PAGO") {
      return NextResponse.json(
        { error: "Pagamentos do racha só existem em eventos POS_PAGO." },
        { status: 400 },
      );
    }

    const isOrganizer = !event.organizerId || event.organizerId === sessionUser.id;

    if (!isOrganizer) {
      const current = await prisma.postEventParticipant.findFirst({
        where: { eventId, userId: sessionUser.id, isActive: true },
        select: { id: true },
      });

      if (!current || current.id !== participantId) {
        return NextResponse.json(
          { error: "Você só pode ver o comprovante do seu próprio participante." },
          { status: 403 },
        );
      }
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
        provider: payment.provider ?? null,
        createdAt: payment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[GET /api/events/[id]/post-payments] erro ao carregar comprovante:", error);
    return NextResponse.json(
      { error: "Erro ao carregar comprovante de pagamento." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/events/[id]/post-payments
 *
 * Confirmação declaratória: o usuário pagou via PIX (fora do app).
 * Criamos um PostEventPayment já como PAID com provider="PIX_MANUAL".
 */
export async function POST(req: NextRequest, context: NextContext) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id: eventId } = await context.params;

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as PostBody;
    const participantId = String(body.participantId ?? "").trim();
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

    if (participant.event.type !== "POS_PAGO") {
      return NextResponse.json(
        { error: "Pagamentos do racha só existem em eventos POS_PAGO." },
        { status: 400 },
      );
    }

    const isOrganizer =
      !participant.event.organizerId || participant.event.organizerId === sessionUser.id;

    // Segurança: só o próprio usuário pode declarar pagamento do seu participante (exceto organizador)
    if (!isOrganizer) {
      if (!participant.userId || participant.userId !== sessionUser.id) {
        return NextResponse.json(
          { error: "Você só pode confirmar pagamento do seu próprio participante." },
          { status: 403 },
        );
      }
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

    const payloadTransfers = Array.isArray(body.transfers) ? body.transfers : [];

    const payment = await prisma.postEventPayment.create({
      data: {
        eventId,
        participantId,
        amount,
        status: PostEventPaymentStatus.PAID,
        provider: "PIX_MANUAL",
        providerPaymentId: null,
        providerPayload: {
          source: "pix_manual",
          declaredByUserId: sessionUser.id,
          declaredAmount: amount,
          transfers: payloadTransfers.map((t) => ({
            toParticipantId: String(t.toParticipantId ?? ""),
            toName: String(t.toName ?? ""),
            toPixKey: t.toPixKey ?? null,
            amount: Number(t.amount ?? 0),
            description: String(t.description ?? ""),
          })),
        },
      },
    });

    return NextResponse.json({
      payment: {
        id: payment.id,
        status: payment.status,
        amount: Number(payment.amount),
        provider: payment.provider ?? null,
      },
    });
  } catch (error) {
    console.error("[POST /api/events/[id]/post-payments] erro ao criar confirmação:", error);
    return NextResponse.json(
      { error: "Erro ao confirmar pagamento do racha." },
      { status: 500 },
    );
  }
}
