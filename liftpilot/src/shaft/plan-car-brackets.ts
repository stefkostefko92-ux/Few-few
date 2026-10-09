// The car rails' brackets named in the plans (registry guide.staffe.cabina): the count per rail at the walls the plan
// draws (the headroom's at the top floor: rail-brackets.ts levelHeights) and the type, in the thickness of the wall they
// are anchored to, from a car rail on a wall without the counterweight (whose own code is written there) toward the
// longer stretch of that wall. Pure.
import type { Entity } from '../drawing';
import { onWall } from './plan-walls';
import { bracketReach, carBracketCode } from './staffe-cabina';
import type { Layout } from './types';

export function carBracketLabel(L: Layout, head = false): Entity[] {
  const I = L.inputs, cars = L.rails.filter((r) => r.kind === 'car');
  const r = cars.find((x) => bracketReach(L, x).wall !== L.cwSide) ?? cars[0];
  if (!r) return [];
  const { wall } = bracketReach(L, r), along = wall === 'front' || wall === 'rear', u = along ? r.x : r.y, len = along ? I.W : I.D;
  // from beside the bracket's wall plate (160 mm wide) toward the wall's longer stretch
  const up = len - u > u, at = onWall(L, wall, u + (up ? 1 : -1) * 110, -I.wall / 2);
  return [{ e: 'text', at, text: carBracketCode(L, head), size: 1.6, align: up ? 'l' : 'r', halo: true, angle: along ? 0 : 90 }];
}
