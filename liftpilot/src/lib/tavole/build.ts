// The drawing set of a lift, A4 sheets: 1 the data; the plans of the shaft at the top floor (headroom), at the main
// floor and at the lowest floor; section A-A whole and in three details (headroom, main floor, pit); the machine room
// in plan and in section B-B — with the machine below, its room beside the shaft or under it in plan and in section
// C-C —; the pit in plan with its loads; the rails developed with their brackets. Each view at the largest standard
// scale that fits with its dimensions; the
// count adapts (no machine room: no sheets of it; main floor = lowest floor: one plan less).
import {
  A4, COND, FRAME, PALETTE, STRIP_H, concreteTile, drawingArea, frame, shapeBox, sheetTitle, strip, toPaper,
  type Box, type DrawingDoc, type Hit, type Page, type Place, type Pt, type Shape, type SheetMeta,
} from '@/drawing';
import type { MachineSpec, RoomGeo } from '@/shaft/machine-room';
import type { PlanLevel } from '@/shaft/plan-view';
import type { SectionKind } from '@/shaft/section-dims';
import type { Layout } from '@/shaft/types';
import { withPitches } from '@/shaft/brackets';
import type { BottomGeo, BottomScheme } from '../lift/bottom';
import { analyse, type Analysis } from '../present/analysis';
import { dataSheet, type Mismatch } from './data';
import { dataSheetShapes } from './datasheet';
import { legendColumn, legendHeight, legendRow, scaleLabel, sectionMarks, sideLabels } from './extras';
import { dateIt, placeLines, type TavoleInput } from './input';
import { OVER_DOWN, OVER_UP, spaceLegend, type LegendItem } from './notes';
import { makeFmt } from '../present/tr';
import { belowGeoOf, belowView, machineOf, planView, roomView, sectionView } from './views';
import { railsNotes, railsSheet } from './rails-sheet';

/** A sheet of the set after the data: a plan of the shaft, section A-A or a detail, the machine room. */
export type Spec =
  | { k: 'plan'; level: PlanLevel; floor: number; title: string; subtitle?: string; total: string; legend: LegendItem[] }
  | { k: 'section'; kind: SectionKind; floor: number; title: string; subtitle?: string; legend: LegendItem[] }
  | { k: 'room-plan' | 'room-section'; title: string; subtitle: string }
  | { k: 'below-plan' | 'below-section'; title: string; subtitle: string }
  | { k: 'rails'; title: string; subtitle: string };

export interface TavoleResult {
  doc: DrawingDoc;
  /** where the calculation and the design disagree */
  warnings: Mismatch[];
  /** title and scale of each sheet */
  sheets: { title: string; scale: number | null }[];
  /** the dimensions of each sheet the screens let change (not part of the document) */
  hits: Hit[][];
}

const LEGEND_W = 34;

/** The scheme of the machine below as the subtitles name it (the research's three). */
const BELOW_SUB: Readonly<Record<BottomScheme, string>> = {
  head: 'RINVII IN TESTATA', room: 'LOCALE PULEGGE SOPRA IL VANO', under: 'RINVII IN TESTATA, MACCHINA SOTTO LA FOSSA',
};

