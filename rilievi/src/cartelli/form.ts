import { z } from 'zod';
import {
  dateParser,
  ERROR_CODES,
  textParser,
  type FieldErrorCode,
  type FieldErrors,
  type FormValues,
} from '../schede/field-parsers.js';
import { dayFromDate } from '../time.js';

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
});

export type CartelloData = Omit<z.output<typeof schema>, 'testo'> & { testo: string };

const KEYS = Object.keys(schema.shape) as Array<keyof typeof schema.shape>;

export function parseCartello(
  body: unknown,
): { ok: true; data: CartelloData } | { ok: false; errors: FieldErrors } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const parsed = schema.safeParse(Object.fromEntries(KEYS.map((key) => [key, raw[key]])));
  if (parsed.success) {
    const { testo, ...rest } = parsed.data;
    if (testo === null) return { ok: false, errors: { testo: 'required' } };
    return { ok: true, data: { ...rest, testo } };
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
}): FormValues {
  return {
    data: dayFromDate(row.data),
    indirizzo: row.indirizzo ?? '',
    citta: row.citta ?? '',
    ubicazione: row.ubicazione ?? '',
    testo: row.testo,
  };
}

/** Пратеното за повторно показване при грешка: само низове, само имената на формата. */
export function formValuesDalBody(body: unknown): FormValues {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 2000) : '');
  return Object.fromEntries([...KEYS, 'azienda'].map((key) => [key, text(raw[key])]));
}
