import { NextResponse, type NextRequest } from 'next/server';

import { bestLocale, isLocale } from '@/i18n/config';

/**
 * Езикът живее в URL-а (`/bg/...`, `/en/...`), не в бисквитка: така всяка
 * страница е споделяема и индексируема на точния си език, а и няма какво да
 * се съгласува по ePrivacy. Пътят без префикс се пренасочва по
 * `Accept-Language` — еднократно, не при всяко зареждане.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const first = pathname.split('/')[1];
  if (isLocale(first)) return NextResponse.next();

  const locale = bestLocale(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Извън обхвата: API-то, вътрешните файлове на Next и всичко с разширение
   * (иконата, llms.txt, картинките). `sitemap.xml`/`robots.txt` също — те са
   * общи за двата езика и не носят префикс.
   */
  matcher: ['/((?!api|_next|.*\\..*|sitemap.xml|robots.txt).*)'],
};

