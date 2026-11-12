import { createHash } from 'node:crypto';
import { maxPersone } from '../abbonamenti/regole.js';
import { COMPANY } from '../company.js';
import { config } from '../config.js';
import { BUSINESS_TZ } from '../time.js';
import { importoDi, type Importo } from './importi.js';
import type { Credito } from './periodo.js';

/**
 * Офертата (чл. 12.1 на условията 2026-11-12; текстът — Правният Разбирач, не е правен съвет): какво вижда и
 * приема администраторът преди Revolut — планът, срокът от–до, цената без ДДС и редът за ДДС, общото, без
 * подновяване, само четенето, връщането (12.9), фактурата, плащането. Същият текст се запечатва в регистъра на
 * приеманията и тръгва в писмото след плащането. Сумите — цели центове, от плана (никога от формата).
 */

type T = (key: string, p?: Record<string, string | number>) => string;

/** Фактурата — до 5 дни от плащането (ЗДДС, чл. 113(4) — потвърждава Данъчника). */
export const GIORNI_FATTURA = 5;

const euro = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // „1.290,50“ като във фактурите (по подразбиране италианският не групира четирицифрени).
  useGrouping: 'always',
});
export const formatoEuro = (cent: number): string => euro.format(cent / 100);

/** „1 mese“ / „12 mesi“. */
export const durataMesi = (t: T, mesi: number): string =>
  t(mesi === 1 ? 'pagamenti.mesi.uno' : 'pagamenti.mesi.altri', { n: mesi });

const giorno = new Intl.DateTimeFormat('it-IT', {
  timeZone: BUSINESS_TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export interface DatiOfferta {
  ragioneSociale: string;
  sede: string;
  partitaIva: { numero: string; paese: string };
  livello: number;
  mesi: number;
  prezzoCent: number;
  utentiAttuali: number;
  email: string;
  versione: string;
  /** Периодът (pagamenti/periodo.ts): кога започва, кога свършва, превърнатите платени дни. */
  periodo: {
    modo: 'coda' | 'subito' | 'superiore';
    inizio: Date;
    fine: Date;
    credito: Credito | null;
  };
  /** Планът в опашка чака края на пробата (иначе — на сегашния план). */
  dopoProva: boolean;
}

export interface Offerta {
  righe: string[];
  testo: string;
  hash: string;
  importo: Importo;
  inizio: Date;
  fine: Date;
}

export function offertaDi(t: T, d: DatiOfferta): Offerta {
  const importo = importoDi(d.prezzoCent, d.partitaIva.paese);
  const { inizio, fine, credito, modo } = d.periodo;
  const ultimo = giorno.format(new Date(fine.getTime() - 1));
  const max = maxPersone(d.livello);
  const durata = durataMesi(t, d.mesi);
  const righe = [
    t('pagamenti.offerta.titolo'),
    t('pagamenti.offerta.fornitore', {
      via: t('company.street'),
      cap: COMPANY.postalCode,
      citta: t('company.city'),
      piva: COMPANY.vat,
      email: config().CONTACT_EMAIL,
    }),
    t('pagamenti.offerta.cliente', {
      ragioneSociale: d.ragioneSociale,
      sede: d.sede,
      partitaIva: d.partitaIva.numero,
    }),
    max === null
      ? t('pagamenti.offerta.pianoOltre', { utentiAttuali: d.utentiAttuali })
      : t('pagamenti.offerta.piano', {
          utenti: t('pagamenti.offerta.utenti', { n: max }),
          utentiAttuali: d.utentiAttuali,
        }),
    credito && credito.giorniExtra > 0
      ? t('pagamenti.offerta.durataCredito', {
          durata,
          extra: credito.giorniExtra,
          inizio: giorno.format(inizio),
          fine: ultimo,
        })
      : t('pagamenti.offerta.durata', { durata, inizio: giorno.format(inizio), fine: ultimo }),
    modo === 'coda'
      ? t(d.dopoProva ? 'pagamenti.offerta.inizioDopoProva' : 'pagamenti.offerta.inizioDopoPiano', {
          inizio: giorno.format(inizio),
        })
      : t('pagamenti.offerta.inizioSubito'),
    ...(credito && credito.giorniExtra > 0
      ? [
          t('pagamenti.offerta.credito', {
            giorni: credito.giorni,
            valore: formatoEuro(credito.valoreCent),
            extra: credito.giorniExtra,
          }),
        ]
      : []),
    t('pagamenti.offerta.prezzo', { prezzo: formatoEuro(importo.imponibile) }),
    importo.regime === 'iva-bg'
      ? t('pagamenti.offerta.ivaBg', { iva: formatoEuro(importo.iva) })
      : t('pagamenti.offerta.ivaInversione'),
    t('pagamenti.offerta.totale', { totale: formatoEuro(importo.totale) }),
    t('pagamenti.offerta.rinnovo'),
    t('pagamenti.offerta.scadenza'),
    t('pagamenti.offerta.persone'),
    t('pagamenti.offerta.rimborso', { fine: ultimo }),
    t('pagamenti.offerta.fattura', { email: d.email, giorni: GIORNI_FATTURA }),
    t('pagamenti.offerta.pagamento'),
    // Чл. 10 от Дир. 2000/31: офертата се пази и е достъпна за клиента.
    t('pagamenti.offerta.archivio', { email: config().CONTACT_EMAIL }),
    t('pagamenti.offerta.integra', {
      versione: giorno.format(new Date(`${d.versione}T12:00:00Z`)),
    }),
  ];
  const testo = righe.join('\n');
  return {
    righe,
    testo,
    hash: createHash('sha256').update(testo, 'utf8').digest('hex'),
    importo,
    inizio,
    fine,
  };
}
