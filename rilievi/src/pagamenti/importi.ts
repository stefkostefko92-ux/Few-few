/**
 * Сумата за плащане на план (#31; условията 2026-11-14, чл. 12.1 и 12.10): цели центове, смятани на сървъра от
 * плана — цената е „IVA esclusa“. Три режима (`REGIMI`): фирма в България — 20 % български ДДС (половин цент —
 * нагоре); фирма в друга държава от ЕС с ДДС номер, валиден във VIES — без ДДС, с обратно начисляване (чл. 196
 * от Директива 2006/112/ЕО); фирма в друга държава от ЕС, чийто номер НЕ е валиден във VIES — третира се като
 * данъчно незадължено лице (чл. 18 Регл. 282/2011) и плаща 20 % български ДДС, докато тези продажби са под
 * прага по чл. 59в от Директивата (pagamenti/soglia.ts). Подготвен казус — Данъчника; не е данъчен съвет.
 */
export const ALIQUOTA_BG_BP = 2000;

/** Държавите от ЕС (кодът в ДДС номера; Гърция — EL). */
const UE = new Set([
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'EL',
  'ES',
  'FI',
  'FR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
]);

/**
 * Контролната цифра на италианския P. IVA (11 цифри, алгоритъм на Luhn): хваща сбърканата или разменена цифра,
 * преди да стигне до фактурата. Не доказва, че номерът съществува — това е VIES (чл. 18 Регл. 282/2011).
 */
export function partitaIvaItValida(cifre: string): boolean {
  if (!/^\d{11}$/.test(cifre)) return false;
  let somma = 0;
  for (let i = 0; i < 10; i += 1) {
    const c = cifre.charCodeAt(i) - 48;
    const v = i % 2 === 0 ? c : c * 2;
    somma += v > 9 ? v - 9 : v;
  }
  return (10 - (somma % 10)) % 10 === cifre.charCodeAt(10) - 48;
}

/** ДДС номерът: италиански с 11 цифри (с „IT“ или без) или от друга държава от ЕС; иначе null. */
export function partitaIvaDa(raw: unknown): { numero: string; paese: string } | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const v = raw.replace(/[\s.-]/g, '').toUpperCase();
  if (/^\d{11}$/.test(v)) return partitaIvaItValida(v) ? { numero: `IT${v}`, paese: 'IT' } : null;
  const m = /^([A-Z]{2})([0-9A-Z]{2,13})$/.exec(v);
  if (!m || !UE.has(m[1]!)) return null;
  if (m[1] === 'IT' && !partitaIvaItValida(m[2]!)) return null;
  return { numero: v, paese: m[1]! };
}

/** Режимите на ДДС, както се пазят в `Pagamento.regimeIva`. */
export const REGIMI = ['iva-bg', 'inversione', 'iva-bg-ue'] as const;
export type Regime = (typeof REGIMI)[number];

/** Начислен ли е български ДДС върху цената (връщането и кредитното известие го носят). */
export const conIva = (regime: string): boolean => regime === 'iva-bg' || regime === 'iva-bg-ue';

/** Ключът на етикета на режима за счетоводството (`pagamenti.mail.regime.<ключ>`). */
export const chiaveRegime = (regime: string): 'ivaBg' | 'ivaBgUe' | 'inversione' =>
  regime === 'iva-bg' ? 'ivaBg' : regime === 'iva-bg-ue' ? 'ivaBgUe' : 'inversione';

export interface Importo {
  imponibile: number;
  iva: number;
  totale: number;
  regime: Regime;
}

/** Български ДДС върху сума без ДДС (половин цент — нагоре). */
export const ivaSu = (imponibileCent: number): number =>
  Math.floor((imponibileCent * ALIQUOTA_BG_BP + 5000) / 10000);

/**
 * `senzaVies`: номерът на фирма от друга държава от ЕС не е валиден във VIES — 20 % български ДДС в свой режим
 * (`iva-bg-ue`). За български номер няма значение: той е винаги `iva-bg`.
 */
export function importoDi(prezzoCent: number, paese: string, senzaVies = false): Importo {
  if (paese !== 'BG' && !senzaVies)
    return { imponibile: prezzoCent, iva: 0, totale: prezzoCent, regime: 'inversione' };
  const iva = ivaSu(prezzoCent);
  return {
    imponibile: prezzoCent,
    iva,
    totale: prezzoCent + iva,
    regime: paese === 'BG' ? 'iva-bg' : 'iva-bg-ue',
  };
}
