/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { recoverSchema } from "@/lib/validation";
import { createResetToken } from "@/lib/auth";
import { sendResetEmail } from "@/lib/email";

function getAppUrl() {
  // Prioridade:
  // 1) APP_URL (produção)
  // 2) VERCEL_URL (preview)
  // 3) fallback local
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = recoverSchema.parse(body);

    const token = await createResetToken(email);

    // Não revelar se existe ou não
    // Em DEV, ainda retornamos o token pra testar (como você já fazia)
    if (token) {
      const baseUrl = getAppUrl();
      const resetLink = `${baseUrl}/reset/${token}`;

      // Envia email só se estiver configurado
      // (RESEND_API_KEY e EMAIL_FROM). Se faltar, não quebra o fluxo.
      try {
        await sendResetEmail({ to: email, resetLink });
      } catch (e) {
        console.warn("[recover] Falha ao enviar e-mail (config pendente):", e);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Se o e-mail existir, enviaremos instruções de recuperação.",
      token: process.env.NODE_ENV !== "production" ? token : undefined,
    });
  } catch (err: any) {
    if (err?.name === "ZodError") {
      return NextResponse.json(
        { success: false, errors: err.flatten().fieldErrors },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, message: "Erro ao solicitar recuperação" },
      { status: 400 },
    );
  }
}
