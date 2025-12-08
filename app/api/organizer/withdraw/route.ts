import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/organizer/withdraw
 * Body: { organizerId: string, amount: number }
 *
 * Cria um pedido de saque (WithdrawalRequest) com status PENDING,
 * validando se há saldo disponível.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    const organizerId = String(body?.organizerId ?? "").trim();
    const amount = Number(body?.amount ?? 0);

    if (!organizerId) {
      return NextResponse.json(
        { error: "organizerId é obrigatório" },
        { status: 400 },
      );
    }

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount deve ser maior que zero" },
        { status: 400 },
      );
    }

    // Calcula saldo atual
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

    if (amount > balance) {
      return NextResponse.json(
        {
          error: "Valor solicitado maior que o saldo disponível",
          balance,
        },
        { status: 400 },
      );
    }

    const requestRecord = await prisma.withdrawalRequest.create({
      data: {
        organizerId,
        amount,
        status: "PENDING",
      },
    });

    // Aqui você pode depois:
    // - notificar admin
    // - enfileirar processamento de Pix manual/automático, etc.

    return NextResponse.json(
      {
        ok: true,
        request: requestRecord,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/organizer/withdraw] Erro:", err);
    return NextResponse.json(
      { error: "Erro ao criar pedido de saque" },
      { status: 500 },
    );
  }
}
