// The pure part of the engine correction notice (scripts/engine-notice.ts): what a saved record says and what the
// running engines give, compared; the changed records grouped by company; the arguments; the key a notice is
// idempotent on. No database, no engine, no mail: tested in scripts/__tests__/engine-notice.test.ts.
import { z } from 'zod';

export type Kind = 'calc' | 'lift' | 'room' | 'shaft';
export type Verdict = 'OK' | 'WARN' | 'FAIL';
/** What a record says: its verdict, the counts, and the state of each check where the record keeps them (null: not kept). */
export interface Outcome {
  verdict: Verdict;
  fails: number;
  warns: number;
  checks: Record<string, string> | null;
}
/** What the running engines give for a record, or why they refuse it (it can no longer be made again in one click). */
export type Now = Outcome | { refused: string };
export interface CheckChange { id: string; from: string | null; to: string | null }
/** How a record's result changes; `refused`: the running engines refuse its input (or fail on it). */
export interface Change {
  verdict: { from: Verdict; to: Verdict } | null;
  counts: { fails: [number, number]; warns: [number, number] } | null;
  checks: CheckChange[];
  refused: string | null;
}
/** A changed record; `owner`: the saved work it belongs to — a lift design's own calculation and shaft design are its
 *  lift design (`lift:<id>`), every other record is its own (`<kind>:<id>`) — what the e-mail counts as one «elaborato». */
export interface Changed { kind: Kind; id: string; owner: string; companyId: string; projectId: string; project: string; change: Change }
export interface CompanyChanges { companyId: string; records: Changed[]; elaborati: number; impianti: number }

/** The checks as id → state; an id met more than once is told apart by its order (id, id#2, …). */
export function checkMap(checks: readonly { id: string; status: string }[]): Record<string, string> {
  const out: Record<string, string> = {}, seen = new Map<string, number>();
  for (const c of checks) {
    const n = (seen.get(c.id) ?? 0) + 1;
    seen.set(c.id, n);
    out[n === 1 ? c.id : `${c.id}#${n}`] = c.status;
  }
  return out;
}

const CHECKS = z.array(z.object({ id: z.string(), status: z.string() }).passthrough());
const STORED_CALC = z.object({ res: z.object({ checks: CHECKS }).passthrough() }).passthrough();
const STORED_OTHER = z.object({ checks: CHECKS }).passthrough();

/** The checks a record stored in its results (a calculation: results.res.checks; a shaft design and a machine room:
 *  results.checks); null when it keeps none (a lift design) or they do not read. */
export function storedChecks(kind: Kind, results: unknown): Record<string, string> | null {
  if (kind === 'lift') return null;
  if (kind === 'calc') {
    const r = STORED_CALC.safeParse(results);
    return r.success ? checkMap(r.data.res.checks) : null;
  }
  const r = STORED_OTHER.safeParse(results);
  return r.success ? checkMap(r.data.checks) : null;
}

/** A check's state that a document reports as a finding: what a verdict and its counts are made of. */
const FINDING = new Set(['fail', 'warn']);

/** The change from what a record stored to what the running engines give; null when the result is the same. A new
 *  version alone is no change, nor a check that appears, goes or moves among the states that are not findings (a new
 *  «info» line, «ok» ↔ «info»): only the verdict, the counts and the checks that are or were a finding count. */
export function changeOf(stored: Outcome, now: Now): Change | null {
  if ('refused' in now) return { verdict: null, counts: null, checks: [], refused: now.refused };
  const verdict = stored.verdict !== now.verdict ? { from: stored.verdict, to: now.verdict } : null;
  const counts = stored.fails !== now.fails || stored.warns !== now.warns
    ? { fails: [stored.fails, now.fails] as [number, number], warns: [stored.warns, now.warns] as [number, number] } : null;
  const checks: CheckChange[] = [];
  if (stored.checks && now.checks) {
    for (const id of [...new Set([...Object.keys(stored.checks), ...Object.keys(now.checks)])].sort()) {
      const from = stored.checks[id] ?? null, to = now.checks[id] ?? null;
      if (from !== to && (FINDING.has(from ?? '') || FINDING.has(to ?? ''))) checks.push({ id, from, to });
    }
  }
  return verdict || counts || checks.length ? { verdict, counts, checks, refused: null } : null;
}

/** The changed records by company, in the order met, each with how many saved works (owners) and installations
 *  they touch. */
export function byCompany(rows: readonly Changed[]): CompanyChanges[] {
  const m = new Map<string, Changed[]>();
  for (const r of rows) m.set(r.companyId, [...(m.get(r.companyId) ?? []), r]);
  return [...m].map(([companyId, records]) => ({
    companyId, records, elaborati: new Set(records.map((r) => r.owner)).size, impianti: new Set(records.map((r) => r.projectId)).size,
  }));
}

/** One line of the list: «FAIL→WARN; fails 1→0; fr_brake fail→ok, tr_d2 —→warn» or «refused: <why>». */
export function describe(c: Change): string {
  if (c.refused) return `refused: ${c.refused}`;
  return [
    ...(c.verdict ? [`${c.verdict.from}→${c.verdict.to}`] : []),
    ...(c.counts ? [(['fails', 'warns'] as const).filter((k) => c.counts?.[k][0] !== c.counts?.[k][1]).map((k) => `${k} ${c.counts?.[k][0]}→${c.counts?.[k][1]}`).join(', ')] : []),
    ...(c.checks.length ? [c.checks.map((x) => `${x.id} ${x.from ?? '—'}→${x.to ?? '—'}`).join(', ')] : []),
  ].join('; ');
}

/** The four engine versions: what a notice is idempotent on (a company is told once for them). */
export const noticeKey = (v: { calc: string; lift: string; room: string; shaft: string }): string =>
  `calc ${v.calc} · lift ${v.lift} · room ${v.room} · shaft ${v.shaft}`;

const ARGS = z.object({
  send: z.boolean(),
  // one line: it goes into the e-mail as written; long enough to say what and why, short enough for a notice
  motivo: z.string().transform((s) => s.replace(/\s+/g, ' ').trim()).pipe(z.string().min(10).max(600)).nullable(),
}).refine((a) => !a.send || a.motivo !== null, { message: '--send needs --motivo "<what was corrected>"', path: ['motivo'] });

/** `--send`, `--motivo <text>` or `--motivo=<text>`; an unknown argument is refused (a typo never sends). */
export function parseArgs(argv: readonly string[]): { ok: true; send: boolean; motivo: string | null } | { ok: false; error: string } {
  let send = false, motivo: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--send') send = true;
    else if (a === '--motivo') {
      const next = argv[++i];
      if (next === undefined) return { ok: false, error: '--motivo needs a text' };
      motivo = next;
    } else if (a.startsWith('--motivo=')) motivo = a.slice('--motivo='.length);
    else return { ok: false, error: `unknown argument: ${a}` };
  }
  const r = ARGS.safeParse({ send, motivo });
  return r.success ? { ok: true, ...r.data } : { ok: false, error: r.error.issues.map((x) => `${x.path.join('.') || 'args'}: ${x.message}`).join('; ') };
}
