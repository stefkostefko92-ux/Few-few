// Everything the screens and the report show, from the form values: the same calls as the prototype's update().
import { brakeWindow, compute, sensitivity } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import { sizeMachine } from '@/calc/sizing';
import type { BrakeWindow, FormValues, ParsedInputs, Results, SensitivityVariant, Sizing } from '@/calc/types';

export interface Analysis {
  ctx: ParsedInputs;
  res: Results;
  old: Results | null;
  sizing: Sizing;
  sens: SensitivityVariant[];
  win: BrakeWindow;
}

export function analyse(V: FormValues): Analysis {
  const ctx = readInputs(V);
  const res = compute(ctx.I, ctx.N);
  const old = ctx.compare ? compute(ctx.I, ctx.O) : null;
  const sizing = sizeMachine(ctx.I, ctx.N, ctx.fixedD, ctx.rope);
  return { ctx, res, old, sizing, sens: sensitivity(ctx.I, ctx.N, res), win: brakeWindow(res) };
}

/** Replacement with the ropes kept and the existing machine entered: the new ropes follow the existing ones. */
export function mirrorRopes(V: FormValues): FormValues {
  if (V.context === 'repl' && V.keepRopes && V.compare && (V.n_n !== V.o_n || V.n_d !== V.o_d)) return { ...V, n_n: V.o_n, n_d: V.o_d };
  return V;
}
