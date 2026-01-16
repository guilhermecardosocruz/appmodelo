/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  return String(rawParams?.id ?? "").trim();
}

// POST /api/events/[id]/confirmados
// - Usado pelo link aberto /convite/[slug]
// - Cria EventConfirmation sempre
// - Se o usuário estiver logado e o evento for FREE, cria/atualiza Ticket (sem usar guestId)
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { error: "Nome é obrigatório para confirmar presença." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    const sessionUser = await getSessionUser(request);

    // 1) Registra a confirmação (sem depender de estar logado)
    const confirmation = await prisma.eventConfirmation.create({
      data: {
        eventId: event.id,
        name,
        // Se o modelo tiver userId/authenticated, dá pra extender depois
        // userId: sessionUser?.id ?? null,
        // authenticated: !!sessionUser?.id,
      },
    });

    // 2) Se estiver logado E o evento for FREE, garante Ticket em "Meus ingressos"
    if (sessionUser?.id && event.type === "FREE") {
      const existing = await prisma.ticket.findFirst({
        where: {
          eventId: event.id,
          userId: sessionUser.id,
        },
        select: { id: true },
      });

      if (existing) {
        // Atualiza status e nome do participante
        await prisma.ticket.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            attendeeName: name,
          },
        });
      } else {
        // Cria ticket novo
        await prisma.ticket.create({
          data: {
            eventId: event.id,
            userId: sessionUser.id,
            attendeeName: name,
          },
        });
      }
    }

    return NextResponse.json(
      {
        id: confirmation.id,
        name: confirmation.name,
        createdAt: confirmation.createdAt,
        authenticated: !!sessionUser?.id,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/events/[id]/confirmados] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao registrar a confirmação de presença." },
      { status: 500 },
    );
  }
}
