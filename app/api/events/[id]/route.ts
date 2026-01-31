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

    let event = await prisma.event.findUnique({
      where: { id: eventId },
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

      // Se for POS_PAGO, o usuário for organizador e ainda não houver inviteSlug,
      // geramos um automaticamente (útil para eventos antigos já criados).
      if (isOrganizer && event.type === "POS_PAGO" && !event.inviteSlug) {
        const randomPart = Math.random().toString(36).slice(2, 8);
        const inviteSlug = `${event.id.slice(0, 6)}-r-${randomPart}`;
        event = await prisma.event.update({
          where: { id: event.id },
          data: { inviteSlug },
        });
      }

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
// PATCH /api/events/[id]
// ================================================
export async function PATCH(request: NextRequest, context: RouteContext) {
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

    const idFromBody =
      typeof body?.id === "string" ? body.id.trim() : "";
    const idFromPath = await getEventIdFromContext(context);
    const eventId = idFromBody || idFromPath;

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

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
      where: { id: eventId },
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

    const data: {
      name?: string;
      description?: string | null;
      location?: string | null;
      eventDate?: Date | null;
    } = {};

    if (typeof body?.name === "string") {
      const v = body.name.trim();
      if (!v) {
        return NextResponse.json(
          { error: "Nome do evento não pode ser vazio." },
          { status: 400 },
        );
      }
      data.name = v;
    }

    if (typeof body?.description === "string" || body?.description === null) {
      data.description = body.description;
    }

    if (typeof body?.location === "string" || body?.location === null) {
      data.location = body.location;
    }

    // eventDate pode vir como string ISO ou "YYYY-MM-DD"
    if (typeof body?.eventDate === "string") {
      const d = new Date(body.eventDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "Data do evento inválida." },
          { status: 400 },
        );
      }
      data.eventDate = d;
    } else if (body && "eventDate" in body && body.eventDate === null) {
      // permitir limpar a data
      data.eventDate = null;
    }

    // Se não veio nenhum campo pra atualizar, devolve o evento atual sem erro
    if (Object.keys(data).length === 0) {
      return NextResponse.json(event, { status: 200 });
    }

    const updated = await prisma.event.update({
      where: { id: eventId },
      data,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error("[PATCH /api/events/[id]] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar evento." },
      { status: 500 },
    );
  }
}
