import { z } from 'zod';

/**
 * Скицникът в края на картата: листове, нарисувани на ръка — молив, права линия и правоъгълник (всичко
 * това е път) и надписи. Едно описание за браузъра (public/js/schizzi.js, schizzo-editor.js), картата и
 * печата (views/schede/_schizzo.ejs) и PDF-а (src/schede/pdf-schizzi.ts): координатите са цели числа в
 * листа LARGHEZZA × ALTEZZA; пътят е SVG само с „M x y“ в началото, относителни „l dx dy“ и „z“ накрая —
 * без криви и без нищо друго. Пратеното от формата се проверява тук; всичко извън вида е подправено.
 */

export const LARGHEZZA = 1400;
export const ALTEZZA = 1000;
/** Квадратчето на мрежата: 28 × 20 на листа, в печата ~6,4 mm. */
export const PASSO_GRIGLIA = 50;
export const MAX_FOGLI = 10;
export const MAX_ELEMENTI = 3000;
/** Отсечките на един път — браузърът започва нов път след толкова. */
export const MAX_SEGMENTI = 4000;
/** Един лист, както идва от формата (JSON) — същия таван има и браузърът. */
export const MAX_JSON_FOGLIO = 200_000;
/**
 * Един лист, кодиран за формата (urlencoded) — вторият таван на браузъра: надписите с ударения и кавички
 * тежат до 9 байта на знак, а десет листа трябва да се съберат в 4 MB на формата (src/server.ts).
 */
export const MAX_FOGLIO_CODIFICATO = 350_000;
export const MAX_TESTO = 120;

export type Colore = 'k' | 'r' | 'b';
export type Misura = 1 | 2;
/** Цветовете — в данните е само ключът. */
export const COLORI: Readonly<Record<Colore, string>> = {
  k: '#000000',
  r: '#c62828',
  b: '#1565c0',
};
/** Дебелината на линията и височината на буквите по размера — в единиците на листа. */
export const SPESSORI: Readonly<Record<Misura, number>> = { 1: 4, 2: 10 };
export const CORPI: Readonly<Record<Misura, number>> = { 1: 32, 2: 52 };

/** Мрежата на листа като един SVG път — картата, печатът, формата и PDF-ът я рисуват еднакво, бледо. */
export const GRIGLIA = (() => {
  const linee: string[] = [];
  for (let x = PASSO_GRIGLIA; x < LARGHEZZA; x += PASSO_GRIGLIA) linee.push(`M${x} 0V${ALTEZZA}`);
  for (let y = PASSO_GRIGLIA; y < ALTEZZA; y += PASSO_GRIGLIA) linee.push(`M0 ${y}H${LARGHEZZA}`);
  return linee.join('');
})();
export const COLORE_GRIGLIA = '#d3d9e0';

/** Каквото трябва на шаблона на листа (views/schede/_schizzo.ejs) — в `res.locals` на всяка страница. */
export const VISTA_SCHIZZO = {
  larghezza: LARGHEZZA,
  altezza: ALTEZZA,
  griglia: GRIGLIA,
  coloreGriglia: COLORE_GRIGLIA,
  colori: COLORI,
  spessori: SPESSORI,
  corpi: CORPI,
  maxFogli: MAX_FOGLI,
  maxElementi: MAX_ELEMENTI,
  maxSegmenti: MAX_SEGMENTI,
  maxJson: MAX_JSON_FOGLIO,
  maxCodificato: MAX_FOGLIO_CODIFICATO,
  maxTesto: MAX_TESTO,
} as const;

const PERCORSO = new RegExp(`^M\\d{1,4} \\d{1,4}(?:l-?\\d{1,4} -?\\d{1,4}){1,${MAX_SEGMENTI}}z?$`);
/** Началото на пътя е в листа (отсечките могат да излязат — печатът и PDF-ът режат по ръба). */
const nelFoglio = (d: string): boolean => {
  const [x = Infinity, y = Infinity] = d.slice(1).split(/[ l]/, 2).map(Number);
  return x <= LARGHEZZA && y <= ALTEZZA;
};
// Без управляващи, невидими и самотни сурогатни знаци (половин емоджи — базата не го приема).
const pulito = (value: string): string =>
  value
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const colore = z.enum(['k', 'r', 'b']);
const misura = z.union([z.literal(1), z.literal(2)]);
const tratto = z
  .object({
    t: z.literal('p'),
    c: colore,
    s: misura,
    d: z.string().max(50_000).regex(PERCORSO).refine(nelFoglio),
  })
  .strict();
const testo = z
  .object({
    t: z.literal('x'),
    c: colore,
    s: misura,
    x: z.number().int().min(0).max(LARGHEZZA),
    y: z.number().int().min(0).max(ALTEZZA),
    v: z
      .string()
      .max(MAX_TESTO * 4)
      .transform(pulito)
      .pipe(z.string().min(1).max(MAX_TESTO)),
  })
  .strict();

export const foglioSchema = z
  .object({ e: z.array(z.discriminatedUnion('t', [tratto, testo])).max(MAX_ELEMENTI) })
  .strict();

export type Foglio = z.output<typeof foglioSchema>;
export type Elemento = Foglio['e'][number];

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

/** Листовете, както са пратени (формата се връща) — само проверените, и празните; без блока — undefined. */
export function schizziFromBody(source: Record<string, unknown>): string[] | undefined {
  if (source[SCHIZZI_MARK] !== '1') return undefined;
  return (lista(source[SCHIZZO_KEY]) ?? []).slice(0, MAX_FOGLI).flatMap((item) => {
    const foglio = foglioDa(item);
    return foglio ? [JSON.stringify(foglio)] : [];
  });
}
