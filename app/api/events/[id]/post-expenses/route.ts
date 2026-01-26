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

// GET /api/events/[id]/post-expenses
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

    const expenses = await prisma.postEventExpense.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      include: {
        payer: true,
        shares: {
          include: {
            participant: true,
          },
        },
      },
    });

    return NextResponse.json({ expenses }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/events/[id]/post-expenses] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar despesas." },
      { status: 500 },
    );
  }
}

// POST /api/events/[id]/post-expenses
// Body: { description: string, totalAmount: number|string, payerId: string, participantIds: string[] }
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
      | {
          description?: string;
          totalAmount?: number | string;
          payerId?: string;
          participantIds?: string[];
        }
      | null;

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Corpo da requisição inválido." },
        { status: 400 },
      );
    }

    const description = String(body.description ?? "").trim();
    const payerId = String(body.payerId ?? "").trim();
    const rawAmount = body.totalAmount;
    const participantIds = Array.isArray(body.participantIds)
      ? body.participantIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [];

    if (!description) {
      return NextResponse.json(
        { error: "Descrição da despesa é obrigatória." },
        { status: 400 },
      );
    }

    if (!payerId) {
      return NextResponse.json(
        { error: "Participante pagador é obrigatório." },
        { status: 400 },
      );
    }

    if (!rawAmount && rawAmount !== 0) {
      return NextResponse.json(
        { error: "Valor total da despesa é obrigatório." },
        { status: 400 },
      );
    }

    const totalAmount = Number(rawAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return NextResponse.json(
        { error: "Valor total da despesa deve ser maior que zero." },
        { status: 400 },
      );
    }

    if (!participantIds.length) {
      return NextResponse.json(
        { error: "Selecione pelo menos uma pessoa para dividir a despesa." },
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
        { error: "Você não tem permissão para alterar este evento." },
        { status: 403 },
      );
    }

    // Se era um evento antigo sem dono, adota para o usuário atual
    if (!event.organizerId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { organizerId: user.id },
      });
    }

    // Garante que todos os participantes existem e pertencem ao evento
    const participants = await prisma.postEventParticipant.findMany({
      where: {
        eventId,
        id: { in: Array.from(new Set([...participantIds, payerId])) },
      },
    });

    if (!participants.length) {
      return NextResponse.json(
        { error: "Nenhum participante válido encontrado para esta despesa." },
        { status: 400 },
      );
    }

    const payerExists = participants.some((p) => p.id === payerId);
    if (!payerExists) {
      return NextResponse.json(
        {
          error:
            "Participante pagador não pertence a este evento ou não foi encontrado.",
        },
        { status: 400 },
      );
    }

    const uniqueParticipantIds = Array.from(new Set(participantIds));
    const divisor = uniqueParticipantIds.length;

    if (divisor <= 0) {
      return NextResponse.json(
        { error: "Selecione ao menos um participante para a divisão." },
        { status: 400 },
      );
    }

    // Divide o valor em cotas iguais (2 casas decimais)
    const centsTotal = Math.round(totalAmount * 100);
    const baseShareInCents = Math.floor(centsTotal / divisor);
    let remainder = centsTotal - baseShareInCents * divisor;

    const sharesData = uniqueParticipantIds.map((participantId) => {
      let shareCents = baseShareInCents;
      if (remainder > 0) {
        shareCents += 1;
        remainder -= 1;
      }
      const shareAmount = shareCents / 100;
      return {
        participantId,
        shareAmount,
      };
    });

    const created = await prisma.postEventExpense.create({
      data: {
        eventId,
        payerId,
        description,
        totalAmount,
        shares: {
          createMany: {
            data: sharesData.map((s) => ({
              participantId: s.participantId,
              shareAmount: s.shareAmount,
            })),
          },
        },
      },
      include: {
        payer: true,
        shares: {
          include: {
            participant: true,
          },
        },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/events/[id]/post-expenses] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao registrar despesa." },
      { status: 500 },
    );
  }
}
