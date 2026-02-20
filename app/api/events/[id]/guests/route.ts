/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext =
  | { params?: { id?: string } }
  | { params?: Promise<{ id?: string }> };

async function getEventIdFromContext(context: RouteContext): Promise<string> {
  let rawParams: any = (context as any)?.params ?? {};
  if (rawParams && typeof rawParams.then === "function") {
    rawParams = await rawParams;
  }
  const id = String(rawParams?.id ?? "").trim();
  return id;
}

// GET /api/events/[id]/guests
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const id = await getEventIdFromContext(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const guests = await prisma.eventGuest.findMany({
      where: { eventId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ guests }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/events/[id]/guests] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar lista de convidados." },
      { status: 500 },
    );
  }
}

// POST /api/events/[id]/guests
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const id = await getEventIdFromContext(context);

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim();
    const userId = String(body.userId ?? "").trim();

    if (!userId) {
      return NextResponse.json(
        {
          error:
            "É obrigatório selecionar um convidado que tenha conta no aplicativo.",
        },
        { status: 400 },
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "Nome do convidado é obrigatório." },
        { status: 400 },
      );
    }

    const event = await prisma.event.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!event) {
      return NextResponse.json(
        { error: "Evento não encontrado." },
        { status: 404 },
      );
    }

    // Garante que o usuário convidado existe
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Usuário convidado não encontrado." },
        { status: 404 },
      );
    }

    const finalName = (user.name ?? name).trim();

    const randomPart = Math.random().toString(36).slice(2, 8);
    const slug = `${id.slice(0, 6)}-g-${randomPart}`;

    const guest = await prisma.eventGuest.create({
      data: {
        eventId: event.id,
        name: finalName,
        slug,
      },
    });

    return NextResponse.json(guest, { status: 201 });
  } catch (err) {
    console.error("[POST /api/events/[id]/guests] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao adicionar convidado." },
      { status: 500 },
    );
  }
}
