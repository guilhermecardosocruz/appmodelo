import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";

type PatchBody = {
  pixKey?: unknown;
};

export async function PATCH(request: NextRequest) {
  try {
    const session = getSessionUser(request);
    if (!session) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as PatchBody;

    // Permite:
    // - string não vazia -> salva
    // - null/"" -> remove (set null)
    const raw = body.pixKey;

    let pixKey: string | null = null;

    if (raw === null || raw === undefined) {
      pixKey = null;
    } else {
      const s = String(raw).trim();
      pixKey = s ? s : null;
    }

    const updated = await prisma.user.update({
      where: { id: session.id },
      data: { pixKey },
      select: { id: true, name: true, email: true, pixKey: true },
    });

    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (err) {
    console.error("[PATCH /api/auth/profile] erro:", err);
    return NextResponse.json(
      { error: "Erro ao atualizar perfil." },
      { status: 500 },
    );
  }
}
