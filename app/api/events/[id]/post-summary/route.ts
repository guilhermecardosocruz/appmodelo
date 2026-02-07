import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};

  if (
    rawParams &&
    typeof (rawParams as { then?: unknown }).then === "function"
  ) {
    rawParams = await (rawParams as Promise<{ id?: string }>);
  }

  const paramsObj = rawParams as { id?: string } | undefined;
  return String(paramsObj?.id ?? "").trim();
}

// GET /api/events/[id]/post-summary
// Resumo apenas entre participantes ATIVOS.
// - Participantes inativos não aparecem no resumo.
// - Despesas cujo pagador está inativo são ignoradas no racha.
// - Só são consideradas cotas (shares) de participantes ativos.
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const eventId = await getEventIdFromContext(context);
    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true, type: true },
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
            "Resumo pós-pago só pode ser calculado para eventos POS_PAGO.",
        },
        { status: 400 },
      );
    }

    const isOrganizer =
      !event.organizerId || event.organizerId === user.id;

    // Participante no módulo pós-pago
    let isParticipant = false;
    if (!isOrganizer) {
      const participant = await prisma.postEventParticipant.findFirst({
        where: {
          eventId,
          userId: user.id,
        },
        select: { id: true },
      });
      isParticipant = !!participant;
    }

    if (!isOrganizer && !isParticipant) {
      return NextResponse.json(
        { error: "Você não tem permissão para ver este evento." },
        { status: 403 },
      );
    }

    // Apenas participantes ATIVOS aparecem no resumo
    const participants = await prisma.postEventParticipant.findMany({
      where: {
        eventId,
        isActive: true,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        userId: true,
      },
    });

    if (!participants.length) {
      return NextResponse.json(
        { participants: [], balances: [] },
        { status: 200 },
      );
    }

    // Garante que SOMENTE o participante vinculado ao usuário logado
    // será marcado como "isCurrentUser"
    const currentParticipant =
      participants.find((p) => p.userId === user.id) ?? null;

    const activeIds = participants.map((p) => p.id);
    const activeIdSet = new Set(activeIds);

    // Estrutura de acumulação por participante
    type Aggregated = {
      participantId: string;
      name: string;
      totalPaid: number;
      totalShare: number;
      balance: number;
      isCurrentUser: boolean;
    };

    const byId = new Map<string, Aggregated>();

    for (const p of participants) {
      byId.set(p.id, {
        participantId: p.id,
        name: p.name,
        totalPaid: 0,
        totalShare: 0,
        balance: 0,
        isCurrentUser:
          !!currentParticipant && p.id === currentParticipant.id,
      });
    }

    // Busca todas as despesas do evento (pagadores podem ser ativos ou não)
    const expenses = await prisma.postEventExpense.findMany({
      where: { eventId },
      select: {
        id: true,
        payerId: true,
      },
    });

    // Busca todas as cotas dos participantes ATIVOS
    const shares = await prisma.postEventExpenseShare.findMany({
      where: {
        expense: { eventId },
        participantId: { in: activeIds },
      },
      select: {
        expenseId: true,
        participantId: true,
        shareAmount: true,
      },
    });

    // Agrupa shares por despesa
    const sharesByExpense = new Map<
      string,
      { participantId: string; shareAmount: number }[]
    >();

    for (const s of shares) {
      const arr =
        sharesByExpense.get(s.expenseId) ?? [];
      arr.push({
        participantId: s.participantId,
        shareAmount: Number(s.shareAmount ?? 0),
      });
      sharesByExpense.set(s.expenseId, arr);
    }

    // Para cada despesa:
    // - Se o pagador estiver inativo, ignoramos totalmente a despesa no racha.
    // - Se o pagador for ativo:
    //   - totalPaid do pagador soma APENAS as cotas dos participantes ativos
    //   - totalShare soma as cotas de cada participante ativo normalmente.
    for (const e of expenses) {
      if (!activeIdSet.has(e.payerId)) {
        // Pagador inativo: essa despesa não entra no racha entre os ativos
        continue;
      }

      const expenseShares = sharesByExpense.get(e.id) ?? [];
      let totalActiveSharesForExpense = 0;

      for (const s of expenseShares) {
        const value = s.shareAmount;

        const aggShare = byId.get(s.participantId);
        if (aggShare) {
          aggShare.totalShare += value;
        }

        totalActiveSharesForExpense += value;
      }

      const payerAgg = byId.get(e.payerId);
      if (payerAgg) {
        payerAgg.totalPaid += totalActiveSharesForExpense;
      }
    }

    // Calcula saldo final
    for (const agg of byId.values()) {
      agg.balance = agg.totalPaid - agg.totalShare;
    }

    // Mantém a ordem dos participantes
    const balances = participants.map((p) => {
      const agg = byId.get(p.id);
      return (
        agg ?? {
          participantId: p.id,
          name: p.name,
          totalPaid: 0,
          totalShare: 0,
          balance: 0,
          isCurrentUser:
            !!currentParticipant && p.id === currentParticipant.id,
        }
      );
    });

    return NextResponse.json(
      {
        eventId,
        participants: participants.map((p) => ({
          id: p.id,
          name: p.name,
        })),
        balances,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/[id]/post-summary] Erro ao calcular resumo do evento:", err);
    return NextResponse.json(
      { error: "Erro ao calcular resumo do evento." },
      { status: 500 },
    );
  }
}
