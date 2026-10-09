// A chain along a line across the axes (a rope drop surveyed askew: room-view.ts). Its points are distances along the
// line from its origin, its dimension line stands `at` to the line's left, its extension lines start `from` across it
// (undefined: on the line; null: none), a gap off the element, and run a little past the dimension line. Arrowheads
// inside a segment long enough for them, else from outside. Each value beside the dimension line on the side away from
// the line measured, turned along it to read from the left or from below: in its segment, or past the chain's far end
// on the dimension line run on beside it; where that lies on a lettering already on the sheet (or on a box the chain
// keeps off, or out of the one it keeps in), moved along its segment, to the line's other side, past either end — the
// first clear, by the turned lettering's own outline (not the box round it); none clear, the one least on them. Paper
// conventions as the level chains' (dims.ts).
import { DIM, valueBox } from './dims';
import { toPaper, type Place } from './geom';
import { textBox, textQuad, textWidth } from './metrics';
import type { Chain } from './model';
import { STYLES, TEXT } from './style';
import { arrowhead } from './symbols';
import type { Align, Box, Pt, Shape, TextShape } from './types';

const fmt = (v: number): string => String(Math.round(v));
const along = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k];

/** A turned lettering's outline and a box closer than 0.2 mm (separating axes: the box's and the outline's). */
function meets(q: readonly Pt[], b: Box): boolean {
  const corners: Pt[] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const axes: Pt[] = [[1, 0], [0, 1], [q[1][0] - q[0][0], q[1][1] - q[0][1]], [q[3][0] - q[0][0], q[3][1] - q[0][1]]];
  return axes.every(([ax, ay]) => {
    const n = Math.hypot(ax, ay) || 1, on = (p: Pt): number => (p[0] * ax + p[1] * ay) / n;
    const a = q.map(on), c = corners.map(on);
    return Math.min(Math.max(...a), Math.max(...c)) - Math.max(Math.min(...a), Math.min(...c)) > -0.2;
  });
}

