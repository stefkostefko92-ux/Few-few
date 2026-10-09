// The sheets of the rails developed with their brackets (round 36; in columns since round 37): the elevation of
// src/shaft/rails-dev.ts at a scale every bracket's interval reads at (never coarser than 1:200), in one column at the
// most detailed such scale it fits, else in columns side by side cut at the joints, on as many sheets as they need —
// and under it on the first what the installer needs to build them as checked (rails-notes.ts). Pure.
import { DIM, TEXT, boxH, boxW, moveShapes, paragraph, renderView, textWidth, type Box, type Entity, type Place, type Shape } from '@/drawing';
import { bracketSpans } from '@/shaft/brackets';
import { designPieces, railHeights } from '@/shaft/rail-brackets';
import { devColumns, devRails, type DevColumn } from '@/shaft/rails-cols';
import { DEV_PAPER, devAcross, railsDev } from '@/shaft/rails-dev';
import type { Layout } from '@/shaft/types';

export { railsNotes } from './rails-notes';

/** The scales the development takes, the most detailed first: at 1:500 the brackets' heights did not read (round 37). */
export const RAILS_SCALES = [50, 100, 200] as const;

/** One sheet of the development: what it draws (`shapes`, its `entities` placed by `place`) and the notes' paragraphs
 *  under it (`notes`, the first sheet only), paper millimetres — the sheet draws both, a CAD file the elevation's
 *  entities with the notes where the sheet has them (cad/project.ts). */
export interface RailsSheet {
  shapes: Shape[];
  notes: Shape[];
  scale: number;
  place: Place;
  entities: Entity[];
}

/** The coarsest of the scales at which every interval between two brackets, and every length of rail between two
 *  joints, carries its value inside its dimension line (as dims.ts fits it: those at the chains' ends go past them); the
 *  most detailed when none does. */
export function railsScaleLimit(L: Layout): number {
  const fits = (len: number, text: string, s: number): boolean => textWidth(text, { size: TEXT.dim, cond: true }) + 0.6 <= len / s + 1e-9;
  const spans = devRails(L).flatMap((r) => bracketSpans(railHeights(L, r))), pieces = designPieces(L).pieces.slice(1, -1);
  const ok = (s: number): boolean => spans.every((d) => fits(d, String(Math.round(d)), s)) && pieces.every((q) => fits(q, `Guida ${Math.round(q)}`, s));
  return RAILS_SCALES.filter(ok).at(-1) ?? RAILS_SCALES[0];
}

/** The notes' paragraphs from the foot of `area` up: their shapes and the height they take [mm]. */
function notesBlock(area: Box, notes: readonly string[]): { shapes: Shape[]; top: number } {
  const size = 2.1, out: Shape[] = [];
  let y = area.y0;
  for (const t of [...notes].reverse()) {
    const p = paragraph(area.x0, 0, boxW(area), t, size, 1.25), h = -p.bottom;
    out.unshift(...moveShapes(p.shapes, 0, y + h));
    y += h + 1.6;
  }
  return { shapes: out, top: notes.length ? y : area.y0 };
}

/** The columns `cols` at `scale` placed in `view` (their foot on its foot, centred across), or null when they do not fit. */
function placed(L: Layout, scale: number, cols: readonly DevColumn[], first: number, view: Box): Omit<RailsSheet, 'notes'> | null {
  const dev = railsDev(L, scale, cols, first), r0 = renderView(dev.entities, { scale, ox: 0, oy: 0 }).extent;
  if (boxW(r0) > boxW(view) + 1e-6 || boxH(r0) > boxH(view) + 1e-6) return null;
  const place: Place = { scale, ox: (view.x0 + view.x1) / 2 - (r0.x0 + r0.x1) / 2, oy: view.y0 - r0.y0 };
  return { shapes: renderView(dev.entities, place).shapes, scale, place, entities: dev.entities };
}

/** The paragraph telling how the columns go on, when there are more than one. */
const COLUMNS_NOTE = 'SVILUPPO IN COLONNE, da sinistra a destra e da un foglio al seguente: ogni colonna riprende alla giunzione delle guide segnata con la stessa '
  + 'lettera della precedente, e le sue quote proseguono dall’ultima staffa sotto quella giunzione.';

/** The development on sheets of drawing area `area`, the notes `notes` under it on the first: one sheet when it fits. */
export function railsSheets(L: Layout, area: Box, notes: readonly string[]): RailsSheet[] {
  const limit = railsScaleLimit(L), scales = RAILS_SCALES.filter((s) => s <= limit), gap = DEV_PAPER.pad;
  const plan = (text: readonly string[]): { block: { shapes: Shape[]; top: number }; view: Box } => {
    const block = notesBlock(area, text);
    return { block, view: { ...area, y0: block.top + 1 } };
  };
  // the room of one column on paper: the rails' height it may take, and how many fit across
  const capOf = (view: Box, s: number): number => (boxH(view) - (DEV_PAPER.title[1] + 3) - (DIM.overrun + 1) - 2) * s;
  const across = (s: number): number => {
    const A = devAcross(L, s), w = (A.right - A.left) / s, g = DEV_PAPER.gutter;
    return Math.max(1, Math.floor((boxW(area) + g) / (w + g)));
  };
  // one column at the most detailed scale it fits, else as few columns as one sheet takes, else sheets of them
  const first = plan(notes);
  for (const s of scales) {
    const one = placed(L, s, devColumns(L), 0, first.view);
    if (one) return [{ ...one, notes: first.block.shapes }];
  }
  const more = plan([...notes, COLUMNS_NOTE]);
  for (const s of scales) {
    const cols = devColumns(L, capOf(more.view, s), gap * s);
    if (cols.length > across(s)) continue;
    const one = placed(L, s, cols, 0, more.view);
    if (one) return [{ ...one, notes: more.block.shapes }];
  }
  const s = scales.at(-1) ?? RAILS_SCALES[0], n = across(s), cols = devColumns(L, capOf(more.view, s), gap * s), out: RailsSheet[] = [];
  for (let i = 0; i < cols.length; i += n) {
    const view = i === 0 ? more.view : area, page = placed(L, s, cols.slice(i, i + n), i, view);
    if (!page) throw new Error('rails do not fit on the sheet');
    out.push({ ...page, notes: i === 0 ? more.block.shapes : [] });
  }
  return out;
}
