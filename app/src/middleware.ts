import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Защитава административната зона. Изпълнява се в Edge, затова ползва само
// Web Crypto проверката на сесията (без база данни / Node-специфични модули).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Страницата за вход е достъпна без сесия.
  if (pathname === "/admin/login") return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
