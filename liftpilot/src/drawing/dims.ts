// Dimension chains as on lift layout drawings: extension lines, one dimension line per chain, filled arrowheads at
// every point, the value above the line (vertical chains: read from the bottom, left of the line). Chains outside the
// drawing sit in rows at fixed paper distances from its edge; chains across it sit at a model coordinate.
import { toPaper, type Place } from './geom';
import { textWidth } from './metrics';
import type { Chain } from './model';
import { STYLES, TEXT } from './style';
import { arrowhead } from './symbols';
import type { Box, Shape, TextShape } from './types';

/** Paper distances [mm]: first row from the drawing, between rows, extension overshoot and gap, arrow, text. */
export const DIM = { first: 7, row: 6.2, over: 1.4, gap: 1, arrow: 2.1, textGap: 0.8, stagger: 2.9, minText: 1.8 } as const;

/** Outward distance of the dimension line of a row from the edge of the drawing. */
export const rowOffset = (row: number): number => DIM.first + row * DIM.row;

const fmt = (v: number): string => String(Math.round(v));

/** `onText`: told of the lettering of each segment, its index and its value (the screens make it editable). */
export function chainShapes(c: Chain, place: Place, edges: Box, onText?: (s: TextShape, i: number, value: number) => void): Shape[] {
  const out: Shape[] = [], horiz = c.dir === 'x';
  if (c.pts.length < 2) return out;
  const along = c.pts.map((v) => (horiz ? toPaper(place, [v, 0])[0] : toPaper(place, [0, v])[1]));
  const acrossOf = (m: number): number => (horiz ? toPaper(place, [0, m])[1] : toPaper(place, [m, 0])[0]);
  // the dimension line and the direction pointing away from the drawing
  let line: number, out1: number;
  if (c.side) {
    const d = rowOffset(c.row ?? 0);
    line = c.side === 'top' ? edges.y1 + d : c.side === 'bottom' ? edges.y0 - d : c.side === 'right' ? edges.x1 + d : edges.x0 - d;
    out1 = c.side === 'top' || c.side === 'right' ? 1 : -1;
  } else {
    line = acrossOf(c.at ?? 0);
    out1 = 1;
  }
  const P = (a: number, b: number): readonly [number, number] => (horiz ? [a, b] : [b, a]);

  // extension lines
  along.forEach((a, i) => {
    const f = Array.isArray(c.from) ? c.from[i] : c.from;
    let start: number | null;
    if (typeof f === 'number') start = acrossOf(f);
    else if (f === null) start = null;
    else if (c.side) start = c.side === 'top' ? edges.y1 + DIM.gap : c.side === 'bottom' ? edges.y0 - DIM.gap : c.side === 'right' ? edges.x1 + DIM.gap : edges.x0 - DIM.gap;
    else start = null;
    if (start === null) return;
    const dir = Math.sign(line - start) || out1, end = line + dir * DIM.over;
    if (Math.abs(end - start) > 0.2) out.push({ t: 'line', a: P(a, start), b: P(a, end), s: STYLES.dim });
  });
  out.push({ t: 'line', a: P(along[0], line), b: P(along[along.length - 1], line), s: STYLES.dim });

  const size = TEXT.dim, rot = horiz ? 0 : 90;
  const angleOf = (sign: number): number => (horiz ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2);
  for (let i = 0; i + 1 < along.length; i++) {
    const a = along[i], b = along[i + 1], len = Math.abs(b - a), s = Math.sign(b - a) || 1;
    if (len < 0.05) continue;
    // arrows inside when they fit, else outside pointing in
    if (len >= 2 * DIM.arrow + 0.6) {
      out.push(arrowhead(P(a, line), angleOf(-s)), arrowhead(P(b, line), angleOf(s)));
    } else {
      out.push(arrowhead(P(a, line), angleOf(s)), arrowhead(P(b, line), angleOf(-s)));
    }
    const value = Math.abs(c.pts[i + 1] - c.pts[i]), tpl = c.text?.[i];
    const text = tpl == null ? fmt(value) : tpl.replace('{v}', fmt(value));
    if (!text) continue;
    // a text longer than its segment shrinks down to DIM.minText; still too long, it goes past the end of the chain
    // that stays within the drawing, or beside the line
    const full = textWidth(text, { size, cond: true }), k = full + 0.6 > len ? Math.max(DIM.minText / size, (len - 0.6) / full) : 1;
    const ts = k < 1 ? Math.max(DIM.minText, size * k) : size, w = full * (ts / size), off = horiz ? DIM.textGap : -DIM.textGap;
    const mid = (a + b) / 2, halo = !c.side, lo = horiz ? edges.x0 : edges.y0, hi = horiz ? edges.x1 : edges.y1;
    let at: readonly [number, number], align: 'l' | 'c' | 'r' = 'c';
    if (w + 0.6 <= len) {
      at = P(mid, line + off);
    } else if (i === along.length - 2 && Math.max(a, b) + 0.8 + w <= hi + 1) {
      at = P(Math.max(a, b) + 0.8, line + off);
      align = 'l';
    } else if (i === 0 && Math.min(a, b) - 0.8 - w >= lo - 1) {
      at = P(Math.min(a, b) - 0.8, line + off);
      align = 'r';
    } else {
      at = P(mid, line + off + (horiz ? DIM.stagger : -DIM.stagger));
    }
    const shape: TextShape = { t: 'text', at, text, size: ts, angle: rot, align, cond: true, halo };
    out.push(shape);
    onText?.(shape, i, value);
  }
  return out;
}
