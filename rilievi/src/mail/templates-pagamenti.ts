import type { Pagamento } from '@prisma/client';
import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import { chiaveRegime } from '../pagamenti/importi.js';
import { durataMesi, formatoEuro, GIORNI_FATTURA } from '../pagamenti/offerta.js';
import { BUSINESS_TZ } from '../time.js';
import type { MailMessage } from './mailer.js';

/** Писмата за плащанията (src/pagamenti/) — само текст, на италиански, като другите (templates.ts). */
const t = translatorFor(DEFAULT_LOCALE);

const giorno = (d: Date): string =>
  new Intl.DateTimeFormat('it-IT', {
    timeZone: BUSINESS_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);

/** Плащането е получено: до администратора, който е платил, с копието на приетата оферта. */
export function pagamentoRicevutoMail(params: {
  to: string;
  azienda: string;
  totaleCent: number;
  ultimoGiorno: Date;
  offerta: string;
}): MailMessage {
  return {
    to: params.to,
    subject: t('pagamenti.mail.subject', { azienda: params.azienda }),
    text: t('pagamenti.mail.body', {
      azienda: params.azienda,
      totale: formatoEuro(params.totaleCent),
      data: giorno(params.ultimoGiorno),
      offerta: params.offerta,
    }),
  };
}

/** Данните на плащането за MASTER — за фактурата (сумите, режимът на ДДС, данните на клиента, периодът). */
const dati = (p: Pagamento): Record<string, string | number> => ({
  azienda: p.aziendaNome,
  piano: t('abbonamento.livello', { n: p.livello }),
  durata: durataMesi(t, p.mesi),
  imponibile: formatoEuro(p.imponibileCent),
  iva: formatoEuro(p.ivaCent),
  totale: formatoEuro(p.totaleCent),
  regime: t(`pagamenti.mail.regime.${chiaveRegime(p.regimeIva)}`),
  ragioneSociale: p.ragioneSociale,
  sede: p.sede,
  partitaIva: p.partitaIva,
  inizio: p.inizio ? giorno(p.inizio) : '—',
  fine: p.fine ? giorno(new Date(p.fine.getTime() - 1)) : '—',
  ordine: p.revolutOrderId ?? '—',
  giorni: GIORNI_FATTURA,
});

/** Ново плащане — до всеки MASTER: фактурата е обещана до 5 дни. */
export function pagamentoMasterMail(params: {
  to: string;
  pagamento: Pagamento;
  ricalcolato: boolean;
  link: string;
}): MailMessage {
  const p = params.pagamento;
  return {
    to: params.to,
    subject: t('pagamenti.mail.masterSubject', {
      azienda: p.aziendaNome,
      totale: formatoEuro(p.totaleCent),
    }),
    text:
      t('pagamenti.mail.masterBody', { ...dati(p), link: params.link }) +
      (p.creditoCent > 0
        ? `\n\n${t('pagamenti.mail.masterCredito', { credito: formatoEuro(p.creditoCent) })}`
        : '') +
      (params.ricalcolato ? `\n\n${t('pagamenti.mail.masterRicalcolato')}` : ''),
  };
}

/** Платено, а периодът не е даден — до всеки MASTER: връща парите или го дава на ръка. */
export function pagamentoVerificaMasterMail(params: {
  to: string;
  pagamento: Pagamento;
  motivo: string;
  link: string;
}): MailMessage {
  const p = params.pagamento;
  return {
    to: params.to,
    subject: t('pagamenti.mail.verificaSubject', { azienda: p.aziendaNome }),
    text: t('pagamenti.mail.verificaBody', {
      ...dati(p),
      motivo: t(`pagamenti.master.motivo.${params.motivo}`),
      link: params.link,
    }),
  };
}

/** До платилия: плащането е получено, но планът не се е включил сам — свързваме се с него. */
export function pagamentoInVerificaMail(params: { to: string; pagamento: Pagamento }): MailMessage {
  const p = params.pagamento;
  return {
    to: params.to,
    subject: t('pagamenti.mail.inVerificaSubject', { azienda: p.aziendaNome }),
    text: t('pagamenti.mail.inVerificaBody', {
      azienda: p.aziendaNome,
      totale: formatoEuro(p.totaleCent),
    }),
  };
}

/** Ключът или средата на плащанията са сменени — до всеки MASTER (откраднатата сесия не минава незабелязано). */
export function pagamentiCambiatiMail(params: {
  to: string;
  chi: string;
  ambiente: 'SANDBOX' | 'PRODUZIONE';
  chiaveNuova: boolean;
}): MailMessage {
  return {
    to: params.to,
    subject: t('pagamenti.mail.cambiatiSubject'),
    text: t(
      params.chiaveNuova ? 'pagamenti.mail.cambiatiChiave' : 'pagamenti.mail.cambiatiAmbiente',
      { chi: params.chi, ambiente: t(`pagamenti.master.ambiente.${params.ambiente}`) },
    ),
  };
}

/** Фирма с платено време е спряна — до всеки MASTER: дължи се връщане по чл. 12.9 (до 30 дни). */
export function rimborsoDovutoMail(params: {
  to: string;
  azienda: string;
  importo: string;
  link: string;
}): MailMessage {
  return {
    to: params.to,
    subject: t('pagamenti.mail.rimborsoSubject', { azienda: params.azienda }),
    text: t('pagamenti.mail.rimborsoBody', params),
  };
}
