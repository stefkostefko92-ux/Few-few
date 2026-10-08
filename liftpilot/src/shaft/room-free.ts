// The free area beside the machine for its maintenance and the manual emergency operation (UNI EN 81-20:2020,
// 5.2.6.3.2.1 b), registry locale.macchina and locale.volantino): a strip of 500 × 600 mm on a side of the machine's
// outline up to the walls or what stands beside it, taken where the handwheel is when it is deep enough there (the
// manual emergency operation is done at the handwheel), else on the side with the most room. Room axes [mm]; pure.
import { KV_VERT } from './norme-vert';
import { panelBox, type Box } from './room-floor';
import type { RoomInputs } from './room';

type Pt = readonly [number, number];

/** How far the point is from the rectangle (0 inside it) [mm]. */
export const pointBoxGap = (p: Pt, [x0, y0, x1, y1]: Box): number => Math.hypot(Math.max(x0 - p[0], 0, p[0] - x1), Math.max(y0 - p[1], 0, p[1] - y1));

/** The free area beside the machine: on the side of the machine's outline `box` [x0, y0, x1, y1] (room axes, its
 *  bedplate and pulley stand with it), the strip to the wall or to the nearest of `obstacles` beside it (the control
 *  panel; the governor and the main switch when given) — as deep as the area's longer side along a side at least as long
 *  as its shorter, or the other way round. Of those deep enough, the one that comes within KV_VERT.wheelReach of the
 *  handwheel `wheel` (when given), else the side with the most room. Its depth, the depth it needs there [mm], the area
 *  itself (as long as it needs along the side, as deep as it needs or as it is, as near the handwheel as the side lets
 *  it; until round 36 the whole side's strip), and how far the handwheel is from it (0 without one). */
export function freeBeside(R: RoomInputs, box: Box, obstacles: readonly Box[] = [panelBox(R)], wheel: Pt | null = null): { depth: number; need: number; area: Box; wheel: number } {
  const [x0, y0, x1, y1] = box, K = KV_VERT, [a, b] = [Math.min(K.maintW, K.maintD), Math.max(K.maintW, K.maintD)];
  // how far each side is from the wall, or from what stands beside it
  let left = x0, right = R.W - x1, front = y0, rear = R.D - y1;
  for (const [px0, py0, px1, py1] of obstacles) {
    const overX = px0 < x1 && x0 < px1, overY = py0 < y1 && y0 < py1;
    if (overY && px1 <= x0) left = Math.min(left, x0 - px1);
    if (overY && px0 >= x1) right = Math.min(right, px0 - x1);
    if (overX && py1 <= y0) front = Math.min(front, y0 - py1);
    if (overX && py0 >= y1) rear = Math.min(rear, py0 - y1);
  }
  // each side: how deep it is free, how long, the strip `d` deep along a stretch [s0, s1] of it
  const sides: { depth: number; len: number; lo: number; strip: (d: number, s0: number, s1: number) => Box }[] = [
    { depth: left, len: y1 - y0, lo: y0, strip: (d, s0, s1) => [x0 - d, s0, x0, s1] },
    { depth: right, len: y1 - y0, lo: y0, strip: (d, s0, s1) => [x1, s0, x1 + d, s1] },
    { depth: front, len: x1 - x0, lo: x0, strip: (d, s0, s1) => [s0, y0 - d, s1, y0] },
    { depth: rear, len: x1 - x0, lo: x0, strip: (d, s0, s1) => [s0, y1, s1, y1 + d] },
  ];
  const ways = sides.flatMap((s) => [...(s.len >= a ? [{ s, need: b, along: a }] : []), ...(s.len >= b ? [{ s, need: a, along: b }] : [])]);
  const all = ways.length ? ways : sides.map((s) => ({ s, need: b, along: Math.min(a, s.len) }));
  // the area itself: as long as it needs along its side, as near the handwheel as the side lets it (else in its middle)
  const areaOf = (w: (typeof all)[number]): Box => {
    const vertical = w.s === sides[0] || w.s === sides[1], c = wheel ? wheel[vertical ? 1 : 0] : w.s.lo + w.s.len / 2;
    const s0 = Math.min(Math.max(c - w.along / 2, w.s.lo), w.s.lo + w.s.len - w.along);
    return w.s.strip(Math.max(0, Math.min(w.s.depth, w.need)), s0, s0 + w.along);
  };
  const gap = (w: (typeof all)[number]): number => (wheel ? pointBoxGap(wheel, areaOf(w)) : 0);
  const margin = (p: (typeof all)[number], w: (typeof all)[number]): boolean => w.s.depth - w.need > p.s.depth - p.need;
  // by the handwheel when one deep enough reaches it (the deepest of those), else the side with the most room
  const near = all.filter((w) => w.s.depth >= w.need && gap(w) <= K.wheelReach);
  const best = (near.length ? near : all).reduce((p, w) => (margin(p, w) ? w : p));
  return { depth: best.s.depth, need: best.need, area: areaOf(best), wheel: gap(best) };
}
