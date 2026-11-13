import { NextResponse, type NextRequest } from 'next/server';

import { bestLocale, isLocale, LOCALE_HEADER } from '@/i18n/config';

/**
 * Езикът живее в URL-а (`/bg/...`, `/en/...`), не в бисквитка: така всяка
 * страница е споделяема и индексируема на точния си език, а и няма какво да
 * се съгласува по ePrivacy. Пътят без префикс се пренасочва по
 * `Accept-Language` — еднократно, не при всяко зареждане.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const first = pathname.split('/')[1];
  if (isLocale(first)) {
    // Езикът надолу към `not-found.tsx`: той се рендира без `params`, а без това
    // английската 404 говореше на български. Хедърът се ЗАДАВА тук (не се
    // добавя), тоест подаден от клиента `x-fivem-locale` се презаписва — и
    // въпреки това четецът пак го минава през `isLocale`.
    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, first);
    return NextResponse.next({ request: { headers } });
  }

  const locale = bestLocale(request.headers.get('accept-language'));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  // ВРЕМЕННО (307), не постоянно: целта зависи от езика на браузъра, а
  // постоянното пренасочване се кешира и би заковало първия избор завинаги.
  // `/` затова НЕ е страница — няма го в sitemap-а, `x-default` сочи `/bg`, а
  // никоя наша връзка не води към голия корен. `Vary` казва на кешовете по
  // пътя, че отговорът зависи от `Accept-Language`.
  const response = NextResponse.redirect(url, 307);
  response.headers.set('Vary', 'Accept-Language');
  return response;
}

export const config = {
  /**
   * Извън обхвата: API-то, вътрешните файлове на Next и всичко с разширение
   * (иконата, llms.txt, картинките). `sitemap.xml`/`robots.txt` също — те са
   * общи за двата езика и не носят префикс.
   */
  matcher: ['/((?!api|_next|.*\\..*|sitemap.xml|robots.txt).*)'],
};

