import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = getSessionUser(request);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      pixKey: true,
    },
  });

  if (!dbUser) {
    // sessão existe mas usuário não (edge case)
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: dbUser,
  });
}
