import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";

// Пази /admin и /api/admin — освен входа. Проверката на подписа (jose) работи
// в edge middleware; bcrypt се ползва само в самия login route (Node).
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isLogin =
    pathname === "/admin/vhod" || pathname === "/api/admin/login";
  if (isLogin) return NextResponse.next();

  const user = await verifySession(req.cookies.get(ADMIN_COOKIE)?.value);
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Нужен е вход." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/vhod";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
