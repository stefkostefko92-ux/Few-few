import {
  ALTEZZA,
  COLORE_GRIGLIA,
  COLORI,
  CORPI,
  FRECCE,
  GRIGLIA,
  LARGHEZZA,
  MAX_ELEMENTI,
  MAX_FOGLI,
  MAX_FOGLIO_CODIFICATO,
  MAX_JSON_FOGLIO,
  MAX_PESO,
  MAX_QUOTA,
  MAX_SEGMENTI,
  MAX_TESTO,
  QUOTA,
  SPESSORI,
  TRATTEGGI,
} from './costanti.js';
import { elementoSchema, foglioSchema, PESI, type Foglio } from './elementi.js';
import { SIMBOLI } from './simboli.js';

/**
 * Скицникът в края на картата: листове, нарисувани на ръка — пътища (молив, права, правоъгълник,
 * начупена линия, многоъгълник), надписи, елипси, стрелки и надписи със стрелка, коти и готови символи за
 * шахтата. Едно описание за браузъра (public/js/schizzi.js, schizzo-*.js), картата и печата
 * (views/schede/_schizzo.ejs) и PDF-а (src/schede/pdf-schizzi.ts): видът и проверката — elementi.ts,
 * мерките — costanti.ts, символите — simboli.ts, рисуването — forme.ts. Тук: каквото отива в браузъра и
 * пратеното от формата.
 */

export * from './costanti.js';
export { foglioSchema, type Elemento, type Foglio } from './elementi.js';

/** Каквото трябва на шаблона на листа и на браузъра (`schizzi-vista`) — в `res.locals` на всяка страница. */
export const VISTA_SCHIZZO = {
  larghezza: LARGHEZZA,
  altezza: ALTEZZA,
  griglia: GRIGLIA,
  coloreGriglia: COLORE_GRIGLIA,
  colori: COLORI,
  spessori: SPESSORI,
  corpi: CORPI,
  frecce: FRECCE,
  tratteggi: TRATTEGGI,
  quota: QUOTA,
  simboli: SIMBOLI,
  maxFogli: MAX_FOGLI,
  maxElementi: MAX_ELEMENTI,
  maxSegmenti: MAX_SEGMENTI,
  maxJson: MAX_JSON_FOGLIO,
  maxCodificato: MAX_FOGLIO_CODIFICATO,
  maxTesto: MAX_TESTO,
  maxQuota: MAX_QUOTA,
  maxPeso: MAX_PESO,
  pesi: PESI,
} as const;

/** Един лист от JSON (формата или базата); null — не е лист (подправен или твърде голям). */
export function foglioDa(value: unknown): Foglio | null {
  let json = value;
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_FOGLIO) return null;
    try {
      json = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const parsed = foglioSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** Ключовете на формата: листовете (по един JSON, в реда им), знакът на блока и отметката за печата. */
export const SCHIZZO_KEY = 'schizzo';
export const SCHIZZI_MARK = 'schizzi-_';
export const SCHIZZI_STAMPA_KEY = 'schizziStampati';
export const SCHIZZI_STAMPA_MARK = 'schizziStampati-_';

const lista = (value: unknown): unknown[] | null =>
  value === undefined
    ? []
    : typeof value === 'string'
      ? [value]
      : Array.isArray(value)
        ? value
        : null;

/**
 * Листовете от пратеното: undefined — скицникът не е на страницата (стара страница, фирма без него) и
 * не се пипа; неуспех — подправено. Празните листове отпадат — в печата нямат какво да покажат.
 */
export function schizziDi(
  raw: Record<string, unknown>,
): { success: true; data: Foglio[] | undefined } | { success: false } {
  if (raw[SCHIZZI_MARK] !== '1') return { success: true, data: undefined };
  const list = lista(raw[SCHIZZO_KEY]);
  if (!list || list.length > MAX_FOGLI) return { success: false };
  const fogli = list.map(foglioDa);
  if (fogli.some((foglio) => foglio === null)) return { success: false };
  return {
    success: true,
    data: fogli.filter((foglio): foglio is Foglio => foglio !== null && foglio.e.length > 0),
  };
}

/** Отметката „Schizzi“ за печата: undefined — не е на страницата (не се пипа). */
export function schizziStampatiDi(raw: Record<string, unknown>): boolean | undefined {
  return raw[SCHIZZI_STAMPA_MARK] === '1' ? raw[SCHIZZI_STAMPA_KEY] === '1' : undefined;
}

/**
 * Лист, в който нещо не е във вида си: само елементите, които са (в реда им, до тавана) — за върнатата
 * форма, за да не се загуби цялата рисунка заради един елемент; null — нищо за спасяване.
 */
function foglioSalvato(item: unknown): Foglio | null {
  if (typeof item !== 'string' || item.length > MAX_JSON_FOGLIO) return null;
  let json: unknown;
  try {
    json = JSON.parse(item);
  } catch {
    return null;
  }
  const voci = typeof json === 'object' && json !== null ? (json as { e?: unknown }).e : null;
  if (!Array.isArray(voci)) return null;
  const e = voci.flatMap((el: unknown) => {
    const parsed = elementoSchema.safeParse(el);
    return parsed.success ? [parsed.data] : [];
  });
  return foglioDa({ e: e.slice(0, MAX_ELEMENTI) });
}

/**
 * Листовете, както са пратени (формата се връща) — проверените, празните и спасеното от подправените;
 * без блока — undefined.
 */
export function schizziFromBody(source: Record<string, unknown>): string[] | undefined {
  if (source[SCHIZZI_MARK] !== '1') return undefined;
  return (lista(source[SCHIZZO_KEY]) ?? []).slice(0, MAX_FOGLI).flatMap((item) => {
    const foglio = foglioDa(item) ?? foglioSalvato(item);
    return foglio ? [JSON.stringify(foglio)] : [];
  });
}
