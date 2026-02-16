import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: Ctx) {
  try {
    const user = await getSessionUser(req);
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id: eventId } = await context.params;
    if (!eventId) return NextResponse.json({ error: "ID do evento é obrigatório." }, { status: 400 });

    await prisma.hiddenEvent.deleteMany({
      where: { userId: user.id, eventId },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/events/[id]/unhide] erro:", err);
    return NextResponse.json({ error: "Erro ao restaurar evento no dashboard." }, { status: 500 });
  }
}
