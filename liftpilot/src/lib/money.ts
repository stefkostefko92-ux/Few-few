// Amounts in cents as the screens and documents write them: the number with the language's separators (makeFmt: the
// same text on the server and in the browser), the euro after it with a no-break space in Italian and Bulgarian, before
// it in English (the EU Interinstitutional Style Guide: before only in English, Dutch, Irish and Maltese).
import { makeFmt } from './present/tr';

const SYMBOL: Readonly<Record<string, string>> = { eur: '€' };

export function money(cents: number, currency: string, locale: string): string {
  const n = makeFmt(locale)(cents / 100, 2), sym = SYMBOL[currency.toLowerCase()];
  if (!sym) return `${n}\u00a0${currency.toUpperCase()}`;
  return locale.startsWith('en') ? `${sym}${n}` : `${n}\u00a0${sym}`;
}
