import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const tickets = await prisma.ticket.findMany({
    where: { userId: user.id },
    include: { event: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    tickets.map((ticket) => ({
      id: ticket.id,
      status: ticket.status,
      createdAt: ticket.createdAt,
      attendeeName: ticket.attendeeName ?? null,
      event: {
        id: ticket.event.id,
        name: ticket.event.name,
        eventDate: ticket.event.eventDate,
        location: ticket.event.location,
        type: ticket.event.type,
      },
    }))
  );
}
