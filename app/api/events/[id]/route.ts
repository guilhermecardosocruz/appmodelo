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

// ================================================
// GET /api/events/[id]
// ================================================
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);
    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        postParticipants: true, // convidados do racha
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    // tenta identificar usuário logado (mas não é obrigatório)
    let user: Awaited<ReturnType<typeof getSessionUser>> | null = null;
    try {
      user = await getSessionUser(request);
    } catch {
      user = null;
    }

    let roleForCurrentUser: "ORGANIZER" | "POST_PARTICIPANT" | null = null;
    let canEditConfig = false;
    let canManageParticipants = false;
    let canAddExpenses = false;

    if (user) {
      const isOrganizer =
        !event.organizerId || event.organizerId === user.id;

      if (isOrganizer) {
        roleForCurrentUser = "ORGANIZER";
        canEditConfig = true;
        canManageParticipants = true;
        canAddExpenses = true;
      } else {
        const participant = await prisma.postEventParticipant.findFirst({
          where: {
            eventId,
            userId: user.id,
          },
        });

        if (participant) {
          roleForCurrentUser = "POST_PARTICIPANT";
          canEditConfig = false;
          canManageParticipants = false;
          canAddExpenses = true;
        }
      }
    }

    return NextResponse.json(
      {
        id: event.id,
        name: event.name,
        type: event.type,
        description: event.description,
        location: event.location,
        eventDate: event.eventDate,
        inviteSlug: event.inviteSlug,

        roleForCurrentUser,
        canEditConfig,
        canManageParticipants,
        canAddExpenses,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/[id]] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar evento." },
      { status: 500 },
    );
  }
}

// ================================================
// PATCH /api/events
// ================================================
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as
      | {
          id?: string;
          name?: string;
          description?: string | null;
          location?: string | null;
          eventDate?: string | null;
        }
      | null;

    if (!body || !body.id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    // getSessionUser com try/catch explícito para agradar o TypeScript
    let user: Awaited<ReturnType<typeof getSessionUser>> | null = null;
    try {
      user = await getSessionUser(request);
    } catch {
      user = null;
    }

    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: body.id },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (event.organizerId && event.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Apenas o organizador pode editar este evento." },
        { status: 403 },
      );
    }

    const updated = await prisma.event.update({
      where: { id: body.id },
      data: {
        name: body.name?.trim() ?? event.name,
        description: body.description ?? event.description,
        location: body.location ?? event.location,
        eventDate: body.eventDate ?? event.eventDate,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error("[PATCH /api/events] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar evento." },
      { status: 500 },
    );
  }
}
