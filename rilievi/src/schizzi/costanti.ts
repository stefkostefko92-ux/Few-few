/**
 * Мерките на скицника — листът, таваните, цветовете, дебелините, буквите, стрелките, пунктирът и котите.
 * Едни и същи за проверката (elementi.ts), рисуването (forme.ts, _schizzo.ejs, pdf-schizzi.ts) и браузъра
 * (VISTA_SCHIZZO в model.ts). Всичко е в единиците на листа LARGHEZZA × ALTEZZA.
 */

export const LARGHEZZA = 1400;
export const ALTEZZA = 1000;
/** Квадратчето на мрежата: 28 × 20 на листа, в печата ~6,4 mm. */
export const PASSO_GRIGLIA = 50;
export const MAX_FOGLI = 10;
export const MAX_ELEMENTI = 3000;
/** Колко може да рисува един лист — сборът от тежестите на елементите му (elementi.ts, `pesoDi`). */
export const MAX_PESO = 6000;
/** Отсечките на един път — браузърът започва нов път след толкова. */
export const MAX_SEGMENTI = 4000;
/** Един лист, както идва от формата (JSON) — същия таван има и браузърът. */
export const MAX_JSON_FOGLIO = 200_000;
/**
 * Един лист, кодиран точно както го праща формата (application/x-www-form-urlencoded, заедно с
 * „schizzo=“) — вторият таван на браузъра: надписите с ударения, кавички и скоби тежат до 9 байта на знак,
 * а десет листа трябва да се съберат в 4 MB на формата (src/server.ts).
 */
export const MAX_FOGLIO_CODIFICATO = 350_000;
export const MAX_TESTO = 120;
/** Числото на котата („1600“, „Ø 600“, „R 300“) — кратко, на една линия. */
export const MAX_QUOTA = 40;

export type Colore = 'k' | 'r' | 'b';
export type Misura = 1 | 2;
/** Цветовете — в данните е само ключът. */
export const COLORI: Readonly<Record<Colore, string>> = {
  k: '#000000',
  r: '#c62828',
  b: '#1565c0',
};
/** Дебелината на линията и височината на буквите по размера. */
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

/**
 * Стрелката (на стрелката, надписа със стрелка и котата) по дебелината: дължина и половин ширина —
 * затворена и запълнена, 30° (половин ширина = дължина × tg 15°, UNI EN ISO 129-1).
 */
export const FRECCE: Readonly<Record<Misura, readonly [number, number]>> = {
  1: [28, 8],
  2: [40, 11],
};
/** Пунктирът по дебелината: черта и празно (с кръглите краища чертата излиза малко по-дълга). */
export const TRATTEGGI: Readonly<Record<Misura, readonly [number, number]>> = {
  1: [20, 14],
  2: [36, 24],
};
/**
 * Котата (UNI EN ISO 129-1): помощните линии почват `stacco` от измерената точка и минават `oltre` след
 * котовата линия; числото стои `testo` над нея, никога с главата надолу.
 */
export const QUOTA = { stacco: 8, oltre: 18, testo: 10 } as const;
