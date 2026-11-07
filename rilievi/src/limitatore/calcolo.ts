/**
 * Изчислението за ограничителя на скоростта (собственикът, 5 ноември 2026 — от своя
 * „Limitatore_velocita_EN81-20-2020.xlsx“, листът „Limitatore“; 7 ноември — само скоростта и видът на
 * парашута, кратък резултат, после нормата при монтажа и „Cosa si modifica“ — всички точки за смяната в
 * бележките): между кои стойности се настройва V1 и кога действа контактът. Без база —
 * tests/limitatore-calcolo.test.ts и tests/limitatore-norme.test.ts.
 *
 * По коя норма са границите (само точка и бележката на Асансьорчика):
 * - преди CE (UNI 10411-1:2024): само нов ограничител — нормата при монтажа (18, uni-10411-1-2024.md:365;
 *   бележка 9 — D.Lgt. 600/1945, D.P.R. 1497/1963, D.M. 587/1987); и нов парашут — UNI EN 81-20:2020
 *   (6.7, :105); Vn нагоре над 5 % — UNI EN 81-20:2020 (15.1, 15.13, :298, :317); контактите при нов
 *   ограничител — винаги UNI EN 81-20:2020, 5.6.2.2.1 (18, 15.13, 6.7).
 * - CE (UNI 10411-11:2024): като оригинала (18, uni-10411-11-2024.md:288; 6.7, :117; 15 f), :252).
 * - Vn надолу над 5 % — пак нормата при монтажа (UNI 10411-1:2024, 15.16–15.17, :320, :324): като „само
 *   нов ограничител“, затова отделен избор няма.
 *
 * Стойностите по норми (само точка, стойност и бележката на Асансьорчика — ../norme-ascensori):
 * - UNI EN 81-20:2020 — 5.6.2.1.2.1 (0,63 m/s), 5.6.2.2.1.1 a) (115 %; 0,80 / 1 / 1,5 m/s; 1,25·v + 0,25/v),
 *   5.6.2.2.1.6 a) (1 m/s) — uni-en-81-20-2020.md:670, :683, :688; клетките B5, B6, B9, B10, B13 на листа.
 * - UNI EN 81-1:1999/2008 — 9.8.2.1 (0,63 и 1 m/s), 9.9.1 (и 1,5 m/s за `ammortizzato`), 9.9.11.1 —
 *   uni-en-81-1-2008.md:412, :425, :443.
 * - UNI EN 81-1:1987 (D.M. 587/1987) — B 9.8.2.1, B 9.9.1 — uni-10411-1-2008.md:800, :821 (контактът по
 *   B 9.9.11.1, :848, не важи за нов ограничител — 18 иска 5.6.2.2.1 на UNI EN 81-20:2020).
 * - D.P.R. 1497/1963, art. 32 (собственикът, 7 ноември 2026 — бележките го нямат): при Vn от 0,6 до
 *   1,5 m/s V1 ≤ 1,40·Vn (включен), без долен праг; извън тези скорости — изчисление няма. Сравнението
 *   с UNI 10411-1:2024 собственикът прави сам („in alcuni casi va in contrasto“).
 * - D.Lgt. 600/1945 — стойностите му не са в бележките: изчисление няма.
 *
 * `ISNUMBER` на листа е `numero()` тук: празно, текст и NaN не са число. Закръглянията са като в
 * електронната таблица — числото се взима с 15 значещи цифри.
 */

export const TIPI_PARACADUTE = ['progressivo', 'istantaneo', 'rulli', 'ammortizzato'] as const;
export type TipoParacadute = (typeof TIPI_PARACADUTE)[number];

/** Нормата, по която е монтирана уредбата (UNI 10411-1:2024, т. 15.17 и 18, бележки 8 и 9). */
export const NORME_IMPIANTO = [
  'en81-20-2020',
  'en81-1-1999',
  'en81-1-1987',
  'dpr-1497-1963',
  'dlgt-600-1945',
] as const;
export type NormaImpianto = (typeof NORME_IMPIANTO)[number];

/** Какво се сменя заедно с ограничителя (UNI 10411-1:2024, т. 18, 6.7 и 15.13). */
export const INTERVENTI = ['limitatore', 'paracadute', 'velocita'] as const;
export type Intervento = (typeof INTERVENTI)[number];

/** Входът — B2 (Vn, m/s), B3 (видът на парашута на кабината), нормата на уредбата и какво се сменя. */
export interface DatiLimitatore {
  vn: number;
  tipo: TipoParacadute;
  norma: NormaImpianto;
  intervento: Intervento;
}

/** Уредба отпреди UNI EN 81-1:1999 — за нея е UNI 10411-1:2024; за CE — UNI 10411-11:2024. */
export const primaDelCe = (norma: unknown): boolean =>
  norma === 'en81-1-1987' || norma === 'dpr-1497-1963' || norma === 'dlgt-600-1945';

/**
 * По коя норма са границите: преди CE с нов парашут (6.7) или с Vn нагоре над 5 % (15.13) — UNI EN
 * 81-20:2020; иначе — нормата при монтажа (18; при CE — оригиналът).
 */
export function normaDeiLimiti(d: Pick<DatiLimitatore, 'norma' | 'intervento'>): NormaImpianto {
  return primaDelCe(d.norma) && (d.intervento === 'paracadute' || d.intervento === 'velocita')
    ? 'en81-20-2020'
    : d.norma;
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
   * B13 — кога трябва да действа контактът; празно без Vn. Едно и също правило за всички норми: UNI EN
   * 81-20:2020, 5.6.2.2.1.6 a) = UNI EN 81-1:1999/2008, 9.9.11.1, а преди CE новият ограничител взима
   * контактите от UNI EN 81-20:2020 (UNI 10411-1:2024, т. 18).
   */
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
  const { vn } = d;
  const norma = normaDeiLimiti(d);
  const dpr = norma === 'dpr-1497-1963';
  const sogliaMax = sogliaMassima(vn, d.tipo, norma);
  // B5: долният праг има смисъл само с горния (иначе празно); D.P.R. 1497/1963 долен праг няма.
  const sogliaMin = numero(sogliaMax) && numero(vn) && !dpr ? vn * 1.15 : null;
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
    momento: !numero(vn) ? null : vn > 1 ? 'prima' : 'alPiuTardi',
  };
}
