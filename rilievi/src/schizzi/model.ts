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
import {
  elementoSchema,
  foglioSchema,
  PESI,
  pesoDi,
  type Elemento,
  type Foglio,
} from './elementi.js';
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

/** Елементите на JSON лист без проверка; null — няма масив `e` или е над тавана на броя. */
function vociDi(json: unknown): unknown[] | null {
  const voci = typeof json === 'object' && json !== null ? (json as { e?: unknown }).e : null;
  return Array.isArray(voci) && voci.length <= MAX_ELEMENTI ? voci : null;
}

/** JSON от формата (до тавана на листа) или вече прочетеното от базата; undefined — не е JSON. */
function jsonDi(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.length > MAX_JSON_FOGLIO) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Един лист от JSON (формата или базата); null — не е лист (подправен или твърде голям). Броят се
 * проверява преди zod: масивът над тавана иначе минава целия през проверката на всеки елемент — секунди
 * синхронна работа на заявка с подправени листове.
 */
export function foglioDa(value: unknown): Foglio | null {
  const json = jsonDi(value);
  if (!vociDi(json)) return null;
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
  const fogli: Foglio[] = [];
  for (const item of list) {
    const foglio = foglioDa(item);
    if (!foglio) return { success: false };
    if (foglio.e.length > 0) fogli.push(foglio);
  }
  return { success: true, data: fogli };
}

/** Отметката „Schizzi“ за печата: undefined — не е на страницата (не се пипа). */
export function schizziStampatiDi(raw: Record<string, unknown>): boolean | undefined {
  return raw[SCHIZZI_STAMPA_MARK] === '1' ? raw[SCHIZZI_STAMPA_KEY] === '1' : undefined;
}

/** Колко елемента може да отпадне от спасявания лист — повече е подправяне, не грешка. */
const MAX_SCARTATI = 20;

/**
 * Листът за върнатата форма (и за сравнението при запис): валидните елементи в реда им, до тавана на
 * тежестта — за да не се загуби цялата рисунка заради един елемент. Един проход: при успешен запис
 * листът вече е проверен веднъж. null — не е лист или е подправен.
 */
function foglioSalvato(item: unknown): Foglio | null {
  if (typeof item !== 'string') return null;
  const voci = vociDi(jsonDi(item));
  if (!voci) return null;
  const e: Elemento[] = [];
  let peso = 0;
  let scartati = 0;
  for (const el of voci) {
    const parsed = elementoSchema.safeParse(el);
    if (!parsed.success) {
      if (++scartati > MAX_SCARTATI) return null;
      continue;
    }
    peso += pesoDi(parsed.data);
    if (peso > MAX_PESO) break;
    e.push(parsed.data);
  }
  return { e };
}

/**
 * Листовете, както са пратени (формата се връща) — проверените, празните и спасеното от подправените;
 * без блока — undefined.
 */
export function schizziFromBody(source: Record<string, unknown>): string[] | undefined {
  if (source[SCHIZZI_MARK] !== '1') return undefined;
  return (lista(source[SCHIZZO_KEY]) ?? []).slice(0, MAX_FOGLI).flatMap((item) => {
    const foglio = foglioSalvato(item);
    return foglio ? [JSON.stringify(foglio)] : [];
  });
}
