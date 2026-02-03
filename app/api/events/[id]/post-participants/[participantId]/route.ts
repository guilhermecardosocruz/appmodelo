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

const BUSINESS_ERROR_PARTICIPANT_NOT_FOUND = "BUSINESS_PARTICIPANT_NOT_FOUND";
const BUSINESS_ERROR_CANNOT_REMOVE_ORGANIZER =
  "BUSINESS_CANNOT_REMOVE_ORGANIZER";

// DELETE /api/events/[id]/post-participants/[participantId]
// Agora: soft delete (isActive = false) e NÃO mexe nas despesas.
// Organizadores não podem ser removidos.
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

    try {
      await prisma.$transaction(async (tx) => {
        const event = await tx.event.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            type: true,
            organizerId: true,
          },
        });

        if (!event) {
          throw new Error(BUSINESS_ERROR_PARTICIPANT_NOT_FOUND);
        }

        if (event.type !== "POS_PAGO") {
          throw new Error("ONLY_POS_PAGO");
        }

        const isOrganizerUser =
          !!event.organizerId && event.organizerId === sessionUser.id;

        const participant = await tx.postEventParticipant.findFirst({
          where: {
            id: participantId,
            eventId,
          },
        });

        if (!participant) {
          throw new Error(BUSINESS_ERROR_PARTICIPANT_NOT_FOUND);
        }

        // Se este participante representa o organizador, não pode ser removido
        const isOrganizerParticipant =
          !!event.organizerId && participant.userId === event.organizerId;

        if (!isOrganizerUser) {
          // Só o organizador pode remover participantes
          throw new Error("ONLY_ORGANIZER_CAN_REMOVE");
        }

        if (isOrganizerParticipant) {
          throw new Error(BUSINESS_ERROR_CANNOT_REMOVE_ORGANIZER);
        }

        // Se já está inativo, não faz nada
        if (!participant.isActive) {
          return;
        }

        // Soft delete: marca como inativo e mantém histórico de despesas
        await tx.postEventParticipant.update({
          where: { id: participantId },
          data: {
            isActive: false,
          },
        });
      });
    } catch (innerErr) {
      const msg = innerErr instanceof Error ? innerErr.message : "";

      if (msg === BUSINESS_ERROR_PARTICIPANT_NOT_FOUND) {
        return NextResponse.json(
          { error: "Participante não encontrado neste evento." },
          { status: 404 },
        );
      }

      if (msg === "ONLY_POS_PAGO") {
        return NextResponse.json(
          {
            error:
              "Participantes pós-pago só podem ser removidos em eventos POS_PAGO.",
          },
          { status: 400 },
        );
      }

      if (msg === "ONLY_ORGANIZER_CAN_REMOVE") {
        return NextResponse.json(
          {
            error: "Apenas o organizador pode remover participantes do racha.",
          },
          { status: 403 },
        );
      }

      if (msg === BUSINESS_ERROR_CANNOT_REMOVE_ORGANIZER) {
        return NextResponse.json(
          {
            error:
              "O organizador do evento não pode ser removido do racha.",
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
