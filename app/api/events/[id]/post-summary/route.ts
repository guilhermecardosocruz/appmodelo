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

// GET /api/events/[id]/post-summary
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

    if (event.organizerId && event.organizerId !== user.id) {
      return NextResponse.json(
        { error: "Você não tem permissão para ver este evento." },
        { status: 403 },
      );
    }

    const participants = await prisma.postEventParticipant.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });

    if (!participants.length) {
      return NextResponse.json({ participants: [], balances: [] }, { status: 200 });
    }

    const [expenses, shares] = await Promise.all([
      prisma.postEventExpense.findMany({
        where: { eventId },
        select: { id: true, payerId: true, totalAmount: true },
      }),
      prisma.postEventExpenseShare.findMany({
        where: {
          expense: { eventId },
        },
        select: {
          participantId: true,
          shareAmount: true,
        },
      }),
    ]);

    const paidMap = new Map<string, number>();
    const shareMap = new Map<string, number>();

    for (const e of expenses) {
      const value = Number(e.totalAmount ?? 0);
      paidMap.set(e.payerId, (paidMap.get(e.payerId) ?? 0) + value);
    }

    for (const s of shares) {
      const value = Number(s.shareAmount ?? 0);
      shareMap.set(
        s.participantId,
        (shareMap.get(s.participantId) ?? 0) + value,
      );
    }

    const balances = participants.map((p) => {
      const totalPaid = paidMap.get(p.id) ?? 0;
      const totalShare = shareMap.get(p.id) ?? 0;
      const balance = totalPaid - totalShare;

      return {
        participantId: p.id,
        name: p.name,
        totalPaid,
        totalShare,
        balance,
      };
    });

    return NextResponse.json(
      {
        eventId,
        participants,
        balances,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/[id]/post-summary] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao calcular resumo do evento." },
      { status: 500 },
    );
  }
}
