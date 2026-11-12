import type { Segnalazione } from '@prisma/client';
import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import { BUSINESS_TZ } from '../time.js';
import type { MailMessage } from './mailer.js';

/**
 * Писмата за сигналите за незаконно съдържание (src/segnalazioni/servizio.ts; чл. 16–17 Рег. (ЕС) 2022/2065) —
 * само текст, на италиански; текстовете — `locales/it/segnalazioni.json` (Правният Разбирач, не е правен съвет).
 */
const t = translatorFor(DEFAULT_LOCALE);
const m = 'segnalazioni.mail.';

const giorno = (d: Date): string =>
  new Intl.DateTimeFormat('it-IT', {
    timeZone: BUSINESS_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);

/** Потвърждението (чл. 16, пар. 4): само номерът и денят — адресът не е проверен, текстът не се повтаря. */
export function segnalazioneConfermaMail(params: {
  to: string;
  segnalazione: Segnalazione;
}): MailMessage {
  const s = params.segnalazione;
  const dati = { riferimento: s.riferimento, data: giorno(s.createdAt) };
  return {
    to: params.to,
    subject: t(`${m}confermaSubject`, dati),
    text: t(`${m}confermaBody`, dati),
  };
}

/** До всеки MASTER: нов сигнал — само номерът и връзката. */
export function segnalazioneMasterMail(params: {
  to: string;
  riferimento: string;
  link: string;
}): MailMessage {
  return {
    to: params.to,
    subject: t(`${m}masterSubject`, params),
    text: t(`${m}masterBody`, params),
  };
}

/** Решението до подателя, с мотивите и средствата за защита (чл. 16, пар. 5). */
export function segnalazioneDecisioneMail(params: {
  to: string;
  segnalazione: Segnalazione;
}): MailMessage {
  const s = params.segnalazione;
  const dati = {
    riferimento: s.riferimento,
    data: giorno(s.createdAt),
    esito: t(`${m}esito.${s.esito ?? 'NESSUNA_AZIONE'}`),
    motivazione: s.motivazione ?? '',
  };
  return {
    to: params.to,
    subject: t(`${m}decisioneSubject`, dati),
    text: t(`${m}decisioneBody`, dati),
  };
}

/** Мотивите до администратор на фирмата (чл. 17, пар. 3) — без самоличността на подателя. */
export function segnalazioneMotivazioneMail(params: {
  to: string;
  segnalazione: Segnalazione;
}): MailMessage {
  const s = params.segnalazione;
  const dati = {
    riferimento: s.riferimento,
    azienda: s.aziendaNome ?? '',
    data: giorno(s.decisaAt ?? new Date()),
    misura: s.misura ?? '',
    origine: t(`${m}origine`, { data: giorno(s.createdAt) }),
    fatti: s.fatti ?? '',
    fondamento: s.fondamento ?? '',
    motivazione: s.motivazione ?? '',
  };
  return {
    to: params.to,
    subject: t(`${m}motivazioneSubject`, dati),
    text: t(`${m}motivazioneBody`, dati),
  };
}
