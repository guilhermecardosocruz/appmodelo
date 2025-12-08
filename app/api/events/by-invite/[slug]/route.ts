/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, context: any) {
  try {
    let rawParams = context?.params as any;

    // Next 16 às vezes passa params como Promise
    if (rawParams && typeof rawParams.then === "function") {
      rawParams = await rawParams;
    }

    const slug = String(rawParams?.slug ?? "").trim();
    console.log("[by-invite] slug recebido:", slug);

    if (!slug) {
      return NextResponse.json(
        { error: "Slug do convite é obrigatório." },
        { status: 400 }
      );
    }

    const [prefix] = slug.split("-");

    // 1) Tenta pelo inviteSlug exato
    // 2) Se não achar, tenta por id = slug
    // 3) Se ainda não achar, tenta por id começando com o prefixo
    const event = await prisma.event.findFirst({
      where: {
        OR: [
          { inviteSlug: slug },
          { id: slug },
          ...(prefix
            ? [
                {
                  id: {
                    startsWith: prefix,
                  },
                },
              ]
            : []),
        ],
      },
    });

    console.log("[by-invite] evento encontrado?", !!event);

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
