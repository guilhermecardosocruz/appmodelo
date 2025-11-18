import { NextResponse } from "next/server";
import { recoverSchema } from "@/lib/validation";
import { createResetToken } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = recoverSchema.parse(body);

    const token = await createResetToken(email);

    return NextResponse.json({
      success: true,
      message: "Se o e-mail existir, enviaremos instruções de recuperação.",
      token,
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return NextResponse.json(
        { success: false, errors: err.flatten().fieldErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Erro ao solicitar recuperação" },
      { status: 400 }
    );
  }
}
