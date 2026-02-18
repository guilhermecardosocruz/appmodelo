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
  if (vercel)
    return `https://${vercel
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = recoverSchema.parse(body);

    const token = await createResetToken(email);

    // Não revelar se existe ou não
    // Em DEV, ainda retornamos o token pra testar (como você já fazia)
    let emailDebug:
      | { sent: true; id: string; to: string; resetLink: string }
      | { sent: false; error: string; to: string; resetLink?: string }
      | undefined;

    if (token) {
      const baseUrl = getAppUrl();
      const resetLink = `${baseUrl}/reset/${token}`;

      try {
        const sent = await sendResetEmail({ to: email, resetLink });
        emailDebug = { sent: true, id: sent.id, to: email, resetLink };
      } catch (e: any) {
        const msg =
          e?.message ?? "Falha desconhecida ao enviar e-mail de recuperação";
        // Log sempre (Vercel Functions logs)
        console.warn("[recover] Falha ao enviar e-mail:", msg);

        emailDebug = { sent: false, error: msg, to: email, resetLink };
      }
    }

    return NextResponse.json({
      success: true,
      message: "Se o e-mail existir, enviaremos instruções de recuperação.",
      token: process.env.NODE_ENV !== "production" ? token : undefined,
      emailDebug: process.env.NODE_ENV !== "production" ? emailDebug : undefined,
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
