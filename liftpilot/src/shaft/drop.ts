// The rope drop (calata) changed where it is drawn: the distance from the car's rope drop to the counterweight's,
// taken by moving the counterweight at the back (its wall gap; the car keeps its depth) or the car beside a side
// counterweight. A length that is the drop less a constant (a diverting pulley's distance from the sheave) moves them
// the same way. Along the plan's axes only: `exact` refuses drops that run askew (the true distance would not follow
// one input), else the axis the counterweight stands across is taken — its leg along that axis, or with `slant` the
// true distance along the drop line (the other leg stays as it is: Edit.across).
import { chain, edit as E, type Edit, type Entity, type Pt } from '../drawing';
import { cwNiche } from './niche';
import type { Layout } from './types';

/** The drops' centres (the car's, the counterweight's) and how far the counterweight stands off the axis it is set
 *  across from the car's (0: the drop runs along an axis). */
function drops(L: Layout): { cx: number; cy: number; ax: number; ay: number; off: number } {
  const car = L.car, c = L.cw, cx = car.x + car.w / 2, cy = car.y + car.h / 2, ax = c.x + c.w / 2, ay = c.y + c.h / 2;
  return { cx, cy, ax, ay, off: L.cwSide === 'rear' ? Math.abs(ax - cx) : Math.abs(ay - cy) };
}

/** The drop runs askew: the counterweight off the car's axis. */
export const dropAskew = (L: Layout): boolean => drops(L).off > 0.5;

export function calataEdit(L: Layout, less = 0, exact = false, slant = false): Edit | null {
  const I = L.inputs, car = L.car, nd = cwNiche(I, L.cwSide)?.depth ?? 0, { cy, ax, off } = drops(L);
  if (exact && off > 0.5) return null;
  const e = L.cwSide === 'rear'
    ? E('cwWallGap', I.D + nd - I.cwDepth / 2 - cy - less, -1, [{ key: 'plan.B', value: L.B }])
    : L.cwSide === 'left' ? E('plan.carX', ax - car.w / 2 + less) : E('plan.carX', ax - car.w / 2 - less, -1);
  // askew, the length typed is the drop along its line less `less`: the input's leg comes from it (Edit.across, plus)
  return slant && off > 0.5 ? { ...e, base: e.base - e.k * less, across: off, plus: less } : e;
}

/** A drop askew: the true rope drop drawn along its line, from the car's drop to the counterweight's, `gap` beside it
 *  on the side the plan's own chain of the drop stands (−x of a rear counterweight, −y of a side one), changed as its
 *  true length (calataEdit, slant); null when the drop runs along an axis (the plan's chain along it is the drop). */
export function slantDrop(L: Layout, gap: number): Entity | null {
  const { cx, cy, ax, ay, off } = drops(L), len = Math.hypot(ax - cx, ay - cy);
  if (off <= 0.5 || len < 1) return null;
  const u: Pt = [(ax - cx) / len, (ay - cy) / len], side: Pt = L.cwSide === 'rear' ? [-gap, 0] : [0, -gap];
  return chain({ dir: L.cwSide === 'rear' ? 'y' : 'x', on: { o: [cx, cy], u }, pts: [0, len], at: -side[0] * u[1] + side[1] * u[0], from: [0, 0],
    text: ['Calata ({v})'], edit: [calataEdit(L, 0, false, true)] });
}
