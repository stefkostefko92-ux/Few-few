/**
 * Изчислението за ограничителя на скоростта (собственикът, 5 ноември 2026 — от своя
 * „Limitatore_velocita_EN81-20-2020.xlsx“, листът „Limitatore“; 7 ноември — само скоростта и видът на
 * парашута, кратък резултат; 8 ноември — UNI 10411-1:2024, т. 18, uni-10411-1-2024.md:365):
 * между кои стойности се настройва V1 и кога действа контактът. Без база — tests/limitatore-calcolo.test.ts.
 *
 * Стойностите по норми (само точка, стойност и бележката на Асансьорчика — ../norme-ascensori):
 * - UNI EN 81-20:2020 — 5.6.2.1.2.1 (0,63 m/s), 5.6.2.2.1.1 a) (115 %; 0,80 / 1 / 1,5 m/s; 1,25·v + 0,25/v),
 *   5.6.2.2.1.6 a) (1 m/s) — uni-en-81-20-2020.md:670, :683, :688; клетките B5, B6, B9, B10, B13 на листа.
 * - UNI EN 81-1:1999/2008 — 9.8.2.1 (0,63 и 1 m/s), 9.9.1 (и 1,5 m/s за `ammortizzato`), 9.9.11.1 —
 *   uni-en-81-1-2008.md:412, :425, :443.
 * - UNI EN 81-1:1987 (D.M. 587/1987) — B 9.8.2.1, B 9.9.1, B 9.9.11.1 (при Vn ≤ 1 и VVVF: 115 % от Vn) —
 *   uni-10411-1-2008.md:800, :821, :848.
 * - D.P.R. 1497/1963, art. 32 (собственикът, 8 ноември 2026 — бележките го нямат): при Vn от 0,6 до
 *   1,5 m/s V1 ≤ 1,40·Vn (включен), без долен праг; извън тези скорости — изчисление няма. Сравнението
 *   с UNI 10411-1:2024 собственикът прави сам („in alcuni casi va in contrasto“).
 * - D.Lgt. 600/1945 — стойностите му не са в бележките: изчисление няма.
 *
 * `ISNUMBER` на листа е `numero()` тук: празно, текст и NaN не са число. Закръглянията са като в
 * електронната таблица — числото се взима с 15 значещи цифри.
 */

export const TIPI_PARACADUTE = ['progressivo', 'istantaneo', 'rulli', 'ammortizzato'] as const;
export type TipoParacadute = (typeof TIPI_PARACADUTE)[number];

/** Нормата, по която е монтирана уредбата (UNI 10411-1:2024, т. 15.17 и 18). */
export const NORME_IMPIANTO = [
  'en81-20-2020',
  'en81-1-1999',
  'en81-1-1987',
  'dpr-1497-1963',
  'dlgt-600-1945',
] as const;
export type NormaImpianto = (typeof NORME_IMPIANTO)[number];

/** Входът — B2 (Vn, m/s), B3 (видът на парашута на кабината) и нормата на уредбата. */
export interface DatiLimitatore {
  vn: number;
  tipo: TipoParacadute;
  norma: NormaImpianto;
}

export type SogliaMassima =
  | number
  | 'vnNonValida'
  | 'nonAmmesso'
  | 'nonAmmessoAmmortizzato'
  | 'tipoNonValido'
  | 'tipoNonPrevisto'
  | 'fuoriCampoDpr'
  | 'normaNonDisponibile';

