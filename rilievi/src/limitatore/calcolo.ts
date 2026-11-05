/**
 * Изчислението за ограничителя на скоростта (собственикът, 5 ноември 2026 — от своя
 * „Limitatore_velocita_EN81-20-2020.xlsx“, листът „Limitatore“): формулите на клетките B5–B27 една към
 * една, с особеностите на файла. Всяка проверка е отделна: липсващо число дава „Dato mancante“ само на
 * своя ред, както в листа. Без база — тества се само (tests/limitatore-*.test.ts: 27-те случая от листа
 * „Test“ и случаите, сметнати в самия файл).
 *
 * `ISNUMBER` на листа е `numero()` тук: празно, текст и NaN не са число. Сравненията и закръглянията са
 * като в електронната таблица — числото се взима с 15 значещи цифри (249 / 8,3 е 30, не 29,999…996).
 */

export const TIPI_PARACADUTE = ['progressivo', 'istantaneo', 'rulli'] as const;
export type TipoParacadute = (typeof TIPI_PARACADUTE)[number];

/** Входът — жълтите клетки на листа (B2, B3, B7, B12, B16, B18, B21, B24, B25); празно — null. */
export interface DatiLimitatore {
  /** B2 — номиналната скорост Vn (m/s). */
  vn: number | null;
  /** B3 — видът на парашута на кабината. */
  tipo: TipoParacadute | null;
  /** B7 — настроената V1 (от табелата или сертификата, m/s). */
  v1: number | null;
  /** B12 — скоростта на контакта Vc (m/s). */
  vc: number | null;
  /** B16 — силата, която задейства парашута (N). */
  forzaParacadute: number | null;
  /** B18 — силата, която ограничителят дава във въжето (N). */
  forzaLimitatore: number | null;
  /** B21 — минималното разрушително усилие на въжето MBL (N). */
  mbl: number | null;
  /** B24 — номиналният диаметър на въжето d (mm). */
  d: number | null;
  /** B25 — диаметърът на ролката Dp (mm). */
  dp: number | null;
}

export type SogliaMassima = number | 'vnNonValida' | 'nonAmmesso' | 'tipoNonValido';
export type EsitoV1 = 'mancante' | 'entro' | 'fuori';
export type EsitoContatto = 'mancante' | 'coerente' | 'fuori';
export type Esito = 'mancante' | 'sufficiente' | 'insufficiente';

export interface RisultatoLimitatore {
  /** B5 — праг отдолу (включен): 115 % от Vn; празно, ако горният не е число. */
  sogliaMin: number | null;
  /** B6 — праг отгоре (изключен), или защо го няма. */
  sogliaMax: SogliaMassima;
  /** B8 */
  esitoV1: EsitoV1;
  /** B9 — първата стойност с 2 знака не под долния праг. */
  min2: number | null;
  /** B10 — последната стойност с 2 знака под горния праг (Vn = 1,6: 2,15, не 2,16). */
  max2: number | null;
  /** B13 — кога трябва да действа контактът; празно без Vn. */
  momento: 'prima' | 'alPiuTardi' | null;
  /** B14 */
  esitoContatto: EsitoContatto;
  /** B17 — max(300 N, 2 × силата на парашута). */
  forzaMinima: number | 'mancante';
  /** B19 */
  esitoForza: Esito;
  /** B22 — 8 × силата на ограничителя. */
  mblMinimo: number | 'mancante';
  /** B23 */
  esitoMbl: Esito;
  /** B26 — Dp / d. */
  rapporto: number | 'mancante';
  /** B27 — Dp ≥ 30 × d. */
  esitoRapporto: Esito;
}

/** `ISNUMBER` на листа: само крайно число (празно, текст, NaN — не). */
export const numero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Числото с 15 значещи цифри — колкото пази и сравнява електронната таблица. */
const quindici = (x: number): number => Number(x.toPrecision(15));
const ge = (a: number, b: number) => quindici(a) >= quindici(b);
const lt = (a: number, b: number) => quindici(a) < quindici(b);
const le = (a: number, b: number) => quindici(a) <= quindici(b);

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

/** „Sufficiente“, ако `valore` ≥ `minimo`; без едно от двете — „Dato mancante“ (B19, B23). */
const confronto = (valore: unknown, minimo: unknown): Esito =>
  !numero(valore) || !numero(minimo)
    ? 'mancante'
    : ge(valore, minimo)
      ? 'sufficiente'
      : 'insufficiente';

export function calcolaLimitatore(d: DatiLimitatore): RisultatoLimitatore {
  const { vn, v1, vc } = d;
  const sogliaMax = sogliaMassima(vn, d.tipo);
  // B5: долният праг има смисъл само с горния (иначе празно).
  const sogliaMin = numero(sogliaMax) && numero(vn) ? vn * 1.15 : null;
  const esitoV1: EsitoV1 = !numero(v1)
    ? 'mancante'
    : numero(sogliaMax) && sogliaMin !== null && ge(v1, sogliaMin) && lt(v1, sogliaMax)
      ? 'entro'
      : 'fuori';
  const min2 = sogliaMin === null ? null : arrotondaSu(arrotonda(sogliaMin, 10), 2);
  const max2 = numero(sogliaMax)
    ? arrotonda(arrotondaSu(arrotonda(sogliaMax, 10), 2) - 0.01, 2)
    : null;

  // B13/B14: при Vn > 1 контактът — преди V1; иначе — най-късно при V1.
  const momento = numero(vn) ? (vn > 1 ? 'prima' : 'alPiuTardi') : null;
  const esitoContatto: EsitoContatto =
    !numero(vc) || !numero(v1) || !numero(vn)
      ? 'mancante'
      : (vn > 1 ? lt(vc, v1) : le(vc, v1))
        ? 'coerente'
        : 'fuori';

  const f = d.forzaParacadute;
  const forzaMinima = numero(f) && f > 0 ? Math.max(300, 2 * f) : 'mancante';
  const fl = d.forzaLimitatore;
  const mblMinimo = numero(fl) && fl > 0 ? 8 * fl : 'mancante';
  const rapporto = numero(d.d) && numero(d.dp) && d.d > 0 ? d.dp / d.d : 'mancante';

  return {
    sogliaMin,
    sogliaMax,
    esitoV1,
    min2,
    max2,
    momento,
    esitoContatto,
    forzaMinima,
    esitoForza: confronto(fl, forzaMinima),
    mblMinimo,
    esitoMbl: confronto(d.mbl, mblMinimo),
    rapporto,
    esitoRapporto: numero(rapporto)
      ? ge(rapporto, 30)
        ? 'sufficiente'
        : 'insufficiente'
      : 'mancante',
  };
}
