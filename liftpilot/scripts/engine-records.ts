// The saved records of the active companies' live installations made with older engines, recomputed by the running
// engines the way «Aggiorna con il software attuale» makes them again (src/server/refresh-actions.ts, save.ts): a
// calculation from its values as the form shows them (savedValues; a machine kept without a catalogue's model) with the
// standards chosen with it; a lift design on its «Calcolo argano» made again first when that one is no longer
// reproduced (liftInputsOf, as `rebase` does), else from its stored form; a machine room on its calculation's values; a
// shaft design from its inputs. Each with what it stored (verdict, counts, the checks it keeps) and what the running
// engines give, or why they refuse it. Reads only (scripts/engine-notice.ts compares and tells). It loads no server-only
// module (src/lib/db, src/server/*): the script runs without the react-server condition, which the mail's translator
// (next-intl) does not load under; the versions' rule of src/server/records.ts `outdated` is in the queries below.
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { compute } from '../src/calc/compute';
import { readInputs } from '../src/calc/inputs';
import { ENGINE_VERSION } from '../src/calc/snapshot';
import type { FormValues } from '../src/calc/types';
import { savedValues } from '../src/lib/calc-saved';
import { formValuesSchema } from '../src/lib/calc-input';
import { collaudoOf, collaudoVerdict, deriveLift, macchinaResta, tipoDaRivedere, type Collaudo, type LiftInputs, type TipoIntervento } from '../src/lib/lift';
import { calcVerdictOf } from '../src/lib/lift/calc-verdict';
import { liftInputsOf, progettoOf } from '../src/lib/lift/progetto';
import { LIFT_ENGINE_VERSION } from '../src/lib/lift/version';
import { collaudoReadSchema, collaudoSchema, liftInputsReadSchema, liftInputsSchema } from '../src/lib/lift-input';
import { deriveRoom } from '../src/lib/room/derive';
import { ROOM_ENGINE_VERSION, roomVerdict } from '../src/lib/room/snapshot';
import { surveySchema } from '../src/lib/room/survey';
import { shaftInputsReadSchema } from '../src/lib/shaft-input';
import { mergeChecks, shaftSnapshot, verdictOf } from '../src/shaft';
import { SHAFT_ENGINE_VERSION } from '../src/shaft/snapshot';
import { checkMap, storedChecks, type Kind, type Now, type Outcome } from './engine-diff';

export interface RecordRow {
  kind: Kind;
  id: string;
  /** the saved work it belongs to (engine-diff.ts Changed.owner) */
  owner: string;
  companyId: string;
  projectId: string;
  project: string;
  stored: Outcome;
  now: Now;
}

const VERDICT = { ok: 'OK', warn: 'WARN', fail: 'FAIL' } as const;

const counted = (checks: readonly { status: string }[]) => ({ fails: checks.filter((c) => c.status === 'fail').length, warns: checks.filter((c) => c.status === 'warn').length });
const refusedBy = (what: string, ids: readonly string[] = []): { refused: string } => ({ refused: ids.length ? `${what}: ${[...new Set(ids)].join(', ')}` : what });

interface CalcRow { inputs: unknown; collaudo: unknown; intervento: TipoIntervento | null }

/** A calculation's values as its remake saves them (remakeCalc → createCalculation), with the standards chosen; null
 *  when its values or its chosen standards no longer read (the form opens instead). */
function remadeValues(c: CalcRow): { V: FormValues; chosen: Collaudo | null } | null {
  const read = c.collaudo ? collaudoReadSchema.safeParse(c.collaudo) : null, chosen = read?.success ? collaudoSchema.safeParse(read.data) : null;
  if (chosen && !chosen.success) return null;
  const values = formValuesSchema.safeParse(c.inputs);
  if (!values.success) return null;
  const C = chosen?.success ? chosen.data : null, kept = macchinaResta(c.intervento, collaudoOf(values.data, C ?? undefined));
  return { V: savedValues(kept ? { ...values.data, n_model: '' } : values.data), chosen: C };
}

