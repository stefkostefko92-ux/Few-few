import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { SESSION_COOKIE } from '@/lib/auth-shared';

/**
 * Primo filtro: verifica la FIRMA del token sul bordo, così un token assente o
 * contraffatto non arriva nemmeno all'applicazione.
 *
 * Non è il controllo definitivo: la revoca (logout, utente disattivato) sta a
 * database e il middleware non può interrogare Prisma. Il controllo completo
 * resta in `requireUser()` lato server, che è quello che decide davvero.
 */

// `/informativa` è pubblica di proposito: si legge PRIMA del primo accesso, ed è
// il testo che spiega quali dati vengono registrati usando il gestionale.
const PUBBLICHE = ['/accesso', '/informativa', '/api/auth/login', '/api/health'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBBLICHE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const segreto = process.env.AUTH_SECRET;
  let valido = false;

  if (token && segreto && segreto.length >= 32) {
    try {
      await jwtVerify(token, new TextEncoder().encode(segreto), {
        issuer: 'staffe',
      });
      valido = true;
    } catch {
      valido = false;
    }
  }

  if (valido) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: { message: 'Accesso richiesto.', code: 'non_autenticato' } },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = '/accesso';
  url.search = pathname === '/' ? '' : `?da=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    // Tutto tranne gli asset statici e le icone.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icone/).*)',
  ],
};
