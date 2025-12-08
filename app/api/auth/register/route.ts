/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation";
import { registerUser } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password } = registerSchema.parse(body);

    const user = await registerUser(name, email, password);

    return NextResponse.json(
      { success: true, user },
      { status: 201 }
    );
  } catch (err: any) {
    if (err.name === "ZodError") {
      return NextResponse.json(
        { success: false, errors: err.flatten().fieldErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, message: err.message ?? "Erro ao registrar" },
      { status: 400 }
    );
  }
}
