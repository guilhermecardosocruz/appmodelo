/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext =
  | { params?: { slug?: string } }
  | { params?: Promise<{ slug?: string }> };

async function getSlugFromContext(context: RouteContext): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  const slug = String(rawParams?.slug ?? "").trim();
  return slug;
}

// GET /api/events/guests/[slug]
// Retorna convidado + evento (para montar a página de convite personalizada)
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Código de convidado inválido." },
        { status: 400 }
      );
    }

    const guest = await prisma.eventGuest.findUnique({
      where: { slug },
      include: {
        event: true,
      },
    });

    if (!guest) {
      return NextResponse.json(
        { error: "Nenhum convidado encontrado para este código." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        guest: {
          id: guest.id,
          name: guest.name,
          slug: guest.slug,
          confirmedAt: guest.confirmedAt,
        },
        event: guest.event,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/events/guests/[slug]] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar dados do convite." },
      { status: 500 }
    );
  }
}

// POST /api/events/guests/[slug]
// Confirma presença do convidado (marca confirmedAt)
export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Código de convidado inválido." },
        { status: 400 }
      );
    }

    const now = new Date();

    const updated = await prisma.eventGuest.update({
      where: { slug },
      data: {
        confirmedAt: now,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        confirmedAt: true,
        eventId: true,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (err: any) {
    console.error("[POST /api/events/guests/[slug]] Erro inesperado:", err);

    if (err?.code === "P2025") {
      return NextResponse.json(
        { error: "Convidado não encontrado para este código." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao confirmar presença do convidado." },
      { status: 500 }
    );
  }
}
