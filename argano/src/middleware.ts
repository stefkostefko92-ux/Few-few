import createMiddleware from 'next-intl/middleware';
import { NextRequest, type NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);

// Content-Security-Policy with a fresh nonce per request: Next.js reads the nonce from the request header and puts
// it on its own scripts, so no inline script runs without it. Styles allow inline attributes (bar widths, SVG).
function policy(nonce: string): string {
  const dev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export default function middleware(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = policy(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = intl(new NextRequest(request, { headers }));
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // every page, also addresses with a dot (their 404 gets the policy too); out: API, Next assets and the real files
  matcher: ['/((?!api/|_next/|fonts/|robots\\.txt|sitemap\\.xml|llms\\.txt|icon\\.svg|og\\.png|favicon\\.ico).*)'],
};
