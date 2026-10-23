// The words of the relazione tecnica di modifica (messages/rt/doc.json, imported here as the builder's texts) and the
// small formatters every part of the document shares: placeholders, days (YYYY-MM-DD and instants, Italy's day, never
// the ICU of the machine), the first characters of a SHA-256, a list in words, a value of the enumerations of the RT's
// data, the source of a datum, a point of the standard. Italian; our own words, clause numbers only. Pure.
import doc from '../../../../messages/rt/doc.json';
import type { PuntoInSito } from '../../lift/punti';
import { FONTE_TIPI } from '../../rt/fonte';

export const DOC = doc;

const ROME = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });

/** A text with its {placeholders} filled in. */
export const fill = (s: string, vars: Readonly<Record<string, string | number>>): string =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** A day YYYY-MM-DD as the documents write it: dd/mm/yyyy; an instant (ISO 8601) by its day in Italy. */
export function giorno(s: string | null | undefined): string {
  if (!s) return '—';
  const day = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ROME.format(new Date(s));
  const [y, m, d] = day.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '—';
}

/** The first 16 characters of a SHA-256. */
export const sha16 = (s: string): string => s.slice(0, 16);

/** «a», «a e b», «a, b e c». */
export const elenco = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** A reference split at its «; » outside parentheses: one item per document («UNI EN 81-20, 5.8; UNI EN 81-50,
 *  5.5.4» → two). */
export function perDocumento(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && s.startsWith('; ', i)) { out.push(cur); cur = ''; i += 1; continue; }
    cur += ch;
  }
  return [...out, cur].filter(Boolean);
}

/** The first letter in upper case. */
export const maiuscola = (s: string): string => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);

const VALORI: Readonly<Record<string, string>> = doc.valori;
/** A value of an enumeration of the RT's data in words (any other text as it is). */
export const valore = (v: string): string => VALORI[v] ?? v;

const FONTI: Readonly<Record<string, string>> = doc.fonti;
const FONTE_TIPO: Readonly<Record<string, string>> = doc.fonteTipi;
const isTipo = (x: string): boolean => FONTE_TIPI.some((t) => t === x);

/** Where a datum comes from, as the document prints it: the software's source by its key, the engineer's
 *  «<tipo>: <riferimento>» with the kind in words, «Allegato n» when it is one of the RT's files. */
export function fonte(f: string, allegato?: number): string {
  const at = f.indexOf(': '), tipo = at > 0 ? f.slice(0, at) : '';
  const testo = at > 0 && isTipo(tipo) ? `${FONTE_TIPO[tipo] ?? tipo}: ${f.slice(at + 2)}` : FONTI[f] ?? (f || '—');
  return allegato === undefined ? testo : `${testo} (${fill(doc.componente.allegato, { n: allegato })})`;
}

/** A point of the standard as the lists print it: its clause, its words, and a mark when it is still to be verified on
 *  the text in force (not a case of DPR 162/1999, whose sentence already says who decides). */
export const punto = (p: PuntoInSito): string =>
  `${p.rif}: ${p.testo}${p.stato === 'da_verificare' && !p.rif.startsWith('DPR 162/1999') ? doc.punti.daVerificare : ''}.`;

const CAMPI_DOC: Readonly<Record<string, string>> = doc.campi;
const BLOCCHI: Readonly<Record<string, string>> = doc.blocchi;
const CAMPI_COMPONENTI: Readonly<Record<string, string>> = doc.campiComponenti;
/** A missing field in words: the document's own names, the engine's (punti.ts CAMPI), a block's source or one of its
 *  fields («forza a corsa completa — ammortizzatori del contrappeso»), else its path. */
export function campo(c: string, engine: Readonly<Record<string, string>>): string {
  if (CAMPI_DOC[c]) return CAMPI_DOC[c];
  if (engine[c]) return engine[c];
  const m = /^componenti\.(.+)\.([A-Za-z]+)$/.exec(c), blocco = m?.[1] ?? '', k = m?.[2] ?? '';
  if (!m) return c;
  if (k === 'fonte') return fill(doc.campi.fonte, { blocco: BLOCCHI[blocco] ?? blocco });
  // a hand-typed profile's measure: the profile as a whole
  const custom = blocco.endsWith('.custom'), owner = custom ? blocco.slice(0, -'.custom'.length) : blocco, key = custom ? 'custom' : k;
  return CAMPI_COMPONENTI[key] ? fill(doc.campiFormato, { campo: CAMPI_COMPONENTI[key], blocco: BLOCCHI[owner] ?? owner }) : c;
}
