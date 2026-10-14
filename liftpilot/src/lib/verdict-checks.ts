// The checks behind a saved record's result: the ones it does not pass and the ones it passes with a warning, read the
// way its stored counts were made (src/server/save.ts) so that the list says what the pill counts. A calculation and a
// shaft design keep every check in their snapshot; a machine room keeps its checks and counts those its acceptance test
// takes in (the standards chosen with its calculation); a lift design counts its calculation's, its shaft design's and
// the beams under the machine (with the headroom over what hangs), which no record keeps: they are derived again only
// while the running engines reproduce the design, else the list is what the stored records hold and says so. Pure.
import { z } from 'zod';
import type { Check, CheckId } from '@/calc/types';
import { AMBITO_VERIFICHE, ambitoOf, type Collaudo } from '@/lib/lift/collaudo';
import { mergeChecks } from '@/shaft/checks';
import type { ShaftCheck, ShaftCheckId } from '@/shaft/types';

export const VERDICT_KINDS = ['calc', 'shaft', 'room', 'lift'] as const;
export type VerdictKind = (typeof VERDICT_KINDS)[number];
export const isVerdictKind = (x: unknown): x is VerdictKind => VERDICT_KINDS.some((k) => k === x);

/** Every check of the calculator, once: the type keeps the list whole (a new CheckId fails the build until it is here). */
const CALC_IDS: Readonly<Record<CheckId, true>> = {
  tr_load: true, tr_dn: true, tr_up: true, tr_real: true, tr_stall: true, r_dd: true, r_ddp: true, r_nd: true, g_geom: true, r_sfa: true,
  d_pst: true, d_ratio: true, d_mp: true, s_shaft: true, b_sets: true, b_all: true, b_one: true, b_up: true, b_amax: true, s_force: true,
  s_uplift: true, tr_msr1: true, r_two: true, v_comp: true, g_retain: true, s_fa: true, s_gravity: true, g_press: true,
};
const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
export const isCalcCheckId = (id: string): id is CheckId => has(CALC_IDS, id);
/** A check of the shaft's engines (plan, section, machine room, beams, rails): the acceptance test's table has every id. */
export const isShaftCheckId = (id: string): id is ShaftCheckId => has(AMBITO_VERIFICHE, id) && !isCalcCheckId(id);

type Status = 'fail' | 'warn';

/** A check as a record keeps it, failing or warning. The calculator stores its decimals; a shaft check stores neither
 *  its decimals nor its unit (`null`: taken from the check's definition in the running engine when there is one). An
 *  id the running software no longer knows keeps its place in the list, named by its id. */
export type ListedCheck =
  | { src: 'calc'; id: string; status: Status; value: number | null; limit: number | null; dec: number }
  | { src: 'shaft'; id: string; status: Status; value: number | null; limit: number | null; dec: number | null; unit: ShaftCheck['unit'] | null };

/** How the list was made: from the record's snapshot; derived again by the running engines (the record reproduces);
 *  what the stored records hold of one the engines no longer reproduce; nothing readable. */
export type ListBasis = 'stored' | 'derived' | 'partial' | 'unreadable';

export interface CheckList {
  fails: ListedCheck[];
  warns: ListedCheck[];
  basis: ListBasis;
}

export interface StoredCounts {
  failCount: number;
  warnCount: number;
}

/** A check as the pill's panel shows it, in Italian. */
export interface VerdictRow {
  name: string;
  value: string;
  /** with its sense («≥ 500 mm»); '' when the check has none */
  limit: string;
}

/** What the panel of a pill gets (src/server/verdict-checks.ts → /api/verdict-checks/<kind>/<id>). */
export interface VerdictDetail {
  fails: VerdictRow[];
  warns: VerdictRow[];
  /** the record's stored counts: the pill's */
  failCount: number;
  warnCount: number;
  /** why the list is not, or may not be, what the pill counts; null when it is */
  note: string | null;
}

/** The list says what the pill counts. */
export const agrees = (l: CheckList, c: StoredCounts): boolean => l.fails.length === c.failCount && l.warns.length === c.warnCount;

// ---- reading what is stored (canonical JSON: a number that is not finite is stored as its text)
const num = z.union([z.number(), z.string(), z.null()]).optional().transform((x): number | null => {
  if (typeof x === 'number') return x;
  if (x === 'Infinity') return Infinity;
  if (x === '-Infinity') return -Infinity;
  return null;
});
const storedRow = z.object({ id: z.string(), status: z.string(), value: num, limit: num, dec: z.number().int().min(0).max(6).optional() });
type StoredRow = z.infer<typeof storedRow>;
const rows = z.array(z.unknown()).transform((xs) => xs.flatMap((x) => { const r = storedRow.safeParse(x); return r.success ? [r.data] : []; }));
const calcResults = z.object({ res: z.object({ checks: rows }) });
const shaftResults = z.object({ checks: rows });

