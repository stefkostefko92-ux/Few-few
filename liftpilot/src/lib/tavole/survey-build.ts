// The drawing set of a machine replacement, A4 sheets: 1 the data (the installation and the intervention, the existing
// and the new machine, the machine room and the drops as surveyed, the loads, the notes, the checks); 2 the machine
// room in plan with the section line; 3 the machine room in section B-B along the drops. Each view at the largest
// standard scale that fits with its dimensions. A machine below has no room over the shaft: no set (as a whole design
// leaves its room out).
import { A4, COND, PALETTE, concreteTile, drawingArea, frame, sheetTitle, strip, type DrawingDoc, type Hit, type Page, type SheetMeta } from '@/drawing';
import { deriveRoom, type RoomDerived } from '../room/derive';
import { inset, roomMarks } from './build';
import { scaleLabel } from './extras';
import { dateIt, placeLines } from './input';
import { surveySheetData } from './survey-data';
import type { SurveyTavoleInput } from './survey-input';
import { surveySheetShapes } from './survey-sheet';
import { machineText, surveyView } from './views';

export interface SurveyTavoleResult {
  doc: DrawingDoc;
  derived: RoomDerived;
  /** title and scale of each sheet */
  sheets: { title: string; scale: number | null }[];
  /** the dimensions of each sheet the screens let change (not part of the document) */
  hits: Hit[][];
}

const LOADS = 'CARICHI: VALORI NEL FOGLIO 1';
const SPECS = [
  { k: 'plan', title: 'VISTA IN PIANTA DEL LOCALE MACCHINA', subtitle: LOADS.replace('CARICHI', 'CARICHI SULLA SOLETTA') },
  { k: 'section', title: 'VISTA IN ELEVATO DEL LOCALE MACCHINA - SEZ. B-B', subtitle: LOADS },
] as const;

export function buildSurveyTavole(x: SurveyTavoleInput): SurveyTavoleResult {
  const d = deriveRoom(x.values, x.survey);
  if (!d.G) throw new Error('no machine room over the shaft');
  // the machine named as the data of the installation name it, else as the catalogue
  const M = { ...d.M, label: machineText(x.plant, d.made) }, pages = SPECS.length + 1;
  const [l1, l2] = placeLines(x.project), last = x.set.revisions[x.set.revisions.length - 1];
  const meta = (page: number): SheetMeta => ({
    number: x.set.number, page, pages, revision: last ? `${last.mark} ${dateIt(last.date)}` : '', location: `${l1} - ${l2}`, plant: x.project.plantNumber || '—',
  });
  const out: Page[] = [{ w: A4.w, h: A4.h, shapes: [...frame(), ...surveySheetShapes(surveySheetData(x, d, pages))] }];
  const sheets: SurveyTavoleResult['sheets'] = [{ title: 'DATI DELLA SOSTITUZIONE DELL\'ARGANO', scale: null }], hits: Hit[][] = [[]];
  SPECS.forEach((s, i) => {
    const area = drawingArea(true), v = surveyView(d, s.k, inset(area, 8, 8, 8, 8), M);
    if (!v) throw new Error('no machine room');
    const shapes = [...v.r.shapes, ...(s.k === 'plan' ? roomMarks(v.G, v.place, v.r.extent) : [])];
    out.push({ w: A4.w, h: A4.h, shapes: [...frame(), ...shapes, ...sheetTitle(s.title, s.subtitle), scaleLabel(v.place.scale, true), ...strip(meta(i + 2))] });
    sheets.push({ title: s.title, scale: v.place.scale });
    hits.push(v.r.hits);
  });
  const doc: DrawingDoc = {
    meta: { title: `Tavole ${x.set.number} - ${x.project.name}`, subject: 'Sostituzione dell\'argano: dati, pianta e sezione B-B del locale macchina', author: x.company.name },
    palette: PALETTE, patterns: { concrete: concreteTile() }, cond: COND,
    images: { ...(x.company.logo ? { logo: x.company.logo } : {}), ...(x.clientLogo ? { client: x.clientLogo } : {}) }, pages: out,
  };
  return { doc, derived: d, sheets, hits };
}
