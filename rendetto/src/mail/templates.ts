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

async function send(
  to: string,
  locale: Locale,
  key: string,
  params: Record<string, string | number>,
): Promise<boolean> {
  const subject = translate(locale, `mail.${key}.subject`, params);
  const body = translate(locale, `mail.${key}.body`, params);
  return sendMail({ to, subject, text: `${body}\n\n${signature(locale)}\n` });
}

export function mailVerifyEmail(
  to: string,
  locale: Locale,
  name: string,
  token: string,
): Promise<boolean> {
  return send(to, locale, 'verify', { name, link: link(`/verify-email?token=${token}`) });
}

export function mailAlreadyRegistered(to: string, locale: Locale, name: string): Promise<boolean> {
  return send(to, locale, 'alreadyRegistered', {
    name,
    login: link('/login'),
    reset: link('/forgot'),
  });
}

export function mailResetPassword(
  to: string,
  locale: Locale,
  name: string,
  token: string,
): Promise<boolean> {
  return send(to, locale, 'reset', { name, link: link(`/reset?token=${token}`) });
}

export function mailPasswordChanged(to: string, locale: Locale, name: string): Promise<boolean> {
  return send(to, locale, 'passwordChanged', { name, reset: link('/forgot') });
}

/** Вярна парола, но грешни кодове от приложението — входът е спрян; паролата явно е известна на друг. */
export function mailCodeFailures(to: string, locale: Locale, name: string): Promise<boolean> {
  return send(to, locale, 'codeFailures', { name, reset: link('/forgot') });
}

export function mailNewDevice(
  to: string,
  locale: Locale,
  params: { name: string; when: string; device: string; ip: string; country: string },
): Promise<boolean> {
  return send(to, locale, 'newDevice', { ...params, security: link('/account/security') });
}

export function mailTwoFactor(
  to: string,
  locale: Locale,
  name: string,
  enabled: boolean,
): Promise<boolean> {
  return send(to, locale, enabled ? 'twoFactorOn' : 'twoFactorOff', {
    name,
    security: link('/account/security'),
  });
}

export function mailChangeEmail(
  to: string,
  locale: Locale,
  name: string,
  token: string,
): Promise<boolean> {
  return send(to, locale, 'changeEmail', {
    name,
    link: link(`/verify-email?token=${token}&change=1`),
  });
}

/** До СТАРИЯ адрес: някой е поискал смяна — ако не е човекът, научава го навреме. */
export function mailEmailChangeNotice(
  to: string,
  locale: Locale,
  name: string,
  newEmail: string,
): Promise<boolean> {
  return send(to, locale, 'emailChangeNotice', {
    name,
    email: newEmail,
    security: link('/account/security'),
  });
}

export function mailTrialEnding(
  to: string,
  locale: Locale,
  name: string,
  date: string,
): Promise<boolean> {
  return send(to, locale, 'trialEnding', { name, date, plan: link('/account/plan') });
}

export function mailPlanChanged(
  to: string,
  locale: Locale,
  params: { name: string; plan: string; until: string },
): Promise<boolean> {
  return send(to, locale, 'planChanged', { ...params, account: link('/account') });
}

export function mailAccountDeleted(to: string, locale: Locale, name: string): Promise<boolean> {
  return send(to, locale, 'accountDeleted', { name });
}
