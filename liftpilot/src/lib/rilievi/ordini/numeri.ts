// The values the sheet and the modules share, read the Italian way: «1.000» is a thousand, «1,6» and «1.6» are the same,
// the units do not count («400 V» = «400»); two lines for one thing («LUCE PORTA: [800] x [2000]») and back. Pure and
// light: the server's rules (collegati.ts) and the browser's (collegati-client.ts) use these same functions — rilievi kept
// one copy in src/ordini/collegati.ts and one in public/js/valori.js (commit 988f3cf37).

const NUMERO = /[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;
const MIGLIAIA = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;

/** The numbers in the text, the Italian way: «1.000» is a thousand, «1,6» and «1.6» are the same, units do not matter. */
export function numeriDi(text: string): number[] {
  return Array.from(text.matchAll(NUMERO), ([token]) => Number(MIGLIAIA.test(token) ? token.replace(/\./g, '').replace(',', '.') : token.replace(',', '.')));
}

/** The two lines of one thing («LUCE PORTA: [800] x [2000]») as one value; without a width — nothing. */
export function coppiaDi(larghezza: string, altezza: string): string {
  if (!larghezza) return '';
  return altezza ? `${larghezza} x ${altezza}` : larghezza;
}

/** The reverse: the value's numbers in the two lines («800x2000 mm» → 800 and 2000); more than two — nothing. */
export function dividiCoppia(value: string): readonly [string, string] | null {
  const parti = value.match(NUMERO) ?? [];
  const [first, second = ''] = parti;
  if (first === undefined || parti.length > 2) return null;
  return [first, second];
}

const normale = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** One and the same value: the same numbers in the same order, and a text without numbers — the same text. */
export function stessoValore(a: string, b: string): boolean {
  const na = numeriDi(a);
  const nb = numeriDi(b);
  if (na.length > 0 || nb.length > 0) return na.length === nb.length && na.every((n, i) => Math.abs(n - (nb[i] ?? Number.NaN)) < 1e-9);
  return normale(a) === normale(b);
}
