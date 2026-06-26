import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Едно middleware за два неща:
//  1) Per-request CSP nonce — за да махнем 'unsafe-inline' от script-src (без него
//     рефлектиран XSS не би се изпълнил). Next автоматично слага nonce-а на своите
//     скриптове, когато прочете CSP-то от заявката.
//  2) Admin guard за /admin/* (както досега) — първа линия над сървърната проверка.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1) CSP nonce ───────────────────────────────────────────────────────────
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const analytics = "https://plausible.io";
  const weather = "https://api.open-meteo.com";
  const isProd = process.env.NODE_ENV === "production";
  // В разработка Next ползва eval за hot-reload → 'unsafe-eval' само там.
  const scriptSrc = isProd
    ? `script-src 'self' 'nonce-${nonce}' ${analytics}`
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' ${analytics}`;
  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${analytics} ${weather}`,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "frame-src 'self' https://www.openstreetmap.org",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  // Подаваме nonce + CSP на заявката, за да ги прочете Next (и layout-ът чрез headers()).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  // ── 2) Admin guard ─────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = req.cookies.get("zd_session")?.value;
    const secret = process.env.AUTH_SECRET;
    let valid = false;
    if (token && secret) {
      try {
        await jwtVerify(token, new TextEncoder().encode(secret), {
          algorithms: ["HS256"],
        });
        valid = true;
      } catch {
        // невалиден/изтекъл токен — към входа
      }
    }
    if (!valid) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  return res;
}

export const config = {
  // Изпълнявай на всички пътища ОСВЕН статичните ресурси/изображения и публичните
  // файлове (sitemap/robots/llms/manifest), за да не плащаме middleware за тях.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
