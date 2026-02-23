/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  const id = String(rawParams?.id ?? "").trim();
  return id;
}

// GET /api/events/[id]/public-participants
// Retorna informações básicas do evento + lista de convidados (com confirmado ou não)
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const id = await getEventIdFromContext(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        organizer: {
          select: { name: true },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    const guests = await prisma.eventGuest.findMany({
      where: { eventId: id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        confirmedAt: true,
      },
    });

    return NextResponse.json(
      {
        event: {
          id: event.id,
          name: event.name,
          type: event.type,
          organizerName: event.organizer?.name ?? null,
        },
        guests,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/events/[id]/public-participants] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar lista pública de participantes." },
      { status: 500 },
    );
  }
}
