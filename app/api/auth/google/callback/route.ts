import { NextRequest, NextResponse } from "next/server";
import { buildSessionCookie } from "@/lib/session";
import { findOrCreateGoogleUser } from "@/lib/auth";

function getAppUrl() {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

type GoogleIdTokenPayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  emailVerified?: boolean;
  name?: string;
};

function decodeIdToken(idToken: string): GoogleIdTokenPayload | null {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payloadSegment = parts[1];
    const json = Buffer.from(payloadSegment, "base64url").toString("utf-8");
    return JSON.parse(json) as GoogleIdTokenPayload;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Login com Google não está configurado (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes).",
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
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  try {
    // Troca o "code" por tokens no endpoint do Google
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      console.error("[Google callback] Falha ao obter token:", tokenRes.status, text);
      return NextResponse.json(
        {
          success: false,
          message: "Falha ao obter token do Google.",
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
          message: "Resposta do Google não contém id_token.",
        },
        { status: 400 },
      );
    }

    const payload = decodeIdToken(tokenJson.id_token);
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          message: "Não foi possível decodificar o id_token do Google.",
        },
        { status: 400 },
      );
    }

    const googleId = payload.sub;
    const email = payload.email;
    const emailVerified = payload.email_verified ?? payload.emailVerified;
    const name = payload.name;

    if (!googleId || !email) {
      return NextResponse.json(
        {
          success: false,
          message: "Dados obrigatórios ausentes no id_token do Google.",
        },
        { status: 400 },
      );
    }

    if (!emailVerified) {
      return NextResponse.json(
        {
          success: false,
          message:
            "O e-mail da conta Google não está verificado. Não é possível prosseguir.",
        },
        { status: 400 },
      );
    }

    // Cria ou encontra o usuário na base
    const user = await findOrCreateGoogleUser({
      googleId,
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
    console.error("[Google callback] Erro inesperado:", err);
    return NextResponse.json(
      {
        success: false,
        message: "Erro inesperado ao processar login com Google.",
      },
      { status: 500 },
    );
  }
}
