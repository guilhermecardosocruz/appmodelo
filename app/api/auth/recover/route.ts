/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { recoverSchema } from "@/lib/validation";
import { createResetToken } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = recoverSchema.parse(body);

    const token = await createResetToken(email);

    // Se existir, manda o e-mail. Se não existir, segue igual (não revela).
    if (token) {
      try {
        await sendPasswordResetEmail(email, token);
      } catch (err) {
        console.error("[POST /api/auth/recover] erro ao enviar e-mail:", err);
        // Não expõe erro de envio, mantém mensagem neutra
      }
    }

    const isDev = process.env.NODE_ENV !== "production";

    return NextResponse.json({
      success: true,
      message: "Se o e-mail existir, enviaremos instruções de recuperação.",
      ...(isDev && token ? { token } : {}),
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
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
