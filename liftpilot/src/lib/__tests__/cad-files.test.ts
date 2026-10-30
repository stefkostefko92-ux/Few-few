// The CAD files as files (round 37): a DWG (code page 1252) loses no sign the drawings write — the Greek letters of the
// rails' note (λ, ω, δ) by their names, like σ —; angles typed in a CAD program run counter-clockwise ($ANGDIR 0, in
// the DXF and in the DWG); a file is dated as its record (the set's issue, the design's saving), local and universal,
// and two downloads of the same record are the same bytes, in DXF and DWG, a project's views and an issued set alike,
// whatever the time zone of the host (also in the hour a daylight saving change skips).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PRESETS } from '@/calc/presets';
import type { Shape } from '@/drawing';
import { defaultInputs, layout } from '@/shaft';
import { acad } from '../cad/acad';
import { cp1252, laidOut, planToDxf, toDwg, toDxf, type CadView } from '../cad/export';
import { inputViews, surveyViews } from '../cad/project';
import { paperSheets, setToDwg, setToDxf, type IssuedSet } from '../cad/set-export';
import { deriveLift, newLift, type LiftInputs } from '../lift';
import { NO_MARKS, valueMarks } from '../lift/marks';
import { storedInput } from '../tavole/compose';
import { buildTavole } from '../tavole/build';
import type { TavoleInput } from '../tavole/input';
import { buildSurveyTavole } from '../tavole/survey-build';
import { startSurvey } from '../room/survey';

