/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Mesmo parser de preço usado em /api/payments/preferences
function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;

  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);

  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

/**
 * POST /api/payments/process
 * Body: { eventId: string, formData: any }
 *
 * - Garante que o evento é PRE_PAGO
 * - Converte ticketPrice -> valor numérico
 * - Chama a API /v1/payments do Mercado Pago
 * - NÃO grava Payment ainda (apenas MP). Depois podemos integrar com a tabela Payment.
 */
export async function POST(req: NextRequest) {
  try {
    if (!MP_ACCESS_TOKEN) {
      console.error("[payments/process] MP_ACCESS_TOKEN não configurado");
      return NextResponse.json(
        { error: "Configuração de pagamento indisponível." },
        { status: 500 },
      );
    }

    const body = (await req.json().catch(() => null)) as
      | { eventId?: string; formData?: any }
      | null;

    const eventId = String(body?.eventId ?? "").trim();
    const formData = body?.formData as any;

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId é obrigatório." },
        { status: 400 },
      );
    }

    if (!formData) {
      return NextResponse.json(
        { error: "Dados do formulário de pagamento não encontrados." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    if (event.type !== "PRE_PAGO") {
      return NextResponse.json(
        { error: "Somente eventos pré pagos podem usar este checkout." },
        { status: 400 },
      );
    }

    const amount = parsePrice((event as any).ticketPrice);
    if (!amount) {
      return NextResponse.json(
        {
          error:
            "Valor do ingresso inválido. Configure o campo 'Valor do ingresso' nas configurações do evento.",
        },
        { status: 400 },
      );
    }

    // Monta o payload mínimo esperado pela API de pagamentos do Mercado Pago.
    // formData vem diretamente do Payment Brick.
    const paymentPayload: any = {
      transaction_amount: amount,
      description: event.name,
      installments: Number(formData.installments ?? 1) || 1,
      payment_method_id: formData.payment_method_id,
      token: formData.token,
      external_reference: event.id,
      payer: {
        email: formData.payer?.email,
        first_name: formData.payer?.first_name,
        last_name: formData.payer?.last_name,
        identification: formData.payer?.identification,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paymentPayload),
    });

    const rawText = await mpRes.text();

    if (!mpRes.ok) {
      let mpError: any = null;
      try {
        mpError = JSON.parse(rawText);
      } catch {
        // segue com texto cru
      }

      console.error(
        "[payments/process] Erro ao criar pagamento no MP:",
        mpRes.status,
        rawText,
      );

      const detalhe =
        mpError?.message ||
        mpError?.error ||
        (typeof rawText === "string" && rawText.slice(0, 300)) ||
        "Resposta desconhecida do Mercado Pago";

      return NextResponse.json(
        {
          error: `Erro ao processar pagamento no Mercado Pago (status ${mpRes.status}). Detalhe: ${detalhe}`,
        },
        { status: 502 },
      );
    }

    let mpPayment: any;
    try {
      mpPayment = JSON.parse(rawText);
    } catch {
      console.error(
        "[payments/process] Resposta inválida da API de pagamentos do MP:",
        rawText,
      );
      return NextResponse.json(
        { error: "Resposta inválida da API do Mercado Pago ao criar pagamento." },
        { status: 502 },
      );
    }

    // Aqui poderíamos:
    // - criar um Payment em status PENDING
    // - deixar o webhook atualizar para APPROVED/REJECTED
    // Por enquanto, apenas devolvemos o resumo pro frontend.
    return NextResponse.json(
      {
        ok: true,
        id: mpPayment.id,
        status: mpPayment.status,
        status_detail: mpPayment.status_detail,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[payments/process] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro inesperado ao processar pagamento." },
      { status: 500 },
    );
  }
}
