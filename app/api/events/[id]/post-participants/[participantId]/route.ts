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
  const paramsObj = rawParams as { id?: string; participantId?: string } | undefined;
  const eventId = String(paramsObj?.id ?? "").trim();
  const participantId = String(paramsObj?.participantId ?? "").trim();
  return { eventId, participantId };
}

// DELETE /api/events/[id]/post-participants/[participantId]
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

    const isOrganizer =
      !event.organizerId || event.organizerId === user.id;

    if (!isOrganizer) {
      return NextResponse.json(
        { error: "Você não tem permissão para alterar este evento." },
        { status: 403 },
      );
    }

    // Se era um evento antigo sem dono, adota para o usuário atual
    if (!event.organizerId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { organizerId: user.id },
      });
    }

    const participant = await prisma.postEventParticipant.findFirst({
      where: { id: participantId, eventId },
      select: { id: true, name: true },
    });

    if (!participant) {
      return NextResponse.json(
        { error: "Participante não encontrado neste evento." },
        { status: 404 },
      );
    }

    // Não permitir remover alguém que é pagador em alguma despesa
    const payerCount = await prisma.postEventExpense.count({
      where: {
        eventId,
        payerId: participantId,
      },
    });

    if (payerCount > 0) {
      return NextResponse.json(
        {
          error:
            "Não é possível remover este participante porque ele é pagador em uma ou mais despesas. " +
            "Edite ou exclua essas despesas antes de remover o participante.",
        },
        { status: 400 },
      );
    }

    // Despesas em que ele aparece como participante da divisão
    const expenses = await prisma.postEventExpense.findMany({
      where: {
        eventId,
        shares: {
          some: { participantId },
        },
      },
      include: {
        shares: true,
      },
      orderBy: { createdAt: "asc" },
    });

    await prisma.$transaction(async (tx) => {
      for (const expense of expenses) {
        const remainingShares = expense.shares.filter(
          (s) => s.participantId !== participantId,
        );

        // Se não sobrar ninguém na divisão, apagamos a despesa inteira
        if (remainingShares.length === 0) {
          await tx.postEventExpenseShare.deleteMany({
            where: { expenseId: expense.id },
          });
          await tx.postEventExpense.delete({
            where: { id: expense.id },
          });
          continue;
        }

        const totalAmountNumber = Number(expense.totalAmount);
        const centsTotal = Math.round(totalAmountNumber * 100);
        const divisor = remainingShares.length;

        const baseShareInCents = Math.floor(centsTotal / divisor);
        let remainder = centsTotal - baseShareInCents * divisor;

        const newSharesData = remainingShares.map((s) => {
          let shareCents = baseShareInCents;
          if (remainder > 0) {
            shareCents += 1;
            remainder -= 1;
          }
          const shareAmount = shareCents / 100;
          return {
            participantId: s.participantId,
            shareAmount,
          };
        });

        // Apaga as cotas antigas e recria com os novos valores
        await tx.postEventExpenseShare.deleteMany({
          where: { expenseId: expense.id },
        });

        await tx.postEventExpenseShare.createMany({
          data: newSharesData.map((s) => ({
            expenseId: expense.id,
            participantId: s.participantId,
            shareAmount: s.shareAmount,
          })),
        });
      }

      // Por fim, remove o participante
      await tx.postEventParticipant.delete({
        where: { id: participantId },
      });
    });

    return NextResponse.json(
      {
        ok: true,
        removedParticipantId: participantId,
        updatedExpensesCount: expenses.length,
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
