/* Endpoint para carregar os dados do checkout a partir do slug.
 * Ele devolve:
 * {
 *   checkoutId: string;
 *   event: {
 *     id: string;
 *     name: string;
 *     type: "PRE_PAGO" | "POS_PAGO" | "FREE";
 *     description?: string | null;
 *     location?: string | null;
 *     eventDate?: string | null;
 *     ticketPrice?: number | null;
 *   };
 *   amount: number;
 *   currency: string;
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Converte strings como "30", "30,00", "R$ 30,00", "1.234,56" para número.
 * (Mesma lógica usada em app/api/payments/preferences/route.ts)
 */
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

  return Number(n.toFixed(2));
}

export async function GET(
  _req: NextRequest,
  context: { params: { slug: string } }
) {
  try {
    const slug = String(context?.params?.slug ?? "").trim();

    if (!slug) {
      return NextResponse.json(
        { error: "Slug do checkout é obrigatório." },
        { status: 400 }
      );
    }

    // Tenta achar o evento tanto por id quanto por inviteSlug
    const event = await prisma.event.findFirst({
      where: {
        OR: [{ id: slug }, { inviteSlug: slug }],
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado para este checkout." },
        { status: 404 }
      );
    }

    const amount = parsePrice((event as any).ticketPrice);

    if (!amount) {
      return NextResponse.json(
        {
          error:
            "Preço do evento inválido. Verifique o campo 'Valor do ingresso' nas configurações do evento.",
        },
        { status: 400 }
      );
    }

    const checkoutData = {
      checkoutId: slug,
      event: {
        id: event.id,
        name: event.name,
        type: (event as any).type ?? "PRE_PAGO",
        description: (event as any).description ?? null,
        location: (event as any).location ?? null,
        eventDate:
          (event as any).eventDate instanceof Date
            ? (event as any).eventDate.toISOString()
            : (event as any).eventDate ?? null,
        ticketPrice: amount,
      },
      amount,
      currency: "BRL",
    };

    return NextResponse.json(checkoutData, { status: 200 });
  } catch (err) {
    console.error("Erro ao carregar dados do checkout por slug:", err);
    return NextResponse.json(
      { error: "Erro ao carregar dados do checkout." },
      { status: 500 }
    );
  }
}
