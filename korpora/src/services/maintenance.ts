import { audit, pruneAudit, SYSTEM_ACTOR, verifyAuditChain } from '../audit.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { purgeExpiredSessions } from '../auth/sessions.js';
import { accountLocale } from '../i18n.js';
import { longDate } from '../mail/dates.js';
import { greetingName, mailTrialEnding } from '../mail/templates.js';
import { TRIAL_REMINDER_DAYS } from '../plans/plan.js';
import { LOGIN_RETENTION_DAYS, UNVERIFIED_RETENTION_DAYS } from '../retention.js';
import { DAY, HOUR } from '../time.js';
import { purgeUnconsentedFingerprints } from './device-consent.js';
import { resendOrderMail } from './plan-requests.js';

/** Изтеклите връзки от писмата се пазят още толкова дни, после се трият. */
const EXPIRED_TOKEN_DAYS = 7;

/**
 * Писмата за наближаващия край на тестовия период. Отбелязва се само пратеното: при отказ на SMTP
 * следващата поддръжка опитва пак. Връща колко писма са тръгнали.
 */
async function sendTrialReminders(now: Date = new Date()): Promise<number> {
  const users = await prisma.user.findMany({
    where: {
      role: 'CUSTOMER',
      plan: 'TRIAL',
      bannedAt: null,
      emailVerifiedAt: { not: null },
      trialReminderAt: null,
      planExpiresAt: { gt: now, lte: new Date(now.getTime() + TRIAL_REMINDER_DAYS * DAY) },
    },
    take: 200,
  });
  let sent = 0;
  for (const user of users) {
    const locale = accountLocale(user);
    const date = longDate(user.planExpiresAt ?? now, locale);
    if (!(await mailTrialEnding(user.email, locale, greetingName(user), date))) continue;
    await prisma.user.update({ where: { id: user.id }, data: { trialReminderAt: now } });
    sent++;
  }
  return sent;
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
    // отпечатъкът и устройството от регистрацията — със същия срок, както казва политиката
    const signups = await prisma.user.updateMany({
      where: {
        createdAt: { lt: ipCutoff },
        OR: [{ signupDeviceHash: { not: null } }, { signupFingerprint: { not: null } }],
      },
      data: { signupDeviceHash: null, signupFingerprint: null },
    });
    // отпечатък без съгласие не се пази — и взетият преди отметката за съгласие
    const fingerprints = await purgeUnconsentedFingerprints();
    const auditIps = await prisma.auditLog.updateMany({
      where: { at: { lt: ipCutoff }, ip: { not: null } },
      data: { ip: null },
    });
    const tokens = await prisma.emailToken.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - EXPIRED_TOKEN_DAYS * DAY) } },
    });
    const reminders = await sendTrialReminders(now);
    const orderMail = await resendOrderMail(now);
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
        signups: signups.count,
        fingerprints,
        auditIps: auditIps.count,
        tokens: tokens.count,
        reminders,
        orderMail,
        auditEntries: chain.count,
        auditPruned,
      },
      'поддръжка',
    );
  } catch (error) {
    logger.error({ err: errorMessage(error) }, 'поддръжката се провали');
  }
}

/** Пуска поддръжката веднъж на час (и веднага при старт). Таймерът не държи процеса жив. */
export function startMaintenance(): NodeJS.Timeout {
  void runMaintenance();
  const timer = setInterval(() => void runMaintenance(), HOUR);
  timer.unref();
  return timer;
}
