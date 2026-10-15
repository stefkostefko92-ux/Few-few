import { z } from 'zod';
import { ORDINABILI } from './ordine.js';

/**
 * Какво влиза в печата и PDF-а на картата — изборите в края на формата: попълненото в модулите
 * (`riepilogoOrdini`) и разделите (`stampa`). Проверката на пратеното е тук; записът — в
 * validation.ts, печатът и PDF-ът — ordine.ts (`sezioniStampate`) и src/ordini/riepilogo.ts.
 */

/** Отметката „Includi quadro e argano nella stampa“: „1“ или нищо — всичко друго е подправено. */
export const riepilogoSchema = z.preprocess(
  (value) => (value === undefined || value === '' ? false : value),
  z.union([z.literal(false), z.literal('1').transform(() => true)], {
    errorMap: () => ({ message: 'invalid' }),
  }),
);
export const RIEPILOGO_KEY = 'riepilogoOrdini';

/**
 * Разделите в печата и PDF-а: отметнатите (`stampa`, повтарящ се ключ). Списъкът е във формата, когато
 * има знака `stampa-_`; без него (стара страница) — всички. Пазят се изключените, затова нов раздел
 * влиза в печата сам. Ключ извън подвижните раздели е подправен.
 */
export const STAMPA_KEY = 'stampa';
export const STAMPA_MARK = 'stampa-_';
const stampaSchema = z.preprocess(
  (value) => (value === undefined ? [] : typeof value === 'string' ? [value] : value),
  z
    .array(z.string({ invalid_type_error: 'invalid' }), { invalid_type_error: 'invalid' })
    .max(ORDINABILI.length * 2, 'invalid')
    .refine(
      (keys) => keys.every((key) => (ORDINABILI as readonly string[]).includes(key)),
      'option',
    ),
);

/** Изключените раздели от пратеното, или неуспех при подправен списък. */
export function sezioniEscluseDi(
  raw: Record<string, unknown>,
): { success: true; data: string[] } | { success: false } {
  if (raw[STAMPA_MARK] !== '1') return { success: true, data: [] };
  const parsed = stampaSchema.safeParse(raw[STAMPA_KEY]);
  return parsed.success
    ? { success: true, data: ORDINABILI.filter((key) => !parsed.data.includes(key)) }
    : { success: false };
}

/** Отметнатите раздели, както са пратени (формата се връща); без списъка във формата — всички. */
export function stampaFromBody(source: Record<string, unknown>): string[] {
  const stampa = source[STAMPA_KEY];
  if (source[STAMPA_MARK] !== '1') return [...ORDINABILI];
  return (typeof stampa === 'string' ? [stampa] : Array.isArray(stampa) ? stampa : [])
    .filter((key): key is string => typeof key === 'string')
    .slice(0, ORDINABILI.length);
}
