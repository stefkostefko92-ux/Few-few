/**
 * Изтрива каквото е изтекло. Обещан срок без изтриващ механизъм е нарушение на
 * чл. 5, ал. 1, б. „д“ ОРЗД (ограничение на съхранението) — сроковете тук
 * трябва да съвпадат с обявените в `src/app/privacy/page.tsx`.
 *
 *   npm run prune          # пуска се по cron, веднъж дневно
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Сроковете от политиката за поверителност — единственият им друг източник. */
export const RETENTION = {
  /**
   * Имена на играчи: 1 ден — предпазител, не същински срок.
   *
   * Политиката обещава МОМЕНТНА снимка и нормално `refresh-servers` я
   * презаписва на 3 минути. Тук се лови само редът, спрял да се опреснява
   * (сървър извън `APPROVED`, спрян cron): един ден без опресняване вече не е
   * „сега играят“ по никое четене на думата.
   */
  playerNameDays: 1,
  /** Заявки за листване: 24 месеца. */
  submissionDays: 730,
  /** Сигнали по DSA: 24 месеца. */
  reportDays: 730,
  /** Отхвърлени ревюта: 6 месеца. */
  rejectedReviewDays: 183,
  /**
   * Одобрени ревюта на СВАЛЕН сървър: 6 месеца след свалянето.
   *
   * Политиката обещава „пазят се, докато сървърът е в директорията“, а
   * `onDelete: Cascade` НЕ се задейства: свалянето на сървър е смяна на статус
   * (`REJECTED`), не изтриване на реда. Тоест ревютата на свален сървър
   * оставаха вечно — обещан срок без изпълнител, чл. 5, ал. 1, б. „д“ ОРЗД.
   */
  orphanReviewDays: 183,
  /** Часови снимки на посещаемостта: 90 дни. */
  snapshotDays: 90,
  /**
   * Канали на стриймъри, невиждани на живо. Срокът е ПО ПЛАТФОРМА, не един
   * общ, защото платформата налага свой и той бие нашия:
   *
   *  - **YouTube: 30 дни.** YouTube API Services Developer Policies, III.E.4.d —
   *    данни от API-то се изтриват или опресняват най-късно на 30 календарни
   *    дни. 180 дни щеше да е нарушение на договора, не просто щедрост.
   *  - Twitch и Kick: 180 дни. Договорът на Twitch говори за 24-часов кеш —
   *    сверѝ го РЪЧНО на legal.twitch.com преди пускане (страницата е
   *    JS-рендирана и не се чете автоматично) и свали срока, ако се потвърди.
   *
   * Изключения (нарочни, не пропуск): `status = REJECTED` е ЗАПИСАНОТО
   * ВЪЗРАЖЕНИЕ по чл. 21 ОРЗД — изтрие ли се, cron-ът връща човека обратно до
   * 10 минути. Пази се, докато съществува автоматичното откриване.
   */
  streamerDays: 180,
  youtubeStreamerDays: 30,
  /**
   * Ръчно добавените (TikTok) нямат жив статус, тоест „не е виждан на живо“
   * там не значи нищо. Затова срокът тече от последното ПИПАНЕ от човек:
   * 365 дни без потвърждение и записът пада. Без това „пазим ги, докато са
   * актуални“ е обещание без изпълнител.
   */
  manualStreamerDays: 365,
  /** Одитният дневник: 24 месеца. Той пази и канала на възразилия. */
  auditLogDays: 730,
  /**
   * Броячът на опитите за вход: 24 часа — точно колкото обявява `/privacy`.
   * Дотук нямаше изтриващ механизъм, тоест хешираните IP-та се трупаха вечно
   * срещу обявен срок. Обещан срок без изпълнител е нарушение на чл. 5, ал. 1,
   * б. „д“, независимо че данната е хеш.
   */
  loginAttemptHours: 24,
} as const;

function before(days: number, now = Date.now()): Date {
  return new Date(now - days * DAY_MS);
}

