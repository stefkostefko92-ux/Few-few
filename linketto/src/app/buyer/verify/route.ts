import { NextResponse } from 'next/server';
import { consumeBuyerMagicToken } from '@/lib/buyer-auth';

// Magic-link вход на купувача: консумира токена, създава сесия и пренасочва
// към заключеното съдържание (само относителен вътрешен път).
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const nextParam = url.searchParams.get('next') ?? '/';
  // Само СЪЩИЯ произход — сравняваме резолвнатия origin (backslash/︙ трикове
  // като „/\evil.com" се нормализират от URL и се хващат тук). Срещу open redirect.
  let next = '/';
  try {
    const resolved = new URL(nextParam, url.origin);
    if (resolved.origin === url.origin) {
      next = resolved.pathname + resolved.search + resolved.hash;
    }
  } catch {
    next = '/';
  }

  const email = token ? await consumeBuyerMagicToken(token) : null;
  const dest = email ? next : '/';
  return NextResponse.redirect(new URL(dest, url.origin), 302);
}
