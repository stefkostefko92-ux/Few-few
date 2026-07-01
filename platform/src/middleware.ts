import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isPlatformHost } from "@/lib/domains";

// Пази /dashboard/* и /admin/* — първа линия. Всяко сериозно действие
// допълнително проверява сесията и достъпа до конкретния сайт на сървъра.
const PROTECTED = ["/dashboard", "/admin"];

// Пътища, които НЕ се пренасочват към хост-обслужването (статика, API, самите
// платформени раздели, качените файлове, well-known за верификация/ACME).
function isReserved(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/hosted") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/uploads") ||
    pathname.startsWith("/site") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/.well-known") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  );
}

async function guard(req: NextRequest, pathname: string) {
  const token = req.cookies.get("plf_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
      });
      return NextResponse.next();
    } catch {
      /* невалиден/изтекъл токен — към входа */
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  // Публичен сайт по собствен домейн/поддомейн → пренаписваме към /_host,
  // като пазим оригиналния Host (за резолюция) и пътя.
  if (!isPlatformHost(host) && !isReserved(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = `/hosted${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // Платформен хост: пази панела.
  if (PROTECTED.some((p) => pathname.startsWith(p))) {
    return guard(req, pathname);
  }
  return NextResponse.next();
}

export const config = {
  // Изключваме само статиката на Next; всичко друго минава през middleware,
  // за да можем да обслужваме по хост.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
