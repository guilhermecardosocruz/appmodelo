/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext =
  | { params?: { slug?: string } }
  | { params?: Promise<{ slug?: string }> };

async function getSlugFromContext(context: RouteContext): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  // Next 16 às vezes passa params como Promise
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  return String(rawParams?.slug ?? "").trim();
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const slug = await getSlugFromContext(context);
    console.log("[by-invite] slug recebido:", slug);

    if (!slug) {
      return NextResponse.json(
        { error: "Slug do convite é obrigatório." },
        { status: 400 },
      );
    }

    const [prefix] = slug.split("-");

    // 1) inviteSlug exato
    // 2) id exato
    // 3) id começando com o prefixo (fallback legado)
    let event =
      (await prisma.event.findFirst({
        where: { inviteSlug: slug },
      })) ?? null;

    if (!event) {
      event =
        (await prisma.event.findUnique({
          where: { id: slug },
        })) ?? null;
    }

    if (!event && prefix) {
      event =
        (await prisma.event.findFirst({
          where: {
            id: {
              startsWith: prefix,
            },
          },
        })) ?? null;
    }

    console.log("[by-invite] evento encontrado?", !!event, "tipo:", event?.type);

    if (!event) {
      return NextResponse.json(
        { error: "Nenhum evento encontrado para este convite." },
        { status: 404 },
      );
    }

    return NextResponse.json(event, { status: 200 });
  } catch (err) {
    console.error("[GET /api/events/by-invite/[slug]] Erro:", err);
    return NextResponse.json(
      { error: "Erro ao buscar evento pelo convite." },
      { status: 500 },
    );
  }
}
