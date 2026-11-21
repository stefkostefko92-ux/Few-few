/**
 * Кодовите списъци на EN 16931, които ядрото ползва. Пълните списъци проверява официалният Schematron
 * (scripts/conformance/); тук са стойностите, които интерфейсът предлага, и формата на останалите.
 */

/** UNTDID 1001 — видът на документа (BT-3). 381 се пише като UBL CreditNote, останалите като Invoice. */
export const DOCUMENT_TYPES = ['380', '381', '383', '384', '386', '389'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Видовете, които изискват препратка към предходна фактура (чл. 115 ЗДДС; BG-3). */
export const NOTE_TYPES: readonly DocumentType[] = ['381', '383', '384'];

/** UNCL 5305 — категориите ДДС (BT-118, BT-151). */
export const VAT_CATEGORIES = ['S', 'Z', 'E', 'AE', 'K', 'G', 'O'] as const;
export type VatCategory = (typeof VAT_CATEGORIES)[number];

/** Категориите без начислен данък — изискват основание (BT-120/BT-121; чл. 114, ал. 1, т. 12 ЗДДС). */
export const ZERO_VAT_CATEGORIES: readonly VatCategory[] = ['Z', 'E', 'AE', 'K', 'G', 'O'];

/** Основание по подразбиране на VATEX за категориите, при които кодът е еднозначен. */
export const DEFAULT_VATEX: Partial<Record<VatCategory, string>> = {
  AE: 'VATEX-EU-AE',
  K: 'VATEX-EU-IC',
  G: 'VATEX-EU-G',
  O: 'VATEX-EU-O',
};

export const VATEX = /^VATEX-[A-Z]{2}-[A-Z0-9-]{1,12}$/;

/** UN/ECE Rec. 20 — мерните единици, които интерфейсът предлага (BT-130). */
export const COMMON_UNITS = [
  'C62',
  'H87',
  'HUR',
  'DAY',
  'WEE',
  'MON',
  'ANN',
  'MIN',
  'KGM',
  'GRM',
  'TNE',
  'MTR',
  'KMT',
  'MTK',
  'MTQ',
  'LTR',
  'KWH',
  'SET',
  'PR',
  'LS',
  'E48',
] as const;

export const UNIT_CODE = /^[A-Z0-9]{2,3}$/;

/** UNTDID 4461 — начин на плащане (BT-81). */
export const PAYMENT_MEANS = [
  '10',
  '30',
  '31',
  '42',
  '48',
  '49',
  '57',
  '58',
  '59',
  '68',
  '97',
] as const;

/** Начините с превод по сметка — изискват IBAN или номер на сметка (BR-61). */
export const CREDIT_TRANSFER_MEANS = ['30', '58'];

/** EAS — схемите на електронния адрес (BT-34, BT-49): 9926 = ДДС номер в България. */
export const EAS = /^[0-9A-Z]{2,4}$/;
export const EAS_BG_VAT = '9926';

const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

export function isCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code) && CURRENCIES.has(code);
}

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
/** Кодове, които ICU знае, но не са държави по ISO 3166-1; XI (Северна Ирландия) е позволен от EN 16931. */
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'ZZ']);

export function isCountry(code: string): boolean {
  if (code === 'XI') return true;
  if (!/^[A-Z]{2}$/.test(code) || NOT_COUNTRIES.has(code)) return false;
  return REGION_NAMES.of(code) !== undefined;
}
