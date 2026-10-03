// Groove factor and N_equiv(t) of the groove (research 4.4 and 4.5; registry: gole.*, funi.Nequiv.gola.*).
import { K } from './norme';
import { rad } from './math';
import type { Groove } from './types';

export interface NeqValue {
  v: number;
  /** the value is the table's (a point of it, or between two of them): not an angle beyond its ends */
  verified: boolean;
}

/** N_equiv(t) of a table [angle, N] sorted by angle: between two points linearly interpolated, as the standard allows
 *  (UNI EN 81-50:2020, 5.12.2.2); `low` and `high` give the value beyond each end, flagged as not from the table. */
function fromTable(T: readonly (readonly [number, number])[], x: number, low: (x: number) => number, high: (x: number) => number): NeqValue {
  const first = T[0], last = T[T.length - 1];
  if (!first || !last) return { v: NaN, verified: false };
  if (x < first[0] - 1e-9) return { v: low(x), verified: false };
  if (x > last[0] + 1e-9) return { v: high(x), verified: false };
  for (let i = 1; i < T.length; i++) {
    const [a0, n0] = T[i - 1] ?? first, [a1, n1] = T[i] ?? last;
    if (x <= a1 + 1e-9) return { v: Math.abs(x - a1) <= 1e-9 ? n1 : n0 + ((n1 - n0) * (x - a0)) / (a1 - a0), verified: true };
  }
  return { v: first[1], verified: true };
}

/** U-groove with undercut: N grows with β. Below 75° the value of 75° (on the safe side); beyond 105° extrapolated
 *  from the last stretch (registry funi.Nequiv.gola.estremi). */
export function neqBeta(beta: number): NeqValue {
  const T = K.neqU, [b0, n0] = T[T.length - 2] ?? T[0], [b1, n1] = T[T.length - 1] ?? T[0];
  return fromTable(T, beta, () => T[0][1], (b) => n1 + ((n1 - n0) / (b1 - b0)) * (b - b1));
}

/** V-groove: N falls as γ grows. Beyond 50° the value of 50° (on the safe side); below 35° the input is refused
 *  (gammaMin), the value of 35°. */
export function neqGamma(gamma: number): NeqValue {
  const T = K.neqV, end = T[T.length - 1] ?? T[0];
  return fromTable(T, gamma, () => T[0][1], () => end[1]);
}

export function neqT(gr: Groove): NeqValue {
  if (gr.type === 'U') return { v: 1, verified: true };
  if (gr.type === 'UU') return neqBeta(gr.beta);
  if (gr.type === 'VN') return { v: Math.max(neqGamma(gr.gamma).v, neqBeta(gr.beta).v), verified: false };
  return neqGamma(gr.gamma);
}

export type Condition = 'loading' | 'braking' | 'stalled';

export function grooveF(mu: number, gr: Groove, cond: Condition): number {
  const b = rad(gr.beta || 0), g = rad(gr.gamma || 0);
  if (gr.type === 'U' || gr.type === 'UU') {
    const beta = gr.type === 'U' ? 0 : b;
    return (mu * 4 * (Math.cos(g / 2) - Math.sin(beta / 2))) / (Math.PI - beta - g - Math.sin(beta) + Math.sin(g));
  }
  if (gr.type === 'VH' || cond === 'stalled') return mu / Math.sin(g / 2);
  return (mu * 4 * (1 - Math.sin(b / 2))) / (Math.PI - b - Math.sin(b));
}
