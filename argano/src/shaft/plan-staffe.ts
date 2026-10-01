// Panev's support of a counterweight rail seen from above, from the catalogue's outlines (staffe.ts): the plate with
// its arm out from the wall (or from the back of the niche), the SG along the arm with its flange behind the rail's
// foot, the two N1 clips over the foot's edges; and its catalogue code. Null when the design uses generic brackets or
// no support of the catalogue takes the rail (then the check v_staffa says so).
import { path, type Entity, type Pt } from '../drawing';
import { cwNiche } from './niche';
import { RAILS } from './rails';
import { N1, PLATES, SG_T, cwBracketsOf, cwSupport, seatRail, supportCode } from './staffe';
import type { Layout, Rail, Wall } from './types';

/** Model point of (u along the wall, v into the shaft from its face). */
function onWall(L: Layout, w: Wall, u: number, v: number): Pt {
  const { W, D } = L.inputs;
  return w === 'front' ? [u, v] : w === 'rear' ? [u, D - v] : w === 'left' ? [v, u] : [W - v, u];
}

/** How far along its wall the bracket of a counterweight rail reaches [mm in the wall's own u]: Panev's plate with
 *  its SG and clips, or a generic bracket as wide as the rail's foot and its clips. */
export function bracketSpan(L: Layout, r: Rail): { wall: Wall; u0: number; u1: number } | null {
  const I = L.inputs, s = RAILS[I.cwRail], n = cwNiche(I, L.cwSide);
  if (r.kind !== 'cw') return null;
  const g = cwBracketsOf(I) === 'panev' ? cwSupport(r, s.h, I.W, I.D, n ? [n.at, n.at + n.width] : undefined) : null;
  if (!g) {
    const wall: Wall = L.cwSide, along = wall === 'rear' ? r.x : r.y;
    return { wall, u0: along - s.b / 2 - 40, u1: along + s.b / 2 + 40 };
  }
  const k = PLATES[g.sup.kind], sx = g.mirror ? -1 : 1, u0 = g.foot - sx * k.arm[1], ends = [u0, u0 + sx * k.flange, u0 + sx * (k.arm[1] + N1.top)];
  return { wall: g.wall, u0: Math.min(...ends), u1: Math.max(...ends) };
}

export function panevSupportPlan(L: Layout, r: Rail, label: boolean): Entity[] | null {
  const I = L.inputs, s = RAILS[I.cwRail], n = cwNiche(I, L.cwSide);
  if (r.kind !== 'cw' || cwBracketsOf(I) !== 'panev') return null;
  const g = cwSupport(r, s.h, I.W, I.D, n ? [n.at, n.at + n.width] : undefined);
  if (!g) return null;
  // the support's frame: x along the wall from its flange's end, y out from the wall
  const k = PLATES[g.sup.kind], xf = k.arm[1], sx = g.mirror ? -1 : 1, u0 = g.foot - sx * xf;
  const P = (x: number, y: number): Pt => onWall(L, g.wall, u0 + sx * x, y - g.inset);
  const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
  const out: Entity[] = [path(k.outline(g.sup.Lp).map(([x, y]) => P(x, y)), true, 'thin', 'steel')];
  // the SG on the arm where the rail sits on it (as the 3D seats it), its flange behind the foot
  const l = g.sup.sg, far = g.reach > (g.sup.range[0] + g.sup.range[1]) / 2, { c, seats } = seatRail(l, far ? l : 0, 0, g.reach - 10, s.b / 2), y0 = g.reach - c;
  out.push(path(box(xf - 80, y0, xf, y0 + l), true, 'thin'), path(box(xf - SG_T, y0, xf, y0 + l), true, 'thin', 'steel'));
  for (const [side, d] of seats) {
    const a = g.reach + side * (d - N1.nose), b = g.reach + side * (d + N1.heel);
    out.push(path(box(xf, Math.min(a, b), xf + N1.top, Math.max(a, b)), true, 'thin'));
  }
  if (label) out.push({ e: 'text', at: P((k.arm[0] + k.arm[1]) / 2, g.sup.Lp + 70), text: `${supportCode(g.sup)} + SG 80 ${l}`, size: 1.8, align: 'c' });
  return out;
}
