// Dimension chains as on lift layout drawings: extension lines, one dimension line per chain, filled arrowheads at
// every point, the value above the line (vertical chains: read from the bottom, left of the line). Chains outside the
// drawing sit in rows at fixed paper distances from its edge; chains across it sit at a model coordinate. A figure
// steps round the lettering already on the sheet: see `figureSpots`.
import { toPaper, type Place } from './geom';
import { textBox, textWidth } from './metrics';
import type { Chain } from './model';
import { STYLES, TEXT } from './style';
import { arrowhead } from './symbols';
import type { Align, Box, Pt, Shape, TextShape } from './types';

/** Paper distances [mm]: first row from the drawing, between rows, extension overshoot and gap, arrow, text; how much
 *  a text may shrink before its figure alone is written instead (a fraction of its size). */
export const DIM = { first: 7, row: 6.2, over: 1.4, gap: 1, arrow: 2.1, textGap: 0.8, stagger: 2.9, minText: 1.8, mildShrink: 0.8 } as const;

/** Outward distance of the dimension line of a row from the edge of the drawing. */
export const rowOffset = (row: number): number => DIM.first + row * DIM.row;

const fmt = (v: number): string => String(Math.round(v));

/** The figure of a text with words round it ("Interpiano 3000" → "3000"); null for a bare figure or no figure. */
const figureOf = (text: string): string | null => {
  const m = /\d+(?:[.,]\d+)?/.exec(text);
  return m && m[0] !== text.trim() ? m[0] : null;
};

/** Boxes closer than 0.2 mm on both axes. */
const clash = (a: Box, b: Box): boolean => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -0.2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -0.2;

/** One segment's lettering on its dimension line (paper coordinates along the chain and across it). */
interface Seg {
  text: string;
  /** the segment's ends along the chain, the line across, the paper range along the chain the drawing spans */
  a: number;
  b: number;
  line: number;
  lo: number;
  hi: number;
  first: boolean;
  last: boolean;
}

/**
 * Where a segment's lettering can go, best first: the whole text in the middle, at its size or a little smaller; its
 * figure alone (the words dropped, as drawings do in tight spots); the text shrunk down to DIM.minText; the same on
 * the other side of the line; past the end of the chain that stays within the drawing; beside the line, staggered.
 */
function figureSpots(g: Seg, horiz: boolean, mk: (text: string, size: number, at: Pt, align: Align) => TextShape): TextShape[] {
  const out: TextShape[] = [], size = TEXT.dim, len = Math.abs(g.b - g.a), mid = (g.a + g.b) / 2;
  const P = (a: number, b: number): Pt => (horiz ? [a, b] : [b, a]);
  const width = (t: string, s: number): number => textWidth(t, { size: s, cond: true });
  // the usual side of the line (over a level line, left of an upright one) and the other, for a lettering of size s
  const near = g.line + (horiz ? DIM.textGap : -DIM.textGap), far = (s: number): number => (horiz ? g.line - DIM.textGap - s : g.line + DIM.textGap + s);
  const fig = figureOf(g.text), full = width(g.text, size), k = Math.max(DIM.minText / size, Math.min(1, (len - 0.6) / full)), small = size * k;
  const inside: [string, number][] = [], shrinks = k < 1 && full * k + 0.6 <= len + 1e-9;
  if (full + 0.6 <= len) inside.push([g.text, size]);
  if (shrinks && k >= DIM.mildShrink) inside.push([g.text, small]);
  if (fig && width(fig, size) + 0.6 <= len) inside.push([fig, size]);
  if (shrinks && k < DIM.mildShrink) inside.push([g.text, small]);
  for (const [t, s] of inside) out.push(mk(t, s, P(mid, near), 'c'));
  for (const [t, s] of inside) out.push(mk(t, s, P(mid, far(s)), 'c'));
  const hi = Math.max(g.a, g.b), lo = Math.min(g.a, g.b);
  for (const s of [size, small]) {
    const w = width(g.text, s);
    if (g.last && hi + 0.8 + w <= g.hi + 1) out.push(mk(g.text, s, P(hi + 0.8, near), 'l'));
    if (g.first && lo - 0.8 - w >= g.lo - 1) out.push(mk(g.text, s, P(lo - 0.8, near), 'r'));
  }
  const [t, s] = fig ? [fig, size] : [g.text, small], st = horiz ? DIM.stagger : -DIM.stagger;
  out.push(mk(t, s, P(mid, near + st), 'c'), mk(t, s, P(mid, far(s) - st), 'c'));
  return out;
}

/** `onText`: told of the lettering of each segment, its index and its value (the screens make it editable). `taken`:
 *  the boxes of the lettering already on the sheet; each figure takes the first spot clear of them and adds its own. */
export function chainShapes(c: Chain, place: Place, edges: Box, onText?: (s: TextShape, i: number, value: number) => void, taken?: Box[]): Shape[] {
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

  const rot = horiz ? 0 : 90, halo = !c.side, lo = horiz ? edges.x0 : edges.y0, hi = horiz ? edges.x1 : edges.y1;
  const angleOf = (sign: number): number => (horiz ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2);
  const mk = (text: string, size: number, at: Pt, align: Align): TextShape => ({ t: 'text', at, text, size, angle: rot, align, cond: true, halo });
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
    const spots = figureSpots({ text, a, b, line, lo, hi, first: i === 0, last: i === along.length - 2 }, horiz, mk);
    const shape = spots.find((q) => !taken?.some((t) => clash(textBox(q), t))) ?? spots[0];
    taken?.push(textBox(shape));
    out.push(shape);
    onText?.(shape, i, value);
  }
  return out;
}
