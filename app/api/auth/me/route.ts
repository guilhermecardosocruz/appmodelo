import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);

  if (!user) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    user,
  });
}
