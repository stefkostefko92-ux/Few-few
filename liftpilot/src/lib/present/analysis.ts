// Everything the screens and the report show, from the form values: the same calls as the prototype's update().
import { brakeWindow, compute, sensitivity } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import type { BrakeWindow, FormValues, ParsedInputs, Results, SensitivityVariant, Sizing, SizingOption } from '@/calc/types';
import { designSizing, sheaveHold, type SheaveHold } from '@/lib/lift/direct';

export interface Analysis {
  ctx: ParsedInputs;
  res: Results;
  old: Results | null;
  sizing: Sizing;
  /** how the sizing holds its sheave: the existing one kept, a lift design's direct pull its plan's drop (lift/direct.ts) */
  hold: SheaveHold;
  sens: SensitivityVariant[];
  win: BrakeWindow;
}

/** `design`: the values of a lift design, whose plan sets a direct pull's sheave for the sizing (lift/direct.ts). */
export function analyse(V: FormValues, design = false): Analysis {
  const ctx = readInputs(V);
  const res = compute(ctx.I, ctx.N);
  const old = ctx.compare ? compute(ctx.I, ctx.O) : null;
  const sizing = designSizing(ctx, design);
  return { ctx, res, old, sizing, hold: sheaveHold(ctx, design), sens: sensitivity(ctx.I, ctx.N, res), win: brakeWindow(res) };
}

/** Replacement with the ropes kept and the existing machine entered: the new ropes follow the existing ones. */
export function mirrorRopes(V: FormValues): FormValues {
  if (V.context === 'repl' && V.keepRopes && V.compare && (V.n_n !== V.o_n || V.n_d !== V.o_d)) return { ...V, n_n: V.o_n, n_d: V.o_d };
  return V;
}

/** A proposal as values of the new-machine fields; poles, speed, η_d, inertias and mass stay as entered. Not a model of a
 *  catalogue (no name), and neither the static load allowed on the shaft nor the output torque: those are a maker's
 *  data, the sizing's numbers are only what the maker is asked for; their checks stay out until they are entered. */
export function proposalValues(o: SizingOption): FormValues {
  const M = o.M;
  return {
    n_model: '', n_D: M.D, n_groove: M.groove.type, n_beta: M.groove.beta, n_gamma: M.groove.gamma, n_i: M.i, n_Pn: M.Pn, n_brakeSets: 2,
    n_brakeNm: M.brakeNm, n_shaftMax: '', n_MpCat: '', n_n: M.n, n_d: M.d, n_Fmin: M.Fmin, n_qf: M.qf,
  };
}
