// The rope drop (calata) changed where it is drawn: the distance from the car's rope drop to the counterweight's,
// taken by moving the counterweight at the back (its wall gap; the car keeps its depth) or the car beside a side
// counterweight. A length that is the drop less a constant (a diverting pulley's distance from the sheave) moves them
// the same way. Along the plan's axes only: `exact` refuses drops that run askew (the true distance would not follow
// one input), else the axis the counterweight stands across is taken.
import { edit as E, type Edit } from '../drawing';
import { cwNiche } from './niche';
import type { Layout } from './types';

export function calataEdit(L: Layout, less = 0, exact = false): Edit | null {
  const I = L.inputs, car = L.car, c = L.cw, nd = cwNiche(I, L.cwSide)?.depth ?? 0;
  const cx = car.x + car.w / 2, cy = car.y + car.h / 2, ax = c.x + c.w / 2, ay = c.y + c.h / 2;
  if (L.cwSide === 'rear') {
    if (exact && Math.abs(ax - cx) > 0.5) return null;
    return E('cwWallGap', I.D + nd - I.cwDepth / 2 - cy - less, -1, [{ key: 'plan.B', value: L.B }]);
  }
  if (exact && Math.abs(ay - cy) > 0.5) return null;
  return L.cwSide === 'left' ? E('plan.carX', ax - car.w / 2 + less) : E('plan.carX', ax - car.w / 2 - less, -1);
}
