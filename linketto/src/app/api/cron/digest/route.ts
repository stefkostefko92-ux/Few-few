import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { SITE_URL } from '@/lib/seo';
import { emailConfigured, sendEmail } from '@/lib/email';
import { languageDemand } from '@/lib/language-gap';
import { daysAgo } from '@/lib/retention-days';
import {
  DIGEST_MIN_GAP_DAYS,
  digestEmail,
  digestToken,
  shouldSendDigest,
} from '@/lib/digest';

// Седмичен отчет „езикова дупка“. Вика се от cron на сървъра (DEPLOY §9) с
// POST и хедър `Authorization: Bearer <CRON_SECRET>`. Пуска се ежедневно —
// партида до 300, най-дълго необработените първо. `lastDigestAt` = кога е
// ОБРАБОТЕН последно (пратен, пропуснат без посещения или неуспешен) — така
// партидата се върти и никой не засяда; всеки получава ≤1 отчет на ~седмица.
// Без CRON_SECRET маршрутът е изключен (503).

const BATCH = 300;

function authorized(request: Request, secret: string): boolean {
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) {
    return NextResponse.json({ error: 'disabled' }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!emailConfigured()) {
    return NextResponse.json({ error: 'email not configured' }, { status: 503 });
  }

  const now = new Date();
  const since = daysAgo(7);
  const users = await prisma.user.findMany({
    where: {
      digestOptOut: false,
      OR: [
        { lastDigestAt: null },
        { lastDigestAt: { lt: daysAgo(DIGEST_MIN_GAP_DAYS) } },
      ],
      profiles: { some: { published: true, bannedAt: null } },
    },
    orderBy: [{ lastDigestAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
    take: BATCH,
    select: {
      id: true,
      email: true,
      name: true,
      locale: true,
      lastDigestAt: true,
      profiles: {
        where: { published: true, bannedAt: null },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { id: true, translations: { select: { locale: true } } },
      },
    },
  });

  // Една заявка за цялата партида (не по една на потребител): прегледите на
  // страницата = ClickEvent без linkId (без бисквитки, без PII).
  const profileIds = users.flatMap((user) => user.profiles.map((p) => p.id));
  const rows = profileIds.length
    ? await prisma.clickEvent.groupBy({
        by: ['profileId', 'country'],
        where: {
          profileId: { in: profileIds },
          linkId: null,
          createdAt: { gte: since },
        },
        _count: { _all: true },
      })
    : [];
  const byProfile = new Map<string, { country: string | null; count: number }[]>();
  for (const row of rows) {
    const list = byProfile.get(row.profileId) ?? [];
    list.push({ country: row.country, count: row._count._all });
    byProfile.set(row.profileId, list);
  }

  let sent = 0;
  let skipped = 0;
  const processed: string[] = [];
  for (const user of users) {
    processed.push(user.id);
    const profile = user.profiles[0];
    if (!profile) continue;
    const byCountry = byProfile.get(profile.id) ?? [];
    const views = byCountry.reduce((sum, row) => sum + row.count, 0);
    if (!shouldSendDigest({ views, lastDigestAt: user.lastDigestAt, now })) {
      skipped += 1;
      continue;
    }
    const gap = languageDemand(
      byCountry,
      profile.translations.map((t) => t.locale),
    );
    const unsubscribeUrl = `${SITE_URL}/api/digest/unsubscribe?u=${encodeURIComponent(user.id)}&s=${digestToken(user.id, secret)}`;
    const { subject, html } = digestEmail({
      locale: user.locale,
      name: user.name,
      views,
      missing: gap.missing,
      dashboardUrl: `${SITE_URL}/${user.locale}/dashboard?p=${profile.id}`,
      unsubscribeUrl,
    });
    const ok = await sendEmail({
      to: user.email,
      subject,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (ok) sent += 1;
  }
  // Всички обработени (и пропуснатите/неуспешните) — следващият опит след ~седмица.
  if (processed.length) {
    await prisma.user.updateMany({
      where: { id: { in: processed } },
      data: { lastDigestAt: now },
    });
  }
  return NextResponse.json({ sent, skipped, batch: users.length });
}
