// The legend of the machine room's plan (registry locale.impianti, locale.gancio, locale.macchina): what its symbols
// for the light, the switches, the sockets, the ventilation, the trunking, the hook and the free areas stand for, in a
// compact block in the band the drawing leaves free under it or over it (else in a column beside it), so the view keeps
// its scale; when the drawing fills its area, smaller (and shorter) beside the sheet's title — the plan's symbols never
// go unexplained. Paper millimetres; Italian; pure.
import { FRAME, STRIP_H, STYLES, drawingArea, fitSize, shapeBox, symbol, textWidth, union, type Box, type Shape, type SymbolName } from '@/drawing';

/** The plan's symbols as the legend names them (`short`: beside the title, where room is scarce). */
export const ROOM_LEGEND: readonly { sym: SymbolName; text: string; short: string }[] = [
  { sym: 'light', text: 'Punto luce (≥ 200 lx sulle aree di lavoro)', short: 'Punto luce (≥ 200 lx)' },
  { sym: 'switch', text: 'Interruttore della luce all’accesso', short: 'Interruttore luce' },
  { sym: 'socket', text: 'Presa 2P+PE', short: 'Presa 2P+PE' },
  { sym: 'vent', text: 'Griglia di aerazione', short: 'Aerazione' },
  { sym: 'duct', text: 'Canalina cavi (coperta dove si passa)', short: 'Canalina cavi' },
  { sym: 'hook', text: 'Gancio di sollevamento', short: 'Gancio' },
  { sym: 'area', text: 'Superficie libera 500×600 · percorso 500', short: 'Sup. libera · percorso' },
];

/** The lettering's size, the rows' pitch, the symbols' size and the frame's padding [mm]; the texts full or short. */
interface Look {
  size: number;
  row: number;
  sym: number;
  pad: number;
  short: boolean;
}

const LOOK: Look = { size: 1.8, row: 5.2, sym: 3, pad: 1.2, short: false };
/** Beside the title, smaller: the full texts first, then the short ones. */
const SPARE: readonly Look[] = [
  { size: 1.5, row: 3.9, sym: 2.4, pad: 0.8, short: false },
  { size: 1.3, row: 3.4, sym: 2.2, pad: 0.6, short: false },
  { size: 1.5, row: 3.9, sym: 2.4, pad: 0.8, short: true },
  { size: 1.3, row: 3.4, sym: 2.2, pad: 0.6, short: true },
];

const textOf = (it: (typeof ROOM_LEGEND)[number], k: Look): string => (k.short ? it.short : it.text);
const cellOf = (k: Look): number => Math.max(...ROOM_LEGEND.map((it) => textWidth(textOf(it, k), { size: k.size, cond: true }))) + k.sym + 4;

/** The free boxes beside a sheet's title (sheet.ts sheetTitle), between the strip and the drawing area: left of it, and
 *  right of it short of the scale (extras.ts scaleLabel). */
export function titleSpares(title: string, subtitle?: string): Box[] {
  const sub = subtitle !== undefined, size = fitSize(title, 170, { size: 3.6, cond: true }), cx = (FRAME.x0 + FRAME.x1) / 2;
  const half = Math.max(textWidth(title, { size, cond: true }), sub ? textWidth(subtitle, { size: 2.2, cond: true }) : 0) / 2;
  const y0 = FRAME.y0 + STRIP_H + 1, y1 = drawingArea(sub).y0 - 1, scale = textWidth('SCALA 1:100', { size: 2.2, cond: true });
  return [{ x0: FRAME.x0 + 2, y0, x1: cx - half - 3, y1 }, { x0: cx + half + 3, y0, x1: FRAME.x1 - 3 - scale - 3, y1 }];
}

/** The legend's shapes in `area` (the view's) clear of `drawn` (the view with its marks); when it does not fit there,
 *  smaller in one of the `spare` boxes (titleSpares); none when nothing fits. */
export function roomLegend(drawn: readonly Shape[], area: Box, spare: readonly Box[] = []): Shape[] {
  let ext: Box | null = null;
  for (const s of drawn) ext = union(ext, shapeBox(s));
  if (!ext) return [];
  const cell = cellOf(LOOK), w = area.x1 - area.x0, n = ROOM_LEGEND.length;
  // a block of rows under the drawing or over it, as few rows as the width allows
  for (let cols = n; cols >= 2; cols--) {
    if (cols * cell > w) continue;
    const rows = Math.ceil(n / cols), h = rows * LOOK.row + 2 * LOOK.pad, x0 = (area.x0 + area.x1) / 2 - (cols * cell) / 2;
    const below = ext.y0 - area.y0 >= h + 2 ? area.y0 : null, above = area.y1 - ext.y1 >= h + 2 ? area.y1 - h : null;
    const y0 = below ?? above;
    if (y0 === null) continue;
    return block(x0, y0, cols, cell, rows, LOOK);
  }
  // else a column beside it
  const h = n * LOOK.row + 2 * LOOK.pad;
  for (const x0 of [area.x1 - cell, area.x0]) {
    const clear = x0 > (area.x0 + area.x1) / 2 ? area.x1 - ext.x1 >= cell + 2 : ext.x0 - area.x0 >= cell + 2;
    if (clear && area.y1 - area.y0 >= h) return block(x0, area.y0, 1, cell, n, LOOK);
  }
  // else beside the title, smaller (round 36 review: the symbols are drawn in any case)
  for (const k of SPARE) {
    const c = cellOf(k);
    for (const b of spare) {
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols), bh = rows * k.row + 2 * k.pad;
        if (cols * c > b.x1 - b.x0 || bh > b.y1 - b.y0) continue;
        return block(b.x0, (b.y0 + b.y1) / 2 - bh / 2, cols, c, rows, k);
      }
    }
  }
  return [];
}

/** The legend's items in `rows` rows of `cols` cells `cell` wide from (x0, y0), framed, as `k` letters them. */
function block(x0: number, y0: number, cols: number, cell: number, rows: number, k: Look): Shape[] {
  const h = rows * k.row + 2 * k.pad, out: Shape[] = [
    { t: 'path', pts: [[x0, y0], [x0 + cols * cell, y0], [x0 + cols * cell, y0 + h], [x0, y0 + h]], closed: true, s: STYLES.thin, fill: { k: 'solid', ink: 'paper' } },
  ];
  ROOM_LEGEND.forEach((it, i) => {
    const r = Math.floor(i / cols), c = i % cols, cx = x0 + c * cell, cy = y0 + h - k.pad - (r + 0.5) * k.row;
    out.push(...symbol(it.sym, [cx + 1 + k.sym / 2, cy], k.sym), { t: 'text', at: [cx + k.sym + 2.5, cy - k.size * 0.35], text: textOf(it, k), size: k.size, cond: true });
  });
  return out;
}