/** A calculation recomputed as its remake would save it. */
export function calcNow(c: CalcRow): Now {
  const r = remadeValues(c);
  if (!r) return refusedBy('values or standards no longer read');
  const ctx = readInputs(r.V);
  if (ctx.bad.length) return refusedBy('inputs refused', ctx.bad);
  // the calculation's own verdict as the save counts it (calc-verdict.ts): with D.1 and D.2 when the ratio changes
  const res = compute(ctx.I, ctx.N), v = calcVerdictOf(res, collaudoOf(r.V, r.chosen ?? undefined), r.V);
  return { verdict: VERDICT[v.status], fails: v.fails, warns: v.warns, checks: checkMap([...res.checks, ...v.extra]) };
}

/** A lift design recomputed as its remake would save it: on its base made again when that one is outdated. */
export function liftNow(d: { inputs: unknown; base: (CalcRow & { engineVersion: string }) | null }): Now {
  const read = liftInputsReadSchema.safeParse(d.inputs), stored = read.success ? liftInputsSchema.safeParse(read.data) : null;
  if (!stored?.success) return refusedBy('the form no longer reads');
  let inputs: LiftInputs = stored.data;
  const b = d.base;
  if (b && b.engineVersion !== ENGINE_VERSION) {
    const r = remadeValues(b);
    if (!r || readInputs(r.V).bad.length) return refusedBy('its «Calcolo argano» no longer passes');
    const again = liftInputsSchema.safeParse(liftInputsOf(progettoOf(stored.data), { values: r.V, collaudo: collaudoOf(r.V, r.chosen ?? undefined) }));
    if (!again.success) return refusedBy('the drawing no longer fits its «Calcolo argano»');
    inputs = again.data;
  }
  const dv = deriveLift(inputs);
  if (b?.intervento === 'SOLO_ARGANO' && inputs.collaudo?.libretto && tipoDaRivedere(b.intervento, dv.collaudo)) return refusedBy('tipoDaRivedere');
  if (dv.analysis.ctx.bad.length || dv.issues.length) return refusedBy('inputs refused', [...dv.analysis.ctx.bad, ...dv.issues]);
  const L = shaftSnapshot(dv.shaft).layout;
  const test = collaudoVerdict(dv.collaudo, [...dv.analysis.res.checks, ...mergeChecks(L.checks, dv.supportChecks)]);
  return { verdict: VERDICT[test.verdict], fails: test.fails, warns: test.warns, checks: null };
}

/** A machine room recomputed on its calculation's values as that calculation's remake saves them (placeRoom). */
export function roomNow(r: { inputs: unknown; calc: CalcRow }): Now {
  const c = remadeValues(r.calc), survey = surveySchema.safeParse(r.inputs);
  if (!c || !survey.success) return refusedBy('values or survey no longer read');
  const dr = deriveRoom(c.V, survey.data);
  if (dr.issues.length) return refusedBy('room issues', dr.issues);
  const v = roomVerdict(dr.checks, collaudoOf(c.V, c.chosen ?? undefined));
  return { verdict: v.verdict, fails: v.failCount, warns: v.warnCount, checks: checkMap(dr.checks) };
}

/** A shaft design recomputed from its inputs. */
export function shaftNow(inputs: unknown): Now {
  const I = shaftInputsReadSchema.safeParse(inputs);
  if (!I.success) return refusedBy('inputs no longer read');
  const L = shaftSnapshot(I.data).layout;
  return { verdict: VERDICT[verdictOf(L)], ...counted(L.checks), checks: checkMap(L.checks) };
}

/** An engine that throws on a record: the record cannot be made again either — it counts as changed, with the reason. */
function safely(f: () => Now): Now {
  try { return f(); } catch (err) { return refusedBy(`engine error ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`); }
}

