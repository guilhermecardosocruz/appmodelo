/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { validateLogin } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const user = await validateLogin(email, password);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "Credenciais inválidas" },
        { status: 401 }
      );
    }

    // Futuro: setar cookie de sessão/JWT aqui
    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    if (err.name === "ZodError") {
      return NextResponse.json(
        { success: false, errors: err.flatten().fieldErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Erro ao fazer login" },
      { status: 400 }
    );
  }
}
