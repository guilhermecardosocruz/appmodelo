import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const session = req.cookies.get("session")?.value;

  const { pathname } = req.nextUrl;

  const isInvite =
    pathname.startsWith("/convite/") ||
    pathname.startsWith("/convite/pessoa/");

  // Se for uma rota de convite e o usuário NÃO está logado
  if (isInvite && !session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/convite/:path*", "/convite/pessoa/:path*"],
};
