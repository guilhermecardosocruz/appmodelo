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

/**
 * GET /api/events/[id]/post-payments-summary
 *
 * Retorna, para cada participante do racha, o total que ele já pagou
 * via PostEventPayment com status PAID.
 */
export async function GET(_req: NextRequest, context: NextContext) {
  try {
    const { id: eventId } = await context.params;

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const rows = await prisma.postEventPayment.groupBy({
      by: ["participantId"],
      where: {
        eventId,
        status: PostEventPaymentStatus.PAID,
      },
      _sum: {
        amount: true,
      },
    });

    return NextResponse.json({
      payments: rows
        .filter((row) => row.participantId != null)
        .map((row) => ({
          participantId: row.participantId as string,
          totalAmount: Number(row._sum.amount ?? 0),
        })),
    });
  } catch (error) {
    console.error(
      "[GET /api/events/[id]/post-payments-summary] erro:",
      error,
    );
    return NextResponse.json(
      { error: "Erro ao carregar resumo de pagamentos." },
      { status: 500 },
    );
  }
}
