import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string; participantId?: string } }
  | { params?: Promise<{ id?: string; participantId?: string }> };

async function getIdsFromContext(
  context: RouteContext,
): Promise<{ eventId: string; participantId: string }> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};
  if (
    rawParams &&
    typeof (rawParams as { then?: unknown }).then === "function"
  ) {
    rawParams = await (rawParams as Promise<{
      id?: string;
      participantId?: string;
    }>);
  }
  const paramsObj = rawParams as
    | { id?: string; participantId?: string }
    | undefined;

  const eventId = String(paramsObj?.id ?? "").trim();
  const participantId = String(paramsObj?.participantId ?? "").trim();

  return { eventId, participantId };
}

// DELETE /api/events/[id]/post-participants/[participantId]
// Remove um participante do pós-pago e redistribui as despesas em que ele participa.
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const { eventId, participantId } = await getIdsFromContext(context);

    if (!eventId || !participantId) {
      return NextResponse.json(
        { error: "ID do evento e do participante são obrigatórios." },
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

    const isOrganizer = !event.organizerId || event.organizerId === user.id;

    if (!isOrganizer) {
      return NextResponse.json(
        { error: "Apenas o organizador pode remover participantes." },
        { status: 403 },
      );
    }

    // Se ainda não tinha organizerId, adota para o usuário atual
    if (!event.organizerId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { organizerId: user.id },
      });
    }

    const participant = await prisma.postEventParticipant.findFirst({
      where: {
        id: participantId,
        eventId,
      },
    });

    if (!participant) {
      return NextResponse.json(
        { error: "Participante não encontrado neste evento." },
        { status: 404 },
      );
    }

    // Busca todas as despesas em que esse participante aparece nas cotas
    const expenses = await prisma.postEventExpense.findMany({
      where: {
        eventId,
        shares: {
          some: {
            participantId,
          },
        },
      },
      include: {
        shares: true,
      },
    });

    // Verifica se existe alguma despesa onde ele é o ÚNICO participante.
    const blockingExpenses = expenses.filter((exp) => {
      const shares = exp.shares ?? [];
      const others = shares.filter((s) => s.participantId !== participantId);
      return shares.length > 0 && others.length === 0;
    });

    if (blockingExpenses.length > 0) {
      return NextResponse.json(
        {
          error:
            "Não é possível remover este participante porque ele é o único na divisão de algumas despesas. " +
            "Remova ou edite essas despesas antes de tirar essa pessoa do racha.",
        },
        { status: 409 },
      );
    }

    // Prepara snapshot das despesas para redistribuir entre os demais
    const expensesToRebalance = expenses.map((exp) => ({
      id: exp.id,
      totalAmount: Number(exp.totalAmount),
      remainingParticipantIds: exp.shares
        .filter((s) => s.participantId !== participantId)
        .map((s) => s.participantId),
    }));

    // Transação: redistribui as cotas e depois remove o participante
    await prisma.$transaction(async (tx) => {
      for (const exp of expensesToRebalance) {
        const { id: expenseId, totalAmount, remainingParticipantIds } = exp;

        if (!remainingParticipantIds.length) {
          // Por segurança, se algo escapar do filtro anterior, não mexe nessa despesa.
          continue;
        }

        // Recalcula as cotas com base no valor total e apenas nos participantes restantes
        const centsTotal = Math.round(totalAmount * 100);
        const divisor = remainingParticipantIds.length;
        const baseShareInCents = Math.floor(centsTotal / divisor);
        let remainder = centsTotal - baseShareInCents * divisor;

        const newSharesData = remainingParticipantIds.map((pid) => {
          let shareCents = baseShareInCents;
          if (remainder > 0) {
            shareCents += 1;
            remainder -= 1;
          }
          const shareAmount = shareCents / 100;
          return {
            participantId: pid,
            shareAmount,
          };
        });

        // Remove as cotas antigas desta despesa
        await tx.postEventExpenseShare.deleteMany({
          where: { expenseId },
        });

        // Insere as novas cotas
        await tx.postEventExpenseShare.createMany({
          data: newSharesData.map((s) => ({
            expenseId,
            participantId: s.participantId,
            shareAmount: s.shareAmount,
          })),
        });
      }

      // Por fim, remove o participante do evento pós-pago
      await tx.postEventParticipant.delete({
        where: { id: participantId },
      });
    });

    return NextResponse.json(
      {
        ok: true,
        removedParticipantId: participantId,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(
      "[DELETE /api/events/[id]/post-participants/[participantId]] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      { error: "Erro ao remover participante." },
      { status: 500 },
    );
  }
}
