import { NextResponse } from 'next/server';
import { consumeBuyerMagicToken } from '@/lib/buyer-auth';

// Magic-link вход на купувача: консумира токена, създава сесия и пренасочва
// към заключеното съдържание (само относителен вътрешен път).
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const nextParam = url.searchParams.get('next') ?? '/';
  // Само вътрешни относителни пътища (без //, без схема) — срещу open redirect.
  const next =
    nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

  const email = token ? await consumeBuyerMagicToken(token) : null;
  const dest = email ? next : '/';
  return NextResponse.redirect(new URL(dest, url.origin), 302);
}
