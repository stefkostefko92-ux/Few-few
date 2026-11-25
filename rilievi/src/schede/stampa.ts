import type { FotoDimensione } from '@prisma/client';
import { z } from 'zod';
import { MAX_PER_SCHEDA } from '../allegati/service.js';
import { COLONNE } from '../ordini/registry.js';
import { ORDINABILI } from './ordine.js';

/**
 * Какво влиза в печата и PDF-а на картата — изборите в края на формата: попълненото в модулите, всеки
 * поотделно (`riepilogoOrdini`), разделите (`stampa`) и снимките (`fotoStampa`). Проверката на
 * пратеното е тук; записът — в validation.ts и service.ts, печатът и PDF-ът — ordine.ts
 * (`sezioniStampate`), src/ordini/riepilogo.ts и src/allegati/stampa.ts.
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
    .array(z.string({ error: 'invalid' }), { error: 'invalid' })
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
    .array(z.string({ error: 'invalid' }), { error: 'invalid' })
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
 * Снимките в края на печата и PDF-а — иконките в края на формата: `fotoMostrate` са показаните (id-та,
 * с интервал), `fotoStampa` — отметнатите от тях (повтарящ се ключ). Записът пипа само показаните:
 * снимка, качена междувременно, остава каквато е; без `fotoMostrate` (нова карта или страница отпреди
 * иконките) — нищо. Отметнато, което не е показано, не се брои; id извън вида на id-тата е подправено;
 * чуждо id не пипа нищо (записът е само в снимките на картата, schede/service.ts).
 */
export const FOTO_KEY = 'fotoStampa';
export const FOTO_MOSTRATE = 'fotoMostrate';
/**
 * Редът и големината на снимките в печата (собственикът, 10 ноември 2026 — „scegliere … con un'anteprima
 * la dimensione e l'ordine delle foto“): `fotoOrdine` — отметнатите id-та в реда на печата (с интервал),
 * `fotoDimensione` — една от `DIMENSIONI_FOTO`. Без тях (страница отпреди) — не се пипат.
 */
export const FOTO_ORDINE = 'fotoOrdine';
export const FOTO_DIMENSIONE = 'fotoDimensione';
export const DIMENSIONI_FOTO = [
  'PICCOLE',
  'MEDIE',
  'GRANDI',
  'UNA',
] as const satisfies readonly FotoDimensione[];
const ID_FOTO = /^[a-z0-9]{20,40}$/;
const idsSchema = z.array(z.string().regex(ID_FOTO)).max(MAX_PER_SCHEDA);
const dimensioneSchema = z.enum(DIMENSIONI_FOTO);

export interface SceltaFoto {
  mostrate: string[];
  scelte: string[];
  /** Отметнатите в реда на печата; undefined — страница без подредбата (редът не се пипа). */
  ordine?: string[];
  dimensione?: FotoDimensione;
}

/** Отметнатите от `ordine` в реда му, всяка веднъж; отметнатите, които липсват в него — накрая. */
const ordinaScelte = (ordine: readonly string[], scelte: readonly string[]): string[] => {
  const tenute = [...new Set(ordine)].filter((id) => scelte.includes(id));
  return [...tenute, ...scelte.filter((id) => !tenute.includes(id))];
};

/** Изборът от пратеното: undefined — без иконки (не се пипа); неуспех — подправен списък. */
export function fotoInStampaDi(
  raw: Record<string, unknown>,
): { success: true; data: SceltaFoto | undefined } | { success: false } {
  const shown = raw[FOTO_MOSTRATE];
  if (typeof shown !== 'string') return { success: true, data: undefined };
  const mostrate = idsSchema.safeParse(shown.split(/\s+/).filter(Boolean));
  const ticked = idsSchema.safeParse(scelte(raw[FOTO_KEY]));
  if (!mostrate.success || !ticked.success) return { success: false };
  const visti = new Set(mostrate.data);
  const scelteVisibili = [...new Set(ticked.data)].filter((id) => visti.has(id));
  const rawOrdine = raw[FOTO_ORDINE];
  const ordine =
    typeof rawOrdine === 'string'
      ? idsSchema.safeParse(rawOrdine.split(/\s+/).filter(Boolean))
      : undefined;
  const rawDimensione = raw[FOTO_DIMENSIONE];
  const dimensione =
    rawDimensione === undefined ? undefined : dimensioneSchema.safeParse(rawDimensione);
  if ((ordine && !ordine.success) || (dimensione && !dimensione.success)) return { success: false };
  return {
    success: true,
    data: {
      mostrate: [...visti],
      scelte: scelteVisibili,
      ...(ordine?.success ? { ordine: ordinaScelte(ordine.data, scelteVisibili) } : {}),
      ...(dimensione?.success ? { dimensione: dimensione.data } : {}),
    },
  };
}

/**
 * Изборът, както е пратен (формата се връща): показаните и отметнатите от тях — само с вида на id-тата.
 * Без иконките — undefined (от базата).
 */
export function fotoFromBody(source: Record<string, unknown>): SceltaFoto | undefined {
  const shown = source[FOTO_MOSTRATE];
  if (typeof shown !== 'string') return undefined;
  const ids = (list: unknown): string[] =>
    Array.isArray(list)
      ? list
          .filter((id): id is string => typeof id === 'string' && ID_FOTO.test(id))
          .slice(0, MAX_PER_SCHEDA)
      : [];
  const mostrate = ids(shown.split(/\s+/));
  const scelteVisibili = ids(scelte(source[FOTO_KEY])).filter((id) => mostrate.includes(id));
  const rawOrdine = source[FOTO_ORDINE];
  const dimensione = dimensioneSchema.safeParse(source[FOTO_DIMENSIONE]);
  return {
    mostrate,
    scelte: scelteVisibili,
    ...(typeof rawOrdine === 'string'
      ? { ordine: ordinaScelte(ids(rawOrdine.split(/\s+/)), scelteVisibili) }
      : {}),
    ...(dimensione.success ? { dimensione: dimensione.data } : {}),
  };
}
