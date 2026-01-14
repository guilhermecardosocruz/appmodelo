import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { slug?: string } }
  | { params?: Promise<{ slug?: string }> };

async function getSlugFromContext(context: RouteContext): Promise<string> {
  const maybeParams = (context as unknown as { params?: unknown })?.params;
  if (maybeParams && typeof (maybeParams as { then?: unknown }).then === "function") {
    const awaited = await (maybeParams as Promise<{ slug?: string }>);
    return String(awaited?.slug ?? "").trim();
  }
  return String((maybeParams as { slug?: string } | undefined)?.slug ?? "").trim();
}

// GET /api/events/guests/[slug]
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Código de convidado inválido." },
        { status: 400 },
      );
    }

    const guest = await prisma.eventGuest.findUnique({
      where: { slug },
      include: { event: true },
    });

    if (!guest) {
      return NextResponse.json(
        { error: "Nenhum convidado encontrado para este código." },
        { status: 404 },
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
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/guests/[slug]] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar dados do convite." },
      { status: 500 },
    );
  }
}

// POST /api/events/guests/[slug]
// - confirma presença (marca confirmedAt)
// - se estiver logado: cria/atualiza Ticket do user com attendeeName = guest.name
// - retorna ticketId quando conseguir vincular ao usuário logado
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json(
        { error: "Código de convidado inválido." },
        { status: 400 },
      );
    }

    const now = new Date();

    const updated = await prisma.eventGuest.update({
      where: { slug },
      data: { confirmedAt: now },
      select: {
        id: true,
        name: true,
        slug: true,
        confirmedAt: true,
        eventId: true,
      },
    });

    const sessionUser = getSessionUser(request);

    let ticketId: string | null = null;

    // Se logado, salva em Meus ingressos (Ticket) — sem duplicar por event+user (best-effort)
    if (sessionUser?.id) {
      const existing = await prisma.ticket.findFirst({
        where: { eventId: updated.eventId, userId: sessionUser.id },
        select: { id: true },
      });

      if (!existing) {
        const created = await prisma.ticket.create({
          data: {
            eventId: updated.eventId,
            userId: sessionUser.id,
            attendeeName: updated.name,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        ticketId = created.id;
      } else {
        const saved = await prisma.ticket.update({
          where: { id: existing.id },
          data: {
            attendeeName: updated.name,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        ticketId = saved.id;
      }
    }

    return NextResponse.json(
      {
        confirmedAt: updated.confirmedAt,
        ticketId,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error("[POST /api/events/guests/[slug]] Erro inesperado:", err);

    const e = err as { code?: string };
    if (e?.code === "P2025") {
      return NextResponse.json(
        { error: "Convidado não encontrado para este código." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Erro ao confirmar presença do convidado." },
      { status: 500 },
    );
  }
}
