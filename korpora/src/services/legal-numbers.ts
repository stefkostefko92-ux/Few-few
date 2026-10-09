import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../auth/lock.js';
import { PRE_CSRF_MAX_AGE_MS } from '../auth/guards.js';
import { MAX_SESSION_MS, SESSION_LIMITS } from '../auth/sessions.js';
import { FLASH_MAX_AGE_MS } from '../http/flash.js';
import { LOCALE_COOKIE_MAX_AGE_MS } from '../http/locale.js';
import { translatorFor, type Locale } from '../i18n.js';
import { TRIAL_DAYS, TRIAL_REMINDER_DAYS } from '../plans/plan.js';
import {
  formatLifetimeTimes,
  LIFETIME_BASIS_MONTHS,
  LIFETIME_NOTICE_MONTHS,
  lifetimeMonthShareCents,
  priceTable,
  VAT_BG_PERCENT,
} from '../plans/pricing.js';
import { REFUND_DAYS, WITHDRAWAL_DAYS } from '../plans/withdrawal.js';
import {
  BACKUP_KEEP_DAILY,
  BACKUP_KEEP_WEEKLY,
  durationText,
  LOGIN_RETENTION_DAYS,
  ORDER_RETENTION_DAYS,
  PRE_DEPLOY_BACKUPS_KEPT,
  PRE_DEPLOY_MAX_DAYS,
  retentionText,
  UNVERIFIED_RETENTION_DAYS,
} from '../retention.js';

/** Числата в правните текстове — едни и същи за страницата на сайта и за копието към писмото. */
export function legalNumbers(locale: Locale) {
  const t = translatorFor(locale);
  return {
    lifetimeTimes: formatLifetimeTimes(locale),
    // Lifetime: предизвестието преди спиране и базата за част от цената му („30 месеца“, 30 € / 25 €)
    lifetimeNotice: t('plan.months', { n: LIFETIME_NOTICE_MONTHS }),
    lifetimeBasis: t('plan.months', { n: LIFETIME_BASIS_MONTHS }),
    lifetimeShare: lifetimeMonthShareCents(),
    trialDays: TRIAL_DAYS,
    prices: priceTable(),
    vatPercent: VAT_BG_PERCENT,
    withdrawalDays: WITHDRAWAL_DAYS,
    refundDays: REFUND_DAYS,
    loginRetentionDays: LOGIN_RETENTION_DAYS,
  };
}

/**
 * Сроковете в политиката за поверителност, които държи кодът: изтриването на непотвърдена
 * регистрация, поръчките на изтрит акаунт, сесиите, бисквитките, напомнянето за края на тестовия период, заключването на входа и
 * резервните копия на базата.
 * Всеки идва от константата, по която работи кодът, като готов текст на езика („30 дни“, „24 часа“).
 */
export function privacyNumbers(locale: Locale) {
  const t = translatorFor(locale);
  return {
    unverifiedKept: retentionText(UNVERIFIED_RETENTION_DAYS, t),
    ordersKept: retentionText(ORDER_RETENTION_DAYS, t),
    sessionMax: durationText(MAX_SESSION_MS, t),
    customerSession: durationText(SESSION_LIMITS.customer.absoluteMs, t),
    customerIdle: durationText(SESSION_LIMITS.customer.idleMs, t),
    staffSession: durationText(SESSION_LIMITS.staff.absoluteMs, t),
    preCsrfKept: durationText(PRE_CSRF_MAX_AGE_MS, t),
    langKept: durationText(LOCALE_COOKIE_MAX_AGE_MS, t),
    flashKept: durationText(FLASH_MAX_AGE_MS, t),
    backupDaily: retentionText(BACKUP_KEEP_DAILY, t),
    backupWeekly: t('common.weeks', { n: BACKUP_KEEP_WEEKLY }),
    preDeployKept: PRE_DEPLOY_BACKUPS_KEPT,
    preDeployMax: retentionText(PRE_DEPLOY_MAX_DAYS, t),
    trialReminder: t('common.days', { n: TRIAL_REMINDER_DAYS }),
    failedLogins: MAX_FAILED_LOGINS,
    lockFor: t('common.minutes', { n: LOCK_MINUTES }),
  };
}
