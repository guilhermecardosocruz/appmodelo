import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/organizer/balance?organizerId=...
 * Retorna saldo, total de créditos e débitos de um organizador.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizerId = searchParams.get("organizerId");

    if (!organizerId) {
      return NextResponse.json(
        { error: "organizerId é obrigatório" },
        { status: 400 },
      );
    }

    const creditsAgg = await prisma.ledgerEntry.aggregate({
      _sum: { amount: true },
      where: {
        organizerId,
        type: "CREDIT",
      },
    });

    const debitsAgg = await prisma.ledgerEntry.aggregate({
      _sum: { amount: true },
      where: {
        organizerId,
        type: "DEBIT",
      },
    });

    const credits = Number(creditsAgg._sum.amount ?? 0);
    const debits = Number(debitsAgg._sum.amount ?? 0);
    const balance = credits - debits;

    return NextResponse.json(
      {
        organizerId,
        balance,
        credits,
        debits,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/organizer/balance] Erro:", err);
    return NextResponse.json(
      { error: "Erro ao calcular saldo" },
      { status: 500 },
    );
  }
}
