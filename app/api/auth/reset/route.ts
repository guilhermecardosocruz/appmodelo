/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { resetSchema } from "@/lib/validation";
import { resetPassword } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, password } = resetSchema.parse(body);

    const user = await resetPassword(token, password);

    return NextResponse.json({
      success: true,
      message: "Senha alterada com sucesso",
      user,
    });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return NextResponse.json(
        { success: false, errors: err.flatten().fieldErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: err.message ?? "Erro ao redefinir senha" },
      { status: 400 }
    );
  }
}
