import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown =
    (context as unknown as { params?: unknown })?.params ?? {};
  if (rawParams && typeof (rawParams as { then?: unknown }).then === "function") {
    rawParams = await (rawParams as Promise<{ id?: string }>);
  }
  const paramsObj = rawParams as { id?: string } | undefined;
  return String(paramsObj?.id ?? "").trim();
}

/**
 * Lista de ingressos de um evento para uso na portaria.
 * NÃO exige autenticação (o link da portaria é "secreto").
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        type: true,
        eventDate: true,
        location: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    const tickets = await prisma.ticket.findMany({
      where: { eventId: event.id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        guest: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const items = tickets.map((t) => {
      const displayName =
        (t.attendeeName && t.attendeeName.trim()) ||
        (t.guest?.name && t.guest.name.trim()) ||
        (t.user?.name && t.user.name.trim()) ||
        "(Sem nome)";

      return {
        id: t.id,
        displayName,
        attendeeName: t.attendeeName,
        guestName: t.guest?.name ?? null,
        userName: t.user?.name ?? null,
        userEmail: t.user?.email ?? null,
        status: t.status,
        checkedInAt: t.checkedInAt,
        createdAt: t.createdAt,
      };
    });

    // Ordena por nome já no backend (pt-BR)
    items.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "pt-BR", {
        sensitivity: "base",
      }),
    );

    return NextResponse.json({
      event: {
        id: event.id,
        name: event.name,
        type: event.type,
        eventDate: event.eventDate,
        location: event.location,
      },
      tickets: items,
    });
  } catch (err) {
    console.error("[GET /api/events/[id]/tickets] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar ingressos do evento." },
      { status: 500 },
    );
  }
}

/**
 * Registra check-in de um ingresso na portaria.
 * Corpo esperado: { ticketId: string, mode?: "scan" | "manual" }
 *
 * - mode "scan": apenas marca entrada; se já tiver entrada, não altera e retorna "already-checked".
 * - mode "manual": alterna (marca / desmarca) o check-in.
 *
 * NÃO exige autenticação (link da portaria é "secreto").
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);

    const ticketId =
      typeof body?.ticketId === "string" ? body.ticketId.trim() : "";
    const mode: "scan" | "manual" =
      body?.mode === "manual" ? "manual" : "scan";

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do ingresso é obrigatório." },
        { status: 400 },
      );
    }

    const baseTicket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        event: {
          select: {
            id: true,
          },
        },
        user: {
          select: {
            email: true,
          },
        },
        guest: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!baseTicket || baseTicket.eventId !== eventId) {
      return NextResponse.json(
        { error: "Ingresso não encontrado para este evento." },
        { status: 404 },
      );
    }

    if (baseTicket.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Este ingresso foi cancelado e não pode registrar entrada." },
        { status: 400 },
      );
    }

    let status: "checked-in" | "already-checked" | "removed-checkin";
    let checkedInAt = baseTicket.checkedInAt;

    if (mode === "scan") {
      // Escaneando QR Code: só marca se ainda não tiver entrada
      if (baseTicket.checkedInAt) {
        status = "already-checked";
      } else {
        const updated = await prisma.ticket.update({
          where: { id: ticketId },
          data: {
            checkedInAt: new Date(),
          },
        });
        status = "checked-in";
        checkedInAt = updated.checkedInAt;
      }
    } else {
      // Ação manual: alterna check-in
      if (baseTicket.checkedInAt) {
        const updated = await prisma.ticket.update({
          where: { id: ticketId },
          data: {
            checkedInAt: null,
          },
        });
        status = "removed-checkin";
        checkedInAt = updated.checkedInAt;
      } else {
        const updated = await prisma.ticket.update({
          where: { id: ticketId },
          data: {
            checkedInAt: new Date(),
          },
        });
        status = "checked-in";
        checkedInAt = updated.checkedInAt;
      }
    }

    return NextResponse.json({
      status,
      ticket: {
        id: baseTicket.id,
        attendeeName: baseTicket.attendeeName,
        guestName: baseTicket.guest?.name ?? null,
        userEmail: baseTicket.user?.email ?? null,
        status: baseTicket.status,
        checkedInAt,
        createdAt: baseTicket.createdAt,
      },
    });
  } catch (err) {
    console.error("[POST /api/events/[id]/tickets] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao registrar entrada." },
      { status: 500 },
    );
  }
}
