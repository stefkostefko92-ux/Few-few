// Защита на страниците: без валидна сесия → /login.
// API маршрутите сами връщат 401/402/403 (по-ясни грешки за клиента).

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "ea_session";
const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(
        token,
        new TextEncoder().encode(process.env.SESSION_SECRET),
      );
      return NextResponse.next();
    } catch {
      // изтекла/невалидна сесия → вход
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
