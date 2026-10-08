// The loads on the head of the shaft of a machine below (loads.ts) on the plan of the shaft at the top floor, where they
// act: P1 on the head pulleys — hung under the slab, or on the floor of the pulley room over it, where the 3D puts them
// (rig.ts: over each rise, and over its run when that is farther than a pulley from it), dashed as seen from under the
// slab where the plan has no rig of its own (rig-view.ts draws them), one reference with a leader to each pulley, the
// load theirs together —; P2 and P3 on the dead ends of a 2:1
// roping under the slab (falls.ts), tagged as the room above tags them (room-loads.ts); P4 on the governor over its
// rope (on its bracket under the slab, or on the pulley room's floor: components/lift3d/governor.ts). Each clear of the
// others, of the rails, of the pulleys and of the plan's lettering, marks and dimensions (tag-place.ts). Plan of the
// shaft [mm]. Pure.
import { path, type Entity, type Pt } from '@/drawing';
import { fallsOf } from '@/shaft/falls';
import { governorSpot } from '@/shaft/governor';
import { planDims } from '@/shaft/plan-dims';
import { planEntities } from '@/shaft/plan-view';
import { ropeWidths } from '@/shaft/ropes';
import { hitchTags } from '@/shaft/room-loads';
import { RAIL_KEEP, TAG_R, letteringBoxes, placeTags, type TagAsk, type TagKeep } from '@/shaft/tag-place';
import type { Layout } from '@/shaft/types';
import type { BottomGeo } from '../lift/bottom';

type P2 = readonly [number, number];

const unit = (a: P2, b: P2): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return l > 1e-9 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : [1, 0];
};
const along = (p: P2, u: P2, k: number): Pt => [p[0] + k * u[0], p[1] + k * u[1]];

/** How far the references stand as a rule [mm]: P1 past the side of the car's first pulley, P4 past the governor. */
const OUT = 260, GOV = 230;

/** The head's loads of a machine below `g` at roping `r`, its pulleys of diameter `Dp` carrying n ropes of d [mm]. */
export function headLoads(L: Layout, g: BottomGeo, r: number, Dp: number, n: number, d: number): Entity[] {
  const F = fallsOf(L, r, Dp), Rp = Dp / 2, half = ropeWidths(n, d).pulley, out: Entity[] = [], keep: TagKeep[] = [];
  // each side's pulleys from its rise toward its run, in the plane they turn in
  const side = (rise: P2, run: P2, count: 1 | 2): Pt[] => {
    const u = unit(rise, run), s = Math.hypot(run[0] - rise[0], run[1] - rise[1]), w: Pt = [-u[1], u[0]];
    return (count === 2 ? [Rp, s - Rp] : [Rp]).map((k) => {
      const c = along(rise, u, k), corner = (a: number, b: number): Pt => [c[0] + a * Rp * u[0] + b * half * w[0], c[1] + a * Rp * u[1] + b * half * w[1]];
      // (drawn here only where the plan has no rig of its own: rig-view.ts draws the pulleys it hangs)
      if (!L.rig) out.push(path([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], true, 'hidden'));
      keep.push({ c, r: Math.max(Rp, half) });
      return c;
    });
  };
  const car = side(F.car, g.mc, g.carPulleys), cw = side(F.cw, g.mw, g.cwPulleys), [c1] = car;
  // P1 beside the car's first pulley, square to its plane on the side of the car's centre
  const u = unit(F.car, g.mc), w: Pt = [-u[1], u[0]], s = (g.car[0] - c1[0]) * w[0] + (g.car[1] - c1[1]) * w[1] >= 0 ? 1 : -1;
  const asks: TagAsk[] = [{ text: 'P1', to: c1, also: [...car.slice(1), ...cw], at: along(c1, w, s * (half + OUT)), rank: 1 }];
  const [ux, uy] = unit(g.car, g.cw);
  for (const t of hitchTags({ deadEnds: F.dead, ux, uy })) if (t.e === 'tag' && t.to) asks.push({ text: t.text, to: t.to, at: t.at });
  const gov = governorSpot(L);
  if (gov) {
    // on the governor's frame over its rope, its reference toward the car
    const at: Pt = [gov.x, (gov.y1 + gov.y2) / 2], inward = gov.side === 'left' ? 1 : -1;
    asks.push({ text: 'P4', to: at, at: [at[0] + inward * GOV, at[1] + GOV] });
    keep.push({ c: at, r: gov.G.R });
  }
  keep.push(...L.rails.map((rl): TagKeep => ({ c: [rl.x, rl.y], r: RAIL_KEEP })));
  // off the plan's lettering, marks and dimensions across it (the brackets' codes, the counterweight's name, the marks on
  // the car roof, the refuge's and the drops' dimensions)
  const top = L.inputs.vertical.floors.length - 1, T = L.inputs.wall - TAG_R;
  const avoid = letteringBoxes([...planEntities(L, 'top', top), ...planDims(L, 'top', top, { level: 'in Testata' })]);
  return [...out, ...placeTags(asks, { x0: -T, y0: -T, x1: L.inputs.W + T, y1: L.inputs.D + T }, keep, avoid)];
}
