import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  const maybeParams = (context as { params?: unknown })?.params;

  const raw =
    maybeParams && typeof (maybeParams as { then?: unknown }).then === "function"
      ? await (maybeParams as Promise<{ id?: string }>)
      : (maybeParams as { id?: string } | undefined);

  return String(raw?.id ?? "").trim();
}

// GET /api/events/[id]/post-participants
// Lista participantes do módulo pós-pago (apenas ativos)
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        type: true,
        organizerId: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (event.type !== "POS_PAGO") {
      return NextResponse.json(
        { error: "Participantes pós-pago só existem em eventos POS_PAGO." },
        { status: 400 },
      );
    }

    const allParticipants = await prisma.postEventParticipant.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        userId: true,
        isActive: true,
      },
    });

    const isOrganizer =
      !event.organizerId || event.organizerId === sessionUser.id;

    const isParticipant = allParticipants.some(
      (p) => p.userId === sessionUser.id,
    );

    if (!isOrganizer && !isParticipant) {
      return NextResponse.json(
        {
          error:
            "Você não tem acesso a esta lista de participantes.",
        },
        { status: 403 },
      );
    }

    const activeParticipants = allParticipants.filter((p) => p.isActive);

    return NextResponse.json(
      {
        participants: activeParticipants.map((p) => ({
          id: p.id,
          name: p.name,
          createdAt: p.createdAt,
        })),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/[id]/post-participants] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar participantes." },
      { status: 500 },
    );
  }
}

// POST /api/events/[id]/post-participants
// Adiciona participante vinculado a um USER existente (por email ou ID)
// - Se já existir participante ativo: retorna ele
// - Se já existir participante inativo: reativa (isActive = true) e retorna
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        type: true,
        organizerId: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (event.type !== "POS_PAGO") {
      return NextResponse.json(
        {
          error:
            "Participantes pós-pago só podem ser adicionados em eventos POS_PAGO.",
        },
        { status: 400 },
      );
    }

    const isOrganizer =
      !event.organizerId || event.organizerId === sessionUser.id;

    if (!isOrganizer) {
      return NextResponse.json(
        {
          error:
            "Apenas o organizador pode adicionar participantes no racha.",
        },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { userEmail?: unknown; userId?: unknown }
      | null;

    const rawEmail = String(body?.userEmail ?? "").trim().toLowerCase();
    const rawUserId = String(body?.userId ?? "").trim();

    if (!rawEmail && !rawUserId) {
      return NextResponse.json(
        {
          error:
            "Informe o e-mail ou o ID do usuário que já tem conta no app.",
        },
        { status: 400 },
      );
    }

    let user =
      rawUserId !== ""
        ? await prisma.user.findUnique({ where: { id: rawUserId } })
        : null;

    if (!user && rawEmail) {
      user = await prisma.user.findUnique({ where: { email: rawEmail } });
    }

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Usuário não encontrado. Ele precisa criar uma conta no app antes de entrar no racha.",
        },
        { status: 404 },
      );
    }

    const existing = await prisma.postEventParticipant.findFirst({
      where: {
        eventId,
        userId: user.id,
      },
    });

    if (existing) {
      // Se já existe, apenas garante que está ativo
      if (!existing.isActive) {
        const updated = await prisma.postEventParticipant.update({
          where: { id: existing.id },
          data: { isActive: true },
        });

        return NextResponse.json(
          {
            id: updated.id,
            name: updated.name,
            createdAt: updated.createdAt,
          },
          { status: 200 },
        );
      }

      return NextResponse.json(
        {
          id: existing.id,
          name: existing.name,
          createdAt: existing.createdAt,
        },
        { status: 200 },
      );
    }

    const participant = await prisma.postEventParticipant.create({
      data: {
        eventId,
        userId: user.id,
        name: user.name,
        isActive: true,
      },
    });

    return NextResponse.json(
      {
        id: participant.id,
        name: participant.name,
        createdAt: participant.createdAt,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error(
      "[POST /api/events/[id]/post-participants] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      { error: "Erro ao adicionar participante." },
      { status: 500 },
    );
  }
}
