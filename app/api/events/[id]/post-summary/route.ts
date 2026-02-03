import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};
  if (rawParams && typeof (rawParams as { then?: unknown }).then === "function") {
    rawParams = await (rawParams as Promise<{ id?: string }>);
  }
  const paramsObj = rawParams as { id?: string } | undefined;
  return String(paramsObj?.id ?? "").trim();
}

// GET /api/events/[id]/post-summary
// Agora: resumo apenas entre participantes ATIVOS.
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
      select: { id: true, organizerId: true },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    const isOrganizer =
      !event.organizerId || event.organizerId === user.id;

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
      },
    });

    if (!participants.length) {
      return NextResponse.json(
        { participants: [], balances: [] },
        { status: 200 },
      );
    }

    const activeIds = participants.map((p) => p.id);

    const [expenses, shares] = await Promise.all([
      prisma.postEventExpense.findMany({
        where: { eventId },
        select: {
          id: true,
          payerId: true,
        },
      }),
      prisma.postEventExpenseShare.findMany({
        where: {
          expense: { eventId },
          participantId: { in: activeIds },
        },
        select: {
          expenseId: true,
          participantId: true,
          shareAmount: true,
        },
      }),
    ]);

    const paidMap = new Map<string, number>();
    const shareMap = new Map<string, number>();

    // Agrupa shares por despesa para facilitar o cálculo
    const sharesByExpense = new Map<
      string,
      { participantId: string; shareAmount: number }[]
    >();

    for (const s of shares) {
      const arr =
        sharesByExpense.get(s.expenseId) ??
        [];
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
    //   - shareMap soma as cotas de cada participante ativo normalmente.
    const activeIdSet = new Set(activeIds);

    for (const e of expenses) {
      if (!activeIdSet.has(e.payerId)) {
        // Pagador inativo: essa despesa não entra no racha entre os ativos
        continue;
      }

      const expenseShares = sharesByExpense.get(e.id) ?? [];
      let totalActiveSharesForExpense = 0;

      for (const s of expenseShares) {
        const value = s.shareAmount;
        shareMap.set(
          s.participantId,
          (shareMap.get(s.participantId) ?? 0) + value,
        );
        totalActiveSharesForExpense += value;
      }

      // O pagador "recebe" o valor equivalente à soma das cotas dos ativos
      // (isso garante que o racha entre ativos é sempre zero-sum)
      paidMap.set(
        e.payerId,
        (paidMap.get(e.payerId) ?? 0) + totalActiveSharesForExpense,
      );
    }

    const balances = participants.map((p) => {
      const totalPaid = paidMap.get(p.id) ?? 0;
      const totalShare = shareMap.get(p.id) ?? 0;
      const balance = totalPaid - totalShare;

      return {
        participantId: p.id,
        name: p.name,
        totalPaid,
        totalShare,
        balance,
      };
    });

    return NextResponse.json(
      {
        eventId,
        participants,
        balances,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/[id]/post-summary] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao calcular resumo do evento." },
      { status: 500 },
    );
  }
}
