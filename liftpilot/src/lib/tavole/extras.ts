// What the drawing sheets carry on paper around the views: the boxes of the legend (symbol over a ruled box of text,
// in a row at the foot of the drawing area), the landings each side of a plan serves ("LATO FERMATE …"), the marks of
// the section lines, the scale by the title and the heights of the floors section A-A whole leaves out. Paper
// millimetres, y up.
import { FRAME, STRIP_H, STYLES, TEXT, boxW, sectionMark, shapeBox, symbol, textBox, textWidth, wrap, type Box, type Pt, type Shape, type TextShape } from '@/drawing';
import { section } from '@/shaft/section';
import type { Layout, Wall } from '@/shaft/types';
import type { LegendItem } from './notes';

const SIZE = 2.7, LEAD = 1.18;

/** Legend boxes in a row from the bottom-left of `area`; returns the shapes and the height they take. */
export function legendRow(items: readonly LegendItem[], area: Box): { shapes: Shape[]; height: number } {
  if (!items.length) return { shapes: [], height: 0 };
  const gap = 3, w = Math.min(44, (boxW(area) - gap * (items.length - 1)) / items.length);
  const blocks = items.map((it) => wrap(it.text, w - 3, { size: SIZE, cond: true }));
  const boxH = Math.max(...blocks.map((l) => l.length)) * SIZE * LEAD + 2.6, height = boxH + 6.5;
  const out: Shape[] = [];
  items.forEach((it, i) => {
    const x0 = area.x0 + i * (w + gap), y0 = area.y0;
    out.push({ t: 'path', pts: [[x0, y0], [x0 + w, y0], [x0 + w, y0 + boxH], [x0, y0 + boxH]], closed: true, s: STYLES.thin, fill: { k: 'solid', ink: 'paper' } });
    blocks[i]?.forEach((l, j) => out.push({ t: 'text', at: [x0 + 1.5, y0 + boxH - 1.3 - SIZE * (0.85 + j * LEAD)], text: l, size: SIZE, cond: true }));
    out.push(...symbol(it.sym, [x0 + w / 2, y0 + boxH + 3.4], 3.2));
  });
  return { shapes: out, height };
}

/** How tall a column of legend boxes `width` wide stands (legendColumn). */
export function legendHeight(items: readonly LegendItem[], width: number): number {
  return items.reduce((h, it) => h + 5 + wrap(it.text, width - 3, { size: SIZE, cond: true }).length * SIZE * LEAD + 2.6 + 6, 0);
}

/** Legend boxes in a column from the top-left of `area`, `width` wide; returns the shapes. */
export function legendColumn(items: readonly LegendItem[], area: Box, width: number): Shape[] {
  const out: Shape[] = [];
  let y = area.y1;
  for (const it of items) {
    const lines = wrap(it.text, width - 3, { size: SIZE, cond: true }), h = lines.length * SIZE * LEAD + 2.6, x0 = area.x0;
    out.push(...symbol(it.sym, [x0 + width / 2, y - 2.2], 3.2));
    y -= 5;
    out.push({ t: 'path', pts: [[x0, y - h], [x0 + width, y - h], [x0 + width, y], [x0, y]], closed: true, s: STYLES.thin, fill: { k: 'solid', ink: 'paper' } });
    lines.forEach((l, j) => out.push({ t: 'text', at: [x0 + 1.5, y - 1.3 - SIZE * (0.85 + j * LEAD)], text: l, size: SIZE, cond: true }));
    y -= h + 6;
  }
  return out;
}

/** The floors `idx` (in order) as the plans name them: each by its label; `ranges`, three or more in a row as a range
 *  ("0–11"). */
