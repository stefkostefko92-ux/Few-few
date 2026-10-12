// Amounts in cents as the screens and documents write them: the number with the Italian separators (makeFmt: the same
// text on the server and in the browser) and the euro after it with a no-break space (the EU Interinstitutional Style
// Guide for Italian).
import { makeFmt } from './present/tr';

const SYMBOL: Readonly<Record<string, string>> = { eur: '€' };

export function money(cents: number, currency: string, locale: string): string {
  const n = makeFmt(locale)(cents / 100, 2), sym = SYMBOL[currency.toLowerCase()];
  if (!sym) return `${n}\u00a0${currency.toUpperCase()}`;
  return `${n}\u00a0${sym}`;
}
