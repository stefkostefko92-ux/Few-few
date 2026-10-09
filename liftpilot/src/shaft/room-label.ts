// Where a name or a reference goes on the machine room's plan among what is drawn there (room-setout.ts): the boxes the
// lettering, the references, the symbols and the dimension lines already placed take — measured as the drawing kernel
// draws them (lettering at letterSize, never under TEXT.min; a reference's circle tagRadius: view.ts), at 1:25, the
// plan's scale — and the first of the places offered whose box keeps off them and off what else is given; none of them,
// the next nearest on a grid over the room (the name or the reference with its leader). Model millimetres; pure.
import { TEXT, letterSize, tagRadius, textBox, textQuad, textWidth, type Align, type Box, type Entity, type Pt } from '../drawing';

/** The plan's scale the boxes are measured at (paper millimetres to model millimetres). */
export const AT = 25;

const grow = (b: Box, d: number): Box => ({ x0: b.x0 - d, y0: b.y0 - d, x1: b.x1 + d, y1: b.y1 + d });
export const meets = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The box of a lettering at `at` (its baseline) as the kernel letters it — at letterSize(`size`), its box the kernel's
 *  (metrics.ts textBox) —, aligned left, centred or right, turned by `angle`; `k` model millimetres to one of paper. */
export function letteringBox(at: Pt, text: string, size: number | undefined, align: Align = 'l', angle = 0, bold = false, k = AT): Box {
  const b = textBox({ t: 'text', at: [0, 0], text, size: letterSize(size), align, angle, bold, cond: true });
  return { x0: at[0] + b.x0 * k, y0: at[1] + b.y0 * k, x1: at[0] + b.x1 * k, y1: at[1] + b.y1 * k };
}

/** The same turned askew as boxes along it, each about as long as the lettering is high (one box round the whole
 *  would take a square of paper beside a slanted name). */
function letteringBoxes(at: Pt, text: string, size: number | undefined, align: Align, angle: number, bold: boolean, k: number): Box[] {
  if (Math.abs(Math.sin((angle * Math.PI) / 90)) < 1e-9) return [letteringBox(at, text, size, align, angle, bold, k)];
  const s = letterSize(size), [q0, q1, q2, q3] = textQuad({ t: 'text', at: [0, 0], text, size: s, align, angle, bold, cond: true });
  const n = Math.max(1, Math.ceil(Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) / (1.3 * s))), lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return Array.from({ length: n }, (_, i) => {
    const ps = [lerp(q0, q1, i / n), lerp(q0, q1, (i + 1) / n), lerp(q3, q2, i / n), lerp(q3, q2, (i + 1) / n)], xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    return { x0: at[0] + Math.min(...xs) * k, y0: at[1] + Math.min(...ys) * k, x1: at[0] + Math.max(...xs) * k, y1: at[1] + Math.max(...ys) * k };
  });
}

/** A reference's box at `c`: its circle as the kernel draws it round `text`. */
export const tagBox = (c: Pt, text: string, k = AT): Box => {
  const r = tagRadius(text) * k;
  return { x0: c[0] - r, y0: c[1] - r, x1: c[0] + r, y1: c[1] + r };
};

/** A symbol's box at `c` (symbols.ts: the light's rays reach 1,15 of its half size, the widest). */
const markBox = (c: Pt, size: number | undefined, k: number): Box => {
  const h = ((size ?? 3.4) / 2) * 1.15 * k;
  return { x0: c[0] - h, y0: c[1] - h, x1: c[0] + h, y1: c[1] + h };
};

/** Where and how large the kernel letters a text with a room it must fit (`fit`): smaller down to TEXT.min, and past
 *  that at `out` (view.ts lettering), at the scale `k`. */
function fitted(e: Extract<Entity, { e: 'text' }>, k: number): { at: Pt; size: number | undefined } {
  if (!e.fit) return { at: e.at, size: e.size };
  const asked = letterSize(e.size), w = textWidth(e.text, { size: asked, bold: e.bold, cond: true }), room = e.fit / k;
  const size = w > room && room > 0 ? Math.max(TEXT.min, (asked * room) / w) : asked, over = room > 0 && (w * size) / asked > room + 1e-9;
  return { at: over && e.out ? e.out : e.at, size };
}

/** What the lettering, the references and the symbols among `es` take. */
export function takenBy(es: readonly Entity[], k = AT): Box[] {
  return es.flatMap((e): Box[] => {
    if (e.e === 'text') {
      const { at, size } = fitted(e, k);
      return letteringBoxes(at, e.text, size, e.align ?? 'l', e.angle ?? 0, e.bold === true, k);
    }
    if (e.e === 'tag') return [tagBox(e.at, e.text, k)];
    if (e.e === 'mark') return [markBox(e.at, e.size, k)];
    return [];
  });
}

