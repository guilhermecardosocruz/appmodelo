import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

type MercadoPagoPayment = {
  id?: string | number;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
};

/**
 * Webhook do Mercado Pago
 * - Recebe notificações de pagamento
 * - Consulta o pagamento na API do MP
 * - Atualiza Payment + cria LedgerEntry (CREDIT) quando aprovado
 */
export async function POST(request: NextRequest) {
  try {
    if (!MP_ACCESS_TOKEN) {
      console.error("[MP Webhook] MP_ACCESS_TOKEN não configurado");
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const body = await request.json().catch(() => null);

    // Mercado Pago costuma enviar algo como:
    // { "data": { "id": "..." }, "type": "payment", ... }
    const paymentId =
      body?.data?.id ??
      body?.id ??
      body?.resource?.split("/").pop() ??
      null;

    if (!paymentId) {
      console.warn("[MP Webhook] Notificação sem paymentId válido:", body);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Busca detalhes do pagamento na API do MP
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(
        String(paymentId),
      )}`,
      {
        headers: {
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        },
      },
    );

    if (!mpRes.ok) {
      const txt = await mpRes.text().catch(() => "");
      console.error(
        "[MP Webhook] Falha ao consultar pagamento no MP:",
        mpRes.status,
        txt,
      );
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const mp: MercadoPagoPayment = await mpRes.json();

    const status: string = String(mp.status ?? "").toLowerCase();
    const externalRef: string = String(mp.external_reference ?? "").trim();
    const amount: number = Number(mp.transaction_amount ?? 0);

    if (!externalRef) {
      console.warn(
        "[MP Webhook] Pagamento sem external_reference, ignorando. ID:",
        paymentId,
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const payment = await prisma.payment.findFirst({
      where: { externalRef },
    });

    if (!payment) {
      console.warn(
        "[MP Webhook] Nenhum Payment encontrado para externalRef:",
        externalRef,
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Mapeia status do MP para nosso enum PaymentStatus
    let newStatus: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" =
      "PENDING";

    if (status === "approved") newStatus = "APPROVED";
    else if (status === "rejected") newStatus = "REJECTED";
    else if (status === "cancelled" || status === "cancelled_refund")
      newStatus = "CANCELLED";

    // Atualiza Payment
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        mpPaymentId: String(mp.id ?? payment.mpPaymentId ?? ""),
        amount:
          !Number.isNaN(amount) && amount > 0
            ? amount
            : payment.amount, // fallback para o valor já salvo
      },
    });

    // Se não estiver aprovado, não credita nada
    if (newStatus !== "APPROVED") {
      console.log(
        "[MP Webhook] Pagamento não aprovado. status:",
        newStatus,
        "paymentId:",
        updatedPayment.id,
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Evita crédito duplicado: verifica se já existe CREDIT para esse paymentId
    const existingCredit = await prisma.ledgerEntry.findFirst({
      where: {
        paymentId: updatedPayment.id,
        type: "CREDIT",
      },
    });

    if (existingCredit) {
      console.log(
        "[MP Webhook] Crédito já registrado para Payment:",
        updatedPayment.id,
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Cria crédito na "carteira" do organizador
    if (!updatedPayment.organizerId) {
      console.warn(
        "[MP Webhook] Payment sem organizerId definido, não foi possível creditar.",
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    await prisma.ledgerEntry.create({
      data: {
        organizerId: updatedPayment.organizerId,
        paymentId: updatedPayment.id,
        type: "CREDIT",
        amount: updatedPayment.amount,
      },
    });

    console.log(
      "[MP Webhook] Crédito criado para organizer",
      updatedPayment.organizerId,
      "valor",
      updatedPayment.amount.toString(),
    );

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[MP Webhook] Erro inesperado:", err);
    // Sempre retornar 200 para o MP não ficar re-tentando infinito
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
