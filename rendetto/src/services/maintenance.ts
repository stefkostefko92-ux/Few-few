import { audit, pruneAudit, SYSTEM_ACTOR, verifyAuditChain } from '../audit.js';
import { prisma } from '../db.js';
import { logger } from '../logger.js';
import { purgeExpiredSessions } from '../auth/sessions.js';
import { isLocale, LOCALE_TAG } from '../i18n.js';
import { greetingName, mailTrialEnding } from '../mail/templates.js';

const DAY = 24 * 60 * 60 * 1000;
/**
 * Колко пазим входовете (IP, държава, устройство), устройствата, които не са виждани, и IP адресите в
 * одитния дневник — после се трият или заличават. Описано в политиката за поверителност.
 */
export const LOGIN_RETENTION_DAYS = 180;
/** Непотвърдена регистрация се трие след толкова дни. */
export const UNVERIFIED_RETENTION_DAYS = 7;

/** Писмо 3 дни преди края на тестовия период — веднъж на акаунт. */
export async function sendTrialReminders(now: Date = new Date()): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      role: 'CUSTOMER',
      plan: 'TRIAL',
      bannedAt: null,
      emailVerifiedAt: { not: null },
      trialReminderAt: null,
      planExpiresAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY) },
    },
    take: 200,
  });
  for (const user of users) {
    const locale = isLocale(user.locale) ? user.locale : 'bg';
    const date = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
      dateStyle: 'long',
      timeZone: 'Europe/Sofia',
    }).format(user.planExpiresAt ?? now);
    await prisma.user.update({ where: { id: user.id }, data: { trialReminderAt: now } });
    await mailTrialEnding(user.email, locale, greetingName(user), date);
  }
  return users.length;
}

export async function runMaintenance(now: Date = new Date()): Promise<void> {
  try {
    const sessions = await purgeExpiredSessions();
    const unverified = await prisma.user.deleteMany({
      where: {
        emailVerifiedAt: null,
        role: 'CUSTOMER',
        plan: 'TRIAL',
        planExpiresAt: null,
        lastLoginAt: null,
        createdAt: { lt: new Date(now.getTime() - UNVERIFIED_RETENTION_DAYS * DAY) },
      },
    });
    const ipCutoff = new Date(now.getTime() - LOGIN_RETENTION_DAYS * DAY);
    const logins = await prisma.loginEvent.deleteMany({ where: { createdAt: { lt: ipCutoff } } });
    const devices = await prisma.device.deleteMany({ where: { lastSeenAt: { lt: ipCutoff } } });
    const auditIps = await prisma.auditLog.updateMany({
      where: { at: { lt: ipCutoff }, ip: { not: null } },
      data: { ip: null },
    });
    const tokens = await prisma.emailToken.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - 7 * DAY) } },
    });
    const reminders = await sendTrialReminders(now);
    const chain = await verifyAuditChain({ full: true });
    if (!chain.ok) logger.error({ brokenAt: chain.brokenAt }, 'одитната верига е скъсана');
    const auditPruned = await pruneAudit(chain, now);
    if (unverified.count > 0) {
      await audit(SYSTEM_ACTOR, {
        action: 'system.unverified.purged',
        detail: { count: unverified.count },
      });
    }
    logger.info(
      {
        sessions,
        unverified: unverified.count,
        logins: logins.count,
        devices: devices.count,
        auditIps: auditIps.count,
        tokens: tokens.count,
        reminders,
        auditEntries: chain.count,
        auditPruned,
      },
      'поддръжка',
    );
  } catch (error) {
    logger.error({ err: (error as Error).message }, 'поддръжката се провали');
  }
}

/** Пуска поддръжката веднъж на час (и веднага при старт). Таймерът не държи процеса жив. */
export function startMaintenance(): NodeJS.Timeout {
  void runMaintenance();
  const timer = setInterval(() => void runMaintenance(), 60 * 60 * 1000);
  timer.unref();
  return timer;
}
