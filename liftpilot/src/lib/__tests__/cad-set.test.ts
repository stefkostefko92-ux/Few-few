// The CAD files of an issued drawing set carry the set as its PDF has it (round 37): the checks of the design on their
// own sheet under sheet 1 (no reference of sheet 1 to a sheet the file lacks), every view laid out where its sheet lays
// it out with what the sheet draws around it — the legends, the landings' sides, the section marks, the counterweight's
// sign, the notes of the rails with the thrusts sheet 1 gives, the legend of the machine room's symbols — lettered as
// the sheet letters it, with its subtitle and its sheet; the replacement's set the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { FRAME, STRIP_H, moveShapes, type Shape } from '@/drawing';
import { defaultInputs, layout } from '@/shaft';
import { inputViews, surveyViews } from '../cad/project';
import { laidOut, type CadView } from '../cad/export';
import { readCad } from '../cad/read';
import { paperSheets, setToDwg, setToDxf, sheetLayer, type IssuedSet } from '../cad/set-export';
import { defaultLift, deriveLift } from '../lift';
import { valueMarks, NO_MARKS } from '../lift/marks';
import { CHECKS_TITLE } from '../tavole/checks-sheet';
import { storedInput } from '../tavole/compose';
import { buildTavole, setSheets } from '../tavole/build';
import type { TavoleInput } from '../tavole/input';
import { railsNotes } from '../tavole/rails-sheet';
import { ROOM_LEGEND } from '../tavole/room-legend';
import { buildSurveyTavole } from '../tavole/survey-build';
import { makeFmt } from '../present/tr';
import { startSurvey } from '../room/survey';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The texts of a DXF (code 1), spaces folded. */
function dxfTexts(dxf: string): Set<string> {
  const lines = dxf.split('\n').map((s) => s.trim()), out = new Set<string>();
  for (let i = 0; i + 1 < lines.length; i += 2) if (lines[i] === '1') out.add(norm(lines[i + 1] ?? ''));
  return out;
}

/** The texts of a sheet a CAD file writes: not those of its strip (sheet 1's title block has them as attributes), not
 *  its scale (a view's caption says it), not the note of the travel drawn shorter (CAD draws section A-A whole). */
const sheetTexts = (shapes: readonly Shape[]): string[] => [...new Set(shapes.flatMap((s) => (s.t === 'text' && s.at[1] > FRAME.y0 + STRIP_H + 0.05 ? [norm(s.text)] : [])))]
  .filter((t) => !/^SCALA 1:\d+$/.test(t) && t !== 'TRATTO TRA LE INTERRUZIONI FUORI SCALA');

/** Shapes as sorted keys: kind, text and points to a thousandth of a millimetre (the order a view paints them aside). */
const keys = (shapes: readonly Shape[]): string[] => shapes.map((s) => JSON.stringify(s, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 + 0 : v))).sort();

