/**
 * Опцията на падащ списък на модул за текст от картата: същата дума („Selcom“ → „SELCOM“), иначе
 * единствената опция със същите числа („24 V DC“ → „24Vcc“; „220 V“ е и „220mono“, и „220tri“ —
 * нищо). Същото е в public/js/collegati.js и public/js/moduli.js.
 */

const compatto = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '');
const numeri = (value: string): number[] =>
  (value.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));

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
  return matching.length === 1 ? matching[0]! : null;
}
