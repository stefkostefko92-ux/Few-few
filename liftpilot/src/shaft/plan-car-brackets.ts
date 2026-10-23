// The car rails' brackets named in the plans (registry guide.staffe.cabina): the count per rail at the walls the plan
// draws (the headroom's at the top floor: rail-brackets.ts levelHeights) and the type, in the thickness of the wall they
// are anchored to — at the first place clear of the plan's lettering already there (the
// counterweight rails' codes, on whichever wall their brackets reach) and inside the wall's length: from beside a car
// rail's bracket toward the longer stretch of its wall, toward the shorter, along the wall's middle, from either of its
// ends, the rails whose wall has no counterweight first; where the wall has no such room, in the wall next to it from
// the corner, on a leader to the bracket; where no wall has it (a code longer than the wall at 1:50), at the first of
// those places clear of the lettering though it runs past the wall's end; else at the one that covers least of the
// names, then of the rest. Pure.
import type { Box, Entity } from '../drawing';
import { onWall } from './plan-walls';
import { bracketReach, carBracketCode } from './staffe-cabina';
import { TAG_SCALE, letteringBoxes } from './tag-place';
import type { Layout, Wall } from './types';

/** How far from the car rail the code starts (past the bracket's wall plate, 160 mm wide), and from a wall's end [mm]. */
const PAST_PLATE = 110, FROM_END = 60;

type Text = Extract<Entity, { e: 'text' }>;

/** `taken`: the boxes of the lettering the plan has there (letteringBoxes at its `scale`), `names` those of its names
 *  (the counterweight rails' codes among them), which a code that fits nowhere covers last; `head`: the plan at the top
 *  floor, the brackets counted in the headroom. */
export function carBracketLabel(L: Layout, taken: readonly Box[] = [], scale: number = TAG_SCALE, names: readonly Box[] = [], head = false): Entity[] {
  const I = L.inputs, T = I.wall, cars = L.rails.filter((r) => r.kind === 'car'), text = carBracketCode(L, head);
  const onCw = (w: string): number => Number(w === L.cwSide);
  const order = [...cars].sort((a, b) => onCw(bracketReach(L, a).wall) - onCw(bracketReach(L, b).wall));
  const lenOf = (w: Wall): number => (w === 'front' || w === 'rear' ? I.W : I.D);
  const label = (w: Wall, u: number, align: 'l' | 'r' | 'c'): Text =>
    ({ e: 'text', at: onWall(L, w, u, -T / 2), text, size: 1.6, align, halo: true, angle: w === 'front' || w === 'rear' ? 0 : 90 });
  const spots: Text[] = [];
  for (const r of order) {
    const { wall } = bracketReach(L, r), len = lenOf(wall), u = wall === 'front' || wall === 'rear' ? r.x : r.y, longer = len - u > u;
    for (const up of [longer, !longer]) spots.push(label(wall, u + (up ? 1 : -1) * PAST_PLATE, up ? 'l' : 'r'));
    spots.push(label(wall, len / 2, 'c'), label(wall, -T + FROM_END, 'l'), label(wall, len + T - FROM_END, 'r'));
  }
  // (along its wall within the shaft's outline; across it the wall's thickness holds it)
  const inWall = (b: Box, along: boolean): boolean => (along ? b.x0 >= -T - 1 && b.x1 <= I.W + T + 1 : b.y0 >= -T - 1 && b.y1 <= I.D + T + 1);
  const meets = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const free = (s: Text): boolean => letteringBoxes([s], scale).every((b) => inWall(b, !s.angle) && taken.every((q) => !meets(b, q)));
  const got = spots.find(free);
  if (got) return [got];
  // the wall next to a rail's own, from the corner they share, on a leader to the bracket's anchors in the wall (a wall
  // without landing doors first: none of its openings under the lettering)
  const leaders = order.map((r) => {
    const { wall } = bracketReach(L, r), along = wall === 'front' || wall === 'rear', u = along ? r.x : r.y, atEnd = 2 * u > lenOf(wall);
    const next: Wall = along ? (atEnd ? 'right' : 'left') : atEnd ? 'rear' : 'front', start = wall === 'front' || wall === 'left' ? 0 : lenOf(next);
    return { s: label(next, start === 0 ? -T + FROM_END : start + T - FROM_END, start === 0 ? 'l' : 'r'), to: onWall(L, wall, u, -T / 2), doors: L.doors.some((d) => d.wall === next) };
  }).sort((a, b) => Number(a.doors) - Number(b.doors));
  // (the lettering set off on its leader: renderView draws it at `out`, whatever its room)
  const led = (c: (typeof leaders)[number]): Text => ({ ...c.s, at: c.to, out: c.s.at, fit: 1 });
  const lead = leaders.find((c) => free(c.s));
  if (lead) return [led(lead)];
  // a code longer than its wall (at 1:50): the first of the places by the rails clear of the lettering, running past
  // the wall's end — rather than over another code or a name inside it
  const past = spots.find((s) => letteringBoxes([s], scale).every((b) => taken.every((q) => !meets(b, q))));
  if (past) return [past];
  // where no place is clear: the one that covers least of the plan's names (the counterweight's codes among them), then
  // within its wall's length, then least of the rest of its lettering
  const all = [...spots.map((x) => ({ at: x, set: x })), ...leaders.map((c) => ({ at: c.s, set: led(c) }))];
  const area = (bs: readonly Box[], qs: readonly Box[]): number =>
    bs.reduce((t, b) => t + qs.reduce((u, q) => u + Math.max(0, Math.min(b.x1, q.x1) - Math.max(b.x0, q.x0)) * Math.max(0, Math.min(b.y1, q.y1) - Math.max(b.y0, q.y0)), 0), 0);
  const score = (x: Text): number[] => {
    const bs = letteringBoxes([x], scale);
    return [area(bs, names), Number(!bs.every((b) => inWall(b, !x.angle))), area(bs, taken)];
  };
  const less = (a: readonly number[], b: readonly number[]): boolean => {
    const i = a.findIndex((v, j) => v !== b[j]);
    return i >= 0 && a[i] < (b[i] ?? 0);
  };
  const best = all.map((x) => ({ x, k: score(x.at) })).reduce<{ x: (typeof all)[number]; k: number[] } | undefined>((m, c) => (!m || less(c.k, m.k) ? c : m), undefined);
  return best ? [best.x.set] : [];
}
