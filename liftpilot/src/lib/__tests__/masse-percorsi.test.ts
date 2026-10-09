// Round 36 (review of A): the same catalogue's machine weighs the same on every path (registry impianto.massa.argano,
// src/lib/lift/known.ts) — proposed from the catalogue, entered by hand in a whole design (a calculator's values carried
// with "Passa a progetto completo": machine entered, its model named), in the replacement. The derivation, sheet 1, the
// relazione's loads and its mass note count the whole machine; the relazione tecnica of the replacement says the same
// under its table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { SHAFT_ENGINE_VERSION } from '@/shaft';
import { roomGeo } from '@/shaft/machine-room';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { valuesAdvice } from '@/lib/lift/advice';
import { collaudoOf } from '@/lib/lift/collaudo';
import { massModelOf } from '@/lib/lift/known';
import { machineMass } from '@/lib/lift/machine-mass';
import { valueMarks } from '@/lib/lift/marks';
import { carriedMass, hebOf, supportLoad } from '@/lib/lift/support';
import { rigLength } from '@/lib/lift/rope';
import { analyse } from '@/lib/present/analysis';
import { makeFmt } from '@/lib/present/tr';
import { buildReport } from '../report/build';
import type { ReportDoc } from '../report/model';
import { buildTecnica } from '../report/tecnica';
import { slabChange } from '../report/tecnica-site';
import { deriveRoom } from '../room/derive';
import { startSurvey } from '../room/survey';
import { storedInput } from '../tavole/compose';
import { dataSheet } from '../tavole/data';
import { surveyLoad } from '../tavole/survey-data';

const fmt = makeFmt('it-IT'), M93 = { brand: 'Montanari', model: 'M93' };
const texts = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows.flat() : b.t === 'grid' ? [...b.head, ...b.rows.flat()]
  : b.t === 'list' ? b.items : 'text' in b && typeof b.text === 'string' ? [b.text] : []));

/** The example's design with HEB beams on the shaft's walls and the Montanari M93 the proposal takes; then the same
 *  values carried as a calculator's: the machine entered, named in n_model. */
function carried(): { inp: LiftInputs; d: ReturnType<typeof deriveLift> } {
  const L = newLift(), R = L.shaft.room;
  assert.ok(R);
  const base: LiftInputs = { ...L, shaft: { ...L.shaft, room: { ...R, heb: {} } } };
  const proposed = deriveLift({ ...base, catalog: { brand: 'Montanari', model: 'M93' } });
  assert.equal(proposed.values.n_model, 'Montanari M93');
  const inp: LiftInputs = { ...base, calc: { ...base.calc, ...proposed.values }, auto: { ...base.auto, machine: false } };
  return { inp, d: deriveLift(inp) };
}

test('argano di catalogo inserito a mano in un progetto completo: la derivazione conta l’argano completo sulle putrelle HEB', () => {
  const { d } = carried(), { I, N } = d.analysis.ctx;
  assert.equal(d.origin.machine, 'entered');
  assert.deepEqual(d.issues, []);
  // recognised by its values and its name: the Montanari's mass is the gearbox alone, the whole machine estimated
  const known = massModelOf(I, N, d.values, null);
  assert.deepEqual(known && { brand: known.brand, model: known.model }, M93);
  const whole = machineMass(N, M93);
  assert.ok(whole.estimate && whole.kg > N.mass, `${whole.kg} > ${N.mass}`);
  // the HEB beams on the shaft's walls are checked with the whole machine on them, not with the catalogue's mass (the
  // ropes at their cut length on the rig, as the derivation counts them; round 37: the M93 drawn as it stands)
  const G = roomGeo(d.layout, d.machine), rope = rigLength({ layout: d.layout, analysis: d.analysis, machine: d.machine, bottom: d.bottom });
  const at = (made: typeof M93 | null) =>
    hebOf(d.layout, d.machine, supportLoad(d.analysis.ctx, d.analysis.res.Mcw, { machine: carriedMass(G, d.machine, N, made), rope }))?.chosen.result?.sigma;
  const sigma = d.heb?.chosen.result?.sigma;
  assert.ok(sigma !== undefined && at(M93) !== undefined);
  assert.equal(sigma, at(M93));
  assert.ok(sigma > (at(null) ?? Infinity), 'più della sola massa del riduttore');
});

