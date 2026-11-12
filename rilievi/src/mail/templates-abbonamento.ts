import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import type { MailMessage } from './mailer.js';
import { formatoEuro } from '../pagamenti/offerta.js';

/** Писмата за абонамента (src/abbonamenti/) — само текст, на италиански, като другите (templates.ts). */
const t = translatorFor(DEFAULT_LOCALE);

/** Краят на пробния месец или на плана наближава / е дошъл (чл. 12.6) — до администраторите на фирмата. */
export function abbonamentoAvvisoMail(params: {
  to: string;
  azienda: string;
  prova: boolean;
  soglia: 14 | 3 | 0;
  ultimoGiorno: Date;
  link: string;
}): MailMessage {
  const chi = params.prova ? 'prova' : 'piano';
  const quando = params.soglia === 0 ? 'scaduto' : 'prossimo';
  const data = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(params.ultimoGiorno);
  const vars = { azienda: params.azienda, data, giorni: params.soglia, link: params.link };
  return {
    to: params.to,
    subject: t(`mail.abbonamento.${chi}.${quando}.subject`, vars),
    text: t(`mail.abbonamento.${chi}.${quando}.body`, vars),
  };
}

/** Плащането е получено: до администратора, който е платил, с копието на приетата оферта. */
export function pagamentoRicevutoMail(params: {
  to: string;
  azienda: string;
  totaleCent: number;
  ultimoGiorno: Date;
  offerta: string;
}): MailMessage {
  const data = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(params.ultimoGiorno);
  const totale = formatoEuro(params.totaleCent);
  return {
    to: params.to,
    subject: t('pagamenti.mail.subject', { azienda: params.azienda }),
    text: t('pagamenti.mail.body', {
      azienda: params.azienda,
      totale,
      data,
      offerta: params.offerta,
    }),
  };
}
