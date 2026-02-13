import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { PostEventPaymentStatus } from "@prisma/client";

type NextContext = {
  params: Promise<{ id: string }>;
};

type TransferLine = {
  toParticipantId: string;
  toName: string;
  toUserId: string | null;
  toPixKey: string | null;
  amount: number;
  description: string;
};

function toNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(req: NextRequest, context: NextContext) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
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
      select: { id: true, name: true, type: true, organizerId: true, isClosed: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (event.type !== "POS_PAGO") {
      return NextResponse.json(
        { error: "Detalhamento de pagamento só existe em eventos POS_PAGO." },
        { status: 400 },
      );
    }

    if (!event.isClosed) {
      return NextResponse.json(
        { error: "O racha ainda não foi encerrado. O pagamento só fica disponível após o encerramento." },
        { status: 400 },
      );
    }

    const participants = await prisma.postEventParticipant.findMany({
      where: { eventId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, userId: true },
    });

    const currentParticipant = participants.find((p) => p.userId === user.id) ?? null;

    const isOrganizer = !event.organizerId || event.organizerId === user.id;
    const isCurrentUserParticipant = !!currentParticipant;

    if (!isOrganizer && !isCurrentUserParticipant) {
      return NextResponse.json(
        { error: "Você não tem permissão para ver este evento." },
        { status: 403 },
      );
    }

    // Regra de segurança: participanteId deve ser do usuário logado (a menos que seja organizador)
    if (!isOrganizer && currentParticipant && participantId !== currentParticipant.id) {
      return NextResponse.json(
        { error: "Você só pode ver o pagamento do seu próprio participante." },
        { status: 403 },
      );
    }

    const activeIds = participants.map((p) => p.id);
    const activeIdSet = new Set(activeIds);

    // despesas do evento
    const expenses = await prisma.postEventExpense.findMany({
      where: { eventId },
      select: { id: true, payerId: true },
    });

    // shares apenas dos participantes ativos
    const shares = await prisma.postEventExpenseShare.findMany({
      where: {
        expense: { eventId },
        participantId: { in: activeIds },
      },
      select: { expenseId: true, participantId: true, shareAmount: true },
    });

    const sharesByExpense = new Map<string, { participantId: string; shareAmount: number }[]>();
    for (const s of shares) {
      const arr = sharesByExpense.get(s.expenseId) ?? [];
      arr.push({ participantId: s.participantId, shareAmount: toNumber(s.shareAmount) });
      sharesByExpense.set(s.expenseId, arr);
    }

    type Agg = { participantId: string; name: string; userId: string | null; totalPaid: number; totalShare: number; balance: number };
    const byId = new Map<string, Agg>();

    for (const p of participants) {
      byId.set(p.id, { participantId: p.id, name: p.name, userId: p.userId ?? null, totalPaid: 0, totalShare: 0, balance: 0 });
    }

    for (const e of expenses) {
      if (!activeIdSet.has(e.payerId)) continue; // regra igual ao post-summary
      const expenseShares = sharesByExpense.get(e.id) ?? [];
      let totalActiveSharesForExpense = 0;

      for (const s of expenseShares) {
        const value = toNumber(s.shareAmount);
        const agg = byId.get(s.participantId);
        if (agg) agg.totalShare += value;
        totalActiveSharesForExpense += value;
      }

      const payerAgg = byId.get(e.payerId);
      if (payerAgg) payerAgg.totalPaid += totalActiveSharesForExpense;
    }

    for (const agg of byId.values()) {
      agg.balance = round2(agg.totalPaid - agg.totalShare);
    }

    const payerAgg = byId.get(participantId);
    if (!payerAgg) {
      return NextResponse.json({ error: "Participante não encontrado no racha." }, { status: 404 });
    }

    // dívida do participante (se negativo)
    const debt = payerAgg.balance < 0 ? round2(Math.abs(payerAgg.balance)) : 0;

    // quanto já foi declarado como pago (PAID)
    const paidRow = await prisma.postEventPayment.aggregate({
      where: { eventId, participantId, status: PostEventPaymentStatus.PAID },
      _sum: { amount: true },
    });

    const alreadyPaid = round2(toNumber(paidRow._sum.amount));
    const remaining = debt > 0 ? round2(Math.max(0, debt - alreadyPaid)) : 0;

    // credores (saldo positivo)
    const creditors = Array.from(byId.values())
      .filter((x) => x.balance > 0.00001)
      .sort((a, b) => b.balance - a.balance);

    // carrega pixKey dos usuários credores (quando existir userId)
    const userIds = Array.from(new Set(creditors.map((c) => c.userId).filter(Boolean))) as string[];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, pixKey: true, name: true },
        })
      : [];

    const pixByUserId = new Map<string, string | null>();
    for (const u of users) pixByUserId.set(u.id, u.pixKey ?? null);

    const lines: TransferLine[] = [];
    let remainingCents = Math.round(remaining * 100);

    for (const c of creditors) {
      if (remainingCents <= 0) break;

      const creditCents = Math.round(toNumber(c.balance) * 100);
      if (creditCents <= 0) continue;

      const payCents = Math.min(remainingCents, creditCents);
      remainingCents -= payCents;

      const pixKey = c.userId ? pixByUserId.get(c.userId) ?? null : null;

      lines.push({
        toParticipantId: c.participantId,
        toName: c.name,
        toUserId: c.userId,
        toPixKey: pixKey,
        amount: round2(payCents / 100),
        description: `Acerto do racha • ${event.name}`,
      });
    }

    // quem iria receber, mas não tem pixKey
    const missingPix = lines
      .filter((l) => !l.toPixKey)
      .map((l) => ({ toParticipantId: l.toParticipantId, toName: l.toName }));

    return NextResponse.json(
      {
        eventId: event.id,
        eventName: event.name,
        participantId,
        participantName: payerAgg.name,
        totalDue: debt,
        alreadyPaid,
        remainingToPay: remaining,
        transfers: lines,
        missingPixRecipients: missingPix,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/[id]/post-payment-details] erro:", err);
    return NextResponse.json(
      { error: "Erro ao montar detalhamento de pagamento." },
      { status: 500 },
    );
  }
}
