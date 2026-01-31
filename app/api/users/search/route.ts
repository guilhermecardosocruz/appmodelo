import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") ?? "").trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [] }, { status: 200 });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          {
            name: {
              contains: q,
              mode: "insensitive",
            },
          },
          {
            email: {
              contains: q,
              mode: "insensitive",
            },
          },
        ],
      },
      orderBy: {
        name: "asc",
      },
      take: 10,
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json(
      {
        users,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/users/search] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao buscar usuários." },
      { status: 500 },
    );
  }
}
