import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function isProd() {
  return process.env.NODE_ENV === "production";
}

export async function GET(req: NextRequest) {
  if (isProd()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const url = new URL(req.url);
    const emailRaw = url.searchParams.get("email");

    if (emailRaw) {
      const email = emailRaw.trim().toLowerCase();

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return NextResponse.json({ found: !!user, user }, { status: 200 });
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      { count: users.length, users },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/debug/users] Erro inesperado:", err);
    return NextResponse.json(
      { error: "Erro ao carregar usuários de debug." },
      { status: 500 },
    );
  }
}
