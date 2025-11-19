import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = ["PRE_PAGO", "POS_PAGO", "FREE"] as const;
type EventType = (typeof VALID_TYPES)[number];

// GET /api/events - lista todos os eventos
export async function GET(_request: NextRequest) {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(events, { status: 200 });
}

// POST /api/events - cria um novo evento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const type = String(body.type ?? "").toUpperCase() as EventType;

    if (!name) {
      return NextResponse.json(
        { error: "Nome do evento é obrigatório." },
        { status: 400 }
      );
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: "Tipo de evento inválido." },
        { status: 400 }
      );
    }

    const event = await prisma.event.create({
      data: {
        name,
        type,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (err) {
    console.error("Erro ao criar evento:", err);
    return NextResponse.json(
      { error: "Erro ao criar evento." },
      { status: 500 }
    );
  }
}

// PATCH /api/events - atualiza um evento existente (id no corpo)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório para atualizar." },
        { status: 400 }
      );
    }

    const data: {
      name?: string;
      description?: string | null;
      location?: string | null;
      inviteSlug?: string | null;
      eventDate?: Date | null;
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

    // Trata eventDate vindo da tela free (string "YYYY-MM-DD" ou null)
    if (typeof body.eventDate === "string" || body.eventDate === null) {
      if (!body.eventDate) {
        data.eventDate = null;
      } else {
        const d = new Date(body.eventDate);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json(
            { error: "Data do evento inválida." },
            { status: 400 }
          );
        }
        data.eventDate = d;
      }
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

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error("Erro ao atualizar evento:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar evento." },
      { status: 500 }
    );
  }
}

// DELETE /api/events - exclui um evento (id no corpo)
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json(
        { error: "ID do evento é obrigatório para excluir." },
        { status: 400 }
      );
    }

    await prisma.event.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Erro ao excluir evento:", err);
    return NextResponse.json(
      { error: "Erro ao excluir evento." },
      { status: 500 }
    );
  }
}
