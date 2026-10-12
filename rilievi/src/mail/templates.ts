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

/**
 * Нова заявка за достъп — до всеки активен MASTER, на неговия език. В писмото е само името на фирмата и
 * връзката към заявката (зад вход): имейлът и телефонът на заявителя не пътуват по пощата.
 */
export function accessRequestMail(
  locale: Locale,
  params: { to: string; company: string; link: string },
): MailMessage {
  const t = translatorFor(locale);
  return {
    to: params.to,
    subject: t('mail.request.subject'),
    text: t('mail.request.body', { company: params.company, link: params.link }),
  };
}
