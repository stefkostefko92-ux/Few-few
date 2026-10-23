// Every view of a lift's project for its CAD files, as the drawing set's sheets draw them (build.ts setSheets): in the
// set's order, with each sheet's title, subtitle and number, at the scale the sheet prints it at and with what the sheet
// draws around it — the legends, the landings' sides, the section marks, the notes of the rails, the legend of the
// machine room's symbols — where the sheet has it; section A-A whole at its real height (the drawing set draws the
// travel shorter to fit the sheet), with the counterweight's sign on it and its legend in a column on its left. The
// machine room of a replacement in plan and section B-B too (survey-build.ts surveySheets). Pure.
import { renderView, type Shape } from '@/drawing';
import type { Layout } from '@/shaft/types';
import type { RoomDerived } from '../room/derive';
import type { Plant } from '../plant';
import { LEGEND_W, setSheets, type Drawn } from '../tavole/build';
import { legendColumn } from '../tavole/extras';
import type { TavoleInput } from '../tavole/input';
import type { LegendItem } from '../tavole/notes';
import { surveyMachine, surveySheets } from '../tavole/survey-build';
import { marksOf, realSection, sectionParts } from '../tavole/views';
import type { CadView } from './export';

/** The scale section A-A whole is lettered for. */
const FULL_SCALE = 50;

/** A sheet's view in a CAD file: its entities at the sheet's scale, laid out where the sheet lays them out, with the
 *  sheet's notes (export.ts laidOut moves both to the model's origin). */
const sheetView = (d: Drawn): Pick<CadView, 'scale' | 'entities' | 'origin' | 'notes'> =>
  ({ scale: d.scale, entities: d.entities, origin: [d.place.ox, d.place.oy], notes: d.notes });

/** Section A-A whole at its real height at 1:FULL_SCALE, `cwGap` on the counterweight's screen as sheet 1 gives it, the
 *  legend of the symbols it places in a column on its left (as its sheet has them). */
function realSectionView(L: Layout, legend: readonly LegendItem[], cwGap: number | null): Pick<CadView, 'scale' | 'entities' | 'notes'> {
  const { entities } = sectionParts(L, 'full', realSection(L), cwGap), marks = marksOf(entities);
  const ext = renderView(entities, { scale: FULL_SCALE, ox: 0, oy: 0 }).extent;
  const notes: Shape[] = legendColumn(legend.filter((it) => marks.includes(it.sym)), { x0: ext.x0 - 4 - LEGEND_W, y0: ext.y0, x1: ext.x0 - 4, y1: ext.y1 }, LEGEND_W);
  return { scale: FULL_SCALE, entities, notes };
}

/** Every view of the set drawn from `x`, as its sheets have them: the brackets at the pitches its data declare, the
 *  lift's rope rig, the machine named as the catalogue names it, the room of the machine below for its scheme, the
 *  values sheet 1 gives (the counterweight's sign, the thrusts of the rails' brackets). */
export function inputViews(x: TavoleInput): CadView[] {
  const { L, ds, sheets } = setSheets(x);
  return sheets.map(({ spec: s, drawn: d }, i): CadView => {
    const head: Pick<CadView, 'title' | 'subtitle' | 'sheet'> = { title: s.title, ...(s.subtitle !== undefined ? { subtitle: s.subtitle } : {}), sheet: i + 2 };
    return { ...head, ...(s.k === 'section' && s.kind === 'full' ? realSectionView(L, s.legend, ds.cwGap) : sheetView(d)) };
  });
}

/** The lines under the first view of a draft's CAD file — a saved project's (server/project-export.ts), a replacement's
 *  machine room's (server/room-export.ts): `what` it is, then where the sheets and the values its views name are
 *  ("Foglio n", "VALORI NEL FOGLIO 1"). A draft's file has its views alone, without sheet 1 and the sheets without a
 *  view (an issued set's has them: set-export.ts), so those are its PDF draft's, named by its file `pdf`. */
export const draftCaption = (what: string, pdf: string): string[] =>
  [`${what} · LiftPilot`, `BOZZA: i fogli e i valori citati sono quelli del PDF ${pdf}`];

/** The machine room of a replacement in plan and in section B-B, as its set's sheets draw them (the section line B-B and
 *  the legend of the plan's symbols with them); none without a room over the shaft. */
export function surveyViews(d: RoomDerived, plant: Plant): CadView[] {
  if (!d.G) return [];
  return surveySheets(d, surveyMachine(d, plant)).map((s, i) => ({ title: s.title, subtitle: s.subtitle, sheet: i + 2, ...sheetView(s.drawn) }));
}
