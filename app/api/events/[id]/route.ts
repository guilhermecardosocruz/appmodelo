import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, context: any) {
  try {
    let rawParams = context?.params as any;

    // Se o Next resolver params como Promise, tratamos aqui
    if (rawParams && typeof rawParams.then === "function") {
      rawParams = await rawParams;
    }

    const id = String(rawParams?.id ?? "").trim();
    console.log("[GET /api/events/[id]] params:", rawParams, "id:", id);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 }
      );
    }

    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json(event, { status: 200 });
  } catch (err) {
    console.error("Erro ao buscar evento por ID:", err);
    return NextResponse.json(
      { error: "Erro ao buscar evento." },
      { status: 500 }
    );
  }
}
