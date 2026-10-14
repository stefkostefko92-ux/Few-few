// The values of the comparison and of the forms' notices as the screen writes them (round 44): Italian decimals («6,5»,
// up to two figures, no thousands separator, as the survey sheets write them), each with its unit. The words (the
// machine's place, the kind of lift) are the page's (messages: collega.valore.*); and when a form's value is the
// survey's, however written. Pure.
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

/** The same value of a form's field however written: «630» and 630, «6.5» and «6,5»; an empty value is never the same. */
export function stessoValore(a: unknown, b: unknown): boolean {
  const s = String(a ?? '').trim(), t = String(b ?? '').trim();
  if (s === '' || t === '') return false;
  const x = Number(s.replace(',', '.')), y = Number(t.replace(',', '.'));
  return s === t || (Number.isFinite(x) && Number.isFinite(y) && x === y);
}

/** The fields whose value came from the survey (`valori`: field → the survey's value) and still is it. */
export const ancoraDalRilievo = (valori: Readonly<Record<string, string>> | undefined, valore: (id: string) => unknown): string[] =>
  (valori ? Object.entries(valori).filter(([id, v]) => stessoValore(valore(id), v)).map(([id]) => id) : []);

/** What a form's draft keeps of the survey (src/lib/draft-input.ts): the fields still the survey's, so that their marks
 *  come back with it, and — only when the form started from the survey (`parte`) — that it did, so that its notice comes
 *  back too. A value put in by «usa» on a saved calculation continued is marked again, never a start from the survey. */
export function bozzaRilievo(o: { valori: Readonly<Record<string, string>>; parte?: boolean } | null | undefined,
  valore: (id: string) => unknown): { rilievo?: string[]; parte?: true } {
  const rilievo = ancoraDalRilievo(o?.valori, valore);
  return rilievo.length ? { rilievo, ...(o?.parte ? { parte: true as const } : {}) } : {};
}
