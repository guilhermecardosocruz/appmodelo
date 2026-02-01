import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { slug?: string } }
  | { params?: Promise<{ slug?: string }> };

async function getSlugFromContext(context: RouteContext): Promise<string> {
  const maybeParams = (context as { params?: unknown })?.params;

  const raw =
    maybeParams && typeof (maybeParams as { then?: unknown }).then === "function"
      ? await (maybeParams as Promise<{ slug?: string }>)
      : (maybeParams as { slug?: string } | undefined);

  const slug = String(raw?.slug ?? "").trim();

  console.log("[/api/racha/[slug]] slug recebido do context:", slug);

  return slug;
}

// GET /api/racha/[slug]
// Traz informações básicas do evento POS_PAGO associado ao inviteSlug
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      console.warn(
        "[GET /api/racha/[slug]] Slug vazio ou ausente. slug=",
        slug,
      );
      return NextResponse.json(
        {
          error: `Slug do convite é obrigatório (recebido: "${slug}")`,
        },
        { status: 400 },
      );
    }

    console.log(
      "[GET /api/racha/[slug]] Buscando evento por inviteSlug:",
      slug,
    );

    const event = await prisma.event.findFirst({
      where: {
        inviteSlug: slug,
        type: "POS_PAGO",
      },
    });

    if (!event) {
      console.warn(
        "[GET /api/racha/[slug]] Nenhum evento encontrado para inviteSlug:",
        slug,
      );
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
    } catch (err) {
      console.warn(
        "[GET /api/racha/[slug]] Falha ao obter usuário (seguindo como anônimo):",
        err,
      );
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
      console.warn(
        "[POST /api/racha/[slug]] Slug vazio ou ausente. slug=",
        slug,
      );
      return NextResponse.json(
        {
          error: `Slug do convite é obrigatório (recebido: "${slug}")`,
        },
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

    console.log(
      "[POST /api/racha/[slug]] Buscando evento por inviteSlug:",
      slug,
    );

    const event = await prisma.event.findFirst({
      where: {
        inviteSlug: slug,
        type: "POS_PAGO",
      },
    });

    if (!event) {
      console.warn(
        "[POST /api/racha/[slug]] Nenhum evento encontrado para inviteSlug:",
        slug,
      );
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
