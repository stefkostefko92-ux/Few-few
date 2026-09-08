import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { bestLocale, isLocale } from './i18n/locales';

const intl = createMiddleware(routing);

// Път без езиков префикс → ръчен избор (NEXT_LOCALE) → Accept-Language → it.
export default function middleware(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  const first = pathname.split('/')[1] ?? '';
  if (!isLocale(first)) {
    const cookie = request.cookies.get('NEXT_LOCALE')?.value;
    const preferred =
      cookie && isLocale(cookie) ? cookie : bestLocale(request.headers.get('accept-language'));
    const url = request.nextUrl.clone();
    url.pathname = `/${preferred}${pathname === '/' ? '' : pathname}`;
    const response = NextResponse.redirect(url);
    response.cookies.set('NEXT_LOCALE', preferred, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return response;
  }
  return intl(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
