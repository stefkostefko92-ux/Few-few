import type { Translator } from '../i18n.js';
import { renderCopiaAccettazione } from './pdf.js';
import { leggiTesto } from './testi.js';

/** Какво е прието и подписано — от `Firmato` при подписа или от реда в регистъра при свалянето. */
export interface DatiCopia {
  at: Date;
  versione: string;
  hash: string;
  clausole: readonly string[];
  ragioneSociale: string;
  sede: string;
  partitaIva: string;
  nome: string;
  email: string;
  otpEmail: string;
  otpInviatoAt: Date;
  otpVerificatoAt: Date;
}

type Formato = (date: Date) => string;

/** Редовете „етикет: стойност“ над текста в PDF-а и в писмото. */
export function riepilogoDi(
  d: DatiCopia,
  t: Translator,
  dateTime: Formato,
): Array<readonly [string, string]> {
  return [
    [
      t('legale.copia.azienda'),
      t('legale.copia.aziendaValore', {
        ragioneSociale: d.ragioneSociale,
        partitaIva: d.partitaIva,
        sede: d.sede,
      }),
    ],
    [
      t('legale.copia.accettateDa'),
      t('legale.copia.accettateDaValore', { nome: d.nome, email: d.email }),
    ],
    [
      t('legale.copia.quando'),
      t('legale.copia.quandoValore', { quando: dateTime(d.at), utc: d.at.toISOString() }),
    ],
    [
      t('legale.copia.testo'),
      t('legale.copia.testoValore', { versione: d.versione, hash: d.hash }),
    ],
    [t('legale.copia.clausole'), d.clausole.map((n) => `art. ${n}`).join(', ')],
    [
      t('legale.copia.firma'),
      t('legale.copia.firmaValore', {
        email: d.otpEmail,
        inviato: dateTime(d.otpInviatoAt),
        verificato: dateTime(d.otpVerificatoAt),
      }),
    ],
  ];
}

/** PDF-ът: обобщението и целият текст на версията (условията с приложенията). */
export function pdfCopia(
  d: DatiCopia,
  t: Translator,
  dateTime: Formato,
  fontDir: string,
): Promise<Buffer> {
  return renderCopiaAccettazione({
    testi: [leggiTesto('CONDIZIONI', d.versione)],
    riepilogo: riepilogoDi(d, t, dateTime),
    t,
    fontDir,
  });
}

/** Писмото с копието до администратора (траен носител, чл. 3.2 от условията). */
export function mailCopia(d: DatiCopia, t: Translator, dateTime: Formato) {
  const riepilogo = riepilogoDi(d, t, dateTime)
    .map(([label, value]) => `${label}: ${value}`)
    .join('\n');
  return {
    to: d.email,
    subject: t('legale.mail.copia.subject', { azienda: d.ragioneSociale }),
    text: t('legale.mail.copia.text', { azienda: d.ragioneSociale, riepilogo }),
    filename: `condizioni-rilievi-impianti-${d.versione}.pdf`,
  };
}