/** `room`: the design has a machine room above; `below`: the scheme of the machine below (its room's sheets). */
export function specs(L: Layout, room: boolean, below: BottomScheme | null = null): Spec[] {
  const V = L.inputs.vertical, top = V.floors.length - 1, main = Math.min(Math.max(0, V.main), top), label = (i: number): string => V.floors[i]?.label ?? String(i);
  const sp = spaceLegend(L, makeFmt('it-IT')), loads = 'CARICHI: VALORI NEL FOGLIO 1';
  const out: Spec[] = [
    { k: 'plan', level: 'top', floor: top, title: `VISTA IN PIANTA DEL VANO IN TESTATA - ULTIMA FERMATA SUPERIORE "${label(top)}"`, total: 'in Testata', legend: [sp.free, sp.top] },
    { k: 'plan', level: 'main', floor: main, title: `VISTA IN PIANTA DEL VANO - FERMATA PIANO PRINCIPALE "${label(main)}"`, total: `piano "${label(main)}"`, legend: [] },
  ];
  if (main !== 0) out.push({ k: 'plan', level: 'bottom', floor: 0, title: `VISTA IN PIANTA DEL VANO - ULTIMA FERMATA INFERIORE "${label(0)}"`, total: `piano "${label(0)}"`, legend: [] });
  out.push(
    { k: 'section', kind: 'full', floor: top, title: 'VISTA IN ELEVATO - SEZ. A-A', legend: [OVER_UP, sp.top, sp.free, OVER_DOWN, sp.pit] },
    { k: 'section', kind: 'top', floor: top, title: `VISTA IN ELEVATO - ULTIMA FERMATA SUPERIORE "${label(top)}" - SEZ. A-A`, subtitle: 'PARTICOLARE DEGLI SPAZI DELLA CABINA IN TESTATA', legend: [sp.top, OVER_UP, sp.free] },
    { k: 'section', kind: 'floor', floor: main, title: `VISTA IN ELEVATO - FERMATA PIANO PRINCIPALE "${label(main)}" - SEZ. A-A`, subtitle: 'PARTICOLARE DELLA CABINA AL PIANO', legend: [] },
    { k: 'section', kind: 'pit', floor: 0, title: `VISTA IN ELEVATO IN FOSSA - ULTIMA FERMATA INFERIORE "${label(0)}" - SEZ. A-A`, subtitle: `PARTICOLARE DEGLI SPAZI DELLA CABINA AL PIANO "${label(0)}" E IN FOSSA`, legend: [OVER_DOWN, sp.pit] },
  );
  if (room) {
    out.push(
      { k: 'room-plan', title: 'VISTA IN PIANTA DEL LOCALE MACCHINA', subtitle: `${loads.replace('CARICHI', 'CARICHI SULLA SOLETTA')}` },
      { k: 'room-section', title: 'VISTA IN ELEVATO DEL LOCALE MACCHINA - SEZ. B-B', subtitle: loads },
    );
  }
  if (below) {
    const where = below === 'under' ? 'SOTTO IL VANO' : 'ACCANTO AL VANO', sub = `MACCHINA IN BASSO: ${BELOW_SUB[below]}`;
    out.push(
      { k: 'below-plan', title: `VISTA IN PIANTA DEL LOCALE MACCHINA ${where}`, subtitle: sub },
      { k: 'below-section', title: `VISTA IN ELEVATO DEL LOCALE MACCHINA ${where} - SEZ. C-C`, subtitle: sub },
    );
  }
  out.push({ k: 'plan', level: 'pit', floor: 0, title: `VISTA IN PIANTA DEL VANO AL PIANO "${label(0)}" E IN FOSSA`, subtitle: loads.replace('CARICHI', 'CARICHI IN FOSSA'), total: `piano "${label(0)}" e in Fossa`, legend: [sp.pit] });
  // the rails developed with their brackets' heights (rails-sheet.ts)
  out.push({ k: 'rails', title: 'SVILUPPO DELLE GUIDE E POSIZIONE DELLE STAFFE', subtitle: 'QUOTE DELLE STAFFE DAL FONDO DELLA FOSSA, LUNGHEZZE DELLE GUIDE' });
  return out;
}

export const inset = (b: Box, l: number, r: number, bottom: number, top: number): Box => ({ x0: b.x0 + l, y0: b.y0 + bottom, x1: b.x1 - r, y1: b.y1 - top });

interface Drawn {
  shapes: Shape[];
  scale: number;
  hits: Hit[];
}

/** Whether nothing of `shapes` reaches into the box. */
const clear = (shapes: readonly Shape[], b: Box): boolean => shapes.every((s) => {
  const o = shapeBox(s);
  return o.x1 < b.x0 || o.x0 > b.x1 || o.y1 < b.y0 || o.y0 > b.y1;
});

