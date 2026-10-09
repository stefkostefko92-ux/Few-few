// The clauses of the relazione's «Riferimento» columns (Italian), the machine's checks and the shaft's: for each check
// the registry entries behind it, each with the clause it has for that check (rifVerifica), for the machine's groove
// and standard (rifGola, rifStd: an entry about another groove or standard is not cited), for the buffer types the check
// concerns (an entry about another type is not cited) and for the reduced-stroke buffers (only with them); only the UNI
// 10411 part the lift is tested to (none for a new lift: UNI EN 81-20/50), with the edition of UNI EN 81-1 that part
// names; then the clauses of one document merged into one reference, each once, in the standard's order. Pure.
import type { CheckId, GrooveType, MachineStd } from '@/calc/types';
import type { ShaftCheckId } from '@/shaft/types';
import type { BufferType } from '@/shaft/vertical';
import type { Collaudo } from '../lift/collaudo';

/** The clauses of a registry entry, split at its "; " outside parentheses, each marked ⚠ when the entry is still to be
 *  verified on the text in force (the box at the head of the relazione says what the mark means). */
export function refsOf(v: { riferimento: string; stato: string }): string[] {
  const out: string[] = [], r = v.riferimento;
  let depth = 0, cur = '';
  for (let i = 0; i < r.length; i++) {
    const ch = r.charAt(i);
    if (ch === '(') depth += 1;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && r.startsWith('; ', i)) { out.push(cur); cur = ''; i += 1; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x && x !== '—').map((x) => (v.stato === 'da_verificare' ? `${x} ⚠` : x));
}

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

/** A machine to UNI EN 81-1 (its original standard) under each test: the edition the registry's «UNI EN 81-1» (no year)
 *  stands for and the clause of UNI 10411 that admits it — UNI 10411-1:2024, 14.1 b) names the 2010 edition; UNI
 *  10411-11:2024, 14.1 the standard the lift was placed on the market with. Tested as new (UNI EN 81-20/50) the software
 *  reads the last edition, with no clause that admits it. The analogies of the registry name their edition (2008). */
export const MACCHINA_81_1: Readonly<Record<Collaudo['norma'], { sigla: string; via: string | null }>> = {
  en81: { sigla: 'UNI EN 81-1:2010', via: null },
  '10411-1': { sigla: 'UNI EN 81-1:2010', via: 'UNI 10411-1:2024, 14.1 b)' },
  '10411-11': { sigla: 'UNI EN 81-1 (edizione dell’impianto)', via: 'UNI 10411-11:2024, 14.1' },
};
const EN81_1 = 'UNI EN 81-1, ';
const edition = (ref: string, norma: Collaudo['norma']): string => (ref.startsWith(EN81_1) ? `${MACCHINA_81_1[norma].sigla}, ${ref.slice(EN81_1.length)}` : ref);

/** A registry entry as the references read it (src/calc/norme.ts Voce, src/shaft/norme.ts VoceVano). */
interface Entry {
  riferimento: string;
  stato: string;
  verifiche?: readonly string[];
  rifVerifica?: Partial<Readonly<Record<CheckId | ShaftCheckId, string>>>;
  rifGola?: Partial<Readonly<Record<GrooveType, string>>>;
  rifStd?: Partial<Readonly<Record<MachineStd, string>>>;
  /** the clauses cited when none of the entry's is of the lift's test standard (the other part's formula, a check of
   *  one part only); absent: the entry is not cited then */
  rifFuoriNorma?: string;
  /** an entry about one buffer type: cited only for the checks of the buffers of that type */
  ammortizzatore?: BufferType;
  /** an entry about the reduced-stroke buffers: cited only with them */
  corsaRidotta?: true;
}

/** What a check's clauses hang on besides the check. */
export interface RefContext {
  /** the lift's test standard */
  norma: Collaudo['norma'];
  /** the machine's checks: its groove, its standard and whether its buffers have a reduced stroke */
  groove?: GrooveType | null;
  std?: MachineStd | null;
  corsaRidotta?: boolean;
  /** the shaft's checks of the buffers: the types the check concerns (the car's, the counterweight's or both) */
  ammortizzatori?: readonly BufferType[];
}

/** An entry keyed by a property of the machine (groove, standard): cited only for the keys it lists. */
const keyed = <K extends string>(by: Partial<Readonly<Record<K, string>>> | undefined, k: K | null): boolean => !by || (k !== null && by[k] !== undefined);

/** The clauses of the check `id` from the registry entries `voci`, as `ctx` has the lift and its machine. */
export function checkRefs(voci: readonly Entry[], id: string, ctx: RefContext, max = 4): string {
  const { norma, groove = null, std = null } = ctx;
  const cited = voci.filter((v) => v.verifiche?.includes(id) && keyed(v.rifGola, groove) && keyed(v.rifStd, std)
    && (!v.corsaRidotta || ctx.corsaRidotta === true) && (!v.ammortizzatore || !ctx.ammortizzatori || ctx.ammortizzatori.includes(v.ammortizzatore)));
  const refs = cited.flatMap((v) => {
    const byCheck: Partial<Readonly<Record<string, string>>> | undefined = v.rifVerifica;
    const own = byCheck?.[id] ?? (groove !== null ? v.rifGola?.[groove] : undefined) ?? (std !== null ? v.rifStd?.[std] : undefined);
    return refsOf({ riferimento: own ?? v.riferimento, stato: v.stato });
  });
  const own = refs.filter((r) => !otherNorma(r, norma)).map((r) => edition(r, norma));
  if (own.length || !refs.length) return mergeRefs(own, max);
  // a check whose only sources are of the other UNI 10411 part: as the entries say to cite them
  return mergeRefs(cited.flatMap((v) => (v.rifFuoriNorma ? refsOf({ riferimento: v.rifFuoriNorma, stato: v.stato }) : [])), max);
}
