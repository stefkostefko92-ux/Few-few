// Dimension chains as on lift layout drawings: extension lines from the element measured (a small gap off it) to a
// little past the dimension line, one dimension line per chain, filled arrowheads, the value above the line (vertical
// chains: read from the bottom, left of the line). A segment too short for its two arrowheads takes dots at the points
// it shares with its neighbours and an arrowhead from outside at an end of the chain. Chains outside the drawing sit
// in rows at fixed paper distances from its edge; chains across it sit at a model coordinate. Every value keeps its
// words and a size that reads: inside its segment, else past the end of the chain on the dimension line run on under
// it, else beside its segment, else set off it with a leader; a lettering already on the sheet is stepped round, and
// where nothing is free the place it covers least is taken — never one on a value already set while one is covered only
// by other lettering (`chainShapes`). The values are masked from the lines they cross (a band of paper round the
// letters).
import { toPaper, type Place } from './geom';
import { textBox, textWidth } from './metrics';
import type { Chain, Side } from './model';
import { STYLES, TEXT } from './style';
import { arrowhead } from './symbols';
import type { Align, Box, Pt, Shape, TextShape } from './types';

/** Paper distances [mm]: first row from the drawing, between rows, extension overshoot and gap, arrow, text, dot; the
 *  smallest size a value may shrink to; how far past the drawing a value past the end of its chain may reach. */
export const DIM = { first: 7, row: 6.2, over: 1.4, gap: 1, arrow: 2.1, textGap: 0.8, stagger: 2.9, dot: 0.42, minText: 2.3, overrun: 6 } as const;

/** Outward distance of the dimension line of a row from the edge of the drawing. */
export const rowOffset = (row: number): number => DIM.first + row * DIM.row;

/** A segment too short for its two arrowheads inside. */
const isShort = (len: number): boolean => len < 2 * DIM.arrow + 0.6;

const fmt = (v: number): string => String(Math.round(v));

/** A text with words round its figure ("Interpiano 3000" → "3000" and "Interpiano"): the figure is the segment's value
 *  where the text says it (a profile's name may carry numbers of its own), else the text's first number; null for a
 *  bare figure or no figure. */
function splitFigure(text: string, value: string): { fig: string; words: string } | null {
  const t = text.trim(), own = new RegExp(`(^|\\D)(${value})(?!\\d)`).exec(t), first = /\d+(?:[.,]\d+)?/.exec(t);
  const [fig, at] = own ? [own[2], own.index + own[1].length] : first ? [first[0], first.index] : [null, 0];
  if (fig === null || fig === t) return null;
  // the words left round it, without the brackets that held it ("Calata (768)" → "Calata") or the "x" glued to it
  // ("Porta 800x H. 2000" → "Porta H. 2000"; a spaced "× 640" says what it multiplies and stays)
  const words = `${t.slice(0, at)} ${t.slice(at + fig.length).replace(/^x(?=\s)/, '')}`.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return { fig, words };
}

/** A model box on paper. */
const paperBox = (place: Place, b: Box): Box => {
  const [x0, y0] = toPaper(place, [b.x0, b.y0]), [x1, y1] = toPaper(place, [b.x1, b.y1]);
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
};

/** Boxes closer than 0.2 mm on both axes. */
const clash = (a: Box, b: Box): boolean => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -0.2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > -0.2;

/** How much of a box the others cover [mm²]. */
const covered = (a: Box, others: readonly Box[]): number =>
  others.reduce((n, b) => n + Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), 0);

/** The boxes of the values the chains have set (in a sheet's `taken` among the other lettering): a value with no free
 *  place never goes on one of them while a place covers only other lettering. */
const VALUES = new WeakSet<Box>();

/** A value's box, told apart from the other lettering in `taken`. */
export function valueBox(b: Box): Box {
  VALUES.add(b);
  return b;
}

/** One segment's lettering on its dimension line (paper coordinates along the chain and across it). */
interface Seg {
  text: string;
  /** its value as the lettering writes it */
  written: string;
  /** the segment's ends along the chain, the line across, the paper range along the chain a value past its end may
   *  take (the drawing's, and the rows' room beyond its corners) */
  a: number;
  b: number;
  line: number;
  lo: number;
  hi: number;
  /** the segment ends the chain at its low or its high end along it */
  atLo: boolean;
  atHi: boolean;
  /** a neighbour long enough to carry this lettering beside it, before and after */
  roomBefore: boolean;
  roomAfter: boolean;
}

