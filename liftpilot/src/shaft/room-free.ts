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
 *  as its shorter, or the other way round. No side that long (a governor's footprint): the area as long as it needs along
 *  a side's line past its ends, from its middle and within the walls, its depth what stands beside that whole stretch
 *  leaves (round 37: until then only the side's own length, the area drawn 400 × 600 and written 500 × 600). Of those
 *  deep enough, the one that comes within KV_VERT.wheelReach of the handwheel `wheel` (when given), else the side with
 *  the most room. Its depth, the depth it needs there [mm], the area itself (as long as it needs along the side, as deep
 *  as it needs or as it is, as near the handwheel as the side lets it; until round 36 the whole side's strip), and how
 *  far the handwheel is from it (0 without one). */
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
  // each side: how deep it is free, how long, where it starts along its line (upright: along y) and how long that line
  // runs wall to wall, how far the wall is, the strip `d` deep along a stretch [s0, s1] of it, how far a thing beside it
  // stands off it (across its line: 0; on the other side of it: none)
  type Side = { depth: number; len: number; lo: number; upright: boolean; wall: number; strip: (d: number, s0: number, s1: number) => Box; off: (o: Box) => number };
  const sides: Side[] = [
    { depth: left, len: y1 - y0, lo: y0, upright: true, wall: x0, strip: (d, s0, s1) => [x0 - d, s0, x0, s1], off: (o) => (o[0] < x0 ? x0 - o[2] : Infinity) },
    { depth: right, len: y1 - y0, lo: y0, upright: true, wall: R.W - x1, strip: (d, s0, s1) => [x1, s0, x1 + d, s1], off: (o) => (o[2] > x1 ? o[0] - x1 : Infinity) },
    { depth: front, len: x1 - x0, lo: x0, upright: false, wall: y0, strip: (d, s0, s1) => [s0, y0 - d, s1, y0], off: (o) => (o[1] < y0 ? y0 - o[3] : Infinity) },
    { depth: rear, len: x1 - x0, lo: x0, upright: false, wall: R.D - y1, strip: (d, s0, s1) => [s0, y1, s1, y1 + d], off: (o) => (o[3] > y1 ? o[1] - y1 : Infinity) },
  ];
  // where along its side an area `along` long goes: as near the handwheel as the side lets it (else in its middle) — past
  // the side's ends when the side is shorter, still along all of it, within the walls
  const startOf = (s: Side, along: number): number => {
    const c = wheel ? wheel[s.upright ? 1 : 0] : s.lo + s.len / 2, run = s.upright ? R.D : R.W;
    const [lo, hi] = along <= s.len ? [s.lo, s.lo + s.len - along] : [Math.max(0, s.lo + s.len - along), Math.min(run - along, s.lo)];
    return Math.min(Math.max(c - along / 2, lo), hi);
  };
  // the depth free off a side over the stretch [s0, s1] of its line: to the wall, or to the nearest thing beside it there
  // (what overlaps the outline itself is not beside it: the checks of the outline's place find it, as on its own sides)
  const own = (o: Box): boolean => o[0] < x1 && x0 < o[2] && o[1] < y1 && y0 < o[3];
  const over = (s: Side, s0: number, s1: number): number => obstacles.reduce((d, o) => {
    const [p0, p1] = s.upright ? [o[1], o[3]] : [o[0], o[2]];
    return p0 < s1 && s0 < p1 && !own(o) ? Math.min(d, Math.max(0, s.off(o))) : d;
  }, s.wall);
  type Way = { s: Side; need: number; along: number; depth: number; s0: number };
  // past the side's ends: of the stretches along all of it within the walls — from its middle (by the handwheel), flush
  // with either end, or just clear of what stands beside it — the deepest, the nearest the middle of those
  const way = (s: Side, need: number, along: number, past: boolean): Way => {
    const mid = startOf(s, along);
    if (!past) return { s, need, along, s0: mid, depth: s.depth };
    const run = s.upright ? R.D : R.W, lo = Math.max(0, s.lo + s.len - along), hi = Math.min(run - along, s.lo);
    const ends = obstacles.flatMap((o) => (s.upright ? [o[3], o[1] - along] : [o[2], o[0] - along]));
    const starts = [mid, lo, hi, ...ends].map((t) => Math.min(Math.max(t, lo), hi));
    return starts.map((s0) => ({ s, need, along, s0, depth: over(s, s0, s0 + along) }))
      .reduce((p, w) => (w.depth > p.depth + 1e-9 || (Math.abs(w.depth - p.depth) <= 1e-9 && Math.abs(w.s0 - mid) < Math.abs(p.s0 - mid)) ? w : p));
  };
  const ways = sides.flatMap((s) => [...(s.len >= a ? [way(s, b, a, false)] : []), ...(s.len >= b ? [way(s, a, b, false)] : [])]);
  const all = ways.length ? ways : sides.flatMap((s) => [way(s, b, a, true), way(s, a, b, true)]);
  // the area itself: as long as it needs along its side, as deep as it needs or as it is
  const areaOf = (w: Way): Box => w.s.strip(Math.max(0, Math.min(w.depth, w.need)), w.s0, w.s0 + w.along);
  const gap = (w: Way): number => (wheel ? pointBoxGap(wheel, areaOf(w)) : 0);
  const margin = (p: Way, w: Way): boolean => w.depth - w.need > p.depth - p.need;
  // by the handwheel when one deep enough reaches it (the deepest of those), else the side with the most room
  const near = all.filter((w) => w.depth >= w.need && gap(w) <= K.wheelReach);
  const best = (near.length ? near : all).reduce((p, w) => (margin(p, w) ? w : p));
  return { depth: best.depth, need: best.need, area: areaOf(best), wheel: gap(best) };
}
