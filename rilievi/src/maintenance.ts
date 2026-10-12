import { config } from './config.js';
import { prisma } from './db.js';
import { errorMessage, logger } from './logger.js';
import { purgeExpiredSessions } from './auth/sessions.js';
import { purgeOldRequests } from './requests/service.js';
import { DAY, HOUR } from './time.js';

/**
 * Чистене веднъж на час: изтекли сесии, стари покани и връзки за парола (след 30 дни — дотогава се
 * виждат като „изтекли“), заявки за достъп след срока си, одит по-стар от срока. Грешка тук не спира
 * процеса — опитва пак след час.
 */
export async function runMaintenance(): Promise<void> {
  const now = Date.now();
  const sessions = await purgeExpiredSessions();
  const invites = await prisma.invite.deleteMany({
    where: { expiresAt: { lt: new Date(now - 30 * DAY) }, acceptedAt: null },
  });
  const resets = await prisma.passwordReset.deleteMany({
    where: { expiresAt: { lt: new Date(now - 30 * DAY) } },
  });
  const requests = await purgeOldRequests(now);
  const audit = await prisma.auditLog.deleteMany({
    where: { at: { lt: new Date(now - config().AUDIT_RETENTION_DAYS * DAY) } },
  });
  if (sessions + invites.count + resets.count + requests + audit.count > 0) {
    logger.info(
      { sessions, invites: invites.count, resets: resets.count, requests, audit: audit.count },
      'поддръжка: изчистено',
    );
  }
}

export function startMaintenance(): NodeJS.Timeout {
  const run = (): void => {
    runMaintenance().catch((error: unknown) => {
      logger.error({ err: errorMessage(error) }, 'поддръжката се провали');
    });
  };
  run();
  const timer = setInterval(run, HOUR);
  timer.unref();
  return timer;
}
