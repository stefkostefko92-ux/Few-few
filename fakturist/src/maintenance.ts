import { prisma } from './db.js';
import { errorMessage, logger } from './logger.js';
import { DAY, HOUR } from './time.js';
import { purgeBankData } from './bank/retention.js';

/**
 * Сроковете от политиката за поверителност (views/legal/privacy): изтеклите сесии и връзките по имейл
 * се трият 30 дни след изтичането си, а изпратените и неуспешните писма от опашката — 90 дни след
 * изпращането (неуспешните — от създаването); данните от банковите извлечения — по bank/retention.ts.
 * Нищо друго не се трие оттук: документите, одитът и приетите условия остават.
 */
export const RETENTION = {
  expiredSessionsMs: 30 * DAY,
  expiredTokensMs: 30 * DAY,
  finishedMailsMs: 90 * DAY,
} as const;

export async function purgeExpired(now: Date = new Date()): Promise<{
  sessions: number;
  tokens: number;
  mails: number;
  erased: number;
  deleted: number;
  statements: number;
}> {
  const before = (ms: number) => new Date(now.getTime() - ms);
  const sessions = await prisma.session.deleteMany({
    where: { expiresAt: { lt: before(RETENTION.expiredSessionsMs) } },
  });
  const tokens = await prisma.userToken.deleteMany({
    where: { expiresAt: { lt: before(RETENTION.expiredTokensMs) } },
  });
  const mails = await prisma.notification.deleteMany({
    where: {
      OR: [
        { status: 'SENT', sentAt: { lt: before(RETENTION.finishedMailsMs) } },
        // Неуспешното писмо спира да се опитва до часове след създаването си.
        { status: 'FAILED', createdAt: { lt: before(RETENTION.finishedMailsMs) } },
      ],
    },
  });
  const bank = await purgeBankData(now);
  return { sessions: sessions.count, tokens: tokens.count, mails: mails.count, ...bank };
}

/** При старт и на всеки 6 часа; грешка само се записва — следващият път опитва пак. */
export function startMaintenanceLoop(): NodeJS.Timeout {
  const run = () => {
    purgeExpired()
      .then((result) => logger.info(result, 'почистване по сроковете'))
      .catch((error: unknown) =>
        logger.error({ err: errorMessage(error) }, 'почистването не мина'),
      );
  };
  run();
  const timer = setInterval(run, 6 * HOUR);
  timer.unref();
  return timer;
}
