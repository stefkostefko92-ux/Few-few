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
 * Имейлът на акаунта е сменен — известие до СТАРИЯ адрес: ако не е било по желание на собственика, той
 * ще разбере. Новият адрес не се пише в писмото.
 */
export function emailChangedMail(params: { to: string }): MailMessage {
  return {
    to: params.to,
    subject: t('mail.emailChanged.subject'),
    text: t('mail.emailChanged.body'),
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

/** Листът за интервенция като PDF — на адреса, който човекът е написал при изпращането. */
export function interventoMail(params: {
  to: string;
  numero: string;
  data: string;
  azienda: string;
  pdf: Buffer;
  filename: string;
}): MailMessage {
  return {
    to: params.to,
    subject: t('interventi.email.oggetto', { n: params.numero, azienda: params.azienda }),
    text: t('interventi.email.corpo', {
      n: params.numero,
      data: params.data,
      azienda: params.azienda,
    }),
    attachments: [
      { filename: params.filename, content: params.pdf, contentType: 'application/pdf' },
    ],
  };
}
