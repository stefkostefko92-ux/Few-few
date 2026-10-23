import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidSlug, normalizeSlug, RESERVED_SLUGS } from '@/lib/slug';
import { clientIp, rateLimit } from '@/lib/rate-limit';

// „Запази си името“ (hero на сайта): проверка на живо дали slug е свободен.
// Публично, без вход; лимит по IP срещу изброяване на имената.

export async function GET(request: Request): Promise<NextResponse> {
  const headers = { 'Cache-Control': 'no-store' };
  if (!rateLimit(`handle:${await clientIp()}`, 40, 60_000)) {
    return NextResponse.json({ error: 'rate' }, { status: 429, headers });
  }
  const raw = new URL(request.url).searchParams.get('slug') ?? '';
  const slug = normalizeSlug(raw.slice(0, 64));
  if (!isValidSlug(slug)) {
    return NextResponse.json(
      {
        slug,
        available: false,
        reason: RESERVED_SLUGS.has(slug) ? 'reserved' : 'invalid',
      },
      { headers },
    );
  }
  const taken = await prisma.profile.findUnique({
    where: { slug },
    select: { id: true },
  });
  return NextResponse.json(
    { slug, available: !taken, ...(taken ? { reason: 'taken' } : {}) },
    { headers },
  );
}