/** A place for a segment's lettering, with the dimension line run on under it past the chain's end, or the leader that
 *  ties it to its segment when it stands off it. */
interface Spot {
  s: TextShape;
  /** the words under the line when the value's figure stands over it */
  words?: TextShape;
  run?: readonly [Pt, Pt];
  leader?: readonly [Pt, Pt];
}

type Mk = (text: string, size: number, at: Pt, align: Align) => TextShape;

/**
 * Where a segment's lettering can go, best first: the whole text in the middle (at its size even if it reaches a
 * little past the segment, else a little smaller); past the end of the chain, on the dimension line run on under it;
 * its figure over the line and its words under it; its figure alone in the middle (the words dropped, as drawings do
 * in tight spots: the extension lines reach the element) or past the end; the same on the
 * other side of the line; a short segment's value centred over it, reaching past it, on either side of the line;
 * beside it on the line of a long neighbour, past the dot; set off it with a leader. Never smaller than DIM.minText.
 */
function spotsOf(g: Seg, horiz: boolean, mk: Mk): Spot[] {
  const out: Spot[] = [], size = TEXT.dim, len = Math.abs(g.b - g.a), mid = (g.a + g.b) / 2, lo = Math.min(g.a, g.b), hi = Math.max(g.a, g.b);
  const P = (a: number, b: number): Pt => (horiz ? [a, b] : [b, a]);
  const width = (t: string, s: number): number => textWidth(t, { size: s, cond: true });
  // the usual side of the line (over a level line, left of an upright one) and the other, for a lettering of size s
  const near = g.line + (horiz ? DIM.textGap : -DIM.textGap), far = (s: number): number => (horiz ? g.line - DIM.textGap - s : g.line + DIM.textGap + s);
  const split = splitFigure(g.text, g.written), fig = split?.fig ?? null, fits = (t: string, s: number): boolean => width(t, s) + 0.6 <= len + 1e-9;
  const small = Math.min(size, (len - 0.6) / Math.max(width(g.text, 1), 1e-9)), shrinks = small >= DIM.minText && small < size;
  const inside = (side: (s: number) => number): Spot[] => {
    const r: Spot[] = [];
    if (fits(g.text, size)) r.push({ s: mk(g.text, size, P(mid, side(size)), 'c') });
    else if (width(g.text, size) <= len + 0.4) r.push({ s: mk(g.text, size, P(mid, side(size)), 'c') });
    else if (shrinks) r.push({ s: mk(g.text, small, P(mid, side(small)), 'c') });
    return r;
  };
  // past the end of the chain: the arrowhead from outside of a short end segment first, then the lettering
  const past = (t: string): Spot[] => {
    const w = width(t, size), gap = isShort(len) ? DIM.arrow + 0.5 : 0.8, r: Spot[] = [];
    if (g.atHi && hi + gap + w <= g.hi) r.push({ s: mk(t, size, P(hi + gap, near), 'l'), run: [P(hi, g.line), P(hi + gap + w + 0.3, g.line)] });
    if (g.atLo && lo - gap - w >= g.lo) r.push({ s: mk(t, size, P(lo - gap, near), 'r'), run: [P(lo, g.line), P(lo - gap - w - 0.3, g.line)] });
    return r;
  };
  out.push(...inside(() => near), ...past(g.text));
  // the figure over the line and its words under it, both in the segment
  const words = split?.words ?? '';
  if (fig && words && fits(fig, size) && width(words, DIM.minText) <= len + 0.4) {
    out.push({ s: mk(fig, size, P(mid, near), 'c'), words: mk(words, DIM.minText, P(mid, far(DIM.minText)), 'c') });
  }
  if (fig && fits(fig, size)) out.push({ s: mk(fig, size, P(mid, near), 'c') });
  if (fig) out.push(...past(fig));
  out.push(...inside(far));
  if (fig && fits(fig, size)) out.push({ s: mk(fig, size, P(mid, far(size)), 'c') });
  // a short segment's value over it, reaching past its ends, on this side of the line or the other
  const t = fig ?? g.text;
  if (isShort(len)) out.push({ s: mk(t, size, P(mid, near), 'c') }, { s: mk(t, size, P(mid, far(size)), 'c') });
  // beside the segment, past its dot, on the line of a neighbour long enough to carry its own value in its middle
  if (g.roomAfter) out.push({ s: mk(t, size, P(hi + 0.8, near), 'l') });
  if (g.roomBefore) out.push({ s: mk(t, size, P(lo - 0.8, near), 'r') });
  // set off the segment, a leader from its middle
  const off = horiz ? DIM.stagger : -DIM.stagger, farOff = far(size) - off;
  out.push({ s: mk(t, size, P(mid, near + off), 'c'), leader: [P(mid, g.line), P(mid, near + off + (horiz ? -0.25 : 0.25))] });
  out.push({ s: mk(t, size, P(mid, farOff), 'c'), leader: [P(mid, g.line), P(mid, farOff + (horiz ? size + 0.1 : -size - 0.1))] });
  return out;
}

