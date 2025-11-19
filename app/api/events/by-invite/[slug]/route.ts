import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, context: any) {
  try {
    let rawParams = context?.params as any;

    // Se o Next resolver params como Promise, tratamos isso
    if (rawParams && typeof rawParams.then === "function") {
      rawParams = await rawParams;
    }

    const slug = String(rawParams?.slug ?? "").trim();

    if (!slug) {
      return NextResponse.json(
        { error: "Slug do convite é obrigatório." },
        { status: 400 }
      );
    }

    const event = await prisma.event.findUnique({
      where: {
        inviteSlug: slug,
      },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Nenhum evento encontrado para este convite." },
        { status: 404 }
      );
    }

    return NextResponse.json(event, { status: 200 });
  } catch (err) {
    console.error("[GET /api/events/by-invite/[slug]] Erro:", err);
    return NextResponse.json(
      { error: "Erro ao buscar evento pelo convite." },
      { status: 500 }
    );
  }
}
