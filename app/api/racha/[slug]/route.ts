import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { slug?: string } }
  | { params?: Promise<{ slug?: string }> };

// Helper compatível com Next 15:
// evita transformar "undefined" em slug válido e trata params como Promise.
async function getSlugFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};

  if (
    rawParams &&
    typeof (rawParams as { then?: unknown }).then === "function"
  ) {
    rawParams = await (rawParams as Promise<{ slug?: string }>);
  }

  const paramsObj = rawParams as { slug?: string } | undefined;
  const rawSlug = String(paramsObj?.slug ?? "").trim();

  // Proteção extra: se vier "undefined" ou "null" como texto, tratamos como vazio
  if (!rawSlug || rawSlug === "undefined" || rawSlug === "null") {
    return "";
  }

  return rawSlug;
}

// GET /api/racha/[slug]
// Traz informações básicas do evento POS_PAGO associado ao inviteSlug ou id
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Convite inválido: link sem identificador." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findFirst({
      where: {
        type: "POS_PAGO",
        OR: [
          { inviteSlug: slug },
          { id: slug },
        ],
      },
    });

    if (!event) {
      return NextResponse.json(
        {
          error: `Convite não encontrado ou inválido (slug="${slug}")`,
        },
        { status: 404 },
      );
    }

    // tenta identificar usuário logado (mas não é obrigatório)
    let user: Awaited<ReturnType<typeof getSessionUser>> | null = null;
    try {
      user = await getSessionUser(request);
    } catch {
      user = null;
    }

    let alreadyParticipant = false;

    if (user) {
      const participant = await prisma.postEventParticipant.findFirst({
        where: {
          eventId: event.id,
          userId: user.id,
        },
      });
      alreadyParticipant = !!participant;
    }

    return NextResponse.json(
      {
        event: {
          id: event.id,
          name: event.name,
          description: event.description,
          location: event.location,
          eventDate: event.eventDate,
        },
        loggedIn: !!user,
        alreadyParticipant,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/racha/[slug]] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar convite do racha." },
      { status: 500 },
    );
  }
}

// POST /api/racha/[slug]
// Adiciona o usuário logado como participante do racha (PostEventParticipant)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Convite inválido: link sem identificador." },
        { status: 400 },
      );
    }

    const user = await getSessionUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "É necessário estar logado para entrar no racha." },
        { status: 401 },
      );
    }

    const event = await prisma.event.findFirst({
      where: {
        type: "POS_PAGO",
        OR: [
          { inviteSlug: slug },
          { id: slug },
        ],
      },
    });

    if (!event) {
      return NextResponse.json(
        {
          error: `Convite não encontrado ou inválido (slug="${slug}")`,
        },
        { status: 404 },
      );
    }

    // Verifica se já existe participante para este usuário
    const existing = await prisma.postEventParticipant.findFirst({
      where: {
        eventId: event.id,
        userId: user.id,
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          participant: {
            id: existing.id,
            name: existing.name,
            createdAt: existing.createdAt,
          },
          alreadyParticipant: true,
        },
        { status: 200 },
      );
    }

    const participant = await prisma.postEventParticipant.create({
      data: {
        eventId: event.id,
        userId: user.id,
        name: user.name,
      },
    });

    return NextResponse.json(
      {
        participant: {
          id: participant.id,
          name: participant.name,
          createdAt: participant.createdAt,
        },
        alreadyParticipant: false,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/racha/[slug]] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao entrar no racha." },
      { status: 500 },
    );
  }
}
