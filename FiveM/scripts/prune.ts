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
  /**
   * Канали на стриймъри, невиждани на живо: 180 дни. Това са лични данни на
   * физически лица — канал, който вече не излъчва български GTA V, няма
   * основание да стои. Изключения (нарочни, не пропуск):
   *  - `status = REJECTED` е ЗАПИСАНОТО ВЪЗРАЖЕНИЕ по чл. 21 ОРЗД; изтрие ли
   *    се, cron-ът връща човека обратно до час. Пази се, докато има откриване;
   *  - `manual` са добавените на ръка (TikTok няма откриване на живо изобщо,
   *    тоест „не е виждан на живо“ там не значи нищо).
   */
  streamerDays: 180,
} as const;

function before(days: number, now = Date.now()): Date {
  return new Date(now - days * DAY_MS);
}

async function main() {
  const stale = before(RETENTION.streamerDays);
  const [submissions, reports, reviews, snapshots, streamers] = await prisma.$transaction([
    prisma.submission.deleteMany({ where: { createdAt: { lt: before(RETENTION.submissionDays) } } }),
    prisma.report.deleteMany({ where: { createdAt: { lt: before(RETENTION.reportDays) } } }),
    prisma.review.deleteMany({
      where: { status: 'REJECTED', createdAt: { lt: before(RETENTION.rejectedReviewDays) } },
    }),
    prisma.serverSnapshot.deleteMany({ where: { at: { lt: before(RETENTION.snapshotDays) } } }),
    prisma.streamer.deleteMany({
      where: {
        manual: false,
        status: { not: 'REJECTED' },
        createdAt: { lt: stale },
        // Никога виждан на живо ИЛИ последно на живо преди срока.
        OR: [{ lastLiveAt: null }, { lastLiveAt: { lt: stale } }],
      },
    }),
  ]);

  console.log(
    `Изчистени: ${submissions.count} заявки · ${reports.count} сигнала · ` +
      `${reviews.count} отхвърлени ревюта · ${snapshots.count} снимки · ` +
      `${streamers.count} неактивни канала.`,
  );
}

main()
  .catch((error) => {
    console.error('Изчистването се провали:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