/** What the dimension lines across the drawing among `es` take with their figures either side (TEXT.dim and a margin),
 *  run on past each end as far as the longest lettering that does not fit its segment (dims.ts may write it there):
 *  along an axis one box, along a line askew (`on`) a box for each stretch of it. */
export function dimBands(es: readonly Entity[], k = AT): Box[] {
  const band = (TEXT.dim + 1.2) * k;
  return es.flatMap((e): Box[] => {
    if (e.e !== 'chain' || e.c.at === undefined || e.c.pts.length < 2) return [];
    // (only a lettering longer than its segment goes past an end)
    const { pts, at, on, text } = e.c, over = pts.slice(1).map((q, i) => {
      const len = Math.abs(q - pts[i]), w = (textWidth((text?.[i] ?? '{v}').replace('{v}', String(Math.round(len))), { size: TEXT.dim, cond: true }) + 1) * k;
      return w > len ? w : 0;
    });
    const past = Math.max(0, ...over), a = Math.min(...pts) - past, b = Math.max(...pts) + past;
    if (!on) return [e.c.dir === 'x' ? { x0: a, y0: at - band, x1: b, y1: at + band } : { x0: at - band, y0: a, x1: at + band, y1: b }];
    // askew: the line `at` to the left of the drop line, in stretches of about 8 mm of paper
    const n: Pt = [-on.u[1], on.u[0]], steps = Math.max(1, Math.ceil((b - a) / (8 * k)));
    const p = (t: number): Pt => [on.o[0] + t * on.u[0] + at * n[0], on.o[1] + t * on.u[1] + at * n[1]];
    return Array.from({ length: steps }, (_, i) => {
      const p0 = p(a + ((b - a) * i) / steps), p1 = p(a + ((b - a) * (i + 1)) / steps);
      return { x0: Math.min(p0[0], p1[0]) - band, y0: Math.min(p0[1], p1[1]) - band, x1: Math.max(p0[0], p1[0]) + band, y1: Math.max(p0[1], p1[1]) + band };
    });
  });
}

const inside = (b: Box, within: Box): boolean => b.x0 >= within.x0 && b.x1 <= within.x1 && b.y0 >= within.y0 && b.y1 <= within.y1;

/** The first box of `places` (each with what it is for) clear of `busy` by `gap`, and inside `within`; null: none. */
export function firstClear<T extends { box: Box }>(places: readonly T[], busy: readonly Box[], within: Box, gap = 20): T | null {
  return places.find((p) => inside(p.box, within) && busy.every((b) => !meets(grow(p.box, gap), b))) ?? null;
}

/** Points over `within` `step` apart, the nearest to `to` first: where a name or a reference is tried when none of its
 *  usual places is clear (farther from what it names, with its leader). */
export function gridNear(within: Box, to: Pt, step = 100): Pt[] {
  const out: Pt[] = [];
  for (let x = within.x0 + step / 2; x <= within.x1; x += step) for (let y = within.y0 + step / 2; y <= within.y1; y += step) out.push([x, y]);
  const d = (p: Pt): number => Math.hypot(p[0] - to[0], p[1] - to[1]);
  return out.sort((p, q) => d(p) - d(q));
}

/** The place of `places` (inside `within`) whose box lies least on `busy`: only when not one of them is clear. */
export function leastOn<T extends { box: Box }>(places: readonly T[], busy: readonly Box[], within: Box): T {
  const over = (a: Box): number => busy.reduce((t, b) => t + Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), 0);
  const kept = places.filter((p) => inside(p.box, within));
  return (kept.length ? kept : places).reduce((p, q) => (over(q.box) < over(p.box) ? q : p));
}

/** The first clear of the usual places, else of the next ones (`more`: the grid's, the lettering in two lines…, each
 *  made only when the ones before are all taken), else the one least on what is there — never a place the check
 *  turned down while another is clear. */
export function placeOf<T extends { box: Box }>(usual: readonly T[], more: () => readonly T[], busy: readonly Box[], within: Box, gap = 20, ...after: (() => readonly T[])[]): T {
  const tried: T[] = [];
  for (const group of [() => usual, more, ...after]) {
    const places = group(), spot = firstClear(places, busy, within, gap);
    if (spot) return spot;
    tried.push(...places);
  }
  return leastOn(tried, busy, within);
}

/** Where a leader leaves a lettering's box toward `to`: the point of the box nearest it. */
export const leaderFrom = (b: Box, to: Pt): Pt => [Math.min(Math.max(to[0], b.x0), b.x1), Math.min(Math.max(to[1], b.y0), b.y1)];