/** `onText`: told of the lettering of each segment, its index and its value (the screens make it editable). `taken`:
 *  the boxes of the lettering already on the sheet; each value takes the first spot clear of them and adds its own.
 *  `room`: the paper the rows take on each side of the drawing, where a value past the end of a chain outside may go. */
export function chainShapes(c: Chain, place: Place, edges: Box, onText?: (s: TextShape, i: number, value: number) => void, taken?: Box[],
  room?: Readonly<Record<Side, number>>): Shape[] {
  const out: Shape[] = [], horiz = c.dir === 'x', n = c.pts.length;
  if (n < 2) return out;
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

  // extension lines: from the element measured, a gap off it, to a little past the dimension line; an axis' as an axis
  along.forEach((a, i) => {
    const f = Array.isArray(c.from) ? c.from[i] : c.from;
    let start: number | null;
    if (typeof f === 'number') start = acrossOf(f);
    else if (f === null) start = null;
    else if (c.side) start = c.side === 'top' ? edges.y1 + DIM.gap : c.side === 'bottom' ? edges.y0 - DIM.gap : c.side === 'right' ? edges.x1 + DIM.gap : edges.x0 - DIM.gap;
    else start = null;
    if (start === null) return;
    // an axis drawn out past its row already
    if (c.axis?.[i] && c.side && (line - start) * out1 <= 0) return;
    const dir = Math.sign(line - start) || out1, end = line + dir * DIM.over;
    if (typeof f === 'number' && Math.abs(line - start) > DIM.gap) start += dir * DIM.gap;
    if (Math.abs(end - start) > 0.2) out.push({ t: 'line', a: P(a, start), b: P(a, end), s: c.axis?.[i] ? STYLES.axis : STYLES.dim });
  });
  out.push({ t: 'line', a: P(along[0], line), b: P(along[n - 1], line), s: STYLES.dim });

  // past the ends: within the drawing and a little beyond, into the corners as far as the rows there reach
  const reach = (sd: Side): number => Math.max(DIM.overrun, c.side ? room?.[sd] ?? 0 : 0);
  // (a chain across the drawing told to keep its lettering in a box: its ends there)
  const keep = !c.side && c.within ? paperBox(place, c.within) : null;
  const rot = horiz ? 0 : 90, lo = Math.max(horiz ? edges.x0 - reach('left') : edges.y0 - reach('bottom'), keep ? (horiz ? keep.x0 : keep.y0) : -Infinity);
  const hi = Math.min(horiz ? edges.x1 + reach('right') : edges.y1 + reach('top'), keep ? (horiz ? keep.x1 : keep.y1) : Infinity);
  const angleOf = (sign: number): number => (horiz ? (sign > 0 ? 0 : Math.PI) : sign > 0 ? Math.PI / 2 : -Math.PI / 2);
  const mk: Mk = (text, size, at, align) => ({ t: 'text', at, text, size, angle: rot, align, cond: true, halo: true });
  const dots = new Set<number>(), lens = along.slice(1).map((b, i) => Math.abs(b - along[i])), [ends0, ends1] = [Math.min(...along), Math.max(...along)];
  const segs: (Seg & { i: number; value: number })[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = along[i], b = along[i + 1], len = lens[i], s = Math.sign(b - a) || 1;
    if (len < 0.05) continue;
    // arrowheads inside when they fit; else a dot where the segment meets another, an arrowhead from outside at an end
    if (!isShort(len)) out.push(arrowhead(P(a, line), angleOf(-s)), arrowhead(P(b, line), angleOf(s)));
    else {
      if (i === 0) out.push(arrowhead(P(a, line), angleOf(s)));
      else dots.add(i);
      if (i + 1 === n - 1) out.push(arrowhead(P(b, line), angleOf(-s)));
      else dots.add(i + 1);
    }
    const value = Math.abs(c.pts[i + 1] - c.pts[i]), tpl = c.text?.[i];
    const text = tpl == null ? fmt(value) : tpl.replace('{v}', fmt(value));
    if (!text) continue;
    const room = (k: number): boolean => k >= 0 && k < n - 1 && !isShort(lens[k]);
    segs.push({ i, value, written: fmt(value), text, a, b, line, lo, hi, atLo: Math.min(a, b) <= ends0 + 1e-6, atHi: Math.max(a, b) >= ends1 - 1e-6, roomBefore: room(i - 1),
      roomAfter: room(i + 1) });
  }
  // the long segments first, each value in its middle; then the short ones round them, in order
  const order = [...segs].sort((p, q) => Number(isShort(Math.abs(p.b - p.a))) - Number(isShort(Math.abs(q.b - q.a))) || p.i - q.i);
  // a row outside keeps its lettering between the rows next to it (or the drawing's edge), clear of their lines
  let band: [number, number] = [-Infinity, Infinity];
  if (c.side) {
    const edge = c.side === 'top' ? edges.y1 : c.side === 'bottom' ? edges.y0 : c.side === 'right' ? edges.x1 : edges.x0;
    const outermost = !room || rowOffset(c.row ?? 0) + TEXT.dim + 1.2 >= room[c.side] - 1e-9;
    const inner = (c.row ?? 0) === 0 ? edge + out1 * 0.4 : line - out1 * DIM.row, outer = outermost ? line + out1 * 1e4 : line + out1 * DIM.row;
    band = [Math.min(inner, outer) + 0.3, Math.max(inner, outer) - 0.3];
  }
  const inBand = (b: Box): boolean => (horiz ? b.y0 >= band[0] && b.y1 <= band[1] : b.x0 >= band[0] && b.x1 <= band[1]);
  const avoid = (c.avoid ?? []).map((b) => paperBox(place, b));
  const placed = new Map<number, Spot>(), free = (b: Box): boolean => inBand(b) && !taken?.some((t) => clash(b, t)) && !avoid.some((t) => clash(b, t));
  // with no spot free, the one the lettering already there covers least (within the row's band first): before any
  // other lettering, off the values already set — a value never on another while a spot covers only other lettering
  // (round 37); the first of the spots alike
  const cost = (q: Spot): readonly [number, number, number] => [q.s, ...(q.words ? [q.words] : [])].reduce<[number, number, number]>((n, t) => {
    const b = textBox(t), on = [...(taken ?? []), ...avoid], values = on.filter((x) => VALUES.has(x));
    return [n[0] + (inBand(b) ? 0 : 1), n[1] + covered(b, values), n[2] + covered(b, on.filter((x) => !VALUES.has(x)))];
  }, [0, 0, 0]);
  const less = (p: readonly number[], q: readonly number[]): boolean => {
    for (let k = 0; k < p.length; k++) if (Math.abs((p[k] ?? 0) - (q[k] ?? 0)) > 1e-9) return (p[k] ?? 0) < (q[k] ?? 0);
    return false;
  };
  for (const g of order) {
    const spots = spotsOf(g, horiz, mk);
    const spot = spots.find((q) => free(textBox(q.s)) && (!q.words || free(textBox(q.words))))
      ?? spots.map((q) => ({ q, c: cost(q) })).reduce((best, x) => (less(x.c, best.c) ? x : best)).q;
    taken?.push(valueBox(textBox(spot.s)));
    if (spot.words) taken?.push(valueBox(textBox(spot.words)));
    placed.set(g.i, spot);
  }
  for (const g of segs) {
    const spot = placed.get(g.i);
    if (!spot) continue;
    if (spot.run) out.push({ t: 'line', a: spot.run[0], b: spot.run[1], s: STYLES.dim });
    if (spot.leader) out.push({ t: 'line', a: spot.leader[0], b: spot.leader[1], s: STYLES.dim });
    out.push(spot.s);
    if (spot.words) out.push(spot.words);
    onText?.(spot.s, g.i, g.value);
  }
  for (const i of dots) out.push({ t: 'circle', c: P(along[i], line), r: DIM.dot, fill: { k: 'solid', ink: 'ink' } });
  // the dimension line itself: no other value is set on it
  const [a0, a1] = [Math.min(along[0], along[n - 1]), Math.max(along[0], along[n - 1])];
  taken?.push(horiz ? { x0: a0, y0: line - 0.25, x1: a1, y1: line + 0.25 } : { x0: line - 0.25, y0: a0, x1: line + 0.25, y1: a1 });
  return out;
}
