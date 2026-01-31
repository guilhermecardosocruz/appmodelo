import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string; participantId?: string } }
  | { params?: Promise<{ id?: string; participantId?: string }> };

async function getIdsFromContext(
  context: RouteContext,
): Promise<{ eventId: string; participantId: string }> {
  const maybeParams = (context as { params?: unknown })?.params;

  const raw =
    maybeParams && typeof (maybeParams as { then?: unknown }).then === "function"
      ? await (maybeParams as Promise<{ id?: string; participantId?: string }>)
      : (maybeParams as { id?: string; participantId?: string } | undefined);

  const eventId = String(raw?.id ?? "").trim();
  const participantId = String(raw?.participantId ?? "").trim();

  return { eventId, participantId };
}

// DELETE /api/events/[id]/post-participants/[participantId]
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { eventId, participantId } = await getIdsFromContext(context);

    if (!eventId || !participantId) {
      return NextResponse.json(
        { error: "ID do evento e do participante são obrigatórios." },
        { status: 400 },
      );
    }

    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        type: true,
        organizerId: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (event.type !== "POS_PAGO") {
      return NextResponse.json(
        { error: "Este recurso só está disponível para eventos POS_PAGO." },
        { status: 400 },
      );
    }

    const isOrganizer =
      !event.organizerId || event.organizerId === sessionUser.id;

    if (!isOrganizer) {
      return NextResponse.json(
        {
          error:
            "Apenas o organizador pode remover participantes do racha.",
        },
        { status: 403 },
      );
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

    // Busca todas as despesas em que este participante entra na divisão
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

    for (const expense of expenses) {
      const remainingShares = expense.shares.filter(
        (s) => s.participantId !== participantId,
      );

      // Se ele era o único participante, apagamos a despesa inteira
      if (remainingShares.length === 0) {
        await prisma.postEventExpenseShare.deleteMany({
          where: { expenseId: expense.id },
        });
        await prisma.postEventExpense.delete({
          where: { id: expense.id },
        });
        continue;
      }

      // Recalcula a divisão igualitária entre os demais
      const totalInCents = Math.round(Number(expense.totalAmount) * 100);
      const base = Math.floor(totalInCents / remainingShares.length);
      const remainder = totalInCents % remainingShares.length;

      // Apaga todas as cotas anteriores
      await prisma.postEventExpenseShare.deleteMany({
        where: { expenseId: expense.id },
      });

      // Cria novas cotas redistribuindo os centavos que "sobram"
      let index = 0;
      for (const share of remainingShares) {
        const cents = base + (index < remainder ? 1 : 0);
        const amount = cents / 100;

        await prisma.postEventExpenseShare.create({
          data: {
            expenseId: expense.id,
            participantId: share.participantId,
            shareAmount: amount,
          },
        });

        index += 1;
      }
    }

    // Finalmente remove o participante do evento
    await prisma.postEventParticipant.delete({
      where: { id: participant.id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error(
      "[DELETE /api/events/[id]/post-participants/[participantId]] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      {
        error:
          "Erro ao remover participante e redistribuir as despesas.",
      },
      { status: 500 },
    );
  }
}
