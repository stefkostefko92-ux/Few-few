// A chain along a line across the axes (a rope drop surveyed askew: room-view.ts). Its points are distances along the
// line from its origin, its dimension line stands `at` to the line's left, its extension lines start `from` across it
// (undefined: on the line; null: none), a gap off the element, and run a little past the dimension line. Arrowheads
// inside a segment long enough for them, else from outside. Each value beside the dimension line on the side away from
// the line measured, turned along it to read from the left or from below: in its segment, or past the chain's far end
// on the dimension line run on beside it. Paper conventions as the level chains' (dims.ts).
import { DIM } from './dims';
import { toPaper, type Place } from './geom';
import { textBox, textWidth } from './metrics';
import type { Chain } from './model';
import { STYLES, TEXT } from './style';
import { arrowhead } from './symbols';
import type { Box, Pt, Shape, TextShape } from './types';

const fmt = (v: number): string => String(Math.round(v));
const along = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k];

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
  for (let i = 0; i + 1 < m; i++) {
    const a = P(pts[i], at), b = P(pts[i + 1], at), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), inside = len >= 2 * DIM.arrow + 0.6;
    out.push(arrowhead(a, inside ? ang + Math.PI : ang), arrowhead(b, inside ? ang : ang + Math.PI));
    const value = Math.abs(pts[i + 1] - pts[i]), tpl = c.text?.[i], text = tpl == null ? fmt(value) : tpl.replace('{v}', fmt(value));
    if (!text) continue;
    const w = textWidth(text, { size: TEXT.dim, cond: true }), atFar = i === farAt || i + 1 === farAt;
    let s: TextShape;
    if (w + 0.6 <= len || !atFar) s = { t: 'text', at: along([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], up, lift), text, size: TEXT.dim, angle: deg, align: 'c', cond: true, halo: true };
    else {
      const gap = inside ? 0.8 : DIM.arrow + 0.5;
      out.push({ t: 'line', a: far, b: along(far, dir, gap + w + 0.3), s: STYLES.dim });
      s = { t: 'text', at: along(along(far, dir, gap), up, lift), text, size: TEXT.dim, angle: deg, align: 'l', cond: true, halo: true };
    }
    out.push(s);
    taken?.push(textBox(s));
    onText?.(s, i, value);
  }
  return out;
}
