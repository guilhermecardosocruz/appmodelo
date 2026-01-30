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

// GET /api/events/[id]/post-participants
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

    // 🔁 Backfill: se o usuário for o organizador, garante que ele exista como participante
    if (isOrganizer && event.organizerId) {
      try {
        const existingOrganizerParticipant =
          await prisma.postEventParticipant.findFirst({
            where: {
              eventId,
              userId: user.id,
            },
            select: { id: true },
          });

        if (!existingOrganizerParticipant) {
          const userRecord = await prisma.user.findUnique({
            where: { id: user.id },
            select: { name: true },
          });

          const participantName = userRecord?.name ?? "Organizador";

          await prisma.postEventParticipant.create({
            data: {
              eventId,
              userId: user.id,
              name: participantName,
            },
          });
        }
      } catch (err) {
        console.error(
          "[GET /post-participants] Erro ao garantir participante organizador:",
          err,
        );
      }
    }

    const participants = await prisma.postEventParticipant.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ participants }, { status: 200 });
  } catch (err) {
    console.error(
      "[GET /api/events/[id]/post-participants] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      { error: "Erro ao carregar participantes." },
      { status: 500 },
    );
  }
}

// POST /api/events/[id]/post-participants
export async function POST(request: NextRequest, context: RouteContext) {
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

    const body = (await request.json().catch(() => null)) as
      | { name?: string; userId?: string }
      | null;

    const rawName = String(body?.name ?? "").trim();
    const rawUserId = String(body?.userId ?? "").trim();

    if (!rawName && !rawUserId) {
      return NextResponse.json(
        {
          error:
            "Informe o nome do participante ou selecione um usuário para adicionar.",
        },
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

    if (event.organizerId && event.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Você não tem permissão para alterar este evento." },
        { status: 403 },
      );
    }

    if (!event.organizerId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { organizerId: user.id },
      });
    }

    let finalName = rawName;
    const finalUserId = rawUserId || null; // mantém lógica atual, mas preferindo userId

    if (finalUserId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: finalUserId },
        select: { id: true, name: true },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: "Usuário não encontrado." },
          { status: 400 },
        );
      }

      if (!finalName) {
        finalName = targetUser.name;
      }

      const existing = await prisma.postEventParticipant.findFirst({
        where: {
          eventId,
          userId: finalUserId,
        },
      });

      if (existing) {
        return NextResponse.json(existing, { status: 200 });
      }
    }

    if (!finalName) {
      return NextResponse.json(
        { error: "Nome do participante é obrigatório." },
        { status: 400 },
      );
    }

    const participant = await prisma.postEventParticipant.create({
      data: {
        eventId,
        name: finalName,
        ...(finalUserId ? { userId: finalUserId } : {}),
      },
    });

    return NextResponse.json(participant, { status: 201 });
  } catch (err) {
    console.error(
      "[POST /api/events/[id]/post-participants] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      { error: "Erro ao adicionar participante." },
      { status: 500 },
    );
  }
}

// DELETE /api/events/[id]/post-participants
// Body: { participantId: string }
export async function DELETE(request: NextRequest, context: RouteContext) {
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

    const body = (await request.json().catch(() => null)) as
      | { participantId?: string }
      | null;

    const participantId = String(body?.participantId ?? "").trim();
    if (!participantId) {
      return NextResponse.json(
        { error: "ID do participante é obrigatório." },
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
        {
          error:
            "Você não tem permissão para remover participantes deste evento.",
        },
        { status: 403 },
      );
    }

    const participant = await prisma.postEventParticipant.findUnique({
      where: { id: participantId },
    });

    if (!participant || participant.eventId !== eventId) {
      return NextResponse.json(
        { error: "Participante não encontrado neste evento." },
        { status: 404 },
      );
    }

    // Não permite remover o participante que representa o organizador
    if (
      participant.userId &&
      event.organizerId &&
      participant.userId === event.organizerId
    ) {
      return NextResponse.json(
        {
          error:
            "Não é possível remover o participante que representa o organizador do evento.",
        },
        { status: 400 },
      );
    }

    // Verifica se o participante é pagador em alguma despesa
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
            "Não é possível remover este participante porque ele está marcado como pagador em pelo menos uma despesa. Edite ou remova essas despesas antes de excluir o participante.",
        },
        { status: 400 },
      );
    }

    // Redistribui as cotas das despesas em que ele entrou na divisão
    await prisma.$transaction(async (tx) => {
      const shares = await tx.postEventExpenseShare.findMany({
        where: {
          participantId,
          expense: { eventId },
        },
        select: {
          id: true,
          expenseId: true,
          shareAmount: true,
        },
      });

      if (shares.length > 0) {
        const expenseIds = Array.from(
          new Set(shares.map((s) => s.expenseId)),
        );

        const expenses = await tx.postEventExpense.findMany({
          where: { id: { in: expenseIds } },
          include: {
            shares: true,
          },
        });

        for (const expense of expenses) {
          const allShares = expense.shares;

          const sharesOfParticipant = allShares.filter(
            (s) => s.participantId === participantId,
          );
          if (!sharesOfParticipant.length) continue;

          const otherShares = allShares.filter(
            (s) => s.participantId !== participantId,
          );

          // Soma o valor que estava no nome do participante em centavos
          const totalRemovedCents = sharesOfParticipant.reduce(
            (acc, s) => acc + Math.round(Number(s.shareAmount) * 100),
            0,
          );

          // Se não sobraram outros participantes na despesa,
          // apenas removemos as cotas desse participante.
          if (otherShares.length > 0 && totalRemovedCents > 0) {
            const divisor = otherShares.length;
            const base = Math.floor(totalRemovedCents / divisor);
            let remainder = totalRemovedCents - base * divisor;

            // Redistribui o valor removido entre os demais participantes
            for (const share of otherShares) {
              const currentCents = Math.round(
                Number(share.shareAmount) * 100,
              );
              let add = base;
              if (remainder > 0) {
                add += 1;
                remainder -= 1;
              }
              const newCents = currentCents + add;
              const newAmount = newCents / 100;

              await tx.postEventExpenseShare.update({
                where: { id: share.id },
                data: { shareAmount: newAmount },
              });
            }
          }

          // Remove as cotas do participante desta despesa
          await tx.postEventExpenseShare.deleteMany({
            where: {
              expenseId: expense.id,
              participantId,
            },
          });
        }
      }

      // Por fim, remove o participante do evento
      await tx.postEventParticipant.delete({
        where: { id: participantId },
      });
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error(
      "[DELETE /api/events/[id]/post-participants] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      { error: "Erro ao remover participante." },
      { status: 500 },
    );
  }
}
