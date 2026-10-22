import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { retiredGuideTarget } from "@/lib/guide-redirects";

const GUIDE_PREFIX = "/kak-da/";

// 1) Оттеглените (дублирани) ръководства водят с постоянно пренасочване 301
//    към каноничното — така Google обединява сигналите на двата адреса.
// 2) Пази /admin/* (без /admin/login). Проверката тук е първа линия; всяка
//    сериозна операция допълнително проверява сесията на сървъра.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith(GUIDE_PREFIX)) {
    const target = retiredGuideTarget(pathname.slice(GUIDE_PREFIX.length));
    if (!target) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = `${GUIDE_PREFIX}${target}`;
    return NextResponse.redirect(url, 301);
  }

  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname === "/admin/login") return NextResponse.next();

  const token = req.cookies.get("zbd_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
      });
      return NextResponse.next();
    } catch {
      // невалиден/изтекъл токен — към входа
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/kak-da/:slug"],
};