test('argano di catalogo inserito a mano: foglio 1, «Guide e carichi» e la nota della relazione con la stessa massa intera', () => {
  const { inp, d } = carried(), V = d.values, { N } = d.analysis.ctx, whole = machineMass(N, M93);
  const marks = valueMarks(inp.auto, d, d.bottom, d.collaudo);
  // round 37: no machine proposed, the model recognised by its values — and drawn and weighed as it stands
  assert.equal(marks.machineProposed, false);
  assert.deepEqual(marks.catalog && { brand: marks.catalog.brand, model: marks.catalog.model }, M93);
  const project = { name: 'Condominio Roma', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB-0001', client: 'Condominio Roma' };
  const x = storedInput(V, d.layout, { number: '26-036', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'Elevatori di prova', projectData: project, plant: {}, revisions: [] }, null, marks);
  assert.ok(x);
  const sheet = dataSheet(x, analyse(V), 10).sheet;
  assert.deepEqual(sheet.loads.find(([k]) => k.startsWith('ARGANO')), ['ARGANO (STIMA)', fmt(whole.kg, 0), 'kg']);
  const doc = buildReport({
    calc: { id: 'cmtest0036', label: null, createdAt: new Date('2026-10-08T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project: { ...project }, company: 'Elevatori di prova', values: V, generatedAt: new Date('2026-10-08T09:00:00Z'), reviews: [], marks, plant: {},
    design: { id: 'cmdesign36', label: null, createdAt: new Date('2026-10-08T07:00:00Z'), sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION, profileId: 'IT-2026.1', author: null, source: null, layout: d.layout },
  });
  const kv = doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])), grid = doc.blocks.flatMap((b) => (b.t === 'grid' ? b.rows : []));
  assert.deepEqual(kv.find(([k]) => k?.startsWith('Argano (argano completo')), ['Argano (argano completo, stima ⚠)', `${fmt(whole.kg, 0)} kg`]);
  // P9 of the relazione is sheet 1's
  assert.equal(grid.find((r) => r[0] === 'P9')?.[1], sheet.P[8]);
  assert.ok(texts(doc).some((t) => t.includes(`argano completo, ${fmt(whole.kg, 0)} kg`)), 'la nota della massa');
  assert.ok(texts(doc).some((t) => t.startsWith('Montanari M93 (inserito a mano con il modello del catalogo')), 'il modello riconosciuto');
});

test('relazione tecnica della sostituzione: la massa del nuovo argano sotto la tabella è quella della tabella', () => {
  // (round 37: the machine with what carries it, as the table «Carichi e appoggi» and P9 count it, and the change of P9)
  // a Montanari taken from the advice into the calculator, compared with the existing machine (600 kg entered)
  const V0 = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 };
  const c = valuesAdvice(V0).candidates.find((m) => m.brand === 'Montanari' && m.massEstimated);
  assert.ok(c, 'un Montanari con la massa del solo riduttore');
  const V = { ...V0, ...c.values, compare: true }, survey = startSurvey(780), d = deriveRoom(V, survey), { N, O } = d.analysis.ctx;
  assert.equal(d.made?.model, c.model);
  const whole = surveyLoad(d, {}).whole;
  assert.ok(whole.estimate && whole.kg > N.mass);
  const doc = buildTecnica({
    room: { id: 'cmroom36', label: null, createdAt: new Date('2026-10-08T08:00:00Z'), sha256: 'd'.repeat(64), engineVersion: '1.0.0', author: null },
    calc: { id: 'cmcalc36', label: null, createdAt: new Date('2026-10-08T07:00:00Z'), sha256: 'c'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1' },
    project: { name: 'Condominio Roma', address: null, city: null, province: null, plantNumber: null, client: null }, company: 'Elevatori di prova',
    values: V, survey, derived: d, collaudo: collaudoOf(V), plant: {}, sets: [], generatedAt: new Date('2026-10-08T09:00:00Z'),
  });
  const all = texts(doc), table = doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])).find(([k]) => k?.startsWith('Argano (stima)'));
  assert.deepEqual(table, ['Argano (stima)', `${fmt(whole.kg, 0)} kg`]);
  const line = all.find((t) => t.startsWith('Massa dell’argano'));
  assert.ok(line, 'la riga della massa');
  const { machine, grow } = slabChange(d, {}), mass = doc.blocks.flatMap((b) => (b.t === 'grid' ? b.rows : [])).find((r) => r[0]?.startsWith('Massa dell’argano (con'));
  assert.ok(grow !== null && machine > whole.kg);
  assert.equal(mass?.[2], `${fmt(machine, 0)} kg`, 'la tabella «Carichi e appoggi»');
  assert.ok(line.includes(`esistente ${fmt(O.mass, 0)} kg, nuovo ${fmt(machine, 0)} kg (argano completo ${fmt(whole.kg, 0)} kg`), line);
  assert.ok(line.includes(`P9 ${grow > 0.5 ? '+' : '−'}${fmt(Math.round(Math.abs(grow)), 0)} daN`), line);
  assert.ok(line.includes(`stima ⚠: ${fmt(N.mass, 0)} kg dal catalogo`), line);
});
