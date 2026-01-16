import { NextRequest, NextResponse } from "next/server";
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

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
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

    return NextResponse.json(event, { status: 200 });
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
    const user = getSessionUser(request);
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
    const user = getSessionUser(request);
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

    const exists = await prisma.event.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    const [ticketsCount, paymentsCount] = await Promise.all([
      prisma.ticket.count({ where: { eventId: id } }),
      prisma.payment.count({ where: { eventId: id } }),
    ]);

    if (ticketsCount > 0 || paymentsCount > 0) {
      return NextResponse.json(
        {
          error:
            "Não é possível excluir este evento porque existem tickets ou pagamentos vinculados.",
        },
        { status: 409 },
      );
    }

    await prisma.event.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Erro ao excluir evento:", err);
    return NextResponse.json(
      { error: "Erro ao excluir evento." },
      { status: 500 },
    );
  }
}
