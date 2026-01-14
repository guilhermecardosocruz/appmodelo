import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getTicketIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: unknown = (context as unknown as { params?: unknown })?.params ?? {};
  if (rawParams && typeof (rawParams as { then?: unknown }).then === "function") {
    rawParams = await (rawParams as Promise<{ id?: string }>);
  }
  const paramsObj = rawParams as { id?: string } | undefined;
  return String(paramsObj?.id ?? "").trim();
}

export async function GET(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const ticketId = await getTicketIdFromContext(context);
  if (!ticketId) {
    return NextResponse.json({ error: "ID do ticket é obrigatório." }, { status: 400 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { event: true },
  });

  if (!ticket || ticket.userId !== user.id) {
    return NextResponse.json({ error: "Ticket não encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    id: ticket.id,
    status: ticket.status,
    createdAt: ticket.createdAt,
    attendeeName: ticket.attendeeName ?? null,
    user: { id: user.id, name: user.name, email: user.email },
    event: {
      id: ticket.event.id,
      name: ticket.event.name,
      type: ticket.event.type,
      description: ticket.event.description,
      location: ticket.event.location,
      eventDate: ticket.event.eventDate,
      ticketPrice: ticket.event.ticketPrice,
    },
  });
}
