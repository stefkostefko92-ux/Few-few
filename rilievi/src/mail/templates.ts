import { translatorFor, type Locale } from '../i18n.js';
import type { MailMessage } from './mailer.js';

/** Писмата са само текст: без HTML, без проследяващи пиксели, без външни картинки. */

export function inviteMail(
  locale: Locale,
  params: {
    to: string;
    inviter: string;
    azienda: string;
    role: string;
    link: string;
    days: number;
  },
): MailMessage {
  const t = translatorFor(locale);
  return {
    to: params.to,
    subject: t('mail.invite.subject'),
    text: t('mail.invite.body', {
      inviter: params.inviter,
      azienda: params.azienda,
      role: params.role,
      link: params.link,
      validity: t('mail.duration.days', { n: params.days }),
    }),
  };
}

export function resetMail(
  locale: Locale,
  params: { to: string; link: string; hours: number },
): MailMessage {
  const t = translatorFor(locale);
  return {
    to: params.to,
    subject: t('mail.reset.subject'),
    text: t('mail.reset.body', {
      link: params.link,
      validity: t('mail.duration.hours', { n: params.hours }),
    }),
  };
}
