import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

/**
 * POST /api/tickets/[id]/checkin
 *
 * - Marca o ingresso como "entrou no evento" (checkedInAt).
 * - Se já tiver check-in, retorna código ALREADY_CHECKED_IN.
 * - NÃO exige autenticação (o controle é pelo link da portaria).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const ticketId = await getTicketIdFromContext(context);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do ticket é obrigatório." },
        { status: 400 },
      );
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket não encontrado." },
        { status: 404 },
      );
    }

    if (ticket.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: "Ingresso inválido ou cancelado.",
          code: "INVALID_TICKET_STATUS",
        },
        { status: 400 },
      );
    }

    const displayName =
      (ticket.attendeeName && ticket.attendeeName.trim()) || "(Sem nome)";

    // Já tinha check-in
    if (ticket.checkedInAt) {
      return NextResponse.json({
        ok: false,
        code: "ALREADY_CHECKED_IN",
        message: "Entrada já realizada para este ingresso.",
        ticket: {
          id: ticket.id,
          attendeeName: displayName,
          checkedInAt: ticket.checkedInAt,
          event: {
            id: ticket.event.id,
            name: ticket.event.name,
          },
        },
      });
    }

    const now = new Date();

    const updated = await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        checkedInAt: now,
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      code: "CHECKED_IN",
      message: "Entrada registrada com sucesso.",
      ticket: {
        id: updated.id,
        attendeeName: displayName,
        checkedInAt: updated.checkedInAt,
        event: {
          id: updated.event.id,
          name: updated.event.name,
        },
      },
    });
  } catch (err) {
    console.error("[POST /api/tickets/[id]/checkin] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao registrar check-in." },
      { status: 500 },
    );
  }
}
