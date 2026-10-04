// What the drawing sheets carry on paper around the views: the boxes of the legend (symbol over a ruled box of text,
// in a row at the foot of the drawing area), the landings each side of a plan serves ("LATO FERMATE …"), the marks of
// the section lines and the scale by the title. Paper millimetres, y up.
import { FRAME, STRIP_H, STYLES, boxW, sectionMark, symbol, wrap, type Box, type Pt, type Shape } from '@/drawing';
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

/** Floors served by each entrance, as the plans label their sides. */
export function servedBy(L: Layout): { wall: Wall; text: string }[] {
  const V = L.inputs.vertical;
  return L.doors.map((d) => {
    const labels = V.floors.filter((f) => f.door.includes(d.side)).map((f) => f.label);
    return { wall: d.wall, text: `LATO FERMAT${labels.length > 1 ? 'E' : 'A'} "${labels.join(', ')}"` };
  });
}

/** The "LATO FERMATE" labels just outside the extent of a plan (the front wall is at the bottom of the sheet). */
export function sideLabels(L: Layout, extent: Box): Shape[] {
  const size = 3.8, midY = (extent.y0 + extent.y1) / 2;
  return servedBy(L).map(({ wall, text }): Shape => {
    if (wall === 'front') return { t: 'text', at: [extent.x0, extent.y0 - 2 - size], text, size, cond: true };
    if (wall === 'rear') return { t: 'text', at: [extent.x0, extent.y1 + 2], text, size, cond: true };
    return wall === 'left'
      ? { t: 'text', at: [extent.x0 - 2, midY], text, size, angle: 90, align: 'c', cond: true }
      : { t: 'text', at: [extent.x1 + 2 + size, midY], text, size, angle: 90, align: 'c', cond: true };
  });
}

/** Marks of a section line crossing the drawing: at both ends, arrows along the direction of view. */
export function sectionMarks(a: Pt, b: Pt, view: 'up' | 'down' | 'left' | 'right', letter: string): Shape[] {
  return [...sectionMark(a, view, letter), ...sectionMark(b, view, letter)];
}

/** The scale, at the right end of the title's line. */
export function scaleLabel(scale: number, subtitle: boolean): Shape {
  const y = FRAME.y0 + STRIP_H + (subtitle ? 11 : 8);
  return { t: 'text', at: [FRAME.x1 - 3, y], text: `SCALA 1:${scale}`, size: 2.2, align: 'r', cond: true };
}
