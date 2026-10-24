import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { classifyPageRequest, hitKey, HIT_HEADER } from "@/lib/analytics-core";
import { ADMIN_LOGIN_PATH, SESSION_COOKIE, adminGuardDecision, isAdminPath } from "@/lib/admin-guard";

// Пази /admin/* (без /admin/login). Проверката тук е първа линия; всяка
// сериозна операция допълнително проверява сесията на сървъра. Решението е в
// @/lib/admin-guard (чисто — тества се); тук е само пренасочването.
async function guardAdmin(req: NextRequest) {
  const decision = await adminGuardDecision({
    pathname: req.nextUrl.pathname,
    token: req.cookies.get(SESSION_COOKIE)?.value,
    secret: process.env.AUTH_SECRET,
  });
  if (decision.allow) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = ADMIN_LOGIN_PATH;
  url.searchParams.set("next", decision.next);
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
  if (isAdminPath(pathname)) return guardAdmin(req);
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
