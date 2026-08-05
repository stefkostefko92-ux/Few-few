import { NextResponse, type NextRequest } from "next/server";

import { readToken } from "@/lib/session";

/**
 * Пазачът на следственото издание.
 *
 * В публичен режим не прави нищо — сайтът е публичен по замисъл. В следствен
 * режим НИЩО не се вижда без установена самоличност: и справките, и API-тата.
 *
 * Проверката е тук, а не по страници, защото пропуснатата страница е тихият
 * начин един защитен инструмент да остане отворен.
 *
 * `middleware` работи в Edge средата, където `node:crypto` не съществува —
 * затова проверката на жетона минава през Web Crypto в `session.ts`, без
 * файлове и без бази.
 */

const PUBLIC_PATHS = ["/vhod", "/api/vhod"];

export async function middleware(request: NextRequest) {
  if (process.env.IPLOOKUP_MODE !== "investigation") return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const claims = await readToken(request.cookies.get("carbonip_session")?.value, process.env.IPLOOKUP_SESSION_SECRET ?? "");
  if (claims) return NextResponse.next();

  // API-тата получават код, не пренасочване — иначе клиентът разбира отказа
  // като успешен отговор с HTML вътре.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Нужен е вход." }, { status: 401 });
  }

  const target = request.nextUrl.clone();
  target.pathname = "/vhod";
  target.search = "";
  return NextResponse.redirect(target);
}

export const config = {
  // Статичните ресурси остават извън пазача — иначе страницата за вход не би
  // могла да се нарисува.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|world-mask.svg).*)"],
};
