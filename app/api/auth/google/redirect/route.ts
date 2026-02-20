import { NextRequest, NextResponse } from "next/server";

function getAppUrl() {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();

  if (!clientId) {
    return NextResponse.json(
      {
        success: false,
        message: "Login com Google não está configurado (GOOGLE_CLIENT_ID ausente).",
      },
      { status: 500 },
    );
  }

  const appUrl = getAppUrl();
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  const url = new URL(req.url);
  const nextParam = url.searchParams.get("next") || "/dashboard";

  // Codifica o "next" dentro do state (base64url de um JSON simples)
  const statePayload = JSON.stringify({ next: nextParam });
  const state = Buffer.from(statePayload, "utf-8").toString("base64url");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "select_account");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString(), {
    status: 302,
  });
}
