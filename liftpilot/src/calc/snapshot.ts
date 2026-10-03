// Canonical projection of a calculation: what a saved calculation stores and what the golden test compares.
// Sorted keys, no undefined or functions, non-finite numbers as strings; the echoed machine and the governing case
// of each check left out. The prototype's generator used the same projection. Pure: the hash is taken by the caller.
import { brakeWindow, compute, sensitivity } from './compute';
import { readInputs } from './inputs';
import { sizeMachine } from './sizing';
import { PROFILO } from './norme';
import type { Check, FormValues, Results, Sizing } from './types';

/** Engine version (semver): a change of formula is a minor or major version and regenerates the golden file. */
export const ENGINE_VERSION = '1.1.0';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canon(x: unknown): Json {
  if (typeof x === 'number') return Number.isFinite(x) ? x : String(x);
  if (Array.isArray(x)) return x.map(canon);
  if (x !== null && typeof x === 'object') {
    const src = x as Record<string, unknown>, out: { [key: string]: Json } = {};
    for (const key of Object.keys(src).sort()) {
      const v = src[key];
      if (v !== undefined && typeof v !== 'function') out[key] = canon(v);
    }
    return out;
  }
  if (typeof x === 'string' || typeof x === 'boolean' || x === null) return x;
  throw new Error(`unexpected value ${String(x)}`);
}

const checkRow = (c: Check) => ({ id: c.id, status: c.status, value: c.value, limit: c.limit, util: c.util, dec: c.dec });

export function projectResults(r: Results): Json {
  const omit = new Set(['M', 'brakeCasesAt', 'brakeUtil', 'fails']);
  const copy: Record<string, unknown> = Object.fromEntries(Object.entries(r).filter(([key]) => !omit.has(key)));
  copy.brake = { ...r.brake, aMaxCase: undefined };
  copy.checks = r.checks.map(checkRow);
  return canon(copy);
}

export const projectSizing = (s: Sizing): Json => canon({
  fixedD: s.fixedD, keep: s.keep, pick: s.pick ? s.options.indexOf(s.pick) : -1,
  options: s.options.map((o) => ({ D: o.D, d: o.d, n: o.n, rope: { Fmin: o.rope.Fmin, qf: o.rope.qf }, groove: o.groove, tight: o.tight, real: o.real,
    iIdeal: o.iIdeal, i: o.i, Preq: o.Preq, Pn: o.Pn, brakeSet: o.brakeSet, fails: o.res.fails.length, util: Math.max(o.res.load.util, o.res.dn.util, o.res.up.util) })),
});

export const projectSensitivity = (I: Parameters<typeof sensitivity>[0], M: Parameters<typeof sensitivity>[1], res: Results): Json[] =>
  sensitivity(I, M, res).map((s) => canon({ key: s.key, d: s.d, changed: s.changed.map((x) => x.id), checks: s.r.checks.map(checkRow) }));

export interface Snapshot {
  engine: string;
  profile: string;
  values: Json;
  results: { inputs: Json; res: Json; old: Json; window: Json; sens: Json[]; sizing: Json };
}

/** The complete, canonical record of a calculation from the form values. */
export function snapshotOf(V: FormValues): Snapshot {
  const ctx = readInputs(V), res = compute(ctx.I, ctx.N), old = ctx.compare ? compute(ctx.I, ctx.O) : null;
  return {
    engine: ENGINE_VERSION,
    profile: PROFILO.id,
    values: canon(V),
    results: {
      inputs: canon({ I: ctx.I, N: ctx.N, O: ctx.O, compare: ctx.compare, bad: ctx.bad, fixedD: ctx.fixedD, rope: ctx.rope }),
      res: projectResults(res),
      old: old ? projectResults(old) : null,
      window: canon(brakeWindow(res)),
      sens: projectSensitivity(ctx.I, ctx.N, res),
      sizing: projectSizing(sizeMachine(ctx.I, ctx.N, ctx.fixedD, ctx.rope)),
    },
  };
}
