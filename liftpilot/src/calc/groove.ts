// Groove factor and N_equiv(t) of the groove (research 4.4 and 4.5; registry: gole.*, funi.Nequiv.gola.*).
import { K } from './norme';
import { rad } from './math';
import type { Groove } from './types';

export interface NeqValue {
  v: number;
  /** the table point used is one confirmed by the sources (U, β 105°, γ 35°) */
  verified: boolean;
}

// Between table points the value of the less favourable point is used (the table gives no interpolation rule).
export function neqBeta(beta: number): NeqValue {
  const hit = K.neqU.find(([b]) => beta <= b + 1e-9);
  if (hit) return { v: hit[1], verified: hit[0] === 105 };
  const [[b0, n0], [b1, n1]] = K.neqU.slice(-2); // beyond 105°: outside the table, extrapolated
  return { v: n1 + ((n1 - n0) / (b1 - b0)) * (beta - b1), verified: false };
}

export function neqGamma(gamma: number): NeqValue {
  let hit: readonly [number, number] = K.neqV[0];
  for (const p of K.neqV) if (gamma >= p[0] - 1e-9) hit = p;
  return { v: hit[1], verified: hit[0] === 35 };
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
