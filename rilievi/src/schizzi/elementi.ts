import { z } from 'zod';
import {
  ALTEZZA,
  LARGHEZZA,
  MAX_ELEMENTI,
  MAX_PESO,
  MAX_QUOTA,
  MAX_SEGMENTI,
  MAX_TESTO,
} from './costanti.js';
import { NOMI_SIMBOLI, SIMBOLI } from './simboli.js';

/**
 * Видът на листа на скицника — проверката (zod) на всичко, пратено от формата или прочетено от базата.
 * Координатите са цели числа в листа LARGHEZZA × ALTEZZA. Елементите (t):
 * - `p` път: молив, права, правоъгълник, начупена линия и многоъгълник — SVG само с „M x y“, относителни
 *   „l dx dy“ и „z“ накрая;
 * - `x` надпис;
 * - `e` елипса (кръг — равни радиуси);
 * - `a` стрелка: върхът (x1, y1), опашката (x2, y2); с `v` — надпис със стрелка, текстът е при опашката;
 * - `q` кота между две точки: `o` — отместването на котовата линия, `v` — написаното число, `m: 'r'` —
 *   радиус (една стрелка, без помощни линии);
 * - `s` готов символ (simboli.ts): центърът, ширината, височината, завъртането на 90° (`r`) и огледалото
 *   (`f: 1` — около вертикалната ос на кутията, преди завъртането).
 * `k: 1` — пунктир (не и за котите и надписите). Всичко извън вида е подправено.
 */

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
const testoDi = (max: number) =>
  z
    .string()
    .max(max * 4)
    .transform(pulito)
    .pipe(z.string().min(1).max(max));

const colore = z.enum(['k', 'r', 'b']);
const misura = z.union([z.literal(1), z.literal(2)]);
const tratteggio = z.literal(1).optional();
const intero = (min: number, max: number) => z.number().int().min(min).max(max);
const x = intero(0, LARGHEZZA);
const y = intero(0, ALTEZZA);

const tratto = z
  .object({
    t: z.literal('p'),
    c: colore,
    s: misura,
    k: tratteggio,
    d: z.string().max(50_000).regex(PERCORSO).refine(nelFoglio),
  })
  .strict();
const testo = z
  .object({ t: z.literal('x'), c: colore, s: misura, x, y, v: testoDi(MAX_TESTO) })
  .strict();
const ellisse = z
  .object({
    t: z.literal('e'),
    c: colore,
    s: misura,
    k: tratteggio,
    x,
    y,
    // Еднакви граници за двете оси — завъртането и кръгът не опират в по-късата.
    rx: intero(1, LARGHEZZA),
    ry: intero(1, LARGHEZZA),
  })
  .strict();
const freccia = z
  .object({
    t: z.literal('a'),
    c: colore,
    s: misura,
    k: tratteggio,
    x1: x,
    y1: y,
    x2: x,
    y2: y,
    v: testoDi(MAX_TESTO).optional(),
  })
  .strict();
const quota = z
  .object({
    t: z.literal('q'),
    c: colore,
    s: misura,
    x1: x,
    y1: y,
    x2: x,
    y2: y,
    o: intero(-LARGHEZZA, LARGHEZZA),
    v: testoDi(MAX_QUOTA),
    m: z.literal('r').optional(),
  })
  .strict();
const simbolo = z
  .object({
    t: z.literal('s'),
    c: colore,
    s: misura,
    k: tratteggio,
    n: z.enum(NOMI_SIMBOLI),
    x,
    y,
    w: intero(10, LARGHEZZA),
    h: intero(10, LARGHEZZA),
    r: intero(0, 3),
    f: z.literal(1).optional(),
  })
  .strict();

/**
 * Стрелката и котата имат посока — двете им точки не съвпадат; котата на радиус е без отместване.
 */
/**
 * Котовата линия (точките, отместени с `o`) остава в листа, с 2 единици допуск — иначе котата е
 * записана, но невидима. Същото смята и браузърът (public/js/schizzo-regole.js), в същия ред.
 */
export function lineaQuotaNelFoglio(el: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  o: number;
}): boolean {
  const lungo = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  const nx = -(el.y2 - el.y1) / lungo;
  const ny = (el.x2 - el.x1) / lungo;
  return [
    [el.x1 + nx * el.o, el.y1 + ny * el.o],
    [el.x2 + nx * el.o, el.y2 + ny * el.o],
  ].every(([x = 0, y = 0]) => x >= -2 && x <= LARGHEZZA + 2 && y >= -2 && y <= ALTEZZA + 2);
}

export const elementoSchema = z
  .discriminatedUnion('t', [tratto, testo, ellisse, freccia, quota, simbolo])
  .refine(
    (el) =>
      (el.t !== 'a' && el.t !== 'q') ||
      ((el.x1 !== el.x2 || el.y1 !== el.y2) &&
        (el.t !== 'q' || ((el.m !== 'r' || el.o === 0) && lineaQuotaNelFoglio(el)))),
  );

/**
 * Колко рисува един елемент (примитивите му — src/schizzi/forme.ts): котата и символът са малки в JSON-а,
 * а излизат на няколко линии. Сборът на листа е с таван — иначе подправен лист с хиляди коти би държал
 * сървъра при всяко показване, печат и PDF. Същото смята и браузърът (VISTA_SCHIZZO.pesi).
 */
export const PESI = { p: 1, x: 1, e: 1, a: 2, q: 6 } as const;
export function pesoDi(el: { t: string; n?: string; v?: string }): number {
  if (el.t === 's') {
    return el.n && Object.hasOwn(SIMBOLI, el.n)
      ? SIMBOLI[el.n as keyof typeof SIMBOLI].parti.length
      : 1;
  }
  if (el.t === 'a') return el.v ? PESI.a + 1 : PESI.a;
  return Object.hasOwn(PESI, el.t) ? PESI[el.t as keyof typeof PESI] : 1;
}

export const foglioSchema = z
  .object({ e: z.array(elementoSchema).max(MAX_ELEMENTI) })
  .strict()
  .refine((foglio) => foglio.e.reduce((somma, el) => somma + pesoDi(el), 0) <= MAX_PESO);

export type Foglio = z.output<typeof foglioSchema>;
export type Elemento = Foglio['e'][number];