const lift = (): TavoleInput => {
  const L = defaultLift(), d = deriveLift(L), project = { name: 'Prova', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB 1', client: 'C' };
  const x = storedInput(d.values, d.layout, { number: '26-037', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S', projectData: project, plant: {}, revisions: [] }, null, valueMarks(L.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  return x;
};

/** A machine below at the head of the shaft (no room over it: the room beside the shaft in plan and section C-C). */
const below = (): TavoleInput => ({
  values: { ...PRESETS.A, context: 'new', layout: 'bottom', Hv: '14' }, layout: layout({ ...defaultInputs(1600, 1750), access: 'none', room: null }),
  plant: { governorLoad: 300, safetyGear: 'progressive' }, marks: { ...NO_MARKS, bottom: 'head' },
  project: { name: 'Prova', address: 'Via Roma 1', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: 'Condominio' },
  company: { name: 'S', logo: null }, set: { number: '26-007', issuedAt: new Date('2026-09-30T10:00:00Z'), author: 'A.C.', revisions: [] },
});

const issued = (x: TavoleInput): { set: IssuedSet; r: ReturnType<typeof buildTavole> } => {
  const r = buildTavole(x);
  return { r, set: { views: inputViews(x), sheet: r.doc.pages[0]?.shapes ?? [], paper: paperSheets(r), title: r.title, caption: `Prova · DIS. N° 26-037 · ${r.doc.pages.length} fogli` } };
};

for (const [name, make] of [['progetto tipico', lift], ['macchina in basso', below]] as const) {
  test(`serie emessa in DXF (${name}): il foglio delle verifiche sotto il foglio 1, ogni rinvio del foglio 1 a un foglio del file`, () => {
    const x = make(), { r, set } = issued(x), dxf = setToDxf(set), have = dxfTexts(dxf), pages = r.doc.pages.length;
    // the checks' sheet is the last, without a view: in the file on its own layer, its table whole
    assert.deepEqual(set.paper.map((p) => p.page), [pages]);
    assert.ok(dxf.includes(`\n  8\n${sheetLayer(pages)}\n`), 'livello del foglio delle verifiche');
    assert.ok(have.has(CHECKS_TITLE));
    for (const [label, value, limit, outcome] of setSheets(x).ds.sheet.checks) for (const t of [label, value, limit, outcome]) assert.ok(have.has(norm(t)), `verifica «${t}»`);
    // its strip left out (its words are the title block's attributes), its number under it
    assert.ok(!have.has(`PAGINA N° ${pages}/${pages}`), 'niente striscia');
    assert.ok(have.has(`Foglio ${pages}`));
    // every sheet sheet 1 and the subtitles name is in the file: as a layer of paper or as a view's caption
    const named = [...dxf.matchAll(/FOGLIO (\d+)/g)].map((m) => Number(m[1]));
    assert.ok(named.includes(pages), 'il foglio 1 rinvia alle verifiche');
    for (const n of named) assert.ok(n === 1 || dxf.includes(`\n  8\n${sheetLayer(n)}\n`) || [...have].some((t) => t.startsWith(`Foglio ${n} · `)), `FOGLIO ${n}`);
    // every text of the drawing sheets and of the checks' sheet
    r.doc.pages.forEach((p, i) => {
      if (i === 0) return;
      const miss = sheetTexts(p.shapes).filter((t) => !have.has(t));
      assert.deepEqual(miss, [], `${name}: foglio ${i + 1} ${r.sheets[i]?.title ?? ''}`);
    });
    // the DWG the same entities
    const a = readCad(new TextEncoder().encode(dxf), 'serie.dxf'), b = readCad(setToDwg(set), 'serie.dwg');
    assert.equal(b.count, a.count);
    assert.deepEqual(b.bounds, a.bounds);
  });
}

test('vista CAD = vista del foglio: la stessa scala, gli stessi segni nello stesso posto, le stesse note, sottotitolo e foglio', () => {
  for (const x of [lift(), below()]) {
    const s = setSheets(x), views = inputViews(x);
    assert.equal(views.length, s.sheets.length);
    s.sheets.forEach(({ spec, drawn: d }, i) => {
      const v: CadView | undefined = views[i];
      assert.ok(v, spec.title);
      assert.equal(v.title, spec.title);
      assert.equal(v.subtitle, spec.subtitle);
      assert.equal(v.sheet, i + 2);
      if (spec.k === 'section' && spec.kind === 'full') return;
      assert.equal(v.scale, d.scale, spec.title);
      // the view laid out as its sheet lays it out, moved to the model's origin: every shape where the sheet draws it
      const { parts, notes } = laidOut(v), o = d.place, want = moveShapes([...d.shapes, ...d.notes], -o.ox, -o.oy);
      assert.deepEqual(keys([...parts.flat(), ...notes]), keys(want), spec.title);
    });
  }
});

test('sezione A-A intera: in scala reale, con il cartello del gioco del contrappeso e la legenda dei simboli che piazza', () => {
  const x = lift(), s = setSheets(x), i = s.sheets.findIndex(({ spec: q }) => q.k === 'section' && q.kind === 'full'), v = inputViews(x)[i], spec = s.sheets[i]?.spec;
  assert.ok(v && spec?.k === 'section' && s.ds.cwGap !== null);
  assert.equal(v.scale, 50);
  const texts = v.entities.flatMap((e) => (e.e === 'text' ? [e.text] : []));
  assert.ok(texts.some((t) => t.startsWith('CARTELLO') && t.includes(makeFmt('it-IT')(s.ds.cwGap ?? 0, 0))), 'cartello');
  const placed = new Set(v.entities.flatMap((e) => (e.e === 'mark' ? [e.sym] : []))), legend = (v.notes ?? []).flatMap((n) => (n.t === 'text' ? [n.text] : [])).join(' ');
  for (const it of spec.legend) assert.equal(legend.includes(norm(it.text).split(' ').slice(0, 3).join(' ')), placed.has(it.sym), it.text);
  // the legend on the left of the section, clear of it
  const e = laidOut({ ...v, notes: [] }).extent;
  for (const n of v.notes ?? []) if (n.t === 'text') assert.ok(n.at[0] < e.x0, n.text);
});

test('sviluppo delle guide: sotto la vista le note del foglio con le spinte del foglio 1, non trattini', () => {
  const x = lift(), s = setSheets(x), i = s.sheets.findIndex(({ spec: q }) => q.k === 'rails'), v = inputViews(x)[i];
  assert.ok(v);
  const placed = laidOut(v), notes = placed.notes.flatMap((n) => (n.t === 'text' ? [n.text] : [])).join(' ');
  assert.ok(!/Fx —|Fy —/.test(notes), notes);
  assert.ok(notes.includes(`Fx ${s.ds.rails.fx}`) && notes.includes(`Fy ${s.ds.rails.fy}`));
  for (const p of railsNotes(s.L, s.ds.rails, makeFmt('it-IT'))) assert.ok(norm(notes).includes(norm(p).split(' ').slice(0, 6).join(' ')), p.slice(0, 40));
  // under the elevation
  const top = Math.max(...placed.notes.map((n) => (n.t === 'text' ? n.at[1] : -Infinity))), view = laidOut({ ...v, notes: [] }).extent;
  assert.ok(top < view.y0, 'note sotto lo sviluppo');
});

test('sostituzione: pianta e sezione B-B del locale con i segni B, la legenda dei simboli, i sottotitoli, come il PDF', () => {
  const x = {
    values: PRESETS.A, survey: startSurvey(600), collaudo: { norma: '10411-1' as const, parti: ['machine' as const] }, plant: {},
    project: { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: null, client: null },
    company: { name: 'S', logo: null }, set: { number: '26-001', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'M.R.', revisions: [] },
  };
  const r = buildSurveyTavole(x), views = surveyViews(r.derived, {});
  assert.equal(views.length, 2);
  assert.deepEqual(paperSheets(r), [], 'le verifiche sul foglio 1');
  const dxf = setToDxf({ views, sheet: r.doc.pages[0]?.shapes ?? [], paper: [], title: r.title, caption: 'R' }), have = dxfTexts(dxf);
  for (const it of ROOM_LEGEND) assert.ok(have.has(it.text) || have.has(it.short), it.text);
  assert.ok(have.has('B') && have.has('CARICHI SULLA SOLETTA: VALORI NEL FOGLIO 1'));
  r.doc.pages.forEach((p, i) => {
    if (i === 0) return;
    assert.deepEqual(sheetTexts(p.shapes).filter((t) => !have.has(t)), [], `foglio ${i + 1}`);
  });
});
