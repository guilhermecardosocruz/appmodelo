import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string; participantId?: string } }
  | { params?: Promise<{ id?: string; participantId?: string }> };

async function getIdsFromContext(context: RouteContext): Promise<{
  eventId: string;
  participantId: string;
}> {
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

const BUSINESS_ERROR_ONLY_PARTICIPANT =
  "BUSINESS_ONLY_PARTICIPANT_IN_EXPENSES";

// DELETE /api/events/[id]/post-participants/[participantId]
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
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
        {
          error:
            "Participantes pós-pago só podem ser removidos em eventos POS_PAGO.",
        },
        { status: 400 },
      );
    }

    const isOrganizer =
      !event.organizerId || event.organizerId === sessionUser.id;

    if (!isOrganizer) {
      return NextResponse.json(
        {
          error: "Apenas o organizador pode remover participantes do racha.",
        },
        { status: 403 },
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const participant = await tx.postEventParticipant.findFirst({
          where: {
            id: participantId,
            eventId,
          },
        });

        if (!participant) {
          throw new Error("PARTICIPANT_NOT_FOUND");
        }

        // Participantes restantes do evento (sem o que será removido)
        const otherParticipants = await tx.postEventParticipant.findMany({
          where: {
            eventId,
            id: { not: participantId },
          },
          select: { id: true },
        });

        // Todas as despesas onde ele é pagador ou tem cota
        const expenses = await tx.postEventExpense.findMany({
          where: {
            eventId,
            OR: [
              { payerId: participantId },
              {
                shares: {
                  some: {
                    participantId,
                  },
                },
              },
            ],
          },
          include: {
            shares: true,
          },
        });

        for (const expense of expenses) {
          const sharesForRemoved = expense.shares.filter(
            (s) => s.participantId === participantId,
          );
          const sharesForOthers = expense.shares.filter(
            (s) => s.participantId !== participantId,
          );

          // 1) Redistribui as cotas dele para os demais desta despesa
          if (sharesForRemoved.length > 0) {
            const removedTotal = sharesForRemoved.reduce(
              (acc, s) => acc + Number(s.shareAmount),
              0,
            );

            const removedTotalCents = Math.round(removedTotal * 100);

            if (removedTotalCents > 0 && sharesForOthers.length === 0) {
              // Não tem ninguém para redistribuir nessa despesa
              throw new Error(BUSINESS_ERROR_ONLY_PARTICIPANT);
            }

            if (removedTotalCents > 0 && sharesForOthers.length > 0) {
              const divisor = sharesForOthers.length;
              const baseExtra = Math.floor(removedTotalCents / divisor);
              let remainder = removedTotalCents - baseExtra * divisor;

              for (const share of sharesForOthers) {
                const currentCents = Math.round(
                  Number(share.shareAmount) * 100,
                );

                let newCents = currentCents + baseExtra;
                if (remainder > 0) {
                  newCents += 1;
                  remainder -= 1;
                }

                const newAmount = newCents / 100;

                await tx.postEventExpenseShare.update({
                  where: { id: share.id },
                  data: { shareAmount: newAmount },
                });
              }
            }

            // Remove as cotas do participante
            await tx.postEventExpenseShare.deleteMany({
              where: {
                expenseId: expense.id,
                participantId,
              },
            });
          }

          // 2) Se ele era o pagador desta despesa, transfere o papel
          if (expense.payerId === participantId) {
            let newPayerId: string | null = null;

            if (sharesForOthers.length > 0) {
              newPayerId = sharesForOthers[0].participantId;
            } else if (otherParticipants.length > 0) {
              newPayerId = otherParticipants[0].id;
            } else {
              // Não há ninguém para assumir a despesa
              throw new Error(BUSINESS_ERROR_ONLY_PARTICIPANT);
            }

            await tx.postEventExpense.update({
              where: { id: expense.id },
              data: {
                payerId: newPayerId,
              },
            });
          }
        }

        // Por fim, remove o participante do evento
        await tx.postEventParticipant.delete({
          where: { id: participantId },
        });
      });
    } catch (innerErr) {
      const msg = innerErr instanceof Error ? innerErr.message : "";

      if (msg === "PARTICIPANT_NOT_FOUND") {
        return NextResponse.json(
          { error: "Participante não encontrado neste evento." },
          { status: 404 },
        );
      }

      if (msg === BUSINESS_ERROR_ONLY_PARTICIPANT) {
        return NextResponse.json(
          {
            error:
              "Não é possível remover este participante porque ele é o único participante em algumas despesas. Ajuste ou remova essas despesas antes de excluir.",
          },
          { status: 400 },
        );
      }

      console.error(
        "[DELETE /api/events/[id]/post-participants/[participantId]] Erro de negócio:",
        innerErr,
      );
      return NextResponse.json(
        { error: "Erro ao remover participante." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
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