function planSheet(L: Layout, s: Extract<Spec, { k: 'plan' }>, area: Box): Drawn {
  // room around the view for the "LATO FERMATE" labels (rotated on a side wall) and the section marks
  const side = (w: 'left' | 'right'): number => (L.doors.some((d) => d.wall === w) ? 11 : 4);
  const drawn = (a: Box): Drawn => {
    const { r, place } = planView(L, s.level, s.floor, s.total, inset(a, side('left'), side('right'), 9, 8));
    const px = toPaper(place, [L.car.x + L.car.w / 2, 0])[0];
    const marks = sectionMarks([px, r.extent.y1 + 3.5], [px, r.extent.y0 - 3.5], 'left', 'A');
    return { shapes: [...r.shapes, ...sideLabels(L, r.extent), ...marks], scale: place.scale, hits: r.hits };
  };
  // the legend's boxes as the trade's sheets have them: in a free corner on the right of the drawing, the first ones
  // at the top and the rest at the foot when one corner cannot take them all; else in a row under a smaller drawing
  const d = drawn(area), x0 = area.x1 - LEGEND_W, fits = (items: readonly LegendItem[], top: boolean): Box | null => {
    const h = legendHeight(items, LEGEND_W), b = top ? { x0, y0: area.y1 - h, x1: area.x1, y1: area.y1 } : { x0, y0: area.y0, x1: area.x1, y1: area.y0 + h };
    return clear(d.shapes, b) ? b : null;
  };
  const all = fits(s.legend, true) ?? fits(s.legend, false), head = s.legend.slice(0, 1), rest = s.legend.slice(1);
  if (all) return { ...d, shapes: [...d.shapes, ...legendColumn(s.legend, all, LEGEND_W)] };
  const a = fits(head, true), b = fits(rest, false);
  if (a && b) return { ...d, shapes: [...d.shapes, ...legendColumn(head, a, LEGEND_W), ...legendColumn(rest, b, LEGEND_W)] };
  const lg = legendRow(s.legend, area), small = drawn(inset(area, 0, 0, lg.height + 7, 0));
  return { ...small, shapes: [...small.shapes, ...lg.shapes] };
}

function sectionSheet(L: Layout, s: Extract<Spec, { k: 'section' }>, area: Box, cwGap: number | null = null): Drawn {
  // the whole section keeps its height: its legend goes in a column on the left, the details' in a row at the foot; the
  // legend only of the symbols the view places (laid out again when some are missing)
  const draw = (legend: readonly LegendItem[]) => {
    const full = s.kind === 'full', lg = full ? { shapes: legendColumn(legend, area, LEGEND_W), height: 0 } : legendRow(legend, area);
    const view = full ? inset(area, LEGEND_W + 4, 0, 0, 0) : inset(area, 0, 0, lg.height + (lg.height ? 4 : 0), 0);
    return { lg, v: sectionView(L, s.kind, s.floor, view, cwGap) };
  };
  let { lg, v } = draw(s.legend);
  const used = s.legend.filter((it) => v.marks.includes(it.sym));
  if (used.length < s.legend.length) ({ lg, v } = draw(used));
  // the travel drawn shorter between the break marks: said by the scale
  const note: Shape[] = v.compressed ? [{ t: 'text', at: [FRAME.x1 - 3, FRAME.y0 + STRIP_H + (s.subtitle !== undefined ? 11 : 8) - 3.4], text: 'TRATTO TRA LE INTERRUZIONI FUORI SCALA',
    size: 1.8, align: 'r', cond: true }] : [];
  return { shapes: [...v.r.shapes, ...lg.shapes, ...note], scale: v.place.scale, hits: v.r.hits };
}

/** Section line B-B on the room plan: along the rope drops, beyond the drawing and its dimensions at both ends, looking
 *  across them. */
export function roomMarks(G: RoomGeo, p: Place, edges: Box): Shape[] {
  const at = (u: number): Pt => toPaper(p, [G.carDrop[0] + u * G.ux, G.carDrop[1] + u * G.uy]);
  const a = at(0), b = at(G.calata), dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1, ux = dx / n, uy = dy / n;
  // from the middle of the drops out to the edges of the drawing with its dimensions, 5 mm beyond
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const reach = (s: number): Pt => {
    let t = 0;
    while (t < 400) {
      const q: Pt = [mid[0] + s * ux * t, mid[1] + s * uy * t];
      if (q[0] < edges.x0 || q[0] > edges.x1 || q[1] < edges.y0 || q[1] > edges.y1) return [q[0] + s * ux * 5, q[1] + s * uy * 5];
      t += 1;
    }
    return mid;
  };
  // looking square to the cut, to its left (on an axis: up when it runs right, left when it runs up)
  return sectionMarks(reach(-1), reach(1), [-uy, ux], 'B');
}

/** Section C-C's marks on the plan of the room below: through the sheave's centre along the drops' direction. */
function belowMarks(g: BottomGeo, p: Place, edges: Box): Shape[] {
  const c: Pt = [(g.mc[0] + g.mw[0]) / 2, (g.mc[1] + g.mw[1]) / 2], a = toPaper(p, c), b = toPaper(p, [c[0] + g.dir[0], c[1] + g.dir[1]]);
  const n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / n, uy = (b[1] - a[1]) / n;
  const reach = (s: number): Pt => {
    for (let t = 0; t < 400; t += 1) {
      const q: Pt = [a[0] + s * ux * t, a[1] + s * uy * t];
      if (q[0] < edges.x0 || q[0] > edges.x1 || q[1] < edges.y0 || q[1] > edges.y1) return [q[0] + s * ux * 5, q[1] + s * uy * 5];
    }
    return a;
  };
  return sectionMarks(reach(-1), reach(1), [-uy, ux], 'C');
}

