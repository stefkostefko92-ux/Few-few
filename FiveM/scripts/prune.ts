/**
 * Изтрива каквото е изтекло. Обещан срок без изтриващ механизъм е нарушение на
 * чл. 5, ал. 1, б. „д“ ОРЗД (ограничение на съхранението) — сроковете тук
 * трябва да съвпадат с обявените в `src/app/privacy/page.tsx`.
 *
 *   npm run prune          # пуска се по cron, веднъж дневно
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сроковете от политиката за поверителност — единственият им друг източник. */
export const RETENTION = {
  /** Заявки за листване: 24 месеца. */
  submissionDays: 730,
  /** Сигнали по DSA: 24 месеца. */
  reportDays: 730,
  /** Отхвърлени ревюта: 6 месеца. */
  rejectedReviewDays: 183,
  /** Часови снимки на посещаемостта: 90 дни. */
  snapshotDays: 90,
} as const;

function before(days: number, now = Date.now()): Date {
  return new Date(now - days * DAY_MS);
}

async function main() {
  const [submissions, reports, reviews, snapshots] = await prisma.$transaction([
    prisma.submission.deleteMany({ where: { createdAt: { lt: before(RETENTION.submissionDays) } } }),
    prisma.report.deleteMany({ where: { createdAt: { lt: before(RETENTION.reportDays) } } }),
    prisma.review.deleteMany({
      where: { status: 'REJECTED', createdAt: { lt: before(RETENTION.rejectedReviewDays) } },
    }),
    prisma.serverSnapshot.deleteMany({ where: { at: { lt: before(RETENTION.snapshotDays) } } }),
  ]);

  console.log(
    `Изчистени: ${submissions.count} заявки · ${reports.count} сигнала · ` +
      `${reviews.count} отхвърлени ревюта · ${snapshots.count} снимки.`,
  );
}

main()
  .catch((error) => {
    console.error('Изчистването се провали:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
