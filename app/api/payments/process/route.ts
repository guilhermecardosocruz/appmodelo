import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

export async function POST(request: NextRequest) {
  const accessToken = process.env.MP_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json(
      { error: "MP_ACCESS_TOKEN não configurado no servidor." },
      { status: 500 },
    );
  }

  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Usuário não autenticado." },
      { status: 401 },
    );
  }

  const {
    token,
    payment_method_id,
    issuer_id,
    installments,
    transaction_amount,
    description,
    payer,
    selectedPaymentMethod,
    checkoutId,
  } = await request.json();

  if (!payment_method_id) {
    return NextResponse.json(
      { error: "payment_method_id ausente no formulário." },
      { status: 400 },
    );
  }

  if (!checkoutId) {
    return NextResponse.json(
      { error: "checkoutId ausente. Não foi possível vincular o evento." },
      { status: 400 },
    );
  }

  // Localiza o evento relacionado ao checkout
  const event = await prisma.event.findFirst({
    where: {
      OR: [{ id: checkoutId }, { inviteSlug: checkoutId }],
    },
  });

  if (!event) {
    return NextResponse.json(
      { error: "Evento não encontrado para este checkout." },
      { status: 404 },
    );
  }

  const payment_type_id =
    selectedPaymentMethod === "bank_transfer"
      ? "bank_transfer"
      : "credit_card";

  const payload = {
    token,
    payment_method_id,
    payment_type_id,
    issuer_id,
    installments,
    transaction_amount,
    description,
    payer,
  };

  try {
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

    // Se o pagamento foi criado com sucesso, registramos um Ticket
    try {
      const status = String(data.status ?? "").toLowerCase();

      // Criamos o ingresso para status aprovados ou em análise.
      if (status === "approved" || status === "in_process" || status === "pending") {
        await prisma.ticket.create({
          data: {
            eventId: event.id,
            userId: user.id,
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
