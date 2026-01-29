import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function getEventId(context: RouteContext): Promise<string> {
  const { id } = await context.params;
  return String(id ?? "").trim();
}

type EventRole = "ORGANIZER" | "POST_PARTICIPANT";

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const id = await getEventId(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    const isOrganizer =
      !event.organizerId || event.organizerId === user.id;

    let isPostParticipant = false;
    if (!isOrganizer) {
      const participant = await prisma.postEventParticipant.findFirst({
        where: {
          eventId: id,
          userId: user.id,
        },
        select: { id: true },
      });
      isPostParticipant = !!participant;
    }

    if (!isOrganizer && !isPostParticipant) {
      return NextResponse.json(
        { error: "Você não tem permissão para ver este evento." },
        { status: 403 },
      );
    }

    const roleForCurrentUser: EventRole = isOrganizer
      ? "ORGANIZER"
      : "POST_PARTICIPANT";

    const canEditConfig = isOrganizer;
    const canManageParticipants = isOrganizer;
    const canAddExpenses = isOrganizer || isPostParticipant;

    return NextResponse.json(
      {
        ...event,
        roleForCurrentUser,
        canEditConfig,
        canManageParticipants,
        canAddExpenses,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("Erro ao buscar evento:", err);
    return NextResponse.json(
      { error: "Erro ao buscar evento." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const id = await getEventId(context);
    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const existing = await prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (existing.organizerId && existing.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Você não tem permissão para alterar este evento." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | {
          name?: string;
          description?: string | null;
          location?: string | null;
          eventDate?: string | null;
          inviteSlug?: string | null;
          latitude?: number | null;
          longitude?: number | null;
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 },
      );
    }

    const {
      name,
      description,
      location,
      eventDate,
      inviteSlug,
      latitude,
      longitude,
    } = body;

    const data: Record<string, unknown> = {};

    if (typeof name === "string") {
      data.name = name.trim();
    }

    if (typeof description !== "undefined") {
      data.description = description ? String(description).trim() : null;
    }

    if (typeof location !== "undefined") {
      data.location = location ? String(location).trim() : null;
    }

    if (typeof inviteSlug !== "undefined") {
      data.inviteSlug = inviteSlug ? String(inviteSlug).trim() : null;
    }

    if (typeof eventDate !== "undefined") {
      data.eventDate = eventDate ? new Date(eventDate) : null;
    }

    if (typeof latitude !== "undefined") {
      data.latitude = latitude === null ? null : Number(latitude);
    }

    if (typeof longitude !== "undefined") {
      data.longitude = longitude === null ? null : Number(longitude);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo para atualizar." },
        { status: 400 },
      );
    }

    // Se era um evento antigo sem dono, registra o organizador atual
    if (!existing.organizerId) {
      data.organizerId = user.id;
    }

    const updated = await prisma.event.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error("Erro ao atualizar evento:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar evento." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const id = await getEventId(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const existing = await prisma.event.findUnique({
      where: { id },
      select: { id: true, organizerId: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (existing.organizerId && existing.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Você não tem permissão para excluir este evento." },
        { status: 403 },
      );
    }

    // Tentamos excluir o evento. Se houver vínculos (FK), tratamos o erro P2003.
    try {
      await prisma.event.delete({
        where: { id },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2003"
      ) {
        return NextResponse.json(
          {
            error:
              "Não é possível excluir este evento porque existem registros vinculados (ingressos, pagamentos ou convidados).",
          },
          { status: 409 },
        );
      }

      console.error("Erro Prisma ao excluir evento:", err);
      throw err;
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Erro ao excluir evento:", err);
    return NextResponse.json(
      { error: "Erro ao excluir evento." },
      { status: 500 },
    );
  }
}
