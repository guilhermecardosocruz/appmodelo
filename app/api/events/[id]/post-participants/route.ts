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
// Agora: só adiciona participante se for um usuário real (via userId ou email)
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
      | {
          name?: string;
          userId?: string;
          email?: string;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 },
      );
    }

    const rawName = String(body.name ?? "").trim();
    const rawUserId = String(body.userId ?? "").trim();
    const rawEmail = String(body.email ?? "").trim().toLowerCase();

    if (!rawUserId && !rawEmail) {
      return NextResponse.json(
        {
          error:
            "Selecione um usuário pelo ID ou pelo email para adicionar ao evento.",
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

    // Apenas o organizador pode gerenciar a lista de participantes
    if (event.organizerId && event.organizerId !== user.id) {
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

      // Garante que o organizador também entra como participante
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
          "[POST /post-participants] Erro ao garantir participante organizador:",
          err,
        );
      }
    }

    // Resolve o usuário alvo (por ID ou email)
    let targetUser:
      | {
          id: string;
          name: string;
        }
      | null = null;

    if (rawUserId) {
      targetUser = await prisma.user.findUnique({
        where: { id: rawUserId },
        select: { id: true, name: true },
      });
    } else if (rawEmail) {
      targetUser = await prisma.user.findUnique({
        where: { email: rawEmail },
        select: { id: true, name: true },
      });
    }

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            "Usuário não encontrado. Verifique o ID ou o email informado.",
        },
        { status: 400 },
      );
    }

    const finalName = rawName || targetUser.name;

    // Verifica se esse usuário já é participante desse evento
    const existing = await prisma.postEventParticipant.findFirst({
      where: {
        eventId,
        userId: targetUser.id,
      },
    });

    if (existing) {
      // Já existe participante para esse usuário nesse evento:
      // retornamos o mesmo registro (idempotente)
      return NextResponse.json(existing, { status: 200 });
    }

    const participant = await prisma.postEventParticipant.create({
      data: {
        eventId,
        userId: targetUser.id,
        name: finalName,
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
