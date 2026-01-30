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
    rawParams = (rawParams as Promise<{ id?: string }>);
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

    // garante que o organizador apareça como participante
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
            select: { name: true, email: true },
          });

          const participantName =
            userRecord?.name ?? userRecord?.email ?? "Organizador";

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
// Body: { userEmail?: string; userId?: string }
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
      | { userEmail?: string; userId?: string }
      | null;

    const rawEmail = String(body?.userEmail ?? "").trim();
    const rawUserId = String(body?.userId ?? "").trim();

    if (!rawEmail && !rawUserId) {
      return NextResponse.json(
        {
          error:
            "Informe o e-mail ou o ID do usuário para adicionar como participante.",
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

    const isOrganizer =
      !event.organizerId || event.organizerId === user.id;

    if (!isOrganizer) {
      return NextResponse.json(
        { error: "Apenas o organizador pode alterar este evento." },
        { status: 403 },
      );
    }

    // se evento antigo sem dono, adota para o usuário atual
    if (!event.organizerId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { organizerId: user.id },
      });
    }

    const normalizedEmail = rawEmail ? rawEmail.toLowerCase() : "";

    let userWhere:
      | { id: string }
      | { email: string }
      | { OR: { id?: string; email?: string }[] };

    if (rawUserId && normalizedEmail) {
      userWhere = {
        OR: [{ id: rawUserId }, { email: normalizedEmail }],
      };
    } else if (rawUserId) {
      userWhere = { id: rawUserId };
    } else {
      userWhere = { email: normalizedEmail };
    }

    const targetUser = await prisma.user.findFirst({
      where: userWhere,
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            "Nenhum usuário encontrado com esse e-mail ou ID. Peça para a pessoa criar uma conta e tente novamente.",
        },
        { status: 400 },
      );
    }

    const existing = await prisma.postEventParticipant.findFirst({
      where: {
        eventId,
        userId: targetUser.id,
      },
    });

    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const participantName =
      targetUser.name ?? targetUser.email ?? "Participante";

    const participant = await prisma.postEventParticipant.create({
      data: {
        eventId,
        userId: targetUser.id,
        name: participantName,
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
