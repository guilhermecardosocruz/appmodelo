import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

// GET /api/users/search?q=gui
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Não autenticado." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const q = String(searchParams.get("q") ?? "").trim();

    if (!q || q.length < 2) {
      // exige pelo menos 2 caracteres pra evitar varrer tudo
      return NextResponse.json({ users: [] }, { status: 200 });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: [
        { name: "asc" },
        { email: "asc" },
      ],
      take: 10,
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json({ users }, { status: 200 });
  } catch (err) {
    console.error("[GET /api/users/search] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao buscar usuários." },
      { status: 500 },
    );
  }
}