const isCounted = (s: string): s is Status => s === 'fail' || s === 'warn';
const split = (xs: ListedCheck[], basis: ListBasis): CheckList => ({ fails: xs.filter((c) => c.status === 'fail'), warns: xs.filter((c) => c.status === 'warn'), basis });
const UNREADABLE: CheckList = { fails: [], warns: [], basis: 'unreadable' };

const fromCalcRow = (r: StoredRow & { status: Status }): ListedCheck => ({ src: 'calc', id: r.id, status: r.status, value: r.value, limit: r.limit, dec: r.dec ?? 2 });
/** `defs`: the running engine's checks, whose decimals and unit a stored one of the same id takes. */
const fromShaftRow = (r: StoredRow & { status: Status }, defs: readonly ShaftCheck[]): ListedCheck => {
  const def = defs.find((d) => d.id === r.id);
  return { src: 'shaft', id: r.id, status: r.status, value: r.value, limit: r.limit, dec: def?.dec ?? null, unit: def?.unit ?? null };
};
const counted = (xs: readonly StoredRow[]) => xs.filter((r): r is StoredRow & { status: Status } => isCounted(r.status));

/** Whether a check enters the acceptance test `C` (an id the software no longer knows: kept, the counts tell). */
const applies = (C: Collaudo, id: string): boolean => (isCalcCheckId(id) || isShaftCheckId(id) ? ambitoOf(C, id) === 'applies' : true);

/** A calculation: every check of its snapshot (results.res.checks) — failCount the failing ones, warnCount the warning
 *  ones, as saved. */
export function calcList(results: unknown): CheckList {
  const p = calcResults.safeParse(results);
  return p.success ? split(counted(p.data.res.checks).map(fromCalcRow), 'stored') : UNREADABLE;
}

/** A shaft design: every check of its snapshot (results.checks), as saved. */
export function shaftList(results: unknown, defs: readonly ShaftCheck[] = []): CheckList {
  const p = shaftResults.safeParse(results);
  return p.success ? split(counted(p.data.checks).map((r) => fromShaftRow(r, defs)), 'stored') : UNREADABLE;
}

/** A machine room: the checks of its snapshot that its acceptance test takes in (roomVerdict, with the standards stored
 *  with its calculation); `C` null when its calculation's values no longer read. */
export function roomList(results: unknown, C: Collaudo | null, defs: readonly ShaftCheck[] = []): CheckList {
  const p = shaftResults.safeParse(results);
  if (!p.success || !C) return UNREADABLE;
  return split(counted(p.data.checks).filter((r) => applies(C, r.id)).map((r) => fromShaftRow(r, defs)), 'stored');
}

/** A lift design the running engines reproduce: its test's checks as the save counted them (collaudoVerdict over the
 *  calculation's, and the shaft design's merged with those of the beams under the machine). */
export function liftListDerived(C: Collaudo, calc: readonly Check[], shaft: readonly ShaftCheck[], support: readonly ShaftCheck[]): CheckList {
  const all: ListedCheck[] = [
    ...calc.filter((c) => isCounted(c.status) && ambitoOf(C, c.id) === 'applies')
      .map((c): ListedCheck => ({ src: 'calc', id: c.id, status: c.status === 'fail' ? 'fail' : 'warn', value: c.value, limit: c.limit, dec: c.dec })),
    ...mergeChecks(shaft, support).filter((c) => isCounted(c.status) && ambitoOf(C, c.id) === 'applies')
      .map((c): ListedCheck => ({ src: 'shaft', id: c.id, status: c.status === 'fail' ? 'fail' : 'warn', value: c.value, limit: c.limit, dec: c.dec, unit: c.unit })),
  ];
  return split(all, 'derived');
}

/** A lift design the running engines no longer reproduce: what its calculation and its shaft design keep, under the
 *  standards stored with the calculation. The beams under the machine and the headroom over what hangs are not kept by
 *  any record (nor which shaft check they stood in place of): the list is partial and says so. */
export function liftListStored(calcResultsJson: unknown, shaftResultsJson: unknown, C: Collaudo | null, defs: readonly ShaftCheck[] = []): CheckList {
  const c = calcResults.safeParse(calcResultsJson), s = shaftResults.safeParse(shaftResultsJson);
  if (!c.success || !s.success || !C) return UNREADABLE;
  return split([
    ...counted(c.data.res.checks).filter((r) => applies(C, r.id)).map(fromCalcRow),
    ...counted(s.data.checks).filter((r) => applies(C, r.id)).map((r) => fromShaftRow(r, defs)),
  ], 'partial');
}
