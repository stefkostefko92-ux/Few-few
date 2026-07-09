import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Съкратен линк: увеличаваме брояча (агрегат, без бисквитки/PII) и
// пренасочваме към целта. Непознат код → началната страница.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;
  const origin = new URL(request.url).origin;
  const link = await prisma.shortLink.findUnique({ where: { code } });
  if (!link) {
    return NextResponse.redirect(new URL('/', origin), 302);
  }
  await prisma.shortLink
    .update({ where: { id: link.id }, data: { clicks: { increment: 1 } } })
    .catch(() => undefined);
  return NextResponse.redirect(link.targetUrl, 302);
}
