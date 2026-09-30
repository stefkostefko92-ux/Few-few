// Canonical projection of the results for the golden test and for scripts/golden-export.ts: sorted keys, no
// undefined or functions, non-finite numbers as strings; the echoed machine and the governing case of each check
// left out. The prototype's generator used the same projection.
import { createHash } from 'node:crypto';
import { brakeWindow, compute, readInputs, sensitivity, sizeMachine } from '../index';
import type { Check, FormValues, Results, Sizing } from '../index';

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

export const KEYS = ['inputs', 'res', 'old', 'window', 'sens', 'sizing', 'sizingFree'] as const;
export type Key = (typeof KEYS)[number];

/** Everything the golden files record for one case; the proposal only when asked (it is the slow part). */
export function runCase(V: FormValues, withSizing: boolean): Partial<Record<Key, Json>> {
  const ctx = readInputs(V), res = compute(ctx.I, ctx.N), old = ctx.compare ? compute(ctx.I, ctx.O) : null;
  const out: Partial<Record<Key, Json>> = {
    inputs: canon({ I: ctx.I, N: ctx.N, O: ctx.O, compare: ctx.compare, bad: ctx.bad, fixedD: ctx.fixedD, rope: ctx.rope }),
    res: projectResults(res), old: old ? projectResults(old) : null, window: canon(brakeWindow(res)),
    sens: sensitivity(ctx.I, ctx.N, res).map((s) => canon({ key: s.key, d: s.d, changed: s.changed.map((x) => x.id), checks: s.r.checks.map(checkRow) })),
  };
  if (withSizing) {
    out.sizing = projectSizing(sizeMachine(ctx.I, ctx.N, ctx.fixedD, ctx.rope));
    out.sizingFree = projectSizing(sizeMachine(ctx.I, ctx.N, ctx.fixedD, null));
  }
  return out;
}

export const sha256 = (x: Json): string => createHash('sha256').update(JSON.stringify(x)).digest('hex');
