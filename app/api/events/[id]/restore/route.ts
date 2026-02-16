import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Ctx) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { id: eventId } = await context.params;
    if (!eventId) {
      return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true, deletedAt: true },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    }

    if (event.organizerId && event.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Somente o organizador pode restaurar este evento." },
        { status: 403 },
      );
    }

    if (!event.deletedAt) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    await prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: null, purgeAt: null, organizerId: event.organizerId ?? user.id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/events/[id]/restore] erro:", err);
    return NextResponse.json({ error: "Erro ao restaurar evento." }, { status: 500 });
  }
}
