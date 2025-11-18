import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/events/[id] - retorna um evento específico
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  const event = await prisma.event.findUnique({
    where: { id },
  });

  if (!event) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  }

  return NextResponse.json(event);
}

// PATCH /api/events/[id] - atualiza campos básicos do evento
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  try {
    const body = await request.json();

    const data: {
      name?: string;
      description?: string | null;
      location?: string | null;
      inviteSlug?: string | null;
    } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { error: "Nome do evento não pode ser vazio." },
          { status: 400 }
        );
      }
      data.name = name;
    }

    if (typeof body.description === "string" || body.description === null) {
      data.description = body.description;
    }

    if (typeof body.location === "string" || body.location === null) {
      data.location = body.location;
    }

    if (typeof body.inviteSlug === "string" || body.inviteSlug === null) {
      data.inviteSlug = body.inviteSlug;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo para atualizar." },
        { status: 400 }
      );
    }

    const updated = await prisma.event.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Erro ao atualizar evento:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar evento." },
      { status: 500 }
    );
  }
}
