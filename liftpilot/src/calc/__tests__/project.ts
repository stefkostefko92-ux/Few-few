// Golden projection: the canonical form lives in ../snapshot (it is also what a saved calculation stores);
// here only the per-case bundle of the golden file and the hash.
import { createHash } from 'node:crypto';
import { brakeWindow, compute, readInputs, sizeMachine } from '../index';
import { canon, projectResults, projectSensitivity, projectSizing } from '../snapshot';
import type { Json } from '../snapshot';
import type { FormValues } from '../index';

export type { Json };
export { canon };

export const KEYS = ['inputs', 'res', 'old', 'window', 'sens', 'sizing', 'sizingFree'] as const;
export type Key = (typeof KEYS)[number];

/** Everything the golden files record for one case; the proposal only when asked (it is the slow part). */
export function runCase(V: FormValues, withSizing: boolean): Partial<Record<Key, Json>> {
  const ctx = readInputs(V), res = compute(ctx.I, ctx.N), old = ctx.compare ? compute(ctx.I, ctx.O) : null;
  const out: Partial<Record<Key, Json>> = {
    inputs: canon({ I: ctx.I, N: ctx.N, O: ctx.O, compare: ctx.compare, bad: ctx.bad, fixedD: ctx.fixedD, rope: ctx.rope }),
    res: projectResults(res), old: old ? projectResults(old) : null, window: canon(brakeWindow(res)),
    sens: projectSensitivity(ctx.I, ctx.N, res),
  };
  if (withSizing) {
    out.sizing = projectSizing(sizeMachine(ctx.I, ctx.N, ctx.fixedD, ctx.rope));
    out.sizingFree = projectSizing(sizeMachine(ctx.I, ctx.N, ctx.fixedD, null));
  }
  return out;
}

export const sha256 = (x: Json): string => createHash('sha256').update(JSON.stringify(x)).digest('hex');
