import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import type { MailMessage } from './mailer.js';

/** Писмата са само текст (на италиански): без HTML, без проследяващи пиксели, без външни картинки. */
const t = translatorFor(DEFAULT_LOCALE);

export function inviteMail(params: {
  to: string;
  inviter: string;
  azienda: string;
  role: string;
  link: string;
  days: number;
}): MailMessage {
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

export function resetMail(params: { to: string; link: string; hours: number }): MailMessage {
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
 * Нова заявка за достъп — до всеки активен MASTER. В писмото е само името на фирмата и връзката към
 * заявката (зад вход): имейлът и телефонът на заявителя не пътуват по пощата.
 */
export function accessRequestMail(params: {
  to: string;
  company: string;
  link: string;
}): MailMessage {
  return {
    to: params.to,
    subject: t('mail.request.subject'),
    text: t('mail.request.body', { company: params.company, link: params.link }),
  };
}
