import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

// Заявка към чужд хост (собствен домейн на профил) се пренаписва към
// /d/<host>; всичко останало минава през локализирания рутинг.
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
  // Публичните профили (/u, /d), API и статичните файлове са извън
  // локализирания рутинг — езикът им се решава от съдържанието на профила.
  matcher: ['/((?!api|u/|d/|_next|_vercel|.*\\..*).*)'],
};
