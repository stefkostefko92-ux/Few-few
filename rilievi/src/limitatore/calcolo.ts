/**
 * Изчислението за ограничителя на скоростта (собственикът, 5 ноември 2026 — от своя
 * „Limitatore_velocita_EN81-20-2020.xlsx“, листът „Limitatore“; 7 ноември — „solo la velocità
 * dell'impianto e il tipo di paracadute, da lì il risultato senza troppe spiegazioni“): от номиналната
 * скорост и вида на парашута — между кои стойности се настройва V1 и кога действа контактът. Формулите са
 * клетките B5, B6, B9, B10 и B13 на листа, една към една, с особеностите на файла (горният праг при
 * прогресивен парашут с Vn > 1 — 1,25·v + 0,25/v, UNI EN 81-20:2020, 5.6.2.2.1.1 a) 4)). Без база —
 * тества се само (tests/limitatore-calcolo.test.ts: случаите на листа „Test“ и сметнатите в самия файл).
 *
 * `ISNUMBER` на листа е `numero()` тук: празно, текст и NaN не са число. Закръглянията са като в
 * електронната таблица — числото се взима с 15 значещи цифри.
 */

export const TIPI_PARACADUTE = ['progressivo', 'istantaneo', 'rulli'] as const;
export type TipoParacadute = (typeof TIPI_PARACADUTE)[number];

/** Входът — клетките B2 (Vn, m/s) и B3 (видът на парашута на кабината). */
export interface DatiLimitatore {
  vn: number;
  tipo: TipoParacadute;
}

export type SogliaMassima = number | 'vnNonValida' | 'nonAmmesso' | 'tipoNonValido';

export interface RisultatoLimitatore {
  /** B5 — праг отдолу (включен): 115 % от Vn; празно, ако горният не е число. */
  sogliaMin: number | null;
  /** B6 — праг отгоре (изключен), или защо го няма. */
  sogliaMax: SogliaMassima;
  /** B9 — първата стойност с 2 знака не под долния праг. */
  min2: number | null;
  /** B10 — последната стойност с 2 знака под горния праг (Vn = 1,6: 2,15, не 2,16). */
  max2: number | null;
  /** B13 — кога трябва да действа контактът; празно без Vn. */
  momento: 'prima' | 'alPiuTardi' | null;
}

/** `ISNUMBER` на листа: само крайно число (празно, текст, NaN — не). */
export const numero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Числото с 15 значещи цифри — колкото пази електронната таблица. */
const quindici = (x: number): number => Number(x.toPrecision(15));

/** `ROUND(x; n)` — половината се закръгля встрани от нулата. */
export function arrotonda(x: number, n: number): number {
  const f = 10 ** n;
  return (Math.sign(x) * Math.round(quindici(Math.abs(x) * f))) / f;
}

/** `ROUNDUP(x; n)` — встрани от нулата. */
export function arrotondaSu(x: number, n: number): number {
  const f = 10 ** n;
  return (Math.sign(x) * Math.ceil(quindici(Math.abs(x) * f))) / f;
}

/** B6: горният праг по вида на парашута. */
function sogliaMassima(vn: unknown, tipo: unknown): SogliaMassima {
  if (!numero(vn) || vn <= 0) return 'vnNonValida';
  if (tipo === 'progressivo') return vn <= 1 ? 1.5 : 1.25 * vn + 0.25 / vn;
  if (tipo === 'istantaneo' || tipo === 'rulli') {
    if (vn > 0.63) return 'nonAmmesso';
    return tipo === 'rulli' ? 1 : 0.8;
  }
  return 'tipoNonValido';
}

export function calcolaLimitatore(d: DatiLimitatore): RisultatoLimitatore {
  const { vn } = d;
  const sogliaMax = sogliaMassima(vn, d.tipo);
  // B5: долният праг има смисъл само с горния (иначе празно).
  const sogliaMin = numero(sogliaMax) && numero(vn) ? vn * 1.15 : null;
  return {
    sogliaMin,
    sogliaMax,
    min2: sogliaMin === null ? null : arrotondaSu(arrotonda(sogliaMin, 10), 2),
    max2: numero(sogliaMax) ? arrotonda(arrotondaSu(arrotonda(sogliaMax, 10), 2) - 0.01, 2) : null,
    // B13: при Vn > 1 контактът — преди V1; иначе — най-късно при V1.
    momento: numero(vn) ? (vn > 1 ? 'prima' : 'alPiuTardi') : null,
  };
}
