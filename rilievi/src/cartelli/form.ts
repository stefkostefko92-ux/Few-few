import { z } from 'zod';
import {
  dateParser,
  ERROR_CODES,
  textParser,
  yesNoParser,
  type FieldErrorCode,
  type FieldErrors,
  type FormValues,
} from '../schede/field-parsers.js';
import { dayFromDate } from '../time.js';

/** Датата по избор: празното е null, иначе — като датата на табелата (`invalidDate`). */
function dataFacoltativa() {
  const piena = dateParser();
  return z.unknown().transform((value, ctx): Date | null => {
    if (value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
    const parsed = piena.safeParse(value);
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error.issues[0]?.message ?? '' });
    return z.NEVER;
  });
}

/**
 * Спиране поради опасност — D.P.R. 162/1999, чл. 15, ал. 7: поддържащият спира асансьора до поправката и
 * уведомява собственика (или законния му представител), проверяващия (soggetto delle verifiche periodiche) и
 * общината (research/norme-ascensori/leggi/dpr-162-1999.md:304-306). Тук — денят на всяко уведомяване.
 */
export const COMUNICAZIONI_FERMO = [
  ['proprietario', 'avvisoProprietarioAt'],
  ['verificatore', 'avvisoVerificatoreAt'],
  ['comune', 'avvisoComuneAt'],
] as const;

export type ComunicazioneFermo = (typeof COMUNICAZIONI_FERMO)[number][0];

/**
 * Формата на табелата „Avviso di fermo impianto“: датата, адресът, градът, мястото на уредбата („Scala
 * B“) и текстът към хората (задължителен — затова е табелата). Всичко от външния свят минава оттук (zod);
 * грешките са кодовете на картата (`scheda.error.<код>`). Дължините са тези на колоните в базата.
 */
export const MAX_TESTO = 600;

const schema = z.object({
  data: dateParser(),
  indirizzo: textParser({ kind: 'text', maxLength: 200 }),
  citta: textParser({ kind: 'text', maxLength: 80 }),
  ubicazione: textParser({ kind: 'text', maxLength: 120 }),
  testo: textParser({ kind: 'textarea', maxLength: MAX_TESTO }).refine(
    (value) => value !== null,
    'required',
  ),
  // Отметката „Fermo per pericolo“ праща „si“; без нея — спиране за работи.
  pericolo: yesNoParser(),
  avvisoProprietarioAt: dataFacoltativa(),
  avvisoVerificatoreAt: dataFacoltativa(),
  avvisoComuneAt: dataFacoltativa(),
});

export type CartelloData = Omit<z.output<typeof schema>, 'testo' | 'pericolo'> & {
  testo: string;
  pericolo: boolean;
};

const KEYS = Object.keys(schema.shape) as Array<keyof typeof schema.shape>;

/** Кои от трите уведомявания по чл. 15, ал. 7 още нямат ден; при спиране за работи — нито едно. */
export function comunicazioniMancanti(
  cartello: Pick<CartelloData, 'pericolo' | (typeof COMUNICAZIONI_FERMO)[number][1]>,
): ComunicazioneFermo[] {
  if (!cartello.pericolo) return [];
  return COMUNICAZIONI_FERMO.filter(([, campo]) => !cartello[campo]).map(([chi]) => chi);
}

export function parseCartello(
  body: unknown,
): { ok: true; data: CartelloData } | { ok: false; errors: FieldErrors } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const parsed = schema.safeParse(Object.fromEntries(KEYS.map((key) => [key, raw[key]])));
  if (parsed.success) {
    const { testo, pericolo, ...rest } = parsed.data;
    if (testo === null) return { ok: false, errors: { testo: 'required' } };
    // Уведомяванията имат смисъл само при спиране поради опасност (CHECK `Cartello_pericolo_check`):
    // ден без отметката е грешка на отметката — не се маха тихо (човекът решава: отметка или без дни).
    if (pericolo !== true) {
      if (COMUNICAZIONI_FERMO.some(([, campo]) => rest[campo] !== null))
        return { ok: false, errors: { pericolo: 'required' } };
      return { ok: true, data: { ...rest, testo, pericolo: false } };
    }
    return { ok: true, data: { ...rest, testo, pericolo: true } };
  }
  const errors: FieldErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? 'data');
    if (!errors[key])
      errors[key] = (ERROR_CODES.has(issue.message) ? issue.message : 'invalid') as FieldErrorCode;
  }
  return { ok: false, errors };
}

/** Записаната табела във вида на формата (за „Modifica“). */
export function formValuesFromCartello(row: {
  data: Date;
  indirizzo: string | null;
  citta: string | null;
  ubicazione: string | null;
  testo: string;
  pericolo: boolean;
  avvisoProprietarioAt: Date | null;
  avvisoVerificatoreAt: Date | null;
  avvisoComuneAt: Date | null;
}): FormValues {
  const giorno = (value: Date | null): string => (value ? dayFromDate(value) : '');
  return {
    data: dayFromDate(row.data),
    indirizzo: row.indirizzo ?? '',
    citta: row.citta ?? '',
    ubicazione: row.ubicazione ?? '',
    testo: row.testo,
    pericolo: row.pericolo ? 'si' : '',
    avvisoProprietarioAt: giorno(row.avvisoProprietarioAt),
    avvisoVerificatoreAt: giorno(row.avvisoVerificatoreAt),
    avvisoComuneAt: giorno(row.avvisoComuneAt),
  };
}

/** Пратеното за повторно показване при грешка: само низове, само имената на формата. */
export function formValuesDalBody(body: unknown): FormValues {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 2000) : '');
  return Object.fromEntries([...KEYS, 'azienda'].map((key) => [key, text(raw[key])]));
}
