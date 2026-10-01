// The governor's rope in the plans of the shaft as the 3D runs it (components/lift3d/governor.ts): its two strands at
// every level — the one clamped to the car and the free one — and in the pit the tension weight under them
// (components/lift3d/tension.ts): the pulley seen from above, the lever's bars from the hinge by the car rail with the
// weight at their end, or the vertical kind's channel on the rail with the weight hung under the pulley. Pure.
import { line, rect, type Entity } from '../drawing';
import { TENSION, governorSpot } from './governor';
import { RAILS } from './rails';
import type { Layout } from './types';

export function governorPlan(L: Layout, pit: boolean): Entity[] {
  const g = governorSpot(L);
  if (!g) return [];
  const { x, y1, y2, G } = g, yc = (y1 + y2) / 2, T = TENSION, out: Entity[] = [];
  if (!pit) return [y1, y2].map((y): Entity => ({ e: 'mark', at: [x, y], sym: 'dot', size: 0.9 }));
  const box = (a0: number, a1: number, w0: number, w1: number, st: 'outline' | 'thin' | 'hidden', fill?: 'steel' | 'cw' | 'paper'): Entity => rect(x + a0, yc + w0, x + a1, yc + w1, st, fill);
  const hinge = -(Math.abs(g.rail.y - yc) - RAILS[L.inputs.carRail].b / 2 - T.hinge);
  if (g.lever) {
    const [wa, ww] = T.lever;
    out.push(box(-wa / 2, wa / 2, T.weightAt - ww / 2, T.weightAt + ww / 2, 'outline', 'cw'));
    for (const s of [-1, 1]) out.push(box(Math.min(s * T.bar, s * (T.bar + T.barT)), Math.max(s * T.bar, s * (T.bar + T.barT)), hinge - 25, T.weightAt + ww / 2 + 10, 'outline', 'steel'));
  } else {
    const [wa, ww] = T.hang;
    out.push(box(-30, 30, hinge - 20, hinge + 20, 'outline', 'steel'), box(-wa / 2, wa / 2, -ww / 2, ww / 2, 'hidden'));
  }
  out.push(box(-G.half, G.half, -G.R, G.R, 'outline', 'paper'), line([x - G.half - 40, yc], [x + G.half + 40, yc], 'axis'));
  // the label below the pulley, toward the car: the car rail's load P5 is tagged beside the pulley
  const inward = g.side === 'left' ? 1 : -1;
  out.push({ e: 'text', at: [x + inward * (G.half + 70), yc - G.R - 70], text: `Tenditore ${g.lever ? T.leverKg : T.hangKg} kg`, size: 1.6, align: inward > 0 ? 'l' : 'r', halo: true });
  return out;
}