/** How much of a turned lettering lies on the boxes (points of a grid over it on any) or out of `keep`. */
function onBoxes(q: readonly Pt[], boxes: readonly Box[], keep: Box | null): number {
  let n = 0;
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 2; j++) {
    const s = i / 8, t = j / 2, p: Pt = [q[0][0] + (q[1][0] - q[0][0]) * s + (q[3][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * s + (q[3][1] - q[0][1]) * t];
    if (keep && (p[0] < keep.x0 || p[0] > keep.x1 || p[1] < keep.y0 || p[1] > keep.y1)) n += 100;
    else if (boxes.some((b) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1)) n += 1;
  }
  return n;
}

export function obliqueShapes(c: Chain & { on: { o: Pt; u: Pt } }, place: Place, onText?: (s: TextShape, i: number, value: number) => void,
  taken?: Box[]): Shape[] {
  const out: Shape[] = [], { o, u } = c.on, n: Pt = [-u[1], u[0]], at = c.at ?? 0, pts = c.pts, m = pts.length;
  if (m < 2) return out;
  // a point s along the line and t to its left (model mm), on paper: the paper keeps the model's directions
  const P = (s: number, t: number): Pt => toPaper(place, [o[0] + s * u[0] + t * n[0], o[1] + s * u[1] + t * n[1]]);
  pts.forEach((s, i) => {
    const f = Array.isArray(c.from) ? c.from[i] : c.from;
    if (f === null) return;
    const a = P(s, f ?? 0), b = P(s, at), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= DIM.gap) return;
    const d: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    out.push({ t: 'line', a: along(a, d, DIM.gap), b: along(b, d, DIM.over), s: STYLES.dim });
  });
  const [e0, e1] = [P(pts[0], at), P(pts[m - 1], at)];
  out.push({ t: 'line', a: e0, b: e1, s: STYLES.dim });
  // the lettering's direction (read from the left or from below) and its up side
  let deg = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  if (deg > 90 + 1e-9) deg -= 180;
  else if (deg <= -90 + 1e-9) deg += 180;
  const r = (deg * Math.PI) / 180, dir: Pt = [Math.cos(r), Math.sin(r)], up: Pt = [-Math.sin(r), Math.cos(r)];
  // over the line when its up side looks away from the line measured, else under it
  const lift = (at >= 0) === (up[0] * n[0] + up[1] * n[1] >= 0) ? DIM.textGap : -(DIM.textGap + TEXT.dim);
  // the chain's far end in the reading direction, where a value too long for its segment goes
  const [far, farAt] = (e1[0] - e0[0]) * dir[0] + (e1[1] - e0[1]) * dir[1] >= 0 ? [e1, m - 1] : [e0, 0];
  const [near, nearAt] = farAt === m - 1 ? [e0, 0] : [e1, m - 1], other = lift > 0 ? -(DIM.textGap + TEXT.dim) : DIM.textGap;
  // what the lettering keeps off and in, on paper
  const box = (b: Box): Box => {
    const [x0, y0] = toPaper(place, [b.x0, b.y0]), [x1, y1] = toPaper(place, [b.x1, b.y1]);
    return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
  };
  const avoid = (c.avoid ?? []).map(box), keep = c.within ? box(c.within) : null;
  for (let i = 0; i + 1 < m; i++) {
    const a = P(pts[i], at), b = P(pts[i + 1], at), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), inside = len >= 2 * DIM.arrow + 0.6;
    out.push(arrowhead(a, inside ? ang + Math.PI : ang), arrowhead(b, inside ? ang : ang + Math.PI));
    const value = Math.abs(pts[i + 1] - pts[i]), tpl = c.text?.[i], text = tpl == null ? fmt(value) : tpl.replace('{v}', fmt(value));
    if (!text) continue;
    const w = textWidth(text, { size: TEXT.dim, cond: true }), atFar = i === farAt || i + 1 === farAt, atNear = i === nearAt || i + 1 === nearAt;
    const fits = w + 0.6 <= len, gap = inside ? 0.8 : DIM.arrow + 0.5, mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const mk = (p: Pt, align: Align): TextShape => ({ t: 'text', at: p, text, size: TEXT.dim, angle: deg, align, cond: true, halo: true });
    const inSeg = (d: number, l: number): Spot => ({ s: mk(along(along(mid, dir, d), up, l), 'c') });
    const pastFar = (l: number): Spot => ({ s: mk(along(along(far, dir, gap), up, l), 'l'), run: [far, along(far, dir, gap + w + 0.3)] });
    const pastNear = (l: number): Spot => ({ s: mk(along(along(near, dir, -gap), up, l), 'r'), run: [near, along(near, dir, -(gap + w + 0.3))] });
    // where it always went first; then along its segment, on the line's other side, past either end
    const spots: Spot[] = [fits || !atFar ? inSeg(0, lift) : pastFar(lift)];
    for (const l of [lift, other]) {
      if (l !== lift && (fits || !atFar)) spots.push(inSeg(0, l));
      if (fits) for (const k of [1, 2]) for (const sg of [-1, 1]) if (k * (w / 2 + 1) + w / 2 + 0.3 <= len / 2) spots.push(inSeg(sg * k * (w / 2 + 1), l));
    }
    for (const l of [lift, other]) {
      if (atFar && (fits || l !== lift)) spots.push(pastFar(l));
      if (atNear) spots.push(pastNear(l));
    }
    const on = [...(taken ?? []), ...avoid], cost = spots.map((q) => {
      const quad = textQuad(q.s);
      return (keep && quad.some((p) => p[0] < keep.x0 || p[0] > keep.x1 || p[1] < keep.y0 || p[1] > keep.y1)) || on.some((t) => meets(quad, t)) ? 1 + onBoxes(quad, on, keep) : 0;
    });
    const spot = spots[cost.reduce((best, x, k) => (x < cost[best] ? k : best), 0)];
    if (spot.run) out.push({ t: 'line', a: spot.run[0], b: spot.run[1], s: STYLES.dim });
    out.push(spot.s);
    taken?.push(valueBox(textBox(spot.s)));
    onText?.(spot.s, i, value);
  }
  return out;
}

/** A place for a lettering, with the dimension line run on under it past an end of the chain. */
interface Spot {
  s: TextShape;
  run?: readonly [Pt, Pt];
}
