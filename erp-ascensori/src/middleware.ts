// Защита на страниците: без валидна сесия → /login.
// API маршрутите сами връщат 401/402/403 (по-ясни грешки за клиента).

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "ea_session";
const PUBLIC_PATHS = ["/login"];

/**
 * Обвивката на инсталируемото приложение.
 *
 * Тези файлове ТРЯБВА да са достъпни без сесия, иначе PWA-то просто не се
 * инсталира: браузърът дърпа манифеста и иконите преди какъвто и да е вход, а
 * `/sw.js` и офлайн страницата се четат, когато сесия ГАРАНТИРАНО няма — в
 * шахтата без покритие. Съдържанието им е статично и не издава нищо: заглавие,
 * цветове и една икона.
 */
const RISORSE_PUBBLICHE = new Set([
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/icon.svg",
  "/icon-maskable.svg",
  "/favicon.ico",
  "/robots.txt",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    RISORSE_PUBBLICHE.has(pathname) ||
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
  // Пазим КЪДЕ е искал да отиде: техникът сканира QR стикер на асансьора, а
  // изтекла сесия го изхвърля на таблото и трябва да сканира пак — с телефон в
  // ръка и отворен капак на шахтата. Стойността се проверява при ПОЛЗВАНЕ
  // (`ritornoSicuro`), не тук: отвореното пренасочване се спира на изхода.
  url.search =
    pathname === "/" ? "" : `?da=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
