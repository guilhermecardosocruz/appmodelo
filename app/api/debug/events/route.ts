import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const events = await prisma.event.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        type: true,
        inviteSlug: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        count: events.length,
        events,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/debug/events] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar eventos de debug." },
      { status: 500 },
    );
  }
}
