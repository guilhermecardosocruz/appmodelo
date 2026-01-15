/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { slug?: string } }
  | { params?: Promise<{ slug?: string }> };

async function getSlugFromContext(context: RouteContext): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  return String(rawParams?.slug ?? "").trim();
}

// GET /api/events/guests/[slug]
// retorna { guest, event }
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json({ error: "Slug é obrigatório." }, { status: 400 });
    }

    const guest = await prisma.eventGuest.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        confirmedAt: true,
        eventId: true,
        event: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
            location: true,
            eventDate: true,
            ticketPrice: true,
            paymentLink: true,
          },
        },
      },
    });

    if (!guest) {
      return NextResponse.json({ error: "Convidado não encontrado." }, { status: 404 });
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
    return NextResponse.json({ error: "Erro ao carregar convite." }, { status: 500 });
  }
}

// POST /api/events/guests/[slug]
// confirma presença e (se logado) cria Ticket real por guestId
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);

    if (!slug) {
      return NextResponse.json({ error: "Slug é obrigatório." }, { status: 400 });
    }

    const sessionUser = await getSessionUser(request);

    const guest = await prisma.eventGuest.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        confirmedAt: true,
        eventId: true,
        event: { select: { id: true, type: true } },
      },
    });

    if (!guest) {
      return NextResponse.json({ error: "Convidado não encontrado." }, { status: 404 });
    }

    if (guest.event.type !== "FREE") {
      // Mantém compatível com o seu fluxo atual (convite individual também serve pré/pós)
      // mas a transformação em Ticket pode ser expandida depois.
      // Por ora, não bloqueio confirmação, só marco confirmedAt.
    }

    // confirma (idempotente)
    const now = new Date().toISOString();
    const confirmedAt = guest.confirmedAt ?? now;

    if (!guest.confirmedAt) {
      await prisma.eventGuest.update({
        where: { id: guest.id },
        data: { confirmedAt: confirmedAt },
      });
    }

    // ✅ se estiver logado, transforma o convidado em Ticket real (1-1 via guestId @unique)
    let ticketId: string | undefined;

    if (sessionUser?.id) {
      const existing = await prisma.ticket.findUnique({
        where: { guestId: guest.id },
        select: { id: true, userId: true },
      });

      if (existing && existing.userId !== sessionUser.id) {
        return NextResponse.json(
          { error: "Este ingresso já pertence a outro usuário." },
          { status: 403 }
        );
      }

      const ticket = await prisma.ticket.upsert({
        where: { guestId: guest.id },
        update: {
          status: "ACTIVE",
          attendeeName: guest.name,
          eventId: guest.eventId,
          userId: sessionUser.id,
        },
        create: {
          eventId: guest.eventId,
          userId: sessionUser.id,
          attendeeName: guest.name,
          status: "ACTIVE",
          guestId: guest.id,
        },
        select: { id: true },
      });

      ticketId = ticket.id;
    }

    return NextResponse.json({ confirmedAt, ticketId }, { status: 200 });
  } catch (err) {
    console.error("[POST /api/events/guests/[slug]] Erro inesperado:", err);
    return NextResponse.json({ error: "Erro ao confirmar presença." }, { status: 500 });
  }
}
