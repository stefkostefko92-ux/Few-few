// The governor's rope in the plans of the shaft as the 3D runs it (components/lift3d/governor.ts): its two strands at
// every level — the one clamped to the car and the free one — and in the pit the tension weight under them
// (components/lift3d/tension.ts): the pulley seen from above, the lever's bars from the hinge by the car rail with the
// weight at their end, or the vertical kind's channel on the rail with the weight hung under the pulley. Pure.
import { TEXT, chain, edit as E, line, rect, type Edit, type Entity } from '../drawing';
import { TENSION, governorSpot, type GovernorSpot } from './governor';
import { RAILS } from './rails';
import type { Layout } from './types';

export function governorPlan(L: Layout, pit: boolean): Entity[] {
  const g = governorSpot(L);
  if (!g) return [];
  // the tension weight's frame runs from the rail through the pulley: toward +y, or −y with the rope in front of the rail
  const { x, y1, y2, G } = g, yc = (y1 + y2) / 2, T = TENSION, out: Entity[] = [], sw = y1 >= g.rail.y ? 1 : -1;
  if (!pit) return [y1, y2].map((y): Entity => ({ e: 'mark', at: [x, y], sym: 'dot', size: 0.9 }));
  const box = (a0: number, a1: number, w0: number, w1: number, st: 'outline' | 'thin' | 'hidden', fill?: 'steel' | 'cw' | 'paper'): Entity => rect(x + a0, yc + sw * w0, x + a1, yc + sw * w1, st, fill);
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
  out.push({ e: 'text', at: [x + inward * (G.half + 70), yc - G.R - 70], text: `Tenditore ${g.lever ? T.leverKg : T.hangKg} kg`, size: TEXT.min, align: inward > 0 ? 'l' : 'r', halo: true });
  return out;
}

/** The edit of the clamped strand's distance from the car rail's axis (plan.govY, from the front wall): its side of the
 *  axis stays. */
export const govYEdit = (g: GovernorSpot): Edit => E('plan.govY', g.rail.y, g.y1 >= g.rail.y ? 1 : -1);

/** The governor rope's place as the plan at the main floor dimensions it: its plane from the side wall it runs by
 *  (plan.govX) behind its strands, and the strand clamped to the car from the car rail's axis (plan.govY) along the
 *  rope's plane. */
export function governorDims(L: Layout): Entity[] {
  const g = governorSpot(L);
  if (!g) return [];
  const W = L.inputs.W, left = g.side === 'left', y = g.y2 + g.G.R + 140, [a, b] = [Math.min(g.rail.y, g.y1), Math.max(g.rail.y, g.y1)];
  return [
    chain({ dir: 'x', pts: left ? [0, g.x] : [g.x, W], at: y, from: left ? [null, g.y2] : [g.y2, null], text: ['Fune limitatore {v}'], edit: [E('plan.govX')] }),
    chain({ dir: 'y', pts: [a, b], at: g.x, from: g.y1 >= g.rail.y ? [g.rail.x, null] : [null, g.rail.x], text: ['{v} da asse guida'], edit: [govYEdit(g)] }),
  ];
}
