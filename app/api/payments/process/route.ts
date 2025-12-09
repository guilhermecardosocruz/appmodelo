import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const accessToken = process.env.MP_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json(
      { error: "MP_ACCESS_TOKEN não configurado no servidor." },
      { status: 500 }
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
  } = await request.json();

  if (!payment_method_id) {
    return NextResponse.json(
      { error: "payment_method_id ausente no formulário." },
      { status: 400 }
    );
  }

  // Mapeia método → type aceito pelo MP
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
        { status: mpResponse.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Erro inesperado ao chamar Mercado Pago:", error);
    return NextResponse.json(
      { error: "Erro inesperado ao processar pagamento" },
      { status: 500 }
    );
  }
}
