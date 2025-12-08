/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TOKEN = process.env.MP_ACCESS_TOKEN;
const APP_URL_RAW = process.env.NEXT_PUBLIC_APP_URL;

// Normaliza a URL base do app (remove espaços e barra final)
const APP_URL =
  APP_URL_RAW && APP_URL_RAW.trim()
    ? APP_URL_RAW.trim().replace(/\/$/, "")
    : null;

// Converte strings como "30", "30,00", "R$ 30,00", "1.234,56" para número
function parsePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Remove tudo que não for dígito, vírgula, ponto ou sinal
  const cleaned = trimmed.replace(/[^\d,.,-]/g, "");
  if (!cleaned) return null;

  // Remove pontos de milhar e troca vírgula por ponto
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;

  // Garante no máximo 2 casas decimais
  return Number(n.toFixed(2));
}

export async function POST(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json(
      { error: "MP_ACCESS_TOKEN não configurado no servidor" },
      { status: 500 },
    );
  }

  try {
    const { eventId } = await req.json();

    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json(
        { error: "eventId obrigatório" },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado" },
        { status: 404 },
      );
    }

    const preco = parsePrice((event as any).ticketPrice);

    if (!preco) {
      return NextResponse.json(
        {
          error:
            "Preço do evento inválido. Verifique o campo 'Valor do ingresso' nas configurações do evento.",
        },
        { status: 400 },
      );
    }

    // Corpo base da preferência
    const body: any = {
      items: [
        {
          id: event.id,
          title: event.name,
          quantity: 1,
          unit_price: preco,
        },
      ],
      external_reference: event.id,
    };

    // Só envia back_urls + auto_return se tivermos uma URL de app válida
    if (APP_URL) {
      body.back_urls = {
        success: `${APP_URL}/convite/${event.id}`,
        failure: `${APP_URL}/eventos/${event.id}/pre`,
      };
      body.auto_return = "approved";
    }

    const response = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const rawText = await response.text();

    if (!response.ok) {
      // Tenta parsear JSON de erro do MP para facilitar debug
      let mpError: any = null;
      try {
        mpError = JSON.parse(rawText);
      } catch {
        // segue com texto cru mesmo
      }

      console.error("Erro Mercado Pago (status", response.status, "):", rawText);

      const detalhe =
        mpError?.message ||
        mpError?.error ||
        (typeof rawText === "string" && rawText.slice(0, 300)) ||
        "Resposta desconhecida do Mercado Pago";

      return NextResponse.json(
        {
          error: `Erro ao criar preferência no Mercado Pago (status ${response.status}). Detalhe: ${detalhe}`,
        },
        { status: 500 },
      );
    }

    // Se deu tudo certo, rawText é JSON de sucesso
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("Resposta inesperada do Mercado Pago:", rawText);
      return NextResponse.json(
        { error: "Resposta inválida do Mercado Pago ao criar preferência" },
        { status: 500 },
      );
    }

    if (!data.id) {
      console.error("Preferência sem ID recebida do Mercado Pago:", data);
      return NextResponse.json(
        {
          error:
            "Preferência criada pelo Mercado Pago não retornou um ID válido.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ preferenceId: data.id });
  } catch (e) {
    console.error("Erro interno ao criar preferência:", e);
    return NextResponse.json(
      { error: "Erro interno ao criar preferência" },
      { status: 500 },
    );
  }
}
