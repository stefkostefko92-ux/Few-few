import type { TokenPurpose } from '@prisma/client';
import { config } from '../config.js';
import { linkHours } from '../auth/tokens.js';
import { translate, type Locale } from '../i18n.js';
import { renderMailHtml } from './html.js';
import { sendMail, type MailAttachment } from './mailer.js';

/**
 * Писмата към човека. Текстът идва от речниците (`mail.*`) на езика на акаунта; връзките са
 * абсолютни от PUBLIC_BASE_URL и носят езика (`lang=`), за да се отворят на същия език и на друго
 * устройство. Всяко писмо е в два варианта: обикновен текст и HTML с марката (mail/html.ts) — без нищо
 * от чужд сървър.
 */
export function link(path: string, locale: Locale): string {
  return `${config().PUBLIC_BASE_URL}${path}${path.includes('?') ? '&' : '?'}lang=${locale}`;
}

/** Срок от кода с формата за брой на езика („1 час“, „15 минути“, „7 дни“) — не написан в речника. */
export function period(locale: Locale, unit: 'hours' | 'minutes' | 'days', n: number): string {
  return translate(locale, `common.${unit}`, { n });
}

/** Колко важи връзката („48 часа“, „1 час“) — от срока на токена. */
export function validFor(locale: Locale, purpose: TokenPurpose): string {
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

/** Основното действие на писмото: кой параметър е адресът и надписът на бутона (`mail.action.<label>`). */
export interface MailAction {
  param: string;
  label: string;
}

export interface SendOptions {
  attachments?: MailAttachment[];
  action?: MailAction;
}

/**
 * Писмо от речника `mail.<key>`: поздрав, текст и подпис на езика на акаунта — като обикновен текст и като
 * HTML със същите думи; адресът на `action` в HTML е бутон.
 */
export async function send(
  to: string,
  locale: Locale,
  key: string,
  params: Record<string, string | number>,
  name: string | null,
  options: SendOptions = {},
): Promise<boolean> {
  const subject = translate(locale, `mail.${key}.subject`, params);
  const greeting = name
    ? translate(locale, 'mail.greeting', { name })
    : translate(locale, 'mail.greetingPlain');
  const body = translate(locale, `mail.${key}.body`, params);
  const url = options.action ? params[options.action.param] : undefined;
  const html = renderMailHtml({
    locale,
    subject,
    greeting,
    body,
    action:
      options.action && typeof url === 'string'
        ? { url, label: translate(locale, `mail.action.${options.action.label}`) }
        : null,
    fallback: translate(locale, 'mail.buttonFallback'),
    signature: signature(locale),
    baseUrl: config().PUBLIC_BASE_URL,
    contact: config().CONTACT_EMAIL,
  });
  const attachments = options.attachments ?? [];
  return sendMail({
    to,
    subject,
    text: `${greeting}\n\n${body}\n\n${signature(locale)}\n`,
    html,
    ...(attachments.length ? { attachments } : {}),
  });
}
