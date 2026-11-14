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

/** Двуфакторният вход е включен, изключен от човека или изключен от управляващия акаунта му. */
export function dueFattoriMail(params: {
  to: string;
  evento: 'attivata' | 'disattivata' | 'azzerata';
}): MailMessage {
  return {
    to: params.to,
    subject: t(`mail.dueFattori.${params.evento}.subject`),
    text: t(`mail.dueFattori.${params.evento}.body`),
  };
}

/** Вярна парола, но грешни кодове заключиха акаунта: паролата явно е известна на друг. */
export function bloccoCodiciMail(params: { to: string }): MailMessage {
  return {
    to: params.to,
    subject: t('mail.bloccoCodici.subject'),
    text: t('mail.bloccoCodici.body'),
  };
}

/** Входът с Microsoft/Google е свързан или откачен от акаунта (D1) — да знае човекът, ако не е бил той. */
export function accessoEsternoMail(params: {
  to: string;
  fornitore: string;
  evento: 'collegato' | 'scollegato';
}): MailMessage {
  return {
    to: params.to,
    subject: t(`mail.accessoEsterno.${params.evento}.subject`, { fornitore: params.fornitore }),
    text: t(`mail.accessoEsterno.${params.evento}.body`, { fornitore: params.fornitore }),
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

/** „Buono di lavoro“ по имейл — PDF-ът е прикачен (routes/buoni-firme.ts). */
export function buonoMail(params: {
  to: string;
  numero: string;
  azienda: string;
  pdf: Buffer;
  filename: string;
}): MailMessage {
  return {
    to: params.to,
    subject: t('buoni.mail.oggetto', { n: params.numero, azienda: params.azienda }),
    text: t('buoni.mail.corpo', { n: params.numero, azienda: params.azienda }),
    attachments: [
      { filename: params.filename, content: params.pdf, contentType: 'application/pdf' },
    ],
  };
}

/** Съобщение на портала до администраторите на фирмите (src/master/comunicazioni.ts). */
export function comunicazioneMail(params: {
  to: string;
  titolo: string;
  testo: string;
  /** „dal 12/11/2026 al 14/11/2026“ — кога лентата е в портала. */
  quando: string;
  link: string;
}): MailMessage {
  return {
    to: params.to,
    subject: t('master.comunicazioni.mail.oggetto', { titolo: params.titolo }),
    text: t('master.comunicazioni.mail.corpo', {
      titolo: params.titolo,
      testo: params.testo,
      quando: params.quando,
      link: params.link,
    }),
  };
}

export type TipoCambioMail =
  | 'richiesto'
  | 'masterRichiesto'
  | 'prorogato'
  | 'annullato'
  | 'masterAnnullato'
  | 'concluso'
  | 'cancellato';

/**
 * Смяната на доставчика (src/aziende/cambio.ts): до администраторите на фирмата — искането, удължаването,
 * оттеглянето, краят; до MASTER — искането и оттеглянето. Дните са по Рим, „“ — няма такъв.
 */
export function cambioMail(params: {
  to: string;
  tipo: TipoCambioMail;
  azienda: string;
  esito: string | null;
  /** Последният ден на прехода („12/12/2026“). */
  fine: string;
  /** Денят на окончателното изтриване („12/03/2027“). */
  eliminazione: string;
  link: string;
}): MailMessage {
  const esito = params.esito ? t(`mail.cambio.esiti.${params.esito}`) : '';
  const p = { azienda: params.azienda, esito, fine: params.fine, link: params.link };
  return {
    to: params.to,
    subject: t(`mail.cambio.${params.tipo}.subject`, p),
    text: t(`mail.cambio.${params.tipo}.body`, { ...p, eliminazione: params.eliminazione }),
  };
}

/** Двете копия на подписания протокол — на адреса, който подписалият е написал при подписа. */
export function verbaleMail(params: {
  to: string;
  data: string;
  azienda: string;
  allegati: ReadonlyArray<{ pdf: Buffer; filename: string }>;
}): MailMessage {
  return {
    to: params.to,
    subject: t('verbali.email.oggetto', { data: params.data, azienda: params.azienda }),
    text: t('verbali.email.corpo', { data: params.data, azienda: params.azienda }),
    attachments: params.allegati.map((a) => ({
      filename: a.filename,
      content: a.pdf,
      contentType: 'application/pdf',
    })),
  };
}

/** Модулът за поръчка до доставчика (ordini/invio.ts): PDF-ът прикачен, отговорът — до пратилия. */
export function ordineMail(params: {
  to: string;
  replyTo: string;
  fornitore: string;
  azienda: string;
  mittente: string;
  modulo: string;
  impianto: string;
  messaggio: string | null;
  pdf: Buffer;
  filename: string;
}): MailMessage {
  const p = {
    fornitore: params.fornitore,
    azienda: params.azienda,
    mittente: params.mittente,
    modulo: params.modulo,
    impianto: params.impianto || '—',
  };
  return {
    to: params.to,
    replyTo: params.replyTo,
    subject: t('ordini.email.oggetto', p),
    text:
      t('ordini.email.corpo', p) +
      (params.messaggio ? `\n\n${t('ordini.email.nota')}\n${params.messaggio}` : '') +
      `\n\n${t('ordini.email.firma', p)}`,
    attachments: [
      { filename: params.filename, content: params.pdf, contentType: 'application/pdf' },
    ],
  };
}

/** Офертата до клиента (routes/preventivi-azioni.ts): PDF-ът прикачен, отговорът — до пратилия. */
export function preventivoMail(params: {
  to: string;
  replyTo: string;
  numero: number;
  azienda: string;
  mittente: string;
  oggetto: string;
  messaggio: string | null;
  pdf: Buffer;
  filename: string;
}): MailMessage {
  const p = {
    n: params.numero,
    azienda: params.azienda,
    mittente: params.mittente,
    oggetto: params.oggetto,
  };
  return {
    to: params.to,
    replyTo: params.replyTo,
    subject: t('preventivi.mail.oggetto', p),
    text:
      t('preventivi.mail.corpo', p) +
      (params.messaggio ? `\n\n${params.messaggio}` : '') +
      `\n\n${t('preventivi.mail.firma', p)}`,
    attachments: [
      { filename: params.filename, content: params.pdf, contentType: 'application/pdf' },
    ],
  };
}
