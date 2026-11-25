import { audit, pruneAudit, SYSTEM_ACTOR, verifyAuditChain } from '../audit.js';
import { prisma } from '../db.js';
import { errorMessage, logger } from '../logger.js';
import { purgeExpiredSessions } from '../auth/sessions.js';
import { accountLocale } from '../i18n.js';
import { longDate } from '../mail/dates.js';
import { greetingName, mailPlanEnding, mailTrialEnding } from '../mail/templates.js';
import { PREMIUM_REMINDER_DAYS, TRIAL_REMINDER_DAYS } from '../plans/plan.js';
import { LOGIN_RETENTION_DAYS, UNVERIFIED_RETENTION_DAYS } from '../retention.js';
import { DAY, HOUR } from '../time.js';
import { purgeUnconsentedFingerprints } from './device-consent.js';
import { purgeExpiredOrders } from './order-retention.js';
import { resendOrderMail } from './plan-requests.js';
import { keepCurrentTermsCopies } from './terms-snapshots.js';

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

/**
 * Писмата за наближаващия край на Premium — веднъж за всеки срок: `planReminderFor` пази края, за който е
 * пратено; нов срок (подновяване от екипа) дава ново писмо. Отбелязва се само пратеното.
 */
async function sendPremiumReminders(now: Date = new Date()): Promise<number> {
  const due = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "User"
    WHERE "role" = 'CUSTOMER' AND "plan" = 'PREMIUM' AND "bannedAt" IS NULL
      AND "emailVerifiedAt" IS NOT NULL
      AND "planExpiresAt" > ${now}
      AND "planExpiresAt" <= ${new Date(now.getTime() + PREMIUM_REMINDER_DAYS * DAY)}
      AND ("planReminderFor" IS NULL OR "planReminderFor" <> "planExpiresAt")
    LIMIT 200`;
  let sent = 0;
  for (const { id } of due) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user?.planExpiresAt) continue;
    const locale = accountLocale(user);
    const date = longDate(user.planExpiresAt, locale);
    if (!(await mailPlanEnding(user.email, locale, greetingName(user), date))) continue;
    await prisma.user.update({ where: { id }, data: { planReminderFor: user.planExpiresAt } });
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
    // отпечатъкът, устройството и IP адресът от регистрацията — със същия срок, както казва политиката
    // (държавата остава: без адреса тя не сочи човек)
    const signups = await prisma.user.updateMany({
      where: {
        createdAt: { lt: ipCutoff },
        OR: [
          { signupDeviceHash: { not: null } },
          { signupFingerprint: { not: null } },
          { signupIp: { not: null } },
        ],
      },
      data: { signupDeviceHash: null, signupFingerprint: null, signupIp: null },
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
    // поръчките на изтрити акаунти — след срока, който казва политиката
    const orders = await purgeExpiredOrders(now);
    const reminders = (await sendTrialReminders(now)) + (await sendPremiumReminders(now));
    // копието на условията в сила — преди повторните писма, които може да го поискат след смяна
    await keepCurrentTermsCopies();
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
        orders,
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
