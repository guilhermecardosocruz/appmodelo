/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// Mesmo parser de preço usado na preferência:
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

// Gera um idempotency-key seguro
function makeIdempotencyKey(eventId: string) {
  try {
    // Node 18+ / Next: crypto.randomUUID já existe
    // @ts-ignore
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      // @ts-ignore
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `${eventId}-${Date.now()}-${Math.random()}`;
}

export async function POST(request: NextRequest) {
  if (!MP_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "MP_ACCESS_TOKEN não configurado no servidor." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | { eventId?: string; formData?: any }
      | null;

    const eventId = String(body?.eventId ?? "").trim();
    const formData = body?.formData;

    if (!eventId) {
      return NextResponse.json(
        { error: "eventId é obrigatório." },
        { status: 400 },
      );
    }

    if (!formData || typeof formData !== "object") {
      return NextResponse.json(
        { error: "Dados de pagamento (formData) inválidos." },
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
            "Valor do ingresso inválido. Verifique o campo 'Valor do ingresso' nas configurações do evento.",
        },
        { status: 400 },
      );
    }

    // Corpo que vai para o Mercado Pago:
    // - reaproveita tudo do formData
    // - garante transaction_amount baseado no evento
    const mpBody: any = {
      ...formData,
      transaction_amount: amount,
      description: event.name,
    };

    const idemKey = makeIdempotencyKey(event.id);

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idemKey,
      },
      body: JSON.stringify(mpBody),
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
        "[/api/payments/process] Erro Mercado Pago",
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
        { status: 400 },
      );
    }

    let mpData: any;
    try {
      mpData = JSON.parse(rawText);
    } catch {
      console.error(
        "[/api/payments/process] Resposta inesperada do Mercado Pago:",
        rawText,
      );
      return NextResponse.json(
        { error: "Resposta inválida do Mercado Pago ao processar pagamento." },
        { status: 500 },
      );
    }

    // Aqui dá para, depois, criar Payment no banco usando mpData.id, status etc.
    // Por enquanto só repassamos algumas infos principais.
    return NextResponse.json({
      ok: true,
      status: mpData.status,
      status_detail: mpData.status_detail,
      mpPaymentId: mpData.id,
    });
  } catch (err) {
    console.error("[/api/payments/process] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro interno ao processar pagamento." },
      { status: 500 },
    );
  }
}
