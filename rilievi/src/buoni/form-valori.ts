import { lavoriDi, type ValoriScheda } from '../cartelli/da-scheda.js';
import type { FormValues } from '../schede/field-parsers.js';
import { DATE_KEYS, HEAD_KEYS, ORE_KEYS, type BuonoData } from './form.js';
import { CONTROLLO_KEYS, MAX_INDICE } from './voci.js';

/**
 * Стойностите на формата на „Buono di lavoro“ — записаният лист, пратеното при грешка, новият от картата —
 * и местата на редовете в тях (form.ts е разборът).
 */

/** Записаното във вида на формата (за „Modifica“): редовете на местата 0…n−1. */
export function formValuesDaBuono(data: BuonoData): FormValues {
  const out: FormValues = {};
  for (const key of HEAD_KEYS) {
    const value = data[key];
    out[key] = typeof value === 'boolean' ? (value ? 'si' : 'no') : (value ?? '');
  }
  for (const key of [...DATE_KEYS, ...ORE_KEYS]) out[key] = data[key] ?? '';
  data.sequenze.forEach((riga, i) => {
    out[`seq-${i}-id`] = riga.id;
    out[`seq-${i}-descrizione`] = riga.descrizione ?? '';
    out[`seq-${i}-esito`] = riga.esito ?? '';
    out[`seq-${i}-data`] = riga.data ?? '';
    out[`seq-${i}-fornitore`] = riga.fornitore ?? '';
  });
  for (const key of CONTROLLO_KEYS) {
    out[`ctl-${key}-esito`] = data.controlli[key].esito ?? '';
    out[`ctl-${key}-data`] = data.controlli[key].data ?? '';
  }
  return out;
}

/** Пратеното за повторно показване при грешка: само низове, само имената на формата. */
export function formValuesDalBody(body: unknown): FormValues {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = (value: unknown): string =>
    typeof value === 'string' ? value.slice(0, 70_000) : '';
  const out: FormValues = {};
  for (const key of [...HEAD_KEYS, ...DATE_KEYS, ...ORE_KEYS, 'azienda', 'scheda'])
    out[key] = text(raw[key]).slice(0, 4000);
  for (let i = 0; i < MAX_INDICE; i += 1) {
    for (const k of ['id', 'descrizione', 'esito', 'data', 'fornitore', 'firma']) {
      const value = text(raw[`seq-${i}-${k}`]);
      if (value !== '') out[`seq-${i}-${k}`] = k === 'firma' ? value : value.slice(0, 2000);
    }
  }
  for (const key of CONTROLLO_KEYS)
    for (const k of ['esito', 'data', 'firma'])
      out[`ctl-${key}-${k}`] = text(raw[`ctl-${key}-${k}`]);
  return out;
}

/** Местата на редовете във формата (подредени), от стойностите ѝ. */
export function indiciRighe(values: FormValues): number[] {
  const set = new Set<number>();
  for (const key of Object.keys(values)) {
    const m = /^seq-(\d+)-/.exec(key);
    if (m && Number(m[1]) < MAX_INDICE) set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}

/** „Sostituzione“ + „del quadro di manovra“ → „Sostituzione del quadro di manovra“. */
const lavoro = (verbo: string, cosa: string) => `${verbo} ${cosa}`;

/**
 * Новият лист от картата (собственикът — „sì, da scheda o libero“): от картата идват номерът на бона,
 * матрикулата и адресът (мястото на уредбата), а редовете с работа — работите, които картата казва
 * (смяната на таблото, на аргано… — само видимите полета със „Sì“). Всичко друго пише човекът.
 */
export function valoriDaScheda(
  scheda: ValoriScheda & {
    indirizzo: string | null;
    matricola: string | null;
    buonoLavoro: string | null;
  },
): FormValues {
  const { sostituzione, installazione } = lavoriDi(scheda);
  const righe = [
    ...sostituzione.map((cosa) => lavoro('Sostituzione', cosa)),
    ...installazione.map((cosa) => lavoro('Installazione', cosa)),
  ];
  const out: FormValues = {
    numero: scheda.buonoLavoro ?? '',
    matricola: scheda.matricola ?? '',
    ubicazione: scheda.indirizzo ?? '',
  };
  righe.forEach((testoRiga, i) => {
    out[`seq-${i}-descrizione`] = testoRiga;
  });
  return out;
}
