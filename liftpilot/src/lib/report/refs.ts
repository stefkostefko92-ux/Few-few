// The clauses of the relazione's «Riferimento» column (Italian): for each check the registry entries behind it, each
// with the clause it has for that check (rifVerifica) and for the machine's groove (rifGola: an entry about another
// groove is not cited), only the UNI 10411 part the lift is tested to (none for a new lift: UNI EN 81-20/50), then the
// clauses of one document merged into one reference, each once, in the standard's order. Pure.
import type { CheckId, GrooveType } from '@/calc/types';
import type { Collaudo } from '../lift/collaudo';
import { refsOf } from './shaft';

/** The clauses of a document's reference, split at ", " and " e " outside parentheses. */
function clauses(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    const sep = depth === 0 ? (s.startsWith(', ', i) ? 2 : s.startsWith(' e ', i) ? 3 : 0) : 0;
    if (sep) { out.push(cur); cur = ''; i += sep - 1; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** A standard or a law the references cite by its acronym, before its first clause. */
const DOC = /^(UNI|EN|ISO|CEI|DPR|DM|D\.?\s?Lgs|Direttiva|NTC)\b[^,]*$/;
/** A clause number (5.11.2.3.1, 14.1): sorted by its numbers; anything else keeps its place after them. */
const NUM = /^(\d+(?:\.\d+)*)(.*)$/;
const order = (a: string, b: string): number => {
  const x = NUM.exec(a), y = NUM.exec(b);
  if (!x || !y) return 0;
  const p = x[1].split('.').map(Number), q = y[1].split('.').map(Number);
  for (let i = 0; i < Math.max(p.length, q.length); i++) { const d = (p[i] ?? -1) - (q[i] ?? -1); if (d) return d; }
  return 0;
};
const join = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/** The references `list` (each «DOC, clauses», ⚠ when to be verified), one per document with its clauses merged, each
 *  once, in order; a reference without a document's acronym as it is. At most `max` documents. */
export function mergeRefs(list: readonly string[], max = Infinity): string {
  const docs = new Map<string, { cl: string[]; flag: boolean }>(), loose = new Map<string, boolean>();
  for (const raw of list) {
    const flag = raw.endsWith('⚠'), x = raw.replace(/\s*⚠$/, ''), at = x.indexOf(', '), doc = at > 0 ? x.slice(0, at) : x;
    if (at > 0 && DOC.test(doc)) {
      const d = docs.get(doc) ?? { cl: [], flag: false };
      for (const c of clauses(x.slice(at + 2))) if (!d.cl.includes(c)) d.cl.push(c);
      docs.set(doc, { cl: d.cl, flag: d.flag || flag });
    } else loose.set(x, (loose.get(x) ?? false) || flag);
  }
  const out = [...[...docs].map(([doc, d]) => `${doc}, ${join(once(d.cl).sort(order))}${d.flag ? ' ⚠' : ''}`), ...[...loose].map(([x, f]) => `${x}${f ? ' ⚠' : ''}`)];
  return out.slice(0, max).join('; ');
}

/** Each clause once: "5.11.3" and "5.11.3 (termine III)" are one clause, written bare. */
function once(cl: readonly string[]): string[] {
  const bare = (c: string): string => c.replace(/\s*\([^()]*\)$/, ''), seen = new Map<string, string>();
  for (const c of cl) { const k = bare(c); seen.set(k, seen.has(k) ? k : c); }
  return [...seen.values()];
}

/** A reference of the UNI 10411 part the lift is not tested to, or of either part for a new lift. */
export const otherNorma = (ref: string, norma: Collaudo['norma']): boolean =>
  (ref.startsWith('UNI 10411-11:') && norma !== '10411-11') || (ref.startsWith('UNI 10411-1:') && norma !== '10411-1');

interface Entry { riferimento: string; stato: string; verifiche?: readonly string[]; rifVerifica?: Partial<Readonly<Record<CheckId, string>>>; rifGola?: Partial<Readonly<Record<GrooveType, string>>> }

/** The clauses of the check `id` from the registry entries `voci`: the lift's test standard and, for the machine's
 *  checks, its groove. */
export function checkRefs(voci: readonly Entry[], id: string, norma: Collaudo['norma'], groove: GrooveType | null = null, max = 4): string {
  const refs = voci.filter((v) => v.verifiche?.includes(id) && (!v.rifGola || (groove !== null && v.rifGola[groove] !== undefined))).flatMap((v) => {
    const byCheck: Partial<Readonly<Record<string, string>>> | undefined = v.rifVerifica;
    const own = byCheck?.[id] ?? (groove !== null ? v.rifGola?.[groove] : undefined);
    return refsOf({ riferimento: own ?? v.riferimento, stato: v.stato });
  });
  // a check whose only source is the other part's formula (the specific pressure of UNI 10411-1, D.2) cites it as such
  const own = refs.filter((r) => !otherNorma(r, norma));
  return own.length || !refs.length ? mergeRefs(own, max) : `${mergeRefs(refs, max)} (formula)`;
}
