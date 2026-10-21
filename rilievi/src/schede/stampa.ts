import { z } from 'zod';
import { COLONNE } from '../ordini/registry.js';
import { ORDINABILI } from './ordine.js';

/**
 * Какво влиза в печата и PDF-а на картата — изборите в края на формата: попълненото в модулите, всеки
 * поотделно (`riepilogoOrdini`) и разделите (`stampa`). Проверката на пратеното е тук; записът — в
 * validation.ts, печатът и PDF-ът — ordine.ts (`sezioniStampate`) и src/ordini/riepilogo.ts.
 */

/** Страница отпреди отделния избор праща една отметка „1“ за всички модули. */
const TUTTI = '1';
const scelte = (value: unknown): unknown =>
  value === undefined || value === '' ? [] : typeof value === 'string' ? [value] : value;

/**
 * Модулите в печата: отметнатите колони (`riepilogoOrdini`, повтарящ се ключ) в реда на слотовете;
 * „1“ (стара страница) — всичките. Друга стойност е подправена.
 */
export const riepilogoSchema = z.preprocess(
  scelte,
  z
    .array(z.string({ invalid_type_error: 'invalid' }), { invalid_type_error: 'invalid' })
    .max(COLONNE.length + 1, 'invalid')
    .refine(
      (keys) => keys.every((key) => key === TUTTI || (COLONNE as readonly string[]).includes(key)),
      'invalid',
    )
    .transform((keys) => COLONNE.filter((col) => keys.includes(TUTTI) || keys.includes(col))),
);
export const RIEPILOGO_KEY = 'riepilogoOrdini';

/** Отметнатите модули, както са пратени (формата се връща) — само познатите колони. */
export function riepilogoFromBody(source: Record<string, unknown>): string[] {
  const list = scelte(source[RIEPILOGO_KEY]);
  if (!Array.isArray(list)) return [];
  return COLONNE.filter((col) => list.includes(col) || list.includes(TUTTI));
}

/**
 * Разделите в печата и PDF-а: отметнатите (`stampa`, повтарящ се ключ). Списъкът е във формата, когато
 * има знака `stampa-_`; без него (стара страница) — всички. Пазят се изключените, затова нов раздел
 * влиза в печата сам. Ключ извън подвижните раздели е подправен — освен раздел, слят в друг: страница,
 * отворена преди сливането, още го праща („telesoccorso“ е в „allarme“ от октомври 2026).
 */
export const STAMPA_KEY = 'stampa';
export const STAMPA_MARK = 'stampa-_';
const SLITE: readonly unknown[] = ['telesoccorso'];
const stampaSchema = z.preprocess(
  (value) => {
    const list = value === undefined ? [] : typeof value === 'string' ? [value] : value;
    return Array.isArray(list) ? list.filter((key) => !SLITE.includes(key)) : list;
  },
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

/** Отметнатите раздели, както са пратени (формата се връща) — само познатите; без списъка — всички. */
export function stampaFromBody(source: Record<string, unknown>): string[] {
  const stampa = source[STAMPA_KEY];
  if (source[STAMPA_MARK] !== '1') return [...ORDINABILI];
  const list: unknown[] =
    typeof stampa === 'string' ? [stampa] : Array.isArray(stampa) ? stampa : [];
  return ORDINABILI.filter((key) => list.includes(key));
}

/**
 * Снимките на разделите в края на печата и PDF-а — отметка (`stampaFoto`). Знакът `stampaFoto-_` казва,
 * че отметката е във формата; без него (страница отпреди нея) изборът не се пипа (undefined).
 */
export const FOTO_KEY = 'stampaFoto';
export const FOTO_MARK = 'stampaFoto-_';

export function fotoStampateDi(raw: Record<string, unknown>): boolean | undefined {
  return raw[FOTO_MARK] === '1' ? raw[FOTO_KEY] === 'si' : undefined;
}

/** Отметката, както е пратена (формата се връща). */
export function fotoFromBody(source: Record<string, unknown>): string {
  return source[FOTO_KEY] === 'si' ? 'si' : '';
}