const AT = new Date('2026-10-08T10:00:00Z');
const project = { name: 'Prova', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB 1', client: 'C' };

const liftInput = (L: LiftInputs): TavoleInput => {
  const d = deriveLift(L);
  const x = storedInput(d.values, d.layout, { number: '26-037', createdAt: AT, authorInitials: 'M.R.', companyName: 'S', projectData: project, plant: {}, revisions: [] }, null, valueMarks(L.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  return x;
};

/** A machine below at the head of the shaft. */
const below = (): TavoleInput => ({
  values: { ...PRESETS.A, context: 'new', layout: 'bottom', Hv: '14' }, layout: layout({ ...defaultInputs(1600, 1750), access: 'none', room: null }),
  plant: { governorLoad: 300, safetyGear: 'progressive' }, marks: { ...NO_MARKS, bottom: 'head' }, project,
  company: { name: 'S', logo: null }, set: { number: '26-007', issuedAt: AT, author: 'A.C.', revisions: [] },
});

const LIFTS: readonly (readonly [string, () => TavoleInput])[] = [
  ['impianto nuovo', () => liftInput(newLift())],
  ['contrappeso a sinistra', () => { const L = newLift(); return liftInput({ ...L, shaft: { ...L.shaft, cw: 'left' } }); }],
  ['macchina in basso', below],
];

/** Every text a set's CAD file writes: its sheets as the PDF draws them, its views laid out, the notes around them. */
const textsOf = (shapes: readonly Shape[]): string[] => shapes.flatMap((s) => (s.t === 'text' ? [s.text] : []));
const viewTexts = (views: readonly CadView[]): string[] => views.flatMap((v) => {
  const { parts, notes } = laidOut(v);
  return [v.title, v.subtitle ?? '', ...textsOf(parts.flat()), ...textsOf(notes)];
});

/** The signs of `texts` a DWG would write as '?' (none but '?' itself). */
const lost = (texts: readonly string[]): string[] => [...new Set(texts.flatMap((t) => [...t].filter((c) => c !== '?' && cp1252(c) === '?')))];

test('DWG in cp1252: le lettere greche per nome, come σ; nessun segno dei disegni diventa «?»', () => {
  assert.equal(cp1252('λ = 134, ω = 3,04; frecce δx 0,8 mm; σm'), 'lambda = 134, omega = 3,04; frecce deltax 0,8 mm; sigmam');
  assert.equal(cp1252('Δ Ω φ π ε η α β γ μ'), 'Delta Omega phi pi epsilon eta alfa beta gamma mu');
  // what code page 1252 has stays itself
  assert.equal(cp1252('Ø 2,5 mm² ±1 € “Ø” — °'), 'Ø 2,5 mm² ±1 € “Ø” — °');
  for (const [name, make] of LIFTS) {
    const x = make(), r = buildTavole(x), texts = [...r.doc.pages.flatMap((p) => textsOf(p.shapes)), ...viewTexts(inputViews(x))];
    assert.ok(texts.some((t) => /[λωδ]/.test(t)), `${name}: la nota delle guide con λ, ω, δ`);
    assert.deepEqual(lost(texts), [], name);
  }
  // the replacement's set: its sheets and its plan and section B-B
  const r = buildSurveyTavole({
    values: PRESETS.A, survey: startSurvey(600), collaudo: { norma: '10411-1' as const, parti: ['machine' as const] }, plant: {}, project,
    company: { name: 'S', logo: null }, set: { number: '26-001', issuedAt: AT, author: 'M.R.', revisions: [] },
  });
  assert.deepEqual(lost([...r.doc.pages.flatMap((p) => textsOf(p.shapes)), ...viewTexts(surveyViews(r.derived, {}))]), []);
});

/** A set of `x` as its CAD files take it, dated `date`. */
const issued = (x: TavoleInput, date: Date): IssuedSet => {
  const r = buildTavole(x);
  return { views: inputViews(x), sheet: r.doc.pages[0]?.shapes ?? [], paper: paperSheets(r), title: r.title, caption: 'Prova · DIS. N° 26-037 · SHA-256 0123456789abcdef', date };
};

/** The value of a DXF header variable (the line after its group code). */
const headerValue = (dxf: string, name: string): string => {
  const lines = dxf.split('\n').map((s) => s.trim()), i = lines.indexOf(name);
  assert.ok(i >= 0, name);
  return lines[i + 2] ?? '';
};

/** A date as a DXF writes it (AutoCAD's: the Julian day number and the fraction of the day since midnight). */
const julian = (d: Date): number => d.getTime() / 86400000 + 2440588;

test('angoli in senso antiorario ($ANGDIR 0) e data del record, nel DXF e nel DWG', () => {
  const x = liftInput(newLift()), views = inputViews(x), dxf = toDxf(views, 'Prova', AT);
  assert.equal(headerValue(dxf, '$ANGDIR'), '0');
  // local (Italy: 12:00 on 8 October, summer time) and universal (10:00)
  assert.ok(Math.abs(Number(headerValue(dxf, '$TDCREATE')) - julian(new Date('2026-10-08T12:00:00Z'))) < 1e-7);
  assert.ok(Math.abs(Number(headerValue(dxf, '$TDUPDATE')) - julian(new Date('2026-10-08T12:00:00Z'))) < 1e-7);
  assert.ok(Math.abs(Number(headerValue(dxf, '$TDUCREATE')) - julian(AT)) < 1e-7);
  assert.ok(Math.abs(Number(headerValue(dxf, '$TDUUPDATE')) - julian(AT)) < 1e-7);
  // in winter Italy is an hour ahead
  const jan = new Date('2026-01-15T10:00:00Z');
  assert.ok(Math.abs(Number(headerValue(toDxf(views, 'Prova', jan), '$TDCREATE')) - julian(new Date('2026-01-15T11:00:00Z'))) < 1e-7);
  assert.equal(headerValue(planToDxf(layout(defaultInputs(1600, 1750)), 'Vano', AT), '$ANGDIR'), '0');
  assert.equal(headerValue(setToDxf(issued(x, AT)), '$ANGDIR'), '0');
  // the DWG read back
  for (const bytes of [toDwg(views, 'Prova', AT), setToDwg(issued(x, AT))]) {
    const h = acad.DwgReader.readFromStream(bytes.slice().buffer, null).header;
    assert.ok(h);
    assert.equal(h.angularDirection, acad.AngularDirection.CounterClockWise);
    // an AutoCAD 2000 DWG keeps the local dates (Italy's wall clock)
    assert.ok(Math.abs(h.createDateTime.getTime() - Date.parse('2026-10-08T12:00:00Z')) < 2);
    assert.ok(Math.abs(h.updateDateTime.getTime() - Date.parse('2026-10-08T12:00:00Z')) < 2);
    assert.match(h.fingerPrintGuid, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test('due scaricamenti dello stesso record: gli stessi byte (DXF e DWG, progetto e serie emessa); un altro record, un altro file', async () => {
  const x = liftInput(newLift()), views = inputViews(x), caption = ['Prova · progetto cm123 · 2026-10-08', 'BOZZA: i fogli e i valori citati sono quelli del PDF x.pdf'];
  const files = (): Uint8Array[] => [
    new TextEncoder().encode(toDxf(views, caption, AT)), toDwg(views, caption, AT),
    new TextEncoder().encode(setToDxf(issued(x, AT))), setToDwg(issued(x, AT)),
    new TextEncoder().encode(planToDxf(layout(defaultInputs(1600, 1750)), 'Vano', AT)),
  ];
  const first = files();
  // a later download: the clock moved on
  await new Promise((r) => setTimeout(r, 1100));
  const again = files();
  first.forEach((f, i) => assert.ok(Buffer.from(f).equals(Buffer.from(again[i] ?? new Uint8Array())), `file ${i}`));
  // another date (another record): other dates and GUIDs in the DWG
  const other = toDwg(views, caption, new Date('2026-10-09T10:00:00Z')), h = acad.DwgReader.readFromStream(other.slice().buffer, null).header;
  const h0 = acad.DwgReader.readFromStream((first[1] ?? new Uint8Array()).slice().buffer, null).header;
  assert.ok(h && h0 && h.fingerPrintGuid !== h0.fingerPrintGuid && h.versionGuid !== h0.versionGuid && h.fingerPrintGuid !== h.versionGuid);
});

test('le date del DXF e del DWG non dipendono dal fuso orario della macchina, anche nell’ora saltata dall’ora legale', () => {
  // the record's instant: an ordinary one; 02:30 UTC on the night Italy moves to summer time (a Rome host has no 02:30);
  // 02:30 in Italy on the night New York does (a New York host has none); a winter one
  const dates = ['2026-10-08T10:00:00Z', '2026-03-29T02:30:00Z', '2026-03-08T01:30:00Z', '2026-01-15T10:00:00Z'];
  const run = (tz: string): unknown => {
    const r = spawnSync(process.execPath, ['--import', 'tsx', path.join(process.cwd(), 'src/lib/__tests__/cad-tz-child.ts'), ...dates], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, `${tz}: ${r.stderr}`);
    return JSON.parse(r.stdout);
  };
  const utc = run('UTC');
  for (const tz of ['Europe/Rome', 'America/New_York', 'Asia/Kolkata']) assert.deepEqual(run(tz), utc, tz);
  // the dates themselves: Italy's wall clock (04:30 in summer time, 02:30 and 11:00 in winter) and the universal time
  assert.ok(Array.isArray(utc) && utc.length === dates.length);
  const rows = utc.map((r: unknown) => {
    assert.ok(r !== null && typeof r === 'object' && 'local' in r && 'universal' in r && typeof r.local === 'string' && typeof r.universal === 'string');
    return { local: r.local, universal: r.universal };
  });
  const rome = ['2026-10-08T12:00:00Z', '2026-03-29T04:30:00Z', '2026-03-08T02:30:00Z', '2026-01-15T11:00:00Z'];
  rows.forEach((r, i) => {
    assert.ok(Math.abs(Number(r.local) - julian(new Date(rome[i] ?? ''))) < 1e-7, `${dates[i]}: ${r.local}`);
    assert.ok(Math.abs(Number(r.universal) - julian(new Date(dates[i] ?? ''))) < 1e-7, `${dates[i]}: ${r.universal}`);
  });
});