const floorList = (L: Layout, idx: readonly number[], ranges: boolean): string => {
  const V = L.inputs.vertical, out: string[] = [], label = (i: number): string => V.floors[i]?.label ?? String(i);
  for (let k = 0; k < idx.length;) {
    let j = k;
    while (ranges && j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++;
    if (j - k >= 2) out.push(`${label(idx[k])}–${label(idx[j])}`);
    else for (let q = k; q <= j; q++) out.push(label(idx[q]));
    k = j + 1;
  }
  return out.join(', ');
};

/** Floors served by each entrance, as the plans label their sides: listed, and shortened to ranges (`short`). */
export function servedBy(L: Layout): { wall: Wall; text: string; short: string }[] {
  const V = L.inputs.vertical;
  return L.doors.flatMap((d) => {
    const idx = V.floors.flatMap((f, i) => (f.door.includes(d.side) ? [i] : []));
    // an entrance no floor opens on has no side to name
    const name = (list: string): string => `LATO FERMAT${idx.length > 1 ? 'E' : 'A'} "${list}"`;
    return idx.length ? [{ wall: d.wall, text: name(floorList(L, idx, false)), short: name(floorList(L, idx, true)) }] : [];
  });
}

/** The "LATO FERMATE" labels just outside the extent of a plan (the front wall is at the bottom of the sheet), clear of
 *  `keep` (the section marks in the same band): a level one from the extent's left end, else from its right end, else
 *  beside what it keeps clear of, its floors in ranges when the whole list fits nowhere — within the extent, else past
 *  it within the frame; where the ranges fit nowhere either, in the widest room the frame leaves beside the marks, its
 *  letters smaller down to the least a drawing takes, else in lines at that size, outward; an upright one in ranges
 *  when the list is longer than the plan is high. */
export function sideLabels(L: Layout, extent: Box, keep: readonly Shape[] = []): Shape[] {
  const size = 3.8, midY = (extent.y0 + extent.y1) / 2, boxes = keep.map(shapeBox);
  const meets = (a: Box, b: Box): boolean => a.x0 < b.x1 + 0.5 && b.x0 < a.x1 + 0.5 && a.y0 < b.y1 + 0.5 && b.y0 < a.y1 + 0.5;
  // the widest room of the frame's width beside what is kept clear of between the heights y0 and y1
  const room = (y0: number, y1: number): [number, number] => {
    let spans: [number, number][] = [[FRAME.x0 + 2, FRAME.x1 - 2]];
    for (const b of boxes) if (b.y0 < y1 + 0.5 && y0 < b.y1 + 0.5) {
      spans = spans.flatMap(([a, c]): [number, number][] => [[a, Math.min(c, b.x0 - 1.5)], [Math.max(a, b.x1 + 1.5), c]]).filter(([a, c]) => c > a);
    }
    return spans.reduce((m, s) => (s[1] - s[0] > m[1] - m[0] ? s : m), [FRAME.x0 + 2, FRAME.x0 + 2]);
  };
  return servedBy(L).flatMap(({ wall, text, short }): Shape[] => {
    if (wall === 'front' || wall === 'rear') {
      const front = wall === 'front', base = (s: number): number => (front ? extent.y0 - 2 - s : extent.y1 + 2);
      const at = (t: string, x: number, s = size, y = base(s)): TextShape => ({ t: 'text', at: [x, y], text: t, size: s, cond: true });
      // (within the plan's extent, else past it within the frame)
      for (const [lo, hi] of [[extent.x0, extent.x1], [FRAME.x0 + 2, FRAME.x1 - 2]] as const) {
        for (const t of [text, short]) {
          const w = textWidth(t, { size, cond: true }), xs = [extent.x1 - w, ...boxes.flatMap((b) => [b.x0 - 1.5 - w, b.x1 + 1.5])];
          const fit = [extent.x0, ...xs].filter((x) => x >= lo - 1e-9 && x + w <= hi + 1e-9).map((x) => at(t, x)).find((q) => boxes.every((b) => !meets(textBox(q), b)));
          if (fit) return [fit];
        }
      }
      // (smaller, in the widest room beside the marks)
      const [x0, x1] = room(base(TEXT.min), base(TEXT.min) + size), s = Math.min(size, (size * (x1 - x0)) / textWidth(short, { size, cond: true }));
      if (s >= TEXT.min) return [at(short, x0, s)];
      // (in lines at the least size, away from the plan; the room taken again over the lines' heights)
      const f = { size: TEXT.min, cond: true }, pitch = TEXT.min * LEAD, lines = (w: number): string[] => wrap(short, w, f);
      const y = (k: number): number => base(TEXT.min) + (front ? -k : k) * pitch, band = (n: number): [number, number] => (front ? [y(n - 1), y(0) + TEXT.min] : [y(0), y(n - 1) + TEXT.min]);
      const [u0, u1] = room(...band(lines(x1 - x0).length));
      return lines(u1 - u0).map((t, k) => at(t, u0, TEXT.min, y(k)));
    }
    // (upright by a side wall: in ranges when the list is longer than the plan is high)
    const t = textWidth(text, { size, cond: true }) <= extent.y1 - extent.y0 ? text : short;
    return [wall === 'left'
      ? { t: 'text', at: [extent.x0 - 2, midY], text: t, size, angle: 90, align: 'c', cond: true }
      : { t: 'text', at: [extent.x1 + 2 + size, midY], text: t, size, angle: 90, align: 'c', cond: true }];
  });
}

/** Marks of a section line crossing the drawing: at both ends, arrows along the direction of view (along an axis, or a
 *  unit vector square to a cut askew). */
export function sectionMarks(a: Pt, b: Pt, view: 'up' | 'down' | 'left' | 'right' | Pt, letter: string): Shape[] {
  return [...sectionMark(a, view, letter), ...sectionMark(b, view, letter)];
}

/** The scale, at the right end of the title's line. */
export function scaleLabel(scale: number, subtitle: boolean): Shape {
  const y = FRAME.y0 + STRIP_H + (subtitle ? 11 : 8);
  return { t: 'text', at: [FRAME.x1 - 3, y], text: `SCALA 1:${scale}`, size: 2.2, align: 'r', cond: true };
}

/** The table of the floors section A-A whole leaves out of its shortened travel (`omit`, consecutive) and of the floor
 *  drawn over them, at the top of `area` (the legend's column, under its boxes): each floor's number, its height over the
 *  lowest floor and its rise from the floor under it — what the dimension "Piani …" over them sums (or the travel). */
export function floorTable(L: Layout, omit: readonly number[], area: Box): Shape[] {
  if (!omit.length) return [];
  const S = section(L), V = L.inputs.vertical, size = 2.2, pitch = 3.2, x0 = area.x0, x1 = area.x1;
  const label = (i: number): string => `"${V.floors[i]?.label ?? String(i)}"`, rows = [...omit, Math.max(...omit) + 1];
  const head = ['QUOTE DEI PIANI', `DAL PIANO ${label(0)}`], h = (head.length + 1 + rows.length) * pitch + 2.4, y1 = area.y1;
  const out: Shape[] = [{ t: 'path', pts: [[x0, y1 - h], [x1, y1 - h], [x1, y1], [x0, y1]], closed: true, s: STYLES.thin, fill: { k: 'solid', ink: 'paper' } }];
  const line = (k: number, cells: readonly [string, string, string]): void => {
    const y = y1 - 1.2 - pitch * (k + 0.8);
    out.push({ t: 'text', at: [x0 + 1.5, y], text: cells[0], size, cond: true }, { t: 'text', at: [x0 + 20, y], text: cells[1], size, align: 'r', cond: true },
      { t: 'text', at: [x1 - 1.5, y], text: cells[2], size, align: 'r', cond: true });
  };
  head.forEach((t, k) => out.push({ t: 'text', at: [x0 + 1.5, y1 - 1.2 - pitch * (k + 0.8)], text: t, size, cond: true }));
  line(head.length, ['PIANO', 'QUOTA', 'INTERPIANO']);
  const yr = y1 - 1.2 - pitch * (head.length + 1) + 0.6;
  out.push({ t: 'line', a: [x0, yr], b: [x1, yr], s: STYLES.thin });
  rows.forEach((i, k) => line(head.length + 1 + k, [label(i), `+${Math.round(S.levels[i] ?? 0)}`, String(Math.round((S.levels[i] ?? 0) - (S.levels[i - 1] ?? 0)))]));
  return out;
}
