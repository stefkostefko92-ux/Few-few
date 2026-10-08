import { LOCK_MINUTES, MAX_FAILED_LOGINS } from '../auth/lock.js';
import { PRE_CSRF_MAX_AGE_MS } from '../auth/guards.js';
import { MAX_SESSION_MS, SESSION_LIMITS } from '../auth/sessions.js';
import { FLASH_MAX_AGE_MS } from '../http/flash.js';
import { LOCALE_COOKIE_MAX_AGE_MS } from '../http/locale.js';
import { translatorFor, type Locale } from '../i18n.js';
import { TRIAL_DAYS, TRIAL_REMINDER_DAYS } from '../plans/plan.js';
import { formatLifetimeTimes, priceTable, VAT_BG_PERCENT } from '../plans/pricing.js';
import { REFUND_DAYS, WITHDRAWAL_DAYS } from '../plans/withdrawal.js';
import {
  durationText,
  LOGIN_RETENTION_DAYS,
  retentionText,
  UNVERIFIED_RETENTION_DAYS,
} from '../retention.js';

/** Числата в правните текстове — едни и същи за страницата на сайта и за копието към писмото. */
export function legalNumbers(locale: Locale) {
  return {
    lifetimeTimes: formatLifetimeTimes(locale),
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
 * регистрация, сесиите, бисквитките, напомнянето за края на тестовия период и заключването на входа.
 * Всеки идва от константата, по която работи кодът, като готов текст на езика („30 дни“, „24 часа“).
 */
export function privacyNumbers(locale: Locale) {
  const t = translatorFor(locale);
  return {
    unverifiedKept: retentionText(UNVERIFIED_RETENTION_DAYS, t),
    sessionMax: durationText(MAX_SESSION_MS, t),
    customerSession: durationText(SESSION_LIMITS.customer.absoluteMs, t),
    customerIdle: durationText(SESSION_LIMITS.customer.idleMs, t),
    staffSession: durationText(SESSION_LIMITS.staff.absoluteMs, t),
    preCsrfKept: durationText(PRE_CSRF_MAX_AGE_MS, t),
    langKept: durationText(LOCALE_COOKIE_MAX_AGE_MS, t),
    flashKept: durationText(FLASH_MAX_AGE_MS, t),
    trialReminder: t('common.days', { n: TRIAL_REMINDER_DAYS }),
    failedLogins: MAX_FAILED_LOGINS,
    lockFor: t('common.minutes', { n: LOCK_MINUTES }),
  };
}
