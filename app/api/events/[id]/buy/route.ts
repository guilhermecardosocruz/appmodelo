/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(
  context: RouteContext,
): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  return String(rawParams?.id ?? "").trim();
}

// POST /api/events/[id]/buy
// Simula um pagamento e cria um Ticket ACTIVE para o usuário logado.
export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  try {
    const eventId = await getEventIdFromContext(context);

    if (!eventId) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const user = await getSessionUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "É preciso estar autenticado para comprar o ingresso." },
        { status: 401 },
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

    if (event.type !== "PRE_PAGO") {
      return NextResponse.json(
        {
          error:
            "Esta rota de teste de pagamento só está disponível para eventos pré-pagos.",
        },
        { status: 400 },
      );
    }

    let attendeeName = "";
    try {
      const body = (await request.json()) as {
        attendeeName?: string | null;
      };
      attendeeName = String(body?.attendeeName ?? "").trim();
    } catch {
      // body vazio é permitido
    }

    if (!attendeeName) {
      attendeeName = String(user.name ?? "").trim();
    }

    if (!attendeeName) {
      return NextResponse.json(
        {
          error:
            "Nome do participante não informado e não foi possível deduzir a partir da conta.",
        },
        { status: 400 },
      );
    }

    const ticket = await prisma.ticket.create({
      data: {
        eventId: event.id,
        userId: user.id,
        attendeeName,
        status: "ACTIVE",
      },
      select: { id: true },
    };

    return NextResponse.json(
      {
        ticketId: ticket.id,
        message:
          "Pagamento de teste registrado. Ingresso criado em Meus ingressos.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/events/[id]/buy] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao registrar compra de ingresso." },
      { status: 500 },
    );
  }
}
