import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildSubscribersCsv } from '@/lib/newsletter';

// Износ на аудиторията в CSV — аудиторията е на създателя, не заключена в
// нас. Само за собственика (сесия); само потвърдените, неотписани абонати.
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Следва ?p (активния профил), с проверка за собственост.
  const p = new URL(request.url).searchParams.get('p');
  const profile = await prisma.profile.findFirst({
    where: { userId: user.id, ...(p ? { id: p } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { id: true, slug: true },
  });
  if (!profile) {
    return NextResponse.json({ error: 'no profile' }, { status: 404 });
  }
  const subscribers = await prisma.subscriber.findMany({
    where: { profileId: profile.id, unsubscribedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { email: true, locale: true, confirmedAt: true, createdAt: true },
  });
  const csv = buildSubscribersCsv(subscribers);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${profile.slug}-subscribers.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
