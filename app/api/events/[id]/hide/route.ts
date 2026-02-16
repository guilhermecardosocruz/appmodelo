import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export async function POST(req: NextRequest, context: Ctx) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id: eventId } = await context.params;
    if (!eventId) return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });

    // Verifica se o evento existe e se o user tem relação (organizador OU participante do racha)
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, organizerId: true, type: true },
    });
    if (!event) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });

    const isOrganizer = !event.organizerId || event.organizerId === user.id;

    let isParticipant = false;
    if (!isOrganizer && event.type === "POS_PAGO") {
      const p = await prisma.postEventParticipant.findFirst({
        where: { eventId, userId: user.id },
        select: { id: true },
      });
      isParticipant = !!p;
    }

    if (!isOrganizer && !isParticipant) {
      return NextResponse.json({ error: "Você não tem permissão para ocultar este evento." }, { status: 403 });
    }

    const now = new Date();

    await prisma.hiddenEvent.upsert({
      where: { userId_eventId: { userId: user.id, eventId } },
      update: { hiddenAt: now, purgeAt: addDays(now, 30) },
      create: { userId: user.id, eventId, hiddenAt: now, purgeAt: addDays(now, 30) },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/events/[id]/hide] erro:", err);
    return NextResponse.json({ error: "Erro ao ocultar evento." }, { status: 500 });
  }
}
