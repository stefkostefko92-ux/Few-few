// The drawing set of a machine replacement, A4 sheets: 1 the data (the installation and the intervention, the existing
// and the new machine, the machine room and the drops as surveyed, the loads, the notes, the checks); 2 the machine
// room in plan with the section line; 3 the machine room in section B-B along the drops. Each view at the largest
// standard scale that fits with its dimensions. A machine below has no room over the shaft: no set (as a whole design
// leaves its room out).
import { A4, COND, PALETTE, concreteTile, drawingArea, frame, sheetTitle, strip, type DrawingDoc, type Hit, type Page, type SheetMeta } from '@/drawing';
import { deriveRoom, type RoomDerived } from '../room/derive';
import type { MachineSpec } from '@/shaft/machine-room';
import type { Plant } from '../plant';
import { inset, roomMarks, type Drawn } from './build';
import { scaleLabel } from './extras';
import { roomLegend, titleSpares } from './room-legend';
import { placeLines } from './input';
import { currentRevision, type TitleData } from './title-block';
import { surveySheetData } from './survey-data';
import type { SurveyTavoleInput } from './survey-input';
import { surveySheetShapes } from './survey-sheet';
import { machineName, surveyView } from './views';

export interface SurveyTavoleResult {
  doc: DrawingDoc;
  derived: RoomDerived;
  /** title and scale of each sheet */
  sheets: { title: string; scale: number | null }[];
  /** the dimensions of each sheet the screens let change (not part of the document) */
  hits: Hit[][];
  /** what sheet 1's title block writes (the attributes of the title block of the CAD files: cad/set-export.ts) */
  title: TitleData;
}

const LOADS = 'CARICHI: VALORI NEL FOGLIO 1';
const SPECS = [
  { k: 'plan', title: 'VISTA IN PIANTA DEL LOCALE MACCHINA', subtitle: LOADS.replace('CARICHI', 'CARICHI SULLA SOLETTA') },
  { k: 'section', title: 'VISTA IN ELEVATO DEL LOCALE MACCHINA - SEZ. B-B', subtitle: LOADS },
] as const;

/** A drawing sheet of the replacement's set: its title, its subtitle, its view and what it draws around it. */
export interface SurveySheet {
  title: string;
  subtitle: string;
  drawn: Drawn;
}

/** The machine room's sheets of `d` with the machine `M` (named as the set names it): the plan with the section line B-B
 *  and the legend of its symbols, the section — the PDF (buildSurveyTavole) and the CAD files (cad/project.ts
 *  surveyViews) take them from here. */
export function surveySheets(d: RoomDerived, M: MachineSpec): SurveySheet[] {
  return SPECS.map((s) => {
    const area = drawingArea(true), v = surveyView(d, s.k, inset(area, 8, 8, 8, 8), M);
    if (!v) throw new Error('no machine room');
    const marks = s.k === 'plan' ? roomMarks(v.G, v.place, v.r.extent) : [];
    const legend = s.k === 'plan' ? roomLegend([...v.r.shapes, ...marks], area, titleSpares(s.title, s.subtitle)) : [];
    return { title: s.title, subtitle: s.subtitle, drawn: { entities: v.entities, place: v.place, shapes: v.r.shapes, notes: [...marks, ...legend], scale: v.place.scale, hits: v.r.hits } };
  });
}

/** The machine as the replacement's set names it: the catalogue's, else as the data of the installation write it. */
export const surveyMachine = (d: RoomDerived, plant: Plant): MachineSpec => ({ ...d.M, label: machineName(plant, d.made) });

export function buildSurveyTavole(x: SurveyTavoleInput): SurveyTavoleResult {
  const d = deriveRoom(x.values, x.survey);
  if (!d.G) throw new Error('no machine room over the shaft');
  const M = surveyMachine(d, x.plant), pages = SPECS.length + 1;
  const [l1, l2] = placeLines(x.project), sheet = surveySheetData(x, d, pages);
  // the strip of every sheet: the revision and the plant number as the title block writes them
  const meta = (page: number): SheetMeta => ({
    number: x.set.number, page, pages, revision: currentRevision(sheet), location: `${l1} - ${l2}`, plant: sheet.plant,
  });
  const out: Page[] = [{ w: A4.w, h: A4.h, shapes: [...frame(), ...surveySheetShapes(sheet)] }];
  const sheets: SurveyTavoleResult['sheets'] = [{ title: 'DATI DELLA SOSTITUZIONE DELL’ARGANO', scale: null }], hits: Hit[][] = [[]];
  surveySheets(d, M).forEach(({ title, subtitle, drawn: v }, i) => {
    out.push({ w: A4.w, h: A4.h, shapes: [...frame(), ...v.shapes, ...v.notes, ...sheetTitle(title, subtitle), scaleLabel(v.scale, true), ...strip(meta(i + 2))] });
    sheets.push({ title, scale: v.scale });
    hits.push(v.hits);
  });
  const doc: DrawingDoc = {
    meta: { title: `Tavole ${x.set.number} - ${x.project.name}`, subject: 'Sostituzione dell’argano: dati, pianta e sezione B-B del locale macchina', author: x.company.name },
    palette: PALETTE, patterns: { concrete: concreteTile() }, cond: COND,
    images: { ...(x.company.logo ? { logo: x.company.logo } : {}), ...(x.clientLogo ? { client: x.clientLogo } : {}) }, pages: out,
  };
  return { doc, derived: d, sheets, hits, title: sheet };
}
