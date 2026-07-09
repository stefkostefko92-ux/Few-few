import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// Отписване с един клик (линк в подписа на всеки бюлетин).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const token = new URL(request.url).searchParams.get('token') ?? '';
  const origin = new URL(request.url).origin;
  const back = new URL(`/u/${slug}`, origin);

  if (token) {
    const subscriber = await prisma.subscriber.findUnique({
      where: { token },
      include: { profile: { select: { slug: true } } },
    });
    if (subscriber && subscriber.profile.slug === slug) {
      await prisma.subscriber.update({
        where: { id: subscriber.id },
        data: { unsubscribedAt: new Date() },
      });
      back.searchParams.set('unsub', '1');
    }
  }
  return NextResponse.redirect(back, 302);
}
