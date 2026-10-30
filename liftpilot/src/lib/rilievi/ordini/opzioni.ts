// The option of a module's drop-down list for a text of the sheet: the same word («Selcom» → «SELCOM»), otherwise the
// only option with the same numbers («24 V DC» → «24Vcc»; «220 V» is both «220mono» and «220tri» — none). The same is in
// the browser's rules (valori-client.ts optionFor). Ported 1:1 from rilievi (src/ordini/opzioni.ts, commit 988f3cf37).

const compatto = (value: string): string => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '');
const numeri = (value: string): number[] => (value.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));

export function opzioneDi(opzioni: readonly string[], value: string): string | null {
  const wanted = compatto(value);
  if (!wanted) return null;
  const same = opzioni.find((o) => compatto(o) === wanted);
  if (same) return same;
  const target = numeri(value);
  if (target.length === 0) return null;
  const matching = opzioni.filter((o) => {
    const own = numeri(o);
    return own.length === target.length && own.every((n, i) => n === target[i]);
  });
  return matching.length === 1 ? (matching[0] ?? null) : null;
}
