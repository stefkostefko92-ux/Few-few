// Amounts in cents as the screens and documents write them: the number with the language's separators (makeFmt: the
// same text on the server and in the browser), the euro after it in Italian and Bulgarian, before it in English.
import { makeFmt } from './present/tr';

const SYMBOL: Readonly<Record<string, string>> = { eur: '€' };

export function money(cents: number, currency: string, locale: string): string {
  const n = makeFmt(locale)(cents / 100, 2), sym = SYMBOL[currency.toLowerCase()];
  if (!sym) return `${n} ${currency.toUpperCase()}`;
  return locale.startsWith('en') ? `${sym}${n}` : `${n} ${sym}`;
}
