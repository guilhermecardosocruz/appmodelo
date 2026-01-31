import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { slug?: string } }
  | { params?: Promise<{ slug?: string }> };

// Lê o slug do context (Next 16 pode mandar params como Promise)
async function getSlugFromContext(context: RouteContext): Promise<string> {
  const maybeParams = (context as { params?: unknown })?.params;

  const raw =
    maybeParams && typeof (maybeParams as { then?: unknown }).then === "function"
      ? await (maybeParams as Promise<{ slug?: string }>)
      : (maybeParams as { slug?: string } | undefined);

  return String(raw?.slug ?? "").trim();
}

// Tenta encontrar o evento do racha a partir do slug
async function findPosPagoEventBySlug(slug: string) {
  if (!slug) return null;

  // 1) tenta pelo inviteSlug exato
  let event = await prisma.event.findFirst({
    where: {
      inviteSlug: slug,
      type: "POS_PAGO",
    },
  });

  if (event) return event;

  // 2) fallback: tenta achar pelo prefixo do ID (ex.: abc123-r-xyz)
  const [prefix, middle] = slug.split("-");
  if (!prefix || middle !== "r") {
    return null;
  }

  event = await prisma.event.findFirst({
    where: {
      id: {
        startsWith: prefix,
      },
      type: "POS_PAGO",
    },
  });

  if (!event) return null;

  // Se achou pelo prefixo, aproveita para fixar o inviteSlug no banco
  if (event.inviteSlug !== slug) {
    event = await prisma.event.update({
      where: { id: event.id },
      data: { inviteSlug: slug },
    });
  }

  return event;
}

// GET /api/racha/[slug]  -> carrega dados básicos do evento + status do usuário
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Slug do convite é obrigatório." },
        { status: 400 },
      );
    }

    const event = await findPosPagoEventBySlug(slug);

    if (!event) {
      return NextResponse.json(
        { error: "Convite não encontrado ou inválido." },
        { status: 404 },
      );
    }

    const user = await getSessionUser(request).catch(() => null as const);

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

// POST /api/racha/[slug] -> adiciona o usuário logado como participante do racha
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Slug do convite é obrigatório." },
        { status: 400 },
      );
    }

    const user = await getSessionUser(request).catch(() => null as const);

    if (!user) {
      return NextResponse.json(
        { error: "É necessário estar logado para entrar no racha." },
        { status: 401 },
      );
    }

    const event = await findPosPagoEventBySlug(slug);

    if (!event) {
      return NextResponse.json(
        { error: "Convite não encontrado ou inválido." },
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
