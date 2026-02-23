import { NextRequest, NextResponse } from "next/server";
import { buildSessionCookie } from "@/lib/session";
import { findOrCreateAppleUser } from "@/lib/auth";

function getAppUrl() {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

type AppleIdTokenPayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  emailVerified?: boolean | string;
  name?: string;
};

function decodeIdToken(idToken: string): AppleIdTokenPayload | null {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payloadSegment = parts[1];
    const json = Buffer.from(payloadSegment, "base64url").toString("utf-8");
    return JSON.parse(json) as AppleIdTokenPayload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const clientId = process.env.APPLE_CLIENT_ID?.trim();
  const clientSecret = process.env.APPLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Login com Apple não está configurado (APPLE_CLIENT_ID/APPLE_CLIENT_SECRET ausentes).",
      },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) {
    return NextResponse.json(
      { success: false, message: "Código de autorização ausente." },
      { status: 400 },
    );
  }

  const appUrl = getAppUrl();
  const redirectUri = `${appUrl}/api/auth/apple/callback`;

  try {
    // Troca o "code" por tokens no endpoint da Apple
    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      console.error("[Apple callback] Falha ao obter token:", tokenRes.status, text);
      return NextResponse.json(
        {
          success: false,
          message: "Falha ao obter token da Apple.",
        },
        { status: 400 },
      );
    }

    const tokenJson = (await tokenRes.json()) as {
      id_token?: string;
      access_token?: string;
    };

    if (!tokenJson.id_token) {
      return NextResponse.json(
        {
          success: false,
          message: "Resposta da Apple não contém id_token.",
        },
        { status: 400 },
      );
    }

    const payload = decodeIdToken(tokenJson.id_token);
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          message: "Não foi possível decodificar o id_token da Apple.",
        },
        { status: 400 },
      );
    }

    const appleId = payload.sub;
    const email = payload.email;

    const emailVerifiedRaw = payload.email_verified ?? payload.emailVerified;
    const emailVerified =
      typeof emailVerifiedRaw === "string"
        ? emailVerifiedRaw === "true"
        : !!emailVerifiedRaw;

    const name = payload.name;

    if (!appleId || !email) {
      return NextResponse.json(
        {
          success: false,
          message: "Dados obrigatórios ausentes no id_token da Apple.",
        },
        { status: 400 },
      );
    }

    if (!emailVerified) {
      return NextResponse.json(
        {
          success: false,
          message:
            "O e-mail da conta Apple não está verificado. Não é possível prosseguir.",
        },
        { status: 400 },
      );
    }

    // Cria ou encontra o usuário na base
    const user = await findOrCreateAppleUser({
      appleId,
      email,
      name,
    });

    // Monta cookie de sessão
    const sessionCookie = buildSessionCookie({
      id: user.id,
      name: user.name,
      email: user.email,
    });

    // Recupera "next" do state (se existir)
    let nextPath = "/dashboard";
    if (state) {
      try {
        const decoded = Buffer.from(state, "base64url").toString("utf-8");
        const parsed = JSON.parse(decoded) as { next?: string };
        if (parsed.next && typeof parsed.next === "string") {
          // evita open redirect (só caminhos relativos)
          nextPath = parsed.next.startsWith("/") ? parsed.next : "/dashboard";
        }
      } catch {
        // ignora state inválido
      }
    }

    const redirectTarget = `${appUrl}${nextPath}`;
    const res = NextResponse.redirect(redirectTarget, { status: 302 });

    res.cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.options,
    );

    return res;
  } catch (err) {
    console.error("[Apple callback] Erro inesperado:", err);
    return NextResponse.json(
      {
        success: false,
        message: "Erro inesperado ao processar login com Apple.",
      },
      { status: 500 },
    );
  }
}
