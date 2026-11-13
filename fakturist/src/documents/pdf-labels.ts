/**
 * Езикът на PDF копието (XML-ът е без език). „Български“ или „Български и английски“ (двуезичен) —
 * документите на фирмата са на български (ЗСч, чл. 5, ал. 1); английският е до българския, никога вместо
 * него. Казусът — Данъчника, 13.11.2026. Ключът е българският текст; липсващ превод → само българският.
 */
export const PDF_LANGUAGES = ['bg', 'bg-en'] as const;
export type PdfLanguage = (typeof PDF_LANGUAGES)[number];

export function isPdfLanguage(value: unknown): value is PdfLanguage {
  return typeof value === 'string' && (PDF_LANGUAGES as readonly string[]).includes(value);
}

const EN: Record<string, string> = {
  // Заглавия (UNTDID 1001)
  ФАКТУРА: 'INVOICE',
  'КРЕДИТНО ИЗВЕСТИЕ': 'CREDIT NOTE',
  'ДЕБИТНО ИЗВЕСТИЕ': 'DEBIT NOTE',
  'КОРИГИРАЩА ФАКТУРА': 'CORRECTED INVOICE',
  'АВАНСОВА ФАКТУРА': 'PREPAYMENT INVOICE',
  САМОФАКТУРА: 'SELF-BILLED INVOICE',
  'ПРОФОРМА ФАКТУРА': 'PRO FORMA INVOICE',
  ДОКУМЕНТ: 'DOCUMENT',
  // Дати и страни
  'Дата на издаване': 'Issue date',
  'Дата на данъчното събитие': 'Date of supply',
  Падеж: 'Due date',
  'Срок за плащане': 'Payment due by',
  'Към фактура': 'Invoice reference',
  Доставчик: 'Supplier',
  Получател: 'Customer',
  ЕИК: 'UIC',
  'ДДС №': 'VAT No.',
  // Редовете
  'Стока или услуга': 'Item',
  Мярка: 'Unit',
  'Кол.': 'Qty',
  'Ед. цена': 'Unit price',
  'Отст.': 'Disc.',
  ДДС: 'VAT',
  Стойност: 'Amount',
  // Тотали
  'РАЗБИВКА ПО ДДС': 'VAT BREAKDOWN',
  основа: 'taxable',
  Основание: 'Reason',
  'Сума на редовете': 'Lines total',
  Отстъпки: 'Allowances',
  Надбавки: 'Charges',
  'Данъчна основа': 'Taxable amount',
  'ДДС в евро': 'VAT in EUR',
  'Обща сума': 'Total',
  'Платено авансово': 'Prepaid',
  'За плащане': 'Amount due',
  // Плащане
  'Начин на плащане': 'Payment method',
  Условия: 'Terms',
  'в брой': 'cash',
  'банков превод': 'bank transfer',
  'дебитен превод': 'debit transfer',
  'по банкова сметка': 'to bank account',
  'банкова карта': 'bank card',
  'директен дебит': 'direct debit',
  'постоянно нареждане': 'standing order',
  'онлайн плащане': 'online payment',
  прихващане: 'clearing',
  // Мерки
  'бр.': 'pcs',
  ч: 'h',
  ден: 'day',
  'седм.': 'wk',
  'мес.': 'mo',
  'год.': 'yr',
  мин: 'min',
  кг: 'kg',
  г: 'g',
  т: 't',
  м: 'm',
  км: 'km',
  л: 'l',
  'компл.': 'set',
  чифт: 'pair',
  общо: 'lump sum',
  услуга: 'service',
};

/** Бележката на проформата — тя не е данъчен документ (ЗДДС); фактурата идва при плащането или доставката. */
export const PROFORMA_NOT_TAX =
  'Проформата не е данъчен документ по ЗДДС. Фактурата се издава при плащането или доставката.';
EN[PROFORMA_NOT_TAX] =
  'This pro forma invoice is not a tax document. The invoice is issued upon payment or delivery.';

/**
 * Надписът на избрания език: „bg“ — българският; „bg-en“ — „български / english“ (с `sep` — например
 * нов ред в главата на таблицата). Мерките с еднакъв запис (м², кг…) не се повтарят.
 */
export function labeler(lang: PdfLanguage) {
  return (bg: string, sep = ' / '): string => {
    if (lang === 'bg') return bg;
    const en = EN[bg];
    return en && en !== bg ? `${bg}${sep}${en}` : bg;
  };
}

/** Английският превод на надпис (за подзаглавието на двуезичния PDF); липсва или е същият — null. */
export function englishOf(bg: string): string | null {
  const en = EN[bg];
  return en && en !== bg ? en : null;
}

/** Изречението за пълномощното (чл. 113, ал. 7 ЗДДС) — на български, при двуезичния и на английски. */
export function issuedViaText(lang: PdfLanguage, firm: string, ref: string): string {
  const bg = `Издаден от ${firm} от името на доставчика по пълномощно: ${ref} (чл. 113, ал. 7 ЗДДС)`;
  return lang === 'bg'
    ? bg
    : `${bg}\nIssued by ${firm} on behalf of the supplier under mandate: ${ref} (Art. 113(7) VAT Act)`;
}
