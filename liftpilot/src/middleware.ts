import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { legacyRedirect } from './i18n/legacy';

const intl = createMiddleware(routing);
const LANGUAGE_COOKIE = 'NEXT_LOCALE';

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
    // Stripe's hosted pages: the subscription's payment and portal, reached by a redirect after the owner's form
    "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
    "frame-ancestors 'none'",
  ].join('; ');
}

export default function middleware(request: NextRequest): NextResponse {
  // /en/… and /bg/… (the former languages): the same page in Italian, for good, before anything else
  const moved = legacyRedirect(request.nextUrl);
  if (moved) return NextResponse.redirect(moved, 301);
  const nonce = btoa(crypto.randomUUID());
  const csp = policy(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = intl(new NextRequest(request, { headers }));
  response.headers.set('Content-Security-Policy', csp);
  // the language cookie of the time with three languages (routing.ts sets none now): gone at the first visit
  if (request.cookies.has(LANGUAGE_COOKIE)) response.cookies.delete(LANGUAGE_COOKIE);
  return response;
}

export const config = {
  // every page, also addresses with a dot (their 404 gets the policy too); out: API, Next assets and the real files
  matcher: ['/((?!api/|_next/|fonts/|img/|icons/|robots\\.txt|sitemap\\.xml|llms\\.txt|indexnow-key\\.txt|apple-touch-icon\\.png|favicon\\.ico).*)'],
};
