import { config } from '../config.js';
import { LOCK_MINUTES } from '../auth/lock.js';
import { translate, translatorFor, type Locale } from '../i18n.js';
import { ordersKeptText, UNVERIFIED_RETENTION_DAYS } from '../retention.js';
import { legalPath } from '../seo/paths.js';
import { link, period, send, validFor } from './compose.js';

/* Писмата по повод: какво казва всяко и кое е основното му действие (бутонът в HTML варианта). */
export { greetingName, link, send } from './compose.js';

/** До адрес, който още никой не е потвърдил — без име. */
export function mailVerifyEmail(to: string, locale: Locale, token: string): Promise<boolean> {
  return send(
    to,
    locale,
    'verify',
    {
      link: link(`/verify-email?token=${token}`, locale),
      hours: validFor(locale, 'VERIFY_EMAIL'),
      days: period(locale, 'days', UNVERIFIED_RETENTION_DAYS),
    },
    null,
    { action: { param: 'link', label: 'confirmEmail' } },
  );
}

export function mailAlreadyRegistered(
  to: string,
  locale: Locale,
  name: string | null,
): Promise<boolean> {
  return send(
    to,
    locale,
    'alreadyRegistered',
    { login: link('/login', locale), reset: link('/forgot', locale) },
    name,
    { action: { param: 'login', label: 'signIn' } },
  );
}

export function mailResetPassword(
  to: string,
  locale: Locale,
  name: string | null,
  token: string,
): Promise<boolean> {
  return send(
    to,
    locale,
    'reset',
    { link: link(`/reset?token=${token}`, locale), hours: validFor(locale, 'RESET_PASSWORD') },
    name,
    { action: { param: 'link', label: 'newPassword' } },
  );
}

/**
 * Покана: акаунт, създаден от екипа без парола. До адрес, който още никой не е потвърдил — без име.
 * Връзката е като за нова парола, но текстът казва какво е станало, вместо „ако не сте поискали —
 * не правете нищо“.
 */
export function mailInvite(to: string, locale: Locale, token: string): Promise<boolean> {
  return send(
    to,
    locale,
    'invite',
    {
      link: link(`/reset?token=${token}`, locale),
      hours: validFor(locale, 'RESET_PASSWORD'),
      reset: link('/forgot', locale),
    },
    null,
    { action: { param: 'link', label: 'setPassword' } },
  );
}

export function mailPasswordChanged(
  to: string,
  locale: Locale,
  name: string | null,
): Promise<boolean> {
  return send(to, locale, 'passwordChanged', { reset: link('/forgot', locale) }, name, {
    action: { param: 'reset', label: 'newPassword' },
  });
}

/**
 * Входът е спрян за LOCK_MINUTES след грешни опити. `codeFailures` — вярна парола, но грешни кодове от
 * приложението при вход: паролата явно е известна на друг. `reauthFailures` — грешни пароли или кодове при
 * потвърждение на действие в отворена сесия (смяна на парола или имейл, 2FA, изтриване): всички сесии са
 * затворени, а паролата не е непременно известна на друг.
 */
export function mailLocked(
  kind: 'codeFailures' | 'reauthFailures',
  to: string,
  locale: Locale,
  name: string | null,
): Promise<boolean> {
  const minutes = period(locale, 'minutes', LOCK_MINUTES);
  return send(to, locale, kind, { reset: link('/forgot', locale), minutes }, name, {
    action: { param: 'reset', label: 'newPassword' },
  });
}

export function mailNewDevice(
  to: string,
  locale: Locale,
  name: string | null,
  params: { when: string; device: string; ip: string; country: string },
): Promise<boolean> {
  return send(
    to,
    locale,
    'newDevice',
    { ...params, security: link('/account/security', locale) },
    name,
    { action: { param: 'security', label: 'security' } },
  );
}

export function mailTwoFactor(
  to: string,
  locale: Locale,
  name: string | null,
  enabled: boolean,
): Promise<boolean> {
  return send(
    to,
    locale,
    enabled ? 'twoFactorOn' : 'twoFactorOff',
    { security: link('/account/security', locale) },
    name,
    { action: { param: 'security', label: 'security' } },
  );
}

/** До НОВИЯ адрес, още непотвърден — без име. */
export function mailChangeEmail(to: string, locale: Locale, token: string): Promise<boolean> {
  return send(
    to,
    locale,
    'changeEmail',
    {
      link: link(`/verify-email?token=${token}`, locale),
      hours: validFor(locale, 'CHANGE_EMAIL'),
    },
    null,
    { action: { param: 'link', label: 'confirmNewEmail' } },
  );
}

/** До СТАРИЯ адрес: някой е поискал смяна — ако не е човекът, научава го навреме. */
export function mailEmailChangeNotice(
  to: string,
  locale: Locale,
  name: string | null,
  newEmail: string,
): Promise<boolean> {
  return send(
    to,
    locale,
    'emailChangeNotice',
    { email: newEmail, security: link('/account/security', locale) },
    name,
    { action: { param: 'security', label: 'security' } },
  );
}

/** До СТАРИЯ адрес: екипът е сменил имейла — смяната вече е станала, човекът научава веднага. */
export function mailEmailChangedByStaff(
  to: string,
  locale: Locale,
  name: string | null,
  newEmail: string,
): Promise<boolean> {
  return send(to, locale, 'emailChangedByStaff', { email: newEmail }, name);
}

export function mailTrialEnding(
  to: string,
  locale: Locale,
  name: string | null,
  date: string,
): Promise<boolean> {
  return send(to, locale, 'trialEnding', { date, plan: link('/account/plan', locale) }, name, {
    action: { param: 'plan', label: 'plans' },
  });
}

/** Premium свършва след няколко дни и не се подновява сам — връзката води към плана. */
export function mailPlanEnding(
  to: string,
  locale: Locale,
  name: string | null,
  date: string,
): Promise<boolean> {
  return send(to, locale, 'planEnding', { date, plan: link('/account/plan', locale) }, name, {
    action: { param: 'plan', label: 'renew' },
  });
}

export function mailPlanChanged(
  to: string,
  locale: Locale,
  name: string | null,
  params: { plan: string; until: string },
): Promise<boolean> {
  return send(to, locale, 'planChanged', { ...params, account: link('/account', locale) }, name, {
    action: { param: 'account', label: 'account' },
  });
}

/**
 * Блокиран достъп — мотивите по чл. 17, пар. 3 от Регламент (ЕС) 2022/2065: какво е ограничено, фактите
 * (причината от екипа), правилото в общите условия, че решението е на човек и как се възразява.
 */
export function mailBanned(
  to: string,
  locale: Locale,
  name: string | null,
  reason: string,
): Promise<boolean> {
  return send(
    to,
    locale,
    'banned',
    {
      reason,
      terms: `${config().PUBLIC_BASE_URL}${legalPath(locale, 'terms')}`,
      contact: config().CONTACT_EMAIL,
    },
    name,
  );
}

/**
 * Изтритият акаунт. `hadOrders` — поръчките остават само с данните на договора; писмото казва какво остава
 * и до кога (срокът е от кода, src/retention.ts).
 */
export function mailAccountDeleted(
  to: string,
  locale: Locale,
  name: string | null,
  hadOrders: boolean,
): Promise<boolean> {
  const orders = hadOrders
    ? `\n\n${translate(locale, 'mail.accountDeleted.orders', {
        kept: ordersKeptText(translatorFor(locale)),
      })}`
    : '';
  return send(to, locale, 'accountDeleted', { orders }, name);
}
