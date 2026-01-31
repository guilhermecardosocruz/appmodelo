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

  return String(raw?.slug ?? "").trim();
}

// GET /api/convite/[slug]
// Traz informações básicas do evento associado ao inviteSlug
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Slug do convite é obrigatório." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findFirst({
      where: {
        inviteSlug: slug,
        // Hoje usamos principalmente PRE_PAGO para convites abertos.
        // Se quiser permitir FREE também, dá pra ajustar aqui depois.
        // type: { in: ["PRE_PAGO", "FREE"] as const },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Convite não encontrado ou inválido." },
        { status: 404 },
      );
    }

    let user: Awaited<ReturnType<typeof getSessionUser>> | null = null;
    try {
      user = await getSessionUser(request);
    } catch {
      user = null;
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
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/convite/[slug]] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar convite." },
      { status: 500 },
    );
  }
}
