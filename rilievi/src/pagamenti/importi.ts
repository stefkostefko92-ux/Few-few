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
