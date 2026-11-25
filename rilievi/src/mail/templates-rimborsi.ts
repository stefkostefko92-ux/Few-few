import type { Contestazione, Pagamento } from '@prisma/client';
import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import { formatoEuro } from '../pagamenti/offerta.js';
import { BUSINESS_TZ } from '../time.js';
import type { MailMessage } from './mailer.js';

/**
 * Писмата за връщанията през Revolut и за споровете (src/pagamenti/rimborso-revolut.ts, contestazioni.ts) — само
 * текст, на италиански; текстовете — `locales/it/rimborsi.json`.
 */
const t = translatorFor(DEFAULT_LOCALE);

const giorno = (d: Date): string =>
  new Intl.DateTimeFormat('it-IT', {
    timeZone: BUSINESS_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);

/** До платилия: връщането е потвърдено от Revolut — къде отива и какво да направи, ако не го види. */
export function rimborsoEseguitoMail(params: {
  to: string;
  pagamento: Pagamento;
  importoCent: number;
}): MailMessage {
  const dati = {
    importo: formatoEuro(params.importoCent),
    azienda: params.pagamento.aziendaNome,
    riferimento: params.pagamento.id,
  };
  return {
    to: params.to,
    subject: t('rimborsi.mail.eseguitoSubject', dati),
    text: t('rimborsi.mail.eseguitoBody', dati),
  };
}

/** До всеки MASTER: връщането е потвърдено — за кредитното известие. */
export function rimborsoMasterMail(params: {
  to: string;
  pagamento: Pagamento;
  importoCent: number;
  link: string;
}): MailMessage {
  const p = params.pagamento;
  const dati = {
    importo: formatoEuro(params.importoCent),
    azienda: p.aziendaNome,
    data: giorno(p.completatoAt ?? p.createdAt),
    ordine: p.revolutOrderId ?? '—',
    link: params.link,
  };
  return {
    to: params.to,
    subject: t('rimborsi.mail.masterSubject', dati),
    text: t('rimborsi.mail.masterBody', dati),
  };
}

/** До всеки MASTER: Revolut не е направил връщането (кодът — HTTP или състоянието на поръчката). */
export function rimborsoFallitoMail(params: {
  to: string;
  pagamento: Pagamento;
  importoCent: number;
  codice: string;
  link: string;
}): MailMessage {
  const dati = {
    importo: formatoEuro(params.importoCent),
    azienda: params.pagamento.aziendaNome,
    codice: params.codice,
    link: params.link,
  };
  return {
    to: params.to,
    subject: t('rimborsi.mail.fallitoSubject', dati),
    text: t('rimborsi.mail.fallitoBody', dati),
  };
}

/** До всеки MASTER: спор за плащане (chargeback) — състоянието, причината и срокът за отговор. */
export function contestazioneMail(params: {
  to: string;
  contestazione: Contestazione;
  azienda: string | null;
  link: string;
}): MailMessage {
  const c = params.contestazione;
  const dati = {
    azienda: params.azienda ?? t('rimborsi.contestazioni.senzaPagamento'),
    importo: formatoEuro(c.importoCent),
    stato: t(`rimborsi.contestazioni.stato.${c.stato}`),
    motivo: c.motivo ?? '—',
    entro: c.rispostaEntro ? giorno(c.rispostaEntro) : '—',
    link: params.link,
  };
  return {
    to: params.to,
    subject: t('rimborsi.mail.contestazioneSubject', dati),
    text: t('rimborsi.mail.contestazioneBody', dati),
  };
}
