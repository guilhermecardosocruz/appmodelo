import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { normalizePixKeyForPayload } from "@/lib/pix";

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
    // - string não vazia -> valida + salva
    // - null/"" -> remove (set null)
    const raw = body.pixKey;

    let pixKey: string | null = null;

    if (raw === null || raw === undefined) {
      pixKey = null;
    } else {
      const s = String(raw).trim();
      pixKey = s ? s : null;
    }

    // ✅ valida/normaliza para formato correto ANTES de salvar
    // (assim o usuário já descobre na hora, e o payload fica padronizado)
    if (pixKey) {
      const normalized = normalizePixKeyForPayload(pixKey);
      pixKey = normalized.value;
    }

    const updated = await prisma.user.update({
      where: { id: session.id },
      data: { pixKey },
      select: { id: true, name: true, email: true, pixKey: true },
    });

    return NextResponse.json({ user: updated }, { status: 200 });
  } catch (err) {
    console.error("[PATCH /api/auth/profile] erro:", err);

    const msg = err instanceof Error ? err.message : "Erro ao atualizar perfil.";

    // Se foi erro de validação da chave, retorna 400
    if (typeof msg === "string" && msg.toLowerCase().includes("chave pix")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ error: "Erro ao atualizar perfil." }, { status: 500 });
  }
}
