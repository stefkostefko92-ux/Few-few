// A company's prices and what a bill of materials costs with them: the price of every article is the company's own, or
// the one it starts from (Panev's list), or none; a line without a price is counted, never guessed. Amounts in cents.
// And the price as the owner types it, in the language's way of writing numbers. Pure.
import { PRICE_ARTICLES, priceArticle, type ArticleLabel, type PriceUnit } from './articles';

/** The company's prices by key [cents]. */
export type PriceMap = ReadonlyMap<string, number>;

/** The prices in force: every article's start, replaced by the company's own. */
export function pricesOf(own: readonly { key: string; cents: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of PRICE_ARTICLES) if (a.start) m.set(a.key, a.start.cents);
  for (const p of own) if (priceArticle(p.key)) m.set(p.key, p.cents);
  return m;
}

/** A line of a project's bill: the article of the list (null: none of the list fits, e.g. a machine entered by hand). */
export interface BomLine {
  key: string | null;
  label: ArticleLabel;
  qty: number;
  unit: PriceUnit;
}

export interface CostLine extends BomLine {
  /** price per unit and amount [cents]; null: not in the list */
  unitCents: number | null;
  cents: number | null;
}

export interface Cost {
  lines: CostLine[];
  /** the priced lines' total [cents] */
  total: number;
  /** lines without a price: the total leaves them out */
  missing: number;
}

export function costOf(bom: readonly BomLine[], prices: PriceMap): Cost {
  const lines = bom.map((l): CostLine => {
    const unitCents = l.key === null ? null : prices.get(l.key) ?? null;
    return { ...l, unitCents, cents: unitCents === null ? null : Math.round(unitCents * l.qty) };
  });
  return { lines, total: lines.reduce((s, l) => s + (l.cents ?? 0), 0), missing: lines.filter((l) => l.cents === null).length };
}

/** The highest price the list takes [cents]: ten million euro. */
export const MAX_CENTS = 1_000_000_000;

/**
 * A price as typed [cents]: digits with up to two decimals, the decimal comma or point, thousands grouped by the
 * language's separator (Italian and Bulgarian "1.234,50" or "1 234,50", English "1,234.50"), an optional euro sign.
 * Empty: null (no price). Anything else, or above MAX_CENTS: undefined.
 */
export function parseCents(raw: string, locale: string): number | null | undefined {
  const s = raw.replace(/[\s\u00a0\u202f€]/g, '');
  if (!s) return null;
  const en = locale.startsWith('en');
  let x: string | null = null;
  if (en && /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) x = s.replace(/,/g, '');
  else if (!en && /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) x = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+([.,]\d{1,2})?$/.test(s)) x = s.replace(',', '.');
  if (x === null) return undefined;
  const cents = Math.round(Number(x) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_CENTS ? cents : undefined;
}