function belowSheet(L: Layout, M: MachineSpec, g: BottomGeo, kind: 'below-plan' | 'below-section', area: Box): Drawn {
  const v = belowView(L, M, g, kind === 'below-plan' ? 'plan' : 'section', inset(area, 8, 8, 8, 8));
  return { shapes: [...v.r.shapes, ...(kind === 'below-plan' ? belowMarks(g, v.place, v.r.extent) : [])], scale: v.place.scale, hits: v.r.hits };
}

function roomSheet(L: Layout, M: MachineSpec, kind: 'room-plan' | 'room-section', area: Box): Drawn {
  const v = roomView(L, M, kind === 'room-plan' ? 'plan' : 'section', inset(area, 8, 8, 8, 8));
  if (!v) throw new Error('no machine room');
  return { shapes: [...v.r.shapes, ...(kind === 'room-plan' ? roomMarks(v.G, v.place, v.r.extent) : [])], scale: v.place.scale, hits: v.r.hits };
}

/** The design the set draws: the stored one with the brackets' pitches the installation's data declare, so the plans'
 *  codes, the rails' sheet and sheet 1 count the same brackets — the PDF and the CAD files alike (project-export.ts). */
export const setLayout = (x: Pick<TavoleInput, 'layout' | 'plant'>): Layout =>
  withPitches(x.layout, { car: x.plant.carBracketPitch, cw: x.plant.cwBracketPitch });

export function buildTavole(x: TavoleInput): TavoleResult {
  const L: Layout = setLayout(x), a: Analysis = analyse(x.values), M = machineOf(a, x.plant, L, x.marks?.catalog ?? null);
  // the machine below: its room's sheets for the scheme the design chose (the head pulleys under the slab when none)
  const scheme = a.ctx.I.layout === 'bottom' ? x.marks?.bottom ?? 'head' : null, g = scheme ? belowGeoOf(a, L, M, scheme) : null;
  const list = specs(L, L.inputs.room !== null && a.ctx.I.layout !== 'bottom', scheme), pages = list.length + 1;
  const [l1, l2] = placeLines(x.project), last = x.set.revisions[x.set.revisions.length - 1];
  const meta = (page: number): SheetMeta => ({
    number: x.set.number, page, pages, revision: last ? `${last.mark} ${dateIt(last.date)}` : '', location: `${l1} - ${l2}`, plant: x.project.plantNumber || '—',
  });
  const ds = dataSheet(x, a, pages);
  const out: Page[] = [{ w: A4.w, h: A4.h, shapes: [...frame(), ...dataSheetShapes(ds.sheet)] }];
  const sheets: TavoleResult['sheets'] = [{ title: 'DATI DELL’IMPIANTO', scale: null }], hits: Hit[][] = [[]];
  list.forEach((s, i) => {
    const sub = s.subtitle !== undefined, area = drawingArea(sub);
    const d = s.k === 'plan' ? planSheet(L, s, area) : s.k === 'section' ? sectionSheet(L, s, area, ds.cwGap)
      : s.k === 'rails' ? { ...railsSheet(L, area, railsNotes(L, ds.rails, makeFmt('it-IT'))), hits: [] }
      : s.k === 'below-plan' || s.k === 'below-section' ? belowSheet(L, M, g ?? belowGeoOf(a, L, M, 'head'), s.k, area) : roomSheet(L, M, s.k, area);
    out.push({ w: A4.w, h: A4.h, shapes: [...frame(), ...d.shapes, ...sheetTitle(s.title, s.subtitle), scaleLabel(d.scale, sub), ...strip(meta(i + 2))] });
    sheets.push({ title: s.title, scale: d.scale });
    hits.push(d.hits);
  });
  const doc: DrawingDoc = {
    meta: { title: `Tavole ${x.set.number} - ${x.project.name}`, subject: 'Progetto dell’ascensore: dati, piante e sezioni del vano, locale macchina', author: x.company.name },
    palette: PALETTE, patterns: { concrete: concreteTile() }, cond: COND, images: { ...(x.company.logo ? { logo: x.company.logo } : {}), ...(x.clientLogo ? { client: x.clientLogo } : {}) }, pages: out,
  };
  return { doc, warnings: ds.warnings, sheets, hits };
}
