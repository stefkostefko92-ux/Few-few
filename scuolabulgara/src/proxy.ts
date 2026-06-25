import { NextRequest, NextResponse } from "next/server";
import { LOCALES, isLocale, type Locale } from "@/lib/i18n";
import { detectLocale } from "@/lib/geo";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const LANG_COOKIE = "qb_lang";

function hasLocalePrefix(pathname: string): Locale | null {
  const seg = pathname.split("/")[1];
  return isLocale(seg) ? seg : null;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ---- Admin area: protect everything except the login page ----
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ---- Public site: ensure a locale prefix ----
  const current = hasLocalePrefix(pathname);
  if (current) {
    // Keep the cookie in sync so manual choices stick on the next visit.
    const res = NextResponse.next();
    if (req.cookies.get(LANG_COOKIE)?.value !== current) {
      res.cookies.set(LANG_COOKIE, current, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
    return res;
  }

  // No locale in the path → decide one. A manual choice (cookie) wins over geo.
  const cookieLang = req.cookies.get(LANG_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLang) ? cookieLang : detectLocale(req);

  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;
  const res = NextResponse.redirect(url);
  res.cookies.set(LANG_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export const config = {
  // Run on everything except Next internals, API routes, uploads and files.
  matcher: ["/((?!_next/|api/|uploads/|.*\\..*).*)"],
};
