import { LOCALE_TAG, type Locale } from '../i18n.js';

/**
 * Ценоразписът. Парите са ЦЕЛИ ЕВРОЦЕНТИ — никога float. Сумата се смята само тук, на сървъра;
 * нищо от клиента не определя цена. Основата е без ДДС; крайната цена за потребители е с ДДС.
 */
export const MONTHLY_CENTS = 2500;

/** Lifetime = 2,5 × годишната цена БЕЗ отстъпката за 12 месеца. */
export const LIFETIME_PERCENT_OF_YEAR = 250;

/** Същото правило като число за текста („2,5 пъти“) — витрината, условията, брошурата и llms.txt. */
export const LIFETIME_MULTIPLE = LIFETIME_PERCENT_OF_YEAR / 100;

/** Месеците на годината, от която се смята Lifetime. */
export const YEAR_MONTHS = 12;

/**
 * ДДС 20 % — българската ставка за всички потребители, от всяка държава в ЕС: фирмата е под прага от
 * 10 000 € за трансгранични продажби на потребители и не е в OSS, затова мястото на доставката е България
 * (чл. 59в от Директива 2006/112/ЕО). При минат праг или влизане в OSS ставката става по държавата на
 * потребителя — тогава това число и текстовете с него не важат.
 */
export const VAT_BG_PERCENT = 20;

export interface TermOption {
  id: 'm1' | 'm3' | 'm6' | 'm12';
  months: 1 | 3 | 6 | 12;
  discountPercent: number;
}

export const TERM_OPTIONS: readonly TermOption[] = [
  { id: 'm1', months: 1, discountPercent: 0 },
  { id: 'm3', months: 3, discountPercent: 5 },
  { id: 'm6', months: 6, discountPercent: 10 },
  { id: 'm12', months: 12, discountPercent: 20 },
];

export type OptionId = TermOption['id'] | 'lifetime';

const OPTION_IDS: readonly OptionId[] = ['m1', 'm3', 'm6', 'm12', 'lifetime'];

export function isOptionId(value: unknown): value is OptionId {
  return typeof value === 'string' && (OPTION_IDS as readonly string[]).includes(value);
}

/** Закръгляне до цял цент, половинката нагоре — само в края, не на междинните стъпки. */
function divideRoundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function termPriceCents(option: TermOption): number {
  return divideRoundHalfUp(MONTHLY_CENTS * option.months * (100 - option.discountPercent), 100);
}

export function lifetimePriceCents(): number {
  return divideRoundHalfUp(MONTHLY_CENTS * YEAR_MONTHS * LIFETIME_PERCENT_OF_YEAR, 100);
}

/**
 * Правилото за Lifetime в текстовете („{multiple} пъти годишната цена без отстъпката за {months}
 * месеца“) — от ценоразписа, не написано на ръка. Само за показ, затова дробното число е допустимо.
 */
export function lifetimeRuleParams(locale: Locale): { multiple: string; months: number } {
  return { multiple: formatLifetimeTimes(locale), months: YEAR_MONTHS };
}

export function perMonthCents(option: TermOption): number {
  return divideRoundHalfUp(termPriceCents(option), option.months);
}

export function optionPriceCents(id: OptionId): number {
  if (id === 'lifetime') return lifetimePriceCents();
  const option = TERM_OPTIONS.find((item) => item.id === id);
  if (!option) throw new Error(`Непознат вариант: ${id}`);
  return termPriceCents(option);
}

export function optionMonths(id: OptionId): number | null {
  return id === 'lifetime' ? null : (TERM_OPTIONS.find((item) => item.id === id)?.months ?? null);
}

export function withVatCents(cents: number): number {
  return divideRoundHalfUp(cents * (100 + VAT_BG_PERCENT), 100);
}

/** Само за показ: центовете стават низ с валута на езика на екрана. */
export function formatMoney(cents: number, locale: Locale): string {
  if (!Number.isInteger(cents)) throw new Error('Парите са цели центове');
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Само за показ: колко пъти годишната цена е Lifetime („2,5“ / „2.5“) — от константата, не на ръка. */
export function formatLifetimeTimes(locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], { maximumFractionDigits: 2 }).format(
    LIFETIME_MULTIPLE,
  );
}

export interface PriceRow {
  id: OptionId;
  months: number | null;
  discountPercent: number;
  totalCents: number;
  perMonthCents: number | null;
  totalWithVatCents: number;
  /** Месечната част от крайната цена (с ДДС) — за потребителите. */
  perMonthWithVatCents: number | null;
}

/** Целият ценоразпис за витрината и за страницата на плана. */
export function priceTable(): PriceRow[] {
  const terms: PriceRow[] = TERM_OPTIONS.map((option) => ({
    id: option.id,
    months: option.months,
    discountPercent: option.discountPercent,
    totalCents: termPriceCents(option),
    perMonthCents: perMonthCents(option),
    totalWithVatCents: withVatCents(termPriceCents(option)),
    perMonthWithVatCents: divideRoundHalfUp(withVatCents(termPriceCents(option)), option.months),
  }));
  return [
    ...terms,
    {
      id: 'lifetime',
      months: null,
      discountPercent: 0,
      totalCents: lifetimePriceCents(),
      perMonthCents: null,
      totalWithVatCents: withVatCents(lifetimePriceCents()),
      perMonthWithVatCents: null,
    },
  ];
}
