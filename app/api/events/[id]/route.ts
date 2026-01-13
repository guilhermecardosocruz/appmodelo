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
        { status: 400 }
      );
    }

    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json(event, { status: 200 });
  } catch (err) {
    console.error("Erro ao buscar evento:", err);
    return NextResponse.json(
      { error: "Erro ao buscar evento." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    const id = await getEventId(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 }
      );
    }

    const exists = await prisma.event.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 }
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
        { status: 409 }
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
      { status: 500 }
    );
  }
}
