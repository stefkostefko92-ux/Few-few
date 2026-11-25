import { DEFAULT_LOCALE, translatorFor } from '../i18n.js';
import type { MailMessage } from './mailer.js';

/** Писмото с картата (routes/schede-invio.ts): само текст, PDF-ът е прикачен, отговорът — до пратилия. */
const t = translatorFor(DEFAULT_LOCALE);

/** Заглавието на писмото е един ред: данните на уредбата са писани на ръка. */
const unaRiga = (testo: string): string =>
  testo
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function schedaMail(params: {
  to: string;
  replyTo: string;
  /** Как се назовава уредбата на страницата ѝ („Impianto n° 12“, матрикулата или адресът). */
  impianto: string;
  indirizzo: string | null;
  azienda: string;
  mittente: string;
  messaggio: string | null;
  pdf: Buffer;
  filename: string;
}): MailMessage {
  const p = {
    impianto: unaRiga(params.impianto),
    azienda: unaRiga(params.azienda),
    mittente: params.mittente,
  };
  const indirizzo = params.indirizzo ? unaRiga(params.indirizzo) : '';
  return {
    to: params.to,
    replyTo: params.replyTo,
    subject: t('scheda.email.oggetto', p),
    text: [
      t('scheda.email.corpo', p),
      // Адресът — само ако не е вече името на уредбата.
      indirizzo && indirizzo !== p.impianto ? t('scheda.email.indirizzo', { indirizzo }) : '',
      params.messaggio ?? '',
      t('scheda.email.firma', p),
    ]
      .filter(Boolean)
      .join('\n\n'),
    attachments: [
      { filename: params.filename, content: params.pdf, contentType: 'application/pdf' },
    ],
  };
}
