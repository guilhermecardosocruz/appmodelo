import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
 * Retorna, para cada participante do racha, o total já pago no app
 * (somente pagamentos com status PAID).
 *
 * Resposta:
 * {
 *   "payments": [
 *     { "participantId": "p1", "totalAmount": 60.0 },
 *     { "participantId": "p2", "totalAmount": 30.0 }
 *   ]
 * }
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

    const grouped = await prisma.postEventPayment.groupBy({
      by: ["participantId"],
      where: {
        eventId,
        status: "PAID",
      },
      _sum: {
        amount: true,
      },
    });

    const payments = grouped.map((row) => ({
      participantId: row.participantId,
      totalAmount: Number(row._sum.amount ?? 0),
    }));

    return NextResponse.json({ payments });
  } catch (error) {
    console.error(
      "[GET /api/events/[id]/post-payments-summary] error:",
      error,
    );
    return NextResponse.json(
      { error: "Erro ao carregar pagamentos do racha." },
      { status: 500 },
    );
  }
}