async function main() {
  const stale = before(RETENTION.streamerDays);
  const staleYouTube = before(RETENTION.youtubeStreamerDays);
  /** Общото условие „не е виждан на живо от X“ — `null` значи никога. */
  const notLiveSince = (date: Date) => [
    { lastLiveAt: null },
    { lastLiveAt: { lt: date } },
  ];

  const [
    submissions,
    reports,
    reviews,
    orphanReviews,
    snapshots,
    streamers,
    youtube,
    manual,
    audits,
    logins,
    sessions,
  ] = await prisma.$transaction([
    prisma.submission.deleteMany({
      where: { createdAt: { lt: before(RETENTION.submissionDays) } },
    }),
    prisma.report.deleteMany({
      where: { createdAt: { lt: before(RETENTION.reportDays) } },
    }),
    prisma.review.deleteMany({
      where: {
        status: "REJECTED",
        createdAt: { lt: before(RETENTION.rejectedReviewDays) },
      },
    }),
    // Ревюта на свален сървър — виж `orphanReviewDays`.
    prisma.review.deleteMany({
      where: {
        server: {
          status: "REJECTED",
          updatedAt: { lt: before(RETENTION.orphanReviewDays) },
        },
      },
    }),
    prisma.serverSnapshot.deleteMany({
      where: { at: { lt: before(RETENTION.snapshotDays) } },
    }),
    // Имена на играчи, останали без да се опресняват. Нормално ги чисти самият
    // `refresh-servers` (презаписва ги на 3 мин и ги изпразва при офлайн) —
    // това тук е предпазителят за реда, който по някаква причина е спрял да се
    // опреснява: сървър, извън `APPROVED`, спрян cron, забита партида. Без него
    // „моментна снимка“ в /privacy може тихо да стане вечен запис.
    prisma.server.updateMany({
      where: { playersSeenAt: { lt: before(RETENTION.playerNameDays) } },
      data: { playerNames: [], playersSeenAt: null },
    }),
    prisma.streamer.deleteMany({
      where: {
        manual: false,
        platform: { not: "YOUTUBE" },
        status: { not: "REJECTED" },
        createdAt: { lt: stale },
        OR: notLiveSince(stale),
      },
    }),
    // YouTube носи своя, по-кратък срок по договора на платформата.
    prisma.streamer.deleteMany({
      where: {
        manual: false,
        platform: "YOUTUBE",
        status: { not: "REJECTED" },
        createdAt: { lt: staleYouTube },
        OR: notLiveSince(staleYouTube),
      },
    }),
    // Ръчните: срокът тече от последното пипане ОТ ЧОВЕК (`reviewedAt`), не
    // от `updatedAt`. `updatedAt` е машинно поле — Prisma го пипа при всяко
    // записване, включително от cron-а, тоест канал, който никой не е
    // поглеждал от години, изглеждаше „проверен вчера“ и не падаше никога.
    // Политиката обещава „365 дни след последната НАША проверка“.
    prisma.streamer.deleteMany({
      where: {
        manual: true,
        status: { not: "REJECTED" },
        OR: [
          { reviewedAt: { lt: before(RETENTION.manualStreamerDays) } },
          {
            reviewedAt: null,
            createdAt: { lt: before(RETENTION.manualStreamerDays) },
          },
        ],
      },
    }),
    prisma.auditLog.deleteMany({
      where: { at: { lt: before(RETENTION.auditLogDays) } },
    }),
    prisma.loginAttempt.deleteMany({
      where: {
        at: {
          lt: new Date(Date.now() - RETENTION.loginAttemptHours * 3_600_000),
        },
      },
    }),
    // Изтеклите сесии не са срок в политиката, а хигиена: мъртъв ред с хеш
    // на токен няма за какво да стои.
    prisma.adminSession.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }),
  ]);

  console.log(
    `Изчистени: ${submissions.count} заявки · ${reports.count} сигнала · ` +
      `${reviews.count} отхвърлени + ${orphanReviews.count} осиротели ревюта · ` +
      `${snapshots.count} снимки · ` +
      `${streamers.count + youtube.count + manual.count} канала ` +
      `(${youtube.count} YouTube по 30-дневното правило, ${manual.count} ръчни) · ` +
      `${audits.count} записа от дневника · ${logins.count} опита за вход · ` +
      `${sessions.count} изтекли сесии.`,
  );
}

main()
  .catch((error) => {
    console.error("Изчистването се провали:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
