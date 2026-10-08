// The legend of the machine room's plan (registry locale.impianti, locale.gancio, locale.macchina): what its symbols
// for the light, the switches, the sockets, the ventilation, the trunking, the hook and the free areas stand for, in a
// compact block in the band the drawing leaves free under it or over it (else in a column beside it), so the view keeps
// its scale. Paper millimetres; Italian; pure.
import { STYLES, shapeBox, symbol, textWidth, union, type Box, type Shape, type SymbolName } from '@/drawing';

/** The plan's symbols as the legend names them. */
export const ROOM_LEGEND: readonly { sym: SymbolName; text: string }[] = [
  { sym: 'light', text: 'Punto luce (≥ 200 lx sulle aree di lavoro)' },
  { sym: 'switch', text: 'Interruttore della luce all’accesso' },
  { sym: 'socket', text: 'Presa 2P+PE' },
  { sym: 'vent', text: 'Griglia di aerazione' },
  { sym: 'duct', text: 'Canalina cavi (coperta dove si passa)' },
  { sym: 'hook', text: 'Gancio di sollevamento' },
  { sym: 'area', text: 'Superficie libera 500×600 · percorso 500' },
];

const SIZE = 1.8, ROW = 5.2, SYM = 3, PAD = 1.2;

/** The legend's shapes in `area` (the view's) clear of `drawn` (the view with its marks); none when it does not fit. */
export function roomLegend(drawn: readonly Shape[], area: Box): Shape[] {
  let ext: Box | null = null;
  for (const s of drawn) ext = union(ext, shapeBox(s));
  if (!ext) return [];
  const f = { size: SIZE, cond: true }, cell = Math.max(...ROOM_LEGEND.map((it) => textWidth(it.text, f))) + SYM + 4, w = area.x1 - area.x0;
  // a block of rows under the drawing or over it, as few rows as the width allows
  for (let cols = ROOM_LEGEND.length; cols >= 2; cols--) {
    if (cols * cell > w) continue;
    const rows = Math.ceil(ROOM_LEGEND.length / cols), h = rows * ROW + 2 * PAD, x0 = (area.x0 + area.x1) / 2 - (cols * cell) / 2;
    const below = ext.y0 - area.y0 >= h + 2 ? area.y0 : null, above = area.y1 - ext.y1 >= h + 2 ? area.y1 - h : null;
    const y0 = below ?? above;
    if (y0 === null) continue;
    return block(x0, y0, cols, cell, rows);
  }
  // else a column beside it
  const h = ROOM_LEGEND.length * ROW + 2 * PAD;
  for (const x0 of [area.x1 - cell, area.x0]) {
    const clear = x0 > (area.x0 + area.x1) / 2 ? area.x1 - ext.x1 >= cell + 2 : ext.x0 - area.x0 >= cell + 2;
    if (clear && area.y1 - area.y0 >= h) return block(x0, area.y0, 1, cell, ROOM_LEGEND.length);
  }
  return [];
}

/** The legend's items in `rows` rows of `cols` cells `cell` wide from (x0, y0), framed. */
function block(x0: number, y0: number, cols: number, cell: number, rows: number): Shape[] {
  const h = rows * ROW + 2 * PAD, out: Shape[] = [
    { t: 'path', pts: [[x0, y0], [x0 + cols * cell, y0], [x0 + cols * cell, y0 + h], [x0, y0 + h]], closed: true, s: STYLES.thin, fill: { k: 'solid', ink: 'paper' } },
  ];
  ROOM_LEGEND.forEach((it, i) => {
    const r = Math.floor(i / cols), c = i % cols, cx = x0 + c * cell, cy = y0 + h - PAD - (r + 0.5) * ROW;
    out.push(...symbol(it.sym, [cx + 1 + SYM / 2, cy], SYM), { t: 'text', at: [cx + SYM + 2.5, cy - SIZE * 0.35], text: it.text, size: SIZE, cond: true });
  });
  return out;
}
