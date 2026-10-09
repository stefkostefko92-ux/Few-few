// Helpers of the tests on the lettering of the issued sheets (round 37): a lift's drawing set as the server composes it
// (the shaft design's layout, the marks of the calculation), a shaft's alone with a stock calculation, the sheets by
// title, their lettering, the pairs of lettering that overlap and what runs off the A4 sheet.
import { PRESETS } from '@/calc/presets';
import { A4, shapeBox, type Shape } from '@/drawing';
import { deriveLift, type LiftInputs } from '@/lib/lift';
import { valueMarks } from '@/lib/lift/marks';
import { storedInput } from '@/lib/tavole/compose';
import { buildTavole, type TavoleResult } from '@/lib/tavole/build';
import type { TavoleInput } from '@/lib/tavole/input';
import { layout, shaftSnapshot, type ShaftInputs } from '@/shaft';

export type Text = Extract<Shape, { t: 'text' }>;

const project = { name: 'Impianto di prova', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB-0001', client: 'Condominio Roma' };

/** The drawing set of a lift as the server issues it. */
export function liftSheets(L: LiftInputs): TavoleResult {
  const d = deriveLift(L), set = { number: '26-037', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'Elevatori di prova', projectData: project, plant: {}, revisions: [] };
  const x = storedInput(d.values, shaftSnapshot(d.shaft).layout, set, null, valueMarks(L.auto, d, d.bottom, d.collaudo));
  if (!x) throw new Error('no drawing set');
  return buildTavole(x);
}

/** The drawing set of a shaft with a stock calculation (no rope rig). */
export function shaftSheets(I: ShaftInputs): TavoleResult {
  const x: TavoleInput = {
    values: PRESETS.C, layout: layout(I), plant: { machine: 'M 73 (Sx)', governorLoad: 300, safetyGear: 'progressive' }, project,
    company: { name: 'Elevatori di prova', logo: null }, set: { number: '26-037', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'M.R.', revisions: [] },
  };
  return buildTavole(x);
}

/** The shapes of each sheet whose title `title` matches, with its scale. */
export const sheetsBy = (r: TavoleResult, title: RegExp): { shapes: Shape[]; scale: number | null; title: string }[] =>
  r.doc.pages.flatMap((p, i) => (title.test(r.sheets[i]?.title ?? '') ? [{ shapes: p.shapes, scale: r.sheets[i]?.scale ?? null, title: r.sheets[i]?.title ?? '' }] : []));

export const textsOf = (shapes: readonly Shape[]): Text[] => shapes.filter((s): s is Text => s.t === 'text');

/** The pairs of lettering that overlap by more than `min` mm both ways, where `pick` says the pair counts. */
export function overlapping(T: readonly Text[], pick: (a: string, b: string) => boolean = () => true, min = 0.4): string[] {
  const out: string[] = [];
  for (let a = 0; a < T.length; a++) for (let b = a + 1; b < T.length; b++) {
    const p = shapeBox(T[a]), q = shapeBox(T[b]), w = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), h = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
    if (w > min && h > min && pick(T[a].text, T[b].text)) out.push(`«${T[a].text}» × «${T[b].text}»`);
  }
  return out;
}

/** The shapes that run off the A4 sheet. */
export const offSheet = (shapes: readonly Shape[]): Shape[] => shapes.filter((s) => {
  const b = shapeBox(s);
  return !(b.x0 > -0.5 && b.x1 < A4.w + 0.5 && b.y0 > -0.5 && b.y1 < A4.h + 0.5);
});
