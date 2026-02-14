import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { slug?: string } }
  | { params?: Promise<{ slug?: string }> };

async function getSlugFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};

  // Next 16+ pode entregar params como Promise<{ slug }>
  if (
    rawParams &&
    typeof (rawParams as { then?: unknown }).then === "function"
  ) {
    rawParams = await (rawParams as Promise<{ slug?: string }>);
  }

  const paramsObj = rawParams as { slug?: string } | undefined;
  return String(paramsObj?.slug ?? "").trim();
}

// GET /api/events/post-participants/[slug]
// Retorna dados do evento + participante POS_PAGO associado a esse "slug" (usando o id do participante).
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Código do convite é obrigatório." },
        { status: 400 },
      );
    }

    const participant = await prisma.postEventParticipant.findUnique({
      where: { id: slug },
    });

    if (!participant) {
      return NextResponse.json(
        { error: "Nenhum participante encontrado para este convite." },
        { status: 404 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: participant.eventId },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        location: true,
        eventDate: true,
        organizerId: true, // ✅ necessário para permitir o organizador acessar sem vínculo
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento relacionado a este convite não foi encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        event,
        participant: {
          id: participant.id,
          name: participant.name,
          userId: participant.userId,
          createdAt: participant.createdAt,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(
      "[GET /api/events/post-participants/[slug]] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      { error: "Erro ao carregar informações do convite pós-pago." },
      { status: 500 },
    );
  }
}

// POST /api/events/post-participants/[slug]
// Vincula o participante ao usuário logado (preenche postEventParticipant.userId)
// para que o evento apareça no dashboard desse usuário.
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "É necessário estar autenticado para confirmar este convite." },
        { status: 401 },
      );
    }

    const slug = await getSlugFromContext(context);
    if (!slug) {
      return NextResponse.json(
        { error: "Código do convite é obrigatório." },
        { status: 400 },
      );
    }

    const participant = await prisma.postEventParticipant.findUnique({
      where: { id: slug },
    });

    if (!participant) {
      return NextResponse.json(
        { error: "Participante não encontrado para este convite." },
        { status: 404 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: participant.eventId },
      select: {
        id: true,
        type: true,
        name: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento relacionado a este convite não foi encontrado." },
        { status: 404 },
      );
    }

    // Se já estiver vinculado a outro usuário, bloqueia
    if (participant.userId && participant.userId !== user.id) {
      return NextResponse.json(
        {
          error:
            "Este convite já foi vinculado à conta de outra pessoa. Peça um novo convite ao organizador.",
        },
        { status: 409 },
      );
    }

    // Se já estiver vinculado a ESTE usuário, apenas retorna ok (idempotente)
    if (participant.userId === user.id) {
      return NextResponse.json(
        {
          ok: true,
          alreadyLinked: true,
          eventId: event.id,
          participantId: participant.id,
        },
        { status: 200 },
      );
    }

    // Se ainda não estava vinculado, vincula agora
    const updated = await prisma.postEventParticipant.update({
      where: { id: participant.id },
      data: {
        userId: user.id,
      },
      select: {
        id: true,
        name: true,
        userId: true,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        alreadyLinked: false,
        eventId: event.id,
        participantId: updated.id,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error(
      "[POST /api/events/post-participants/[slug]] Erro inesperado:",
      err,
    );
    return NextResponse.json(
      { error: "Erro ao confirmar este convite pós-pago." },
      { status: 500 },
    );
  }
}
