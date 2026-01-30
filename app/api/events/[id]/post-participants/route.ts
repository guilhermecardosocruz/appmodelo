import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};
  if (
    rawParams &&
    typeof (rawParams as { then?: unknown }).then === "function"
  ) {
    rawParams = await (rawParams as Promise<{ id?: string }>);
  }
  const paramsObj = rawParams as { id?: string } | undefined;
  return String(paramsObj?.id ?? "").trim();
}

// GET /api/events/[id]/post-participants
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

    const isOrganizer =
      !event.organizerId || event.organizerId === user.id;

    let isParticipant = false;
    if (!isOrganizer) {
      const participant = await prisma.postEventParticipant.findFirst({
        where: {
          eventId,
          userId: user.id,
        },
        select: { id: true },
      });
      isParticipant = !!participant;
    }

    if (!isOrganizer && !isParticipant) {
      return NextResponse.json(
        { error: "Você não tem permissão para ver este evento." },
        { status: 403 },
      );
    }

    // 🔁 Backfill: se o usuário for o organizador, garante que ele exista como participante
    if (isOrganizer && event.organizerId) {
      try {
        const existingOrganizerParticipant =
          await prisma.postEventParticipant.findFirst({
            where: {
              eventId,
              userId: user.id,
            },
            select: { id: true },
          });

        if (!existingOrganizerParticipant) {
          const userRecord = await prisma.user.findUnique({
            where: { id: user.id },
            select: { name: true },
          });

          const participantName = userRecord?.name ?? "Organizador";

          await prisma.postEventParticipant.create({
            data: {
              eventId,
              userId: user.id,
              name: participantName,
            },
          });
        }
      } catch (err) {
        console.error(
          "[GET /post-participants] Erro ao garantir participante organizador:",
          err,
        );
      }
    }

    const participants = await prisma.postEventParticipant.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ participants }, { status: 200 });
  } catch (err) {
    console.error(
      "[GET /api/events/[id]/post-participants] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      { error: "Erro ao carregar participantes." },
      { status: 500 },
    );
  }
}

// POST /api/events/[id]/post-participants
// Regra: só pode adicionar gente que já tem conta no sistema
// Aceita: { userId?: string; name?: string }
// - se vier userId, usa ele diretamente
// - se não vier, tenta localizar usuário usando o texto de "name"
//   (email exato OU nome exato / muito simples)
// Em qualquer caso, SEMPRE grava com userId preenchido.
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
      | { name?: string; userId?: string }
      | null;

    const rawName = String(body?.name ?? "").trim();
    const rawUserId = String(body?.userId ?? "").trim();

    if (!rawName && !rawUserId) {
      return NextResponse.json(
        {
          error:
            "Selecione um usuário do sistema para adicionar ao racha.",
        },
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

    // Se era um evento antigo sem dono, assume o usuário atual como organizador
    if (!event.organizerId) {
      await prisma.event.update({
        where: { id: eventId },
        data: { organizerId: user.id },
      });
    }

    // 🔍 Descobrir qual usuário do sistema será vinculado
    let targetUserId: string | null = null;
    let targetName: string | null = null;

    if (rawUserId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: rawUserId },
        select: { id: true, name: true },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: "Usuário não encontrado." },
          { status: 400 },
        );
      }

      targetUserId = targetUser.id;
      targetName = targetUser.name;
    } else if (rawName) {
      // tenta bater primeiro por email exato
      let targetUser = await prisma.user.findUnique({
        where: { email: rawName },
        select: { id: true, name: true },
      });

      // se não achar por email, tenta por nome exato
      if (!targetUser) {
        targetUser = await prisma.user.findFirst({
          where: { name: rawName },
          select: { id: true, name: true },
        });
      }

      if (!targetUser) {
        return NextResponse.json(
          {
            error:
              "Usuário não encontrado. Para entrar no racha, a pessoa precisa ter conta no app.",
          },
          { status: 400 },
        );
      }

      targetUserId = targetUser.id;
      targetName = targetUser.name;
    }

    if (!targetUserId) {
      return NextResponse.json(
        {
          error:
            "Não foi possível identificar o usuário. Tente novamente selecionando alguém da lista.",
        },
        { status: 400 },
      );
    }

    // Nome exibido no racha: se o organizador digitou algo diferente,
    // podemos manter esse texto; caso contrário usamos o nome do usuário.
    const finalName = rawName && rawName !== targetName ? rawName : targetName;

    // Garante unicidade: no máximo um participante por usuário em cada evento
    const existing = await prisma.postEventParticipant.findFirst({
      where: {
        eventId,
        userId: targetUserId,
      },
    });

    if (existing) {
      // Já estava na lista -> apenas retorna
      return NextResponse.json(existing, { status: 200 });
    }

    const participant = await prisma.postEventParticipant.create({
      data: {
        eventId,
        userId: targetUserId,
        name: finalName ?? "Participante",
      },
    });

    return NextResponse.json(participant, { status: 201 });
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
