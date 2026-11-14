import { toCents, type Dec } from '../einvoice/decimal.js';

/**
 * Общото на дневниците по ДДС (Приложение № 12 към чл. 113, ал. 4 ППЗДДС) — PRODAGBI.TXT и POKUPKI.TXT:
 * полета с фиксирана дължина без разделители; символните — вляво, допълнени с интервали; цифровите — вдясно;
 * датата — дд/мм/гггг; сумите с „.“ и два знака, минус при отрицателна стойност.
 */
/**
 * Нулевата ставка по чл. 140, 146, ал. 1 и 173 ЗДДС — своето поле (02-16) и свой код в SAF-T (100216).
 * Краят на номера е изричен: `\b` в JS не познава кирилицата и би приел „чл. 140а“ за чл. 140.
 */
export const ZERO_RATE_SPECIAL = /чл\.\s*(140|146|173)(?![0-9а-яА-Яa-zA-Z])/i;

/** Обратно начисляване при услуги по чл. 21, ал. 2 ЗДДС — поле 02-17, код 100217 (SAF-T). */
export const EU_SERVICES_ART_21_2 = /чл\.\s*21,?\s*ал\.\s*2(?![0-9])/i;
/** Доставки по чл. 69, ал. 2 ЗДДС (място на изпълнение в друга държава) — поле 02-18, код 100218. */
export const PLACE_ABROAD_ART_69_2 = /чл\.\s*69,?\s*ал\.\s*2(?![0-9])/i;
/** Обратно начисляване по чл. 163а ЗДДС — в PRODAGBI има само кодово поле 02-27 (сумата — за ръчно). */
export const DOMESTIC_REVERSE_163A = /чл\.\s*163[аa](?![0-9а-яА-Яa-zA-Z])/i;

/** Частта от Приложение № 2 ЗДДС в основанието по чл. 163а; null — не е посочена. */
export function annex2Part(reason: string | undefined): 'I' | 'II' | null {
  const match = /част\s+(II|I)(?![IVX])/i.exec(reason ?? '');
  return match ? (match[1]!.toUpperCase() as 'I' | 'II') : null;
}

/**
 * Основанието за категорията: от разбивката (BT-120), иначе от основанието на документа. При нулева
 * ставка (Z) EN 16931 не допуска BT-120 в разбивката (BR-Z-10) — текстът е само в основанието на документа
 * (и в бележката BT-22), затова без втория източник чл. 140/146/173 никога не би се разпознал.
 */
export function exemptionReasonFor(
  category: string,
  breakdownReason: string | undefined,
  exemptions: ReadonlyArray<{ category: string; reason?: string | undefined }>,
): string {
  return breakdownReason ?? exemptions.find((e) => e.category === category)?.reason ?? '';
}

export const NO_ID = '999999999999999';

/** Вид на документа (02-04): фактура и авансова фактура — 01, дебитно — 02, кредитно — 03. */
export const DOCUMENT_KIND: Record<string, string> = {
  '380': '01',
  '386': '01',
  '383': '02',
  '381': '03',
};

/** По знаци (code points), не по UTF-16 единици: знак извън BMP е един байт в cp1251 („?“), не два. */
export const text = (value: string, length: number) => {
  const chars = [...value.replace(/[\r\n\t]+/g, ' ')].slice(0, length);
  return chars.join('') + ' '.repeat(length - chars.length);
};
export const digits = (value: number | bigint | string, length: number) =>
  String(value).padStart(length, ' ');

export function amountText(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Ширината на полетата за суми в двата дневника. */
export const AMOUNT_WIDTH = 15;

/**
 * Сумите на един запис, вдясно в 15 знака; null — някоя не се побира (над 999 999 999 999.99 или под
 * −99 999 999 999.99). Тогава документът е за ръчно вписване: отрязана сума би била грешна сума.
 */
export function amountCells(values: readonly bigint[]): string | null {
  const cells: string[] = [];
  for (const value of values) {
    const shown = amountText(value);
    if (shown.length > AMOUNT_WIDTH) return null;
    cells.push(shown.padStart(AMOUNT_WIDTH, ' '));
  }
  return cells.join('');
}

export function dayText(date: Date): string {
  const [y, m, d] = date.toISOString().slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export const cents = (value: Dec | null) => (value ? toCents(value) : 0n);

export function counterpartyId(buyer: {
  vatId?: string | undefined;
  legalId?: string | undefined;
  address: { countryCode: string };
}): string {
  if (buyer.vatId) return buyer.vatId.replace(/\s+/g, '').slice(0, 15);
  // Неregистриран по ДДС в България — ЕИК (§ 1 от ДР на ППЗДДС); чуждестранно лице без номер — 9-ки.
  if (buyer.address.countryCode === 'BG' && buyer.legalId) return buyer.legalId.slice(0, 15);
  return NO_ID;
}
