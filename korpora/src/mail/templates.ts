import type { TokenPurpose } from '@prisma/client';
import { config } from '../config.js';
import { LOCK_MINUTES } from '../auth/lock.js';
import { linkHours } from '../auth/tokens.js';
import { translate, type Locale } from '../i18n.js';
import { UNVERIFIED_RETENTION_DAYS } from '../retention.js';
import { sendMail, type MailAttachment } from './mailer.js';

/**
 * Писмата към човека. Текстът идва от речниците (`mail.*`) на езика на акаунта; връзките са
 * абсолютни от PUBLIC_BASE_URL и носят езика (`lang=`), за да се отворят на същия език и на друго
 * устройство. Само обикновен текст — нищо не се зарежда от чужд сървър.
 */
export function link(path: string, locale: Locale): string {
  return `${config().PUBLIC_BASE_URL}${path}${path.includes('?') ? '&' : '?'}lang=${locale}`;
}

/** Срок от кода с формата за брой на езика („1 час“, „15 минути“, „7 дни“) — не написан в речника. */
function period(locale: Locale, unit: 'hours' | 'minutes' | 'days', n: number): string {
  return translate(locale, `common.${unit}`, { n });
}

/** Колко важи връзката („48 часа“, „1 час“) — от срока на токена. */
function validFor(locale: Locale, purpose: TokenPurpose): string {
  return period(locale, 'hours', linkHours(purpose));
}

function signature(locale: Locale): string {
  return translate(locale, 'mail.signature', { contact: config().CONTACT_EMAIL });
}

/**
 * Името влиза само в писмо до адрес, който акаунтът е потвърдил: името е свободен текст на човека, а
 * непотвърден адрес може да е чужд — нашето писмо не бива да носи текст, написан от някой друг.
 */
export function greetingName(user: { name: string; emailVerifiedAt: Date | null }): string | null {
  return user.emailVerifiedAt ? user.name : null;
}

/** Писмо от речника `mail.<key>`: поздрав, текст и подпис на езика на акаунта. */
export async function send(
  to: string,
  locale: Locale,
  key: string,
  params: Record<string, string | number>,
  name: string | null,
  attachments: MailAttachment[] = [],
): Promise<boolean> {
  const subject = translate(locale, `mail.${key}.subject`, params);
  const greeting = name
    ? translate(locale, 'mail.greeting', { name })
    : translate(locale, 'mail.greetingPlain');
  const body = translate(locale, `mail.${key}.body`, params);
  return sendMail({
    to,
    subject,
    text: `${greeting}\n\n${body}\n\n${signature(locale)}\n`,
    ...(attachments.length ? { attachments } : {}),
  });
}

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
  );
}

export function mailPasswordChanged(
  to: string,
  locale: Locale,
  name: string | null,
): Promise<boolean> {
  return send(to, locale, 'passwordChanged', { reset: link('/forgot', locale) }, name);
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
  return send(to, locale, kind, { reset: link('/forgot', locale), minutes }, name);
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
  return send(to, locale, 'trialEnding', { date, plan: link('/account/plan', locale) }, name);
}

export function mailPlanChanged(
  to: string,
  locale: Locale,
  name: string | null,
  params: { plan: string; until: string },
): Promise<boolean> {
  return send(to, locale, 'planChanged', { ...params, account: link('/account', locale) }, name);
}

export function mailAccountDeleted(
  to: string,
  locale: Locale,
  name: string | null,
): Promise<boolean> {
  return send(to, locale, 'accountDeleted', {}, name);
}
