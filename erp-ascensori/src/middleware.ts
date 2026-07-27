// Защита на страниците: без валидна сесия → /login.
// API маршрутите сами връщат 401/402/403 (по-ясни грешки за клиента).
//
// Тук се ражда и nonce-ът за CSP. Мястото е единствено възможното: политиката
// трябва да е в хедъра на ОТГОВОРА, а Next чете същия nonce от хедъра на
// ЗАЯВКАТА, за да го сложи на своите скриптове.

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { costruisciCsp, generaNonce, nomeHeaderCsp } from "@/lib/csp";

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

/**
 * Отговорът за една страница, с политиката върху него.
 *
 * Nonce-ът пътува в ДВЕ посоки и това не е излишество: назад в хедъра, за да
 * го наложи браузърът, и напред във входящата заявка, откъдето Next и нашият
 * `layout.tsx` го четат, за да подпишат вътрешните скриптове.
 *
 * `/api` е нарочно изключен. Част от маршрутите носят СВОЯ, по-строга политика
 * (свалянето на прикачен файл върви със `sandbox; default-src 'none'`), а обща
 * политика оттук би я разхлабила мълчаливо точно там, където е най-нужна.
 */
function politica(): { nonce: string; csp: string } {
  const nonce = generaNonce();
  return {
    nonce,
    csp: costruisciCsp({
      nonce,
      sviluppo: process.env.NODE_ENV === "development",
    }),
  };
}

function conCsp(req: NextRequest): NextResponse {
  const { nonce, csp } = politica();

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set(nomeHeaderCsp(), csp);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api")) return NextResponse.next();

  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    RISORSE_PUBBLICHE.has(pathname) ||
    pathname.startsWith("/_next")
  ) {
    return conCsp(req);
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && process.env.SESSION_SECRET) {
    try {
      await jwtVerify(
        token,
        new TextEncoder().encode(process.env.SESSION_SECRET),
      );
      return conCsp(req);
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
    pathname === "/"
      ? ""
      : `?da=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  const res = NextResponse.redirect(url);
  // Браузърът не рисува тяло на пренасочване, тоест тук политиката няма какво
  // да спре. Слага се, за да НЯМА отговор от този продукт без нея: „защо точно
  // този е гол" е въпрос, който после някой отговаря с разхлабване.
  res.headers.set(nomeHeaderCsp(), politica().csp);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