const LIVE = { company: { active: true }, project: { archivedAt: null } } as const;
const HEAD = { id: true, companyId: true, projectId: true, project: { select: { name: true } }, verdict: true, failCount: true, warnCount: true } as const;
const CALC = { inputs: true, collaudo: true, intervento: true, engineVersion: true } as const;
type Head = { id: string; companyId: string; projectId: string; project: { name: string }; verdict: Outcome['verdict']; failCount: number; warnCount: number };
const row = (kind: Kind, h: Head, owner: string, checks: Record<string, string> | null, now: Now): RecordRow =>
  ({ kind, id: h.id, owner, companyId: h.companyId, projectId: h.projectId, project: h.project.name, stored: { verdict: h.verdict, fails: h.failCount, warns: h.warnCount, checks }, now });
const UPDATES = z.object({ updates: z.string() }).passthrough();

/** The records already made again (the audit of a save keeps `updates`: src/server/remake.ts madeFrom): their new
 *  record is the one that counts, they are not told about. */
async function remade(db: PrismaClient): Promise<Set<string>> {
  const saves = await db.auditLog.findMany({ where: { action: { in: ['CALCULATION_SAVED', 'LIFT_DESIGN_SAVED', 'ROOM_DESIGN_SAVED'] } }, select: { meta: true } });
  return new Set(saves.flatMap((a) => { const m = UPDATES.safeParse(a.meta); return m.success ? [m.data.updates] : []; }));
}

/** Every record of a live installation of an active company that the running engines no longer reproduce — by the
 *  versions stored with it and with the records it is made of, as records.ts `outdated` tells them — and not already
 *  made again, recomputed. */
export async function recomputeAll(db: PrismaClient): Promise<RecordRow[]> {
  const order = [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
  const [done, calcs, lifts, rooms, shafts] = await Promise.all([
    remade(db),
    db.calculation.findMany({ where: { ...LIVE, engineVersion: { not: ENGINE_VERSION } }, orderBy: order, select: { ...HEAD, ...CALC, results: true, liftDesign: { select: { id: true } } } }),
    db.liftDesign.findMany({
      where: { ...LIVE, OR: [{ engineVersion: { not: LIFT_ENGINE_VERSION } }, { calculation: { engineVersion: { not: ENGINE_VERSION } } }, { shaftDesign: { engineVersion: { not: SHAFT_ENGINE_VERSION } } }] },
      orderBy: order, select: { ...HEAD, inputs: true, baseCalculation: { select: CALC } },
    }),
    db.roomDesign.findMany({
      where: { ...LIVE, OR: [{ engineVersion: { not: ROOM_ENGINE_VERSION } }, { calculation: { engineVersion: { not: ENGINE_VERSION } } }] },
      orderBy: order, select: { ...HEAD, inputs: true, results: true, calculation: { select: CALC } },
    }),
    db.shaftDesign.findMany({ where: { ...LIVE, engineVersion: { not: SHAFT_ENGINE_VERSION } }, orderBy: order, select: { ...HEAD, inputs: true, results: true, liftDesign: { select: { id: true } } } }),
  ]);
  // a lift design's own calculation and shaft design belong to it: made again with it, told about with it
  const own = (kind: Kind, id: string, lift: { id: string } | null): { owner: string; key: string } =>
    lift ? { owner: `lift:${lift.id}`, key: lift.id } : { owner: `${kind}:${id}`, key: id };
  const live = <T extends { id: string }>(kind: Kind, xs: readonly T[], lift: (x: T) => { id: string } | null) =>
    xs.map((x) => ({ x, ...own(kind, x.id, lift(x)) })).filter((o) => !done.has(o.key));
  return [
    ...live('calc', calcs, (c) => c.liftDesign).map(({ x: c, owner }) => row('calc', c, owner, storedChecks('calc', c.results), safely(() => calcNow(c)))),
    ...live('lift', lifts, () => null).map(({ x: d, owner }) => row('lift', d, owner, null, safely(() => liftNow({ inputs: d.inputs, base: d.baseCalculation })))),
    ...live('room', rooms, () => null).map(({ x: r, owner }) => row('room', r, owner, storedChecks('room', r.results), safely(() => roomNow({ inputs: r.inputs, calc: r.calculation })))),
    ...live('shaft', shafts, (s) => s.liftDesign).map(({ x: s, owner }) => row('shaft', s, owner, storedChecks('shaft', s.results), safely(() => shaftNow(s.inputs)))),
  ];
}
