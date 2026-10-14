// The values of the comparison and of the forms' notices as the screen writes them (round 44): Italian decimals («6,5»,
// up to two figures, no thousands separator, as the survey sheets write them), each with its unit. The words (the
// machine's place, the kind of lift) are the page's (messages: collega.valore.*). Pure.
import type { Param, Valore } from './confronto';

export const UNITA: Readonly<Partial<Record<Param, string>>> = {
  Q: 'kg', pesoCabina: 'kg', corsa: 'm', velocita: 'm/s', funiDiametro: 'mm', puleggia: 'mm', funicella: 'mm', potenza: 'kW', giri: 'giri/min',
};

/** A number the Italian way: «6,5», «630», «0,63». */
export const numero = (n: number): string => String(Number(n.toFixed(2))).replace('.', ',');

/** A value of a parameter with its unit; `parola` turns a code (ALTO, topDefl, IDRAULICO…) into its words. */
export function testoValore(p: Param, v: Valore, parola: (code: string) => string): string {
  if (v === null) return '—';
  if (typeof v === 'number') {
    if (p === 'taglia') return `${v}:1`;
    if (p === 'rapporto') return `1:${numero(v)}`;
    const u = UNITA[p];
    return u ? `${numero(v)} ${u}` : numero(v);
  }
  if (p === 'posizione') return parola(v);
  if (p === 'tipo') return v.split(', ').map(parola).join(', ');
  return v;
}
