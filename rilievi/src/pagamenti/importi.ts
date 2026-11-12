/**
 * Сумата за плащане на план (#31; условията 2026-11-12, чл. 12.1): цели центове, смятани на сървъра от плана —
 * цената е „IVA esclusa“; фирма в България плаща и 20 % български ДДС (половин цент — нагоре), фирма в друга
 * държава от ЕС — без ДДС, с обратно начисляване (чл. 196 от Директива 2006/112/ЕО). Редът за ДДС и фактурите
 * го потвърждава Данъчника.
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

/** ДДС номерът: италиански с 11 цифри (с „IT“ или без) или от друга държава от ЕС; иначе null. */
export function partitaIvaDa(raw: unknown): { numero: string; paese: string } | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const v = raw.replace(/[\s.-]/g, '').toUpperCase();
  if (/^\d{11}$/.test(v)) return { numero: `IT${v}`, paese: 'IT' };
  const m = /^([A-Z]{2})([0-9A-Z]{2,13})$/.exec(v);
  if (!m || !UE.has(m[1]!)) return null;
  if (m[1] === 'IT' && !/^\d{11}$/.test(m[2]!)) return null;
  return { numero: v, paese: m[1]! };
}

export interface Importo {
  imponibile: number;
  iva: number;
  totale: number;
  regime: 'iva-bg' | 'inversione';
}

export function importoDi(prezzoCent: number, paese: string): Importo {
  if (paese !== 'BG') {
    return { imponibile: prezzoCent, iva: 0, totale: prezzoCent, regime: 'inversione' };
  }
  const iva = Math.floor((prezzoCent * ALIQUOTA_BG_BP + 5000) / 10000);
  return { imponibile: prezzoCent, iva, totale: prezzoCent + iva, regime: 'iva-bg' };
}
