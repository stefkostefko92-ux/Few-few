import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { classifyPageRequest, hitKey, HIT_HEADER } from "@/lib/analytics-core";

// Пази /admin/* (без /admin/login). Проверката тук е първа линия; всяка
// сериозна операция допълнително проверява сесията на сървъра.
async function guardAdmin(req: NextRequest) {
  const { pathname } = req.nextUrl;
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

// Брои прегледа на сървъра — БЕЗ скрипт в браузъра и без бисквитка. Към
// вътрешния адрес отиват само пътят, маркерът ?s=, препращащият адрес и
// хостът; там се нормализират до (ден, път, източник) и се пази само броят.
// IP-то се подава САМО за лимита срещу надуване (в паметта, не в базата).
let keyPromise: Promise<string | null> | null = null;

function countView(req: NextRequest, event: NextFetchEvent): void {
  const decision = classifyPageRequest({
    method: req.method,
    pathname: req.nextUrl.pathname,
    header: (n) => req.headers.get(n),
  });
  if (!decision.count) return;

  keyPromise ??= hitKey(process.env.AUTH_SECRET);
  const origin =
    process.env.STATS_INTERNAL_ORIGIN || `http://127.0.0.1:${process.env.PORT || "3000"}`;
  const xff = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = req.headers.get("x-real-ip")?.trim() || xff[xff.length - 1] || "";
  const body = JSON.stringify({
    p: req.nextUrl.pathname,
    s: req.nextUrl.searchParams.get("s") ?? "",
    r: req.headers.get("referer") ?? "",
    h: req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "",
  });

  event.waitUntil(
    (async () => {
      const key = await keyPromise;
      if (!key) return; // без валидна тайна — не броим (fail closed)
      const headers: Record<string, string> = {
        "content-type": "application/json",
        [HIT_HEADER]: key,
      };
      if (ip) headers["x-real-ip"] = ip;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      try {
        await fetch(`${origin}/api/stats/hit`, {
          method: "POST",
          headers,
          body,
          cache: "no-store",
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    })().catch(() => {
      /* броенето е второстепенно — никога не чупи страницата */
    }),
  );
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;
  // Админът — точно както преди (само /admin и /admin/…).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return guardAdmin(req);
  countView(req, event);
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    // Страниците на сайта: без /api, /_next, /p/<код> и без файлове (с точка).
    "/((?!api|_next/|p/|.*\\..*).*)",
  ],
};
