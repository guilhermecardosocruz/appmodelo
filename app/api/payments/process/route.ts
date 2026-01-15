import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser(request);

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const eventId = String(body.eventId ?? "").trim();

    if (!eventId) {
      return NextResponse.json({ error: "eventId é obrigatório" }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        type: true,
        ticketPrice: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
    }

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { error: "MERCADO_PAGO_ACCESS_TOKEN não configurado" },
        { status: 500 },
      );
    }

    // payload deve vir do seu frontend/processo anterior — mantemos o que já existia
    const payload = body?.payload ?? body;

    const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Erro Mercado Pago:", data);
      return NextResponse.json(
        {
          error: "Erro ao processar pagamento no Mercado Pago",
          details: data,
        },
        { status: mpResponse.status },
      );
    }

    // ✅ Se o pagamento foi criado com sucesso, registramos um Ticket.
    // Importante: NÃO usamos mais upsert por (eventId,userId), pois agora um usuário pode ter vários tickets no mesmo evento.
    try {
      const status = String(data.status ?? "").toLowerCase();

      if (status === "approved" || status === "in_process" || status === "pending") {
        await prisma.ticket.create({
          data: {
            eventId: event.id,
            userId: user.id,
            attendeeName: user.name,
            status: "ACTIVE",
          },
        });
      }
    } catch (ticketErr) {
      console.error("Erro ao criar Ticket após pagamento:", ticketErr);
      // Não quebra o fluxo para o usuário, apenas loga.
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Erro inesperado ao chamar Mercado Pago:", error);
    return NextResponse.json(
      { error: "Erro inesperado ao processar pagamento" },
      { status: 500 },
    );
  }
}
