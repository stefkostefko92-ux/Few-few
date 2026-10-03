import { config } from '../config.js';
import { translate, type Locale } from '../i18n.js';
import { sendMail } from './mailer.js';

/**
 * Писмата към човека. Текстът идва от речниците (`mail.*`) на езика на акаунта; връзките са
 * абсолютни от PUBLIC_BASE_URL. Само обикновен текст — нищо не се зарежда от чужд сървър.
 */
function link(path: string): string {
  return `${config().PUBLIC_BASE_URL}${path}`;
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

async function send(
  to: string,
  locale: Locale,
  key: string,
  params: Record<string, string | number>,
  name: string | null,
): Promise<boolean> {
  const subject = translate(locale, `mail.${key}.subject`, params);
  const greeting = name
    ? translate(locale, 'mail.greeting', { name })
    : translate(locale, 'mail.greetingPlain');
  const body = translate(locale, `mail.${key}.body`, params);
  return sendMail({ to, subject, text: `${greeting}\n\n${body}\n\n${signature(locale)}\n` });
}

/** До адрес, който още никой не е потвърдил — без име. */
export function mailVerifyEmail(to: string, locale: Locale, token: string): Promise<boolean> {
  return send(to, locale, 'verify', { link: link(`/verify-email?token=${token}`) }, null);
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
    { login: link('/login'), reset: link('/forgot') },
    name,
  );
}

export function mailResetPassword(
  to: string,
  locale: Locale,
  name: string | null,
  token: string,
): Promise<boolean> {
  return send(to, locale, 'reset', { link: link(`/reset?token=${token}`) }, name);
}

export function mailPasswordChanged(
  to: string,
  locale: Locale,
  name: string | null,
): Promise<boolean> {
  return send(to, locale, 'passwordChanged', { reset: link('/forgot') }, name);
}

/** Вярна парола, но грешни кодове от приложението — входът е спрян; паролата явно е известна на друг. */
export function mailCodeFailures(
  to: string,
  locale: Locale,
  name: string | null,
): Promise<boolean> {
  return send(to, locale, 'codeFailures', { reset: link('/forgot') }, name);
}

export function mailNewDevice(
  to: string,
  locale: Locale,
  name: string | null,
  params: { when: string; device: string; ip: string; country: string },
): Promise<boolean> {
  return send(to, locale, 'newDevice', { ...params, security: link('/account/security') }, name);
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
    { security: link('/account/security') },
    name,
  );
}

/** До НОВИЯ адрес, още непотвърден — без име. */
export function mailChangeEmail(to: string, locale: Locale, token: string): Promise<boolean> {
  return send(
    to,
    locale,
    'changeEmail',
    { link: link(`/verify-email?token=${token}&change=1`) },
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
    { email: newEmail, security: link('/account/security') },
    name,
  );
}

export function mailTrialEnding(
  to: string,
  locale: Locale,
  name: string | null,
  date: string,
): Promise<boolean> {
  return send(to, locale, 'trialEnding', { date, plan: link('/account/plan') }, name);
}

export function mailPlanChanged(
  to: string,
  locale: Locale,
  name: string | null,
  params: { plan: string; until: string },
): Promise<boolean> {
  return send(to, locale, 'planChanged', { ...params, account: link('/account') }, name);
}

export function mailAccountDeleted(
  to: string,
  locale: Locale,
  name: string | null,
): Promise<boolean> {
  return send(to, locale, 'accountDeleted', {}, name);
}