export interface RisultatoLimitatore {
  /** B5 — праг отдолу (включен): 115 % от Vn; празно, ако горният не е число или нормата няма долен праг. */
  sogliaMin: number | null;
  /** B6 — праг отгоре (изключен; по D.P.R. 1497/1963 — включен), или защо го няма. */
  sogliaMax: SogliaMassima;
  /** Горният праг е включен („non maggiore“ — D.P.R. 1497/1963, art. 32). */
  maxIncluso: boolean;
  /** B9 — първата стойност с 2 знака не под долния праг. */
  min2: number | null;
  /**
   * B10 — последната стойност с 2 знака под горния праг (Vn = 1,6: 2,15, не 2,16); при включен праг —
   * последната не над него (`ROUNDDOWN`).
   */
  max2: number | null;
  /**
   * B13 — кога трябва да действа контактът; празно без Vn. `alPiuTardi1987` — UNI EN 81-1:1987 при
   * Vn ≤ 1: при V1 (скорост по честотата на мрежата) или най-късно при `contatto115` (VVVF).
   */
  momento: 'prima' | 'alPiuTardi' | 'alPiuTardi1987' | null;
  /** 1,15·Vn — само при `alPiuTardi1987`. */
  contatto115: number | null;
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

/** `ROUNDDOWN(x; n)` — към нулата. */
export function arrotondaGiu(x: number, n: number): number {
  const f = 10 ** n;
  return (Math.sign(x) * Math.floor(quindici(Math.abs(x) * f))) / f;
}

/** Нормите с моментален парашут с амортизиран ефект (EN 81-1). Без норма — като EN 81-20 (листът). */
const conAmmortizzato = (norma: unknown) => norma === 'en81-1-1999' || norma === 'en81-1-1987';

/** B6: горният праг по вида на парашута и нормата. */
function sogliaMassima(vn: unknown, tipo: unknown, norma: unknown): SogliaMassima {
  if (!numero(vn) || vn <= 0) return 'vnNonValida';
  if (norma === 'dlgt-600-1945') return 'normaNonDisponibile';
  // D.P.R. 1497/1963, art. 32: само за Vn от 0,6 до 1,5 m/s, всеки вид парашут.
  if (norma === 'dpr-1497-1963') return vn >= 0.6 && vn <= 1.5 ? 1.4 * vn : 'fuoriCampoDpr';
  if (tipo === 'progressivo') return vn <= 1 ? 1.5 : 1.25 * vn + 0.25 / vn;
  if (tipo === 'ammortizzato') {
    if (!conAmmortizzato(norma)) return 'tipoNonPrevisto';
    return vn <= 1 ? 1.5 : 'nonAmmessoAmmortizzato';
  }
  if (tipo === 'istantaneo' || tipo === 'rulli') {
    if (vn > 0.63) return 'nonAmmesso';
    return tipo === 'rulli' ? 1 : 0.8;
  }
  return 'tipoNonValido';
}

export function calcolaLimitatore(d: DatiLimitatore): RisultatoLimitatore {
  const { vn, norma } = d;
  const dpr = norma === 'dpr-1497-1963';
  const sogliaMax = sogliaMassima(vn, d.tipo, norma);
  // B5: долният праг има смисъл само с горния (иначе празно); D.P.R. 1497/1963 долен праг няма.
  const sogliaMin = numero(sogliaMax) && numero(vn) && !dpr ? vn * 1.15 : null;
  // B13 (EN 81-20 и EN 81-1:1999/2008); EN 81-1:1987 при Vn ≤ 1 — и таванът 115 % за VVVF; D.P.R.
  // 1497/1963 — правило за контакта не е дадено.
  const momento =
    !numero(vn) || dpr
      ? null
      : vn > 1
        ? 'prima'
        : norma === 'en81-1-1987'
          ? 'alPiuTardi1987'
          : 'alPiuTardi';
  const max2 = !numero(sogliaMax)
    ? null
    : dpr
      ? arrotondaGiu(arrotonda(sogliaMax, 10), 2)
      : arrotonda(arrotondaSu(arrotonda(sogliaMax, 10), 2) - 0.01, 2);
  return {
    sogliaMin,
    sogliaMax,
    maxIncluso: dpr,
    min2: sogliaMin === null ? null : arrotondaSu(arrotonda(sogliaMin, 10), 2),
    max2,
    momento,
    contatto115: momento === 'alPiuTardi1987' ? vn * 1.15 : null,
  };
}
