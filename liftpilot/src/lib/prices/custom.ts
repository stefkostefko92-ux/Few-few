// The company's free lines of the price list (voci a stesura libera): its own words and price, the basis that counts
// the quantity in each project — once (a corpo), by the stop, by the metre of travel — and the projects that take it
// (all, the whole projects, the machine replacements). Every project's cost adds them by itself. Pure.
import { z } from 'zod';
import type { BomLine } from './cost';
import { MAX_CENTS } from './cost';
import { PRICE_BASES, PRICE_SCOPES, type PriceBasisName, type PriceScopeName } from './groups';

export { CUSTOM_MAX, PRICE_BASES, PRICE_SCOPES, type PriceBasisName, type PriceScopeName } from './groups';

export interface CustomItem {
  id: string;
  text: string;
  cents: number;
  basis: PriceBasisName;
  scope: PriceScopeName;
}

/** A free line as the owner saves it. */
export const customRowSchema = z.object({
  text: z.string().trim().min(1).max(120),
  cents: z.number().int().min(0).max(MAX_CENTS),
  basis: z.enum(PRICE_BASES),
  scope: z.enum(PRICE_SCOPES),
}).strict();

export const customKey = (id: string): string => `custom:${id}`;

/** The free lines a project of this kind takes, with their quantity by their basis; `stops` null when the project does
 *  not know them (a machine replacement): those by the stop are left out and named in `skipped`. */
export function customLines(items: readonly CustomItem[], kind: 'full' | 'replacement', basis: { stops: number | null; travel: number }): { lines: BomLine[]; skipped: string[] } {
  const lines: BomLine[] = [], skipped: string[] = [];
  for (const i of items) {
    if (i.scope !== 'ALL' && i.scope !== (kind === 'full' ? 'FULL' : 'REPLACEMENT')) continue;
    const label = { item: 'custom', name: i.text }, key = customKey(i.id);
    if (i.basis === 'LOT') lines.push({ key, label, qty: 1, unit: 'lot' });
    else if (i.basis === 'TRAVEL') lines.push({ key, label, qty: Math.round(basis.travel * 10) / 10, unit: 'm' });
    else if (basis.stops === null) skipped.push(i.text);
    else lines.push({ key, label, qty: basis.stops, unit: 'stop' });
  }
  return { lines, skipped };
}

/** The prices of the free lines, by their key [cents]. */
export const customPrices = (items: readonly CustomItem[]): [string, number][] => items.map((i) => [customKey(i.id), i.cents]);
