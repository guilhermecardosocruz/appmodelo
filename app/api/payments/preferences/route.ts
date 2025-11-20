import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TOKEN = process.env.MP_ACCESS_TOKEN;

export async function POST(req: NextRequest) {
  try {
    const { eventId } = await req.json();

    if (!eventId) {
      return NextResponse.json({ error: "eventId obrigatório" }, { status: 400 });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
    }

    const preco = Number((event as any).prepaidPrice ?? 0);

    const body = {
      items: [
        {
          id: event.id,
          title: event.name,
          quantity: 1,
          unit_price: preco,
        },
      ],
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL}/convite/${event.id}`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL}/eventos/${event.id}/pre`,
      },
      auto_return: "approved",
    };

    const response = await fetch(
      "https://api.mercadopago.com/checkout/preferences",
      {
        method: "POST",
        headers: {
          Authorization: \`Bearer \${TOKEN}\`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    return NextResponse.json({ preferenceId: data.id });
  } catch (e) {
    return NextResponse.json({ error: e }, { status: 500 });
  }
}
