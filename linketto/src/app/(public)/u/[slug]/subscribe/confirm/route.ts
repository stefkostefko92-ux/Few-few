import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GDPR двойно съгласие: линкът от имейла потвърждава абонамента.
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
        data: { confirmedAt: subscriber.confirmedAt ?? new Date(), unsubscribedAt: null },
      });
      back.searchParams.set('subscribed', 'confirmed');
    }
  }
  return NextResponse.redirect(back, 302);
}
