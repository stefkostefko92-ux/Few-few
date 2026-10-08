// Where the references of the loads (P1…P8) go on a plan of the shaft: each at the first of its spots — where it goes as
// a rule, then that offset turned round what it names by 30° steps, then farther — whose circle keeps 2r + 0,5 mm of
// paper from the references placed before it and off their leaders, stays in the shaft and off what it must not hide
// (rails, buffers, pulleys, the plan's lettering and dimensions), its own leaders clear of the other circles, crossing
// no other leader and, where asked, off the plan's axes; failing that the first off the lettering, then of those that
// keep the circles apart the one farthest from it; else where it goes as a rule. The circle's radius on paper is the
// tag's (view.ts: 2,4 mm) taken at 1:25 — the plans are drawn at 1:20 or 1:25 (views.ts PLAN_SCALES), at 1:20 with more
// paper between them. Model millimetres. Pure.
import { TEXT, letterSize, textWidth, type Box, type Entity, type Pt } from '../drawing';

/** The scale the references are spaced for: the larger of the plans' own (views.ts PLAN_SCALES). */
const K = 25;
/** A reference's circle and the paper between two of them, at 1:25 [mm of the model]. */
export const TAG_R = 2.4 * K;
const APART = 2 * TAG_R + 0.5 * K;
/** What a reference keeps off a rail: its foot with the clamp of its bracket [mm]. */
export const RAIL_KEEP = 80;
/** tan 10°: a leader nearer an axis than that runs along it */
const OFF_AXIS = Math.tan((10 * Math.PI) / 180);

export interface TagAsk {
  text: string;
  /** what it names and, for a load shared by several, the others (one leader to each) */
  to: Pt;
  also?: readonly Pt[];
  /** where it goes as a rule */
  at: Pt;
  /** the lower placed first: the higher move round them (the list's order among equals) */
  rank?: number;
  /** its leaders off the plan's axes (two buffers stand on one, a single one on both) */
  offAxes?: boolean;
}

/** What a reference must not hide: a circle round c [mm]. */
export interface TagKeep {
  c: Pt;
  r: number;
}

/** The boxes the plan's lettering, symbols and dimensions across the drawing (their line with its figures either side)
 *  take at 1:25, 0,8 mm of paper round them [mm of the model]: the references keep off them. */
export function letteringBoxes(entities: readonly Entity[]): Box[] {
  return entities.flatMap((e): Box[] => {
    if (e.e === 'chain') {
      const c = e.c, band = (TEXT.dim + 1.2) * K;
      if (c.at === undefined || c.on || c.pts.length < 2) return [];
      const a = Math.min(...c.pts), b = Math.max(...c.pts);
      return [c.dir === 'x' ? { x0: a, y0: c.at - band, x1: b, y1: c.at + band } : { x0: c.at - band, y0: a, x1: c.at + band, y1: b }];
    }
    if (e.e === 'mark') {
      const h = ((e.size ?? 3.4) / 2 + 0.8) * K;
      return [{ x0: e.at[0] - h, y0: e.at[1] - h, x1: e.at[0] + h, y1: e.at[1] + h }];
    }
    if (e.e !== 'text') return [];
    const size = letterSize(e.size), w = textWidth(e.text, { size, bold: e.bold, cond: true }), m = 0.8;
    const x0 = e.align === 'c' ? -w / 2 : e.align === 'r' ? -w : 0, a = ((e.angle ?? 0) * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const pts = [[x0 - m, -0.3 * size - m], [x0 + w + m, -0.3 * size - m], [x0 + w + m, 0.9 * size + m], [x0 - m, 0.9 * size + m]]
      .map(([u, v]) => [e.at[0] + K * (u * c - v * sn), e.at[1] + K * (u * sn + v * c)]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    return [{ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }];
  });
}

/** The distance from p to the box (0 inside). */
const boxGap = (p: Pt, b: Box): number => Math.hypot(Math.max(b.x0 - p[0], 0, p[0] - b.x1), Math.max(b.y0 - p[1], 0, p[1] - b.y1));

/** The distance from p to the segment a–b. */
export const segGap = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

/** The segments a–b and c–d cross (strictly). */
const crosses = (a: Pt, b: Pt, c: Pt, d: Pt): boolean => {
  const side = (p: Pt, q: Pt, r: Pt): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};

/** The spots round `to` an ask tries: its own, then that offset turned by 30° steps either way, then 1,35 and 1,7 times
 *  as far. */
export function spotsRound(to: Pt, at: Pt): Pt[] {
  const vx = at[0] - to[0], vy = at[1] - to[1], out: Pt[] = [];
  for (const k of [1, 1.35, 1.7]) {
    for (const deg of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
      const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      out.push([to[0] + k * (vx * c - vy * s), to[1] + k * (vx * s + vy * c)]);
    }
  }
  return out;
}

/** The tags of `asks`, in their order, placed in the order of their ranks inside `room`, off `keep` and off the boxes
 *  of `avoid` (the plan's lettering: letteringBoxes). */
export function placeTags(asks: readonly TagAsk[], room: Box, keep: readonly TagKeep[], avoid: readonly Box[] = []): Entity[] {
  const order = asks.map((_, i) => i).sort((a, b) => (asks[a].rank ?? 0) - (asks[b].rank ?? 0) || a - b);
  const at: Pt[] = asks.map((a) => a.at), placed: { at: Pt; to: readonly Pt[] }[] = [];
  for (const i of order) {
    const a = asks[i], to = [a.to, ...(a.also ?? [])];
    // what must hold (in the shaft, the circles apart, off what they must not hide), then off the lettering, then the
    // leaders clear
    const apart = (p: Pt): boolean => p[0] >= room.x0 && p[0] <= room.x1 && p[1] >= room.y0 && p[1] <= room.y1
      && placed.every((q) => Math.hypot(p[0] - q.at[0], p[1] - q.at[1]) >= APART) && keep.every((k) => Math.hypot(p[0] - k.c[0], p[1] - k.c[1]) >= k.r + TAG_R);
    const unlettered = (p: Pt): boolean => apart(p) && avoid.every((b) => boxGap(p, b) >= TAG_R);
    const clear = (p: Pt): boolean => unlettered(p)
      && placed.every((q) => q.to.every((t) => segGap(p, q.at, t) >= TAG_R)
        && to.every((t) => segGap(q.at, p, t) >= TAG_R && q.to.every((u) => !crosses(p, t, q.at, u))))
      && (!a.offAxes || to.every((t) => {
        const dx = Math.abs(t[0] - p[0]), dy = Math.abs(t[1] - p[1]);
        return Math.min(dx, dy) >= OFF_AXIS * Math.max(dx, dy);
      }));
    // (none off the lettering: of those that keep apart the one farthest from it)
    const gap = (p: Pt): number => Math.min(Infinity, ...avoid.map((b) => boxGap(p, b)));
    const spots = spotsRound(a.to, a.at), held = spots.filter(apart);
    const p = spots.find(clear) ?? spots.find(unlettered) ?? held.reduce<Pt | undefined>((b, q) => (b && gap(b) >= gap(q) ? b : q), undefined) ?? a.at;
    at[i] = p;
    placed.push({ at: p, to });
  }
  return asks.map((a, i): Entity => ({ e: 'tag', at: at[i], text: a.text, to: a.to, ...(a.also?.length ? { also: a.also } : {}) }));
}
