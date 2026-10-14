// Helpers of the tests on the lettering of the issued sheets (round 37): a lift's drawing set as the server composes it
// (the shaft design's layout, the marks of the calculation), a shaft's alone with a stock calculation, the sheets by
// title, their lettering, the pairs of lettering that overlap and what runs off the A4 sheet; the drawn views of the
// sheets, so that a test picks the lettering of the entities it is about (a dimension's bare figure among it), whatever
// words it is written with.
import { PRESETS } from '@/calc/presets';
import { A4, renderView, shapeBox, type Entity, type Shape } from '@/drawing';
import { deriveLift, type LiftInputs } from '@/lib/lift';
import { valueMarks } from '@/lib/lift/marks';
import { storedInput } from '@/lib/tavole/compose';
import { buildTavole, setSheets, type Drawn, type TavoleResult } from '@/lib/tavole/build';
import type { TavoleInput } from '@/lib/tavole/input';
import { layout, shaftSnapshot, type ShaftInputs } from '@/shaft';

export type Text = Extract<Shape, { t: 'text' }>;

const project = { name: 'Impianto di prova', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB-0001', client: 'Condominio Roma' };

/** What the server draws a lift's set from. */
export function liftInput(L: LiftInputs): TavoleInput {
  const d = deriveLift(L), set = { number: '26-037', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'Elevatori di prova', projectData: project, plant: {}, revisions: [] };
  const x = storedInput(d.values, shaftSnapshot(d.shaft).layout, set, null, valueMarks(L.auto, d, d.bottom, d.collaudo));
  if (!x) throw new Error('no drawing set');
  return x;
}

/** A shaft's set with a stock calculation (no rope rig). */
export const shaftInput = (I: ShaftInputs): TavoleInput => ({
  values: PRESETS.C, layout: layout(I), plant: { machine: 'M 73 (Sx)', governorLoad: 300, safetyGear: 'progressive' }, project,
  company: { name: 'Elevatori di prova', logo: null }, set: { number: '26-037', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'M.R.', revisions: [] },
});

/** The drawing set of a lift as the server issues it. */
export const liftSheets = (L: LiftInputs): TavoleResult => buildTavole(liftInput(L));

/** The drawing set of a shaft with a stock calculation (no rope rig). */
export const shaftSheets = (I: ShaftInputs): TavoleResult => buildTavole(shaftInput(I));

/** The shapes of each sheet whose title `title` matches, with its scale. */
export const sheetsBy = (r: TavoleResult, title: RegExp): { shapes: Shape[]; scale: number | null; title: string }[] =>
  r.doc.pages.flatMap((p, i) => (title.test(r.sheets[i]?.title ?? '') ? [{ shapes: p.shapes, scale: r.sheets[i]?.scale ?? null, title: r.sheets[i]?.title ?? '' }] : []));

/** The drawn view of each sheet of the set from `x` whose title `title` matches (what buildTavole puts on the page). */
export const drawnBy = (x: TavoleInput, title: RegExp): { drawn: Drawn; title: string }[] =>
  setSheets(x).sheets.flatMap((s) => (title.test(s.spec.title) ? [{ drawn: s.drawn, title: s.spec.title }] : []));

export const textsOf = (shapes: readonly Shape[]): Text[] => shapes.filter((s): s is Text => s.t === 'text');

/** Two letterings overlapping by more than `min` mm both ways. */
const meet = (a: Text, b: Text, min: number): boolean => {
  const p = shapeBox(a), q = shapeBox(b);
  return Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > min && Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) > min;
};

/** The pairs of lettering that overlap by more than `min` mm both ways, where `pick` says the pair counts. */
export function overlapping(T: readonly Text[], pick: (a: string, b: string) => boolean = () => true, min = 0.4): string[] {
  const out: string[] = [];
  for (let a = 0; a < T.length; a++) for (let b = a + 1; b < T.length; b++) if (meet(T[a], T[b], min) && pick(T[a].text, T[b].text)) out.push(`«${T[a].text}» × «${T[b].text}»`);
  return out;
}

/** Every lettering of a drawn sheet (its view and what the sheet adds round it) that overlaps one drawn by the entities
 *  `pick` takes, those among them too: the view drawn again as the sheet draws it, each entity's lettering its own;
 *  with `against`, only the lettering of the entities it takes. */
export function crossing(d: Drawn, pick: (e: Entity) => boolean, against?: (e: Entity) => boolean, min = 0.4): string[] {
  const r = renderView(d.entities, d.place), of = (f: (e: Entity) => boolean): Text[] => r.parts.flatMap((p, i) => (d.entities[i] && f(d.entities[i]) ? textsOf(p) : []));
  const own = of(pick), all = against ? of(against) : textsOf([...r.shapes, ...d.notes]), out: string[] = [];
  own.forEach((o, i) => {
    for (const t of all) if (t !== o && !own.slice(0, i).includes(t) && meet(o, t, min)) out.push(`«${o.text}» × «${t.text}»`);
  });
  return out;
}

/** The shapes that run off the A4 sheet. */
export const offSheet = (shapes: readonly Shape[]): Shape[] => shapes.filter((s) => {
  const b = shapeBox(s);
  return !(b.x0 > -0.5 && b.x1 < A4.w + 0.5 && b.y0 > -0.5 && b.y1 < A4.h + 0.5);
});
