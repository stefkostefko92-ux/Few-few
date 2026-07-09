import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { DEFAULT_LOCALE, isLocale, localeFromGeo } from './i18n/locales';

const intl = createMiddleware(routing);

// Заявка към чужд хост (собствен домейн на профил) се пренаписва към
// /d/<host>; всичко останало минава през локализирания рутинг с
// автоматичен избор на език по геолокация (IP → държава/регион).
export default function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host')?.split(':')[0].toLowerCase();
  const primary = primaryHost();
  if (
    host &&
    primary &&
    host !== primary &&
    host !== `www.${primary}` &&
    request.nextUrl.pathname === '/'
  ) {
    return NextResponse.rewrite(new URL(`/d/${host}`, request.url));
  }

  // Път без езиков префикс (напр. „/" или „/pricing") → избираме езика
  // автоматично: ръчен избор (cookie) → IP геолокация → Accept-Language.
  const pathname = request.nextUrl.pathname;
  const firstSegment = pathname.split('/')[1] ?? '';
  if (!isLocale(firstSegment)) {
    const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
    const preferred =
      cookieLocale && isLocale(cookieLocale)
        ? cookieLocale
        : localeFromGeo({
            country:
              request.headers.get('cf-ipcountry') ??
              request.headers.get('x-vercel-ip-country'),
            acceptLanguage: request.headers.get('accept-language'),
            fallback: DEFAULT_LOCALE,
          });
    const url = request.nextUrl.clone();
    url.pathname = `/${preferred}${pathname === '/' ? '' : pathname}`;
    const response = NextResponse.redirect(url);
    // Запомняме избора, за да е консистентен и да уважи ръчно превключване.
    response.cookies.set('NEXT_LOCALE', preferred, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return response;
  }

  return intl(request);
}

function primaryHost(): string | null {
  try {
    return new URL(
      process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    ).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export const config = {
  // Публичните профили (/u, /d), съкратените линкове (/s), API и
  // статичните файлове са извън локализирания рутинг.
  matcher: ['/((?!api|u/|d/|s/|_next|_vercel|.*\\..*).*)'],
};
