import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isSensitiveUrl } from '@/lib/brands';

// Съкратен линк: увеличаваме брояча (агрегат, без бисквитки/PII) и
// пренасочваме към целта. Непознат код → началната страница.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;
  const origin = new URL(request.url).origin;
  const link = await prisma.shortLink.findUnique({
    where: { code },
    include: { profile: { select: { bannedAt: true, published: true } } },
  });
  // Баннат/свален профил = notFound на ВСИЧКИ публични маршрути (и кратките
  // му линкове, иначе фишинг от нашия домейн); 18+ цел не минава без
  // страницата за възраст — такива кратки линкове не се пренасочват.
  if (
    !link ||
    link.profile.bannedAt ||
    !link.profile.published ||
    isSensitiveUrl(link.targetUrl)
  ) {
    return NextResponse.redirect(new URL('/', origin), 302);
  }
  await prisma.shortLink
    .update({ where: { id: link.id }, data: { clicks: { increment: 1 } } })
    .catch(() => undefined);
  return NextResponse.redirect(link.targetUrl, 302);
}
