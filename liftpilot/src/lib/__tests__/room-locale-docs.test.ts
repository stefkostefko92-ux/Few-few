// The machine room in the documents (round 36): sheet 1 with the hook's rated load, the reactions R1…Rn, the line on P4
// when its load is not given and the note on the HEB beams' bearings, the title block no smaller than before; the room's
// plan with the legend of its symbols at its scale; the note on the room with the sockets; a replacement's survey with
// the existing governor, openings and support — in its checks, on its sheet 1 and in its relazione tecnica (the drops'
// wording with a direct drive, the existing machine's loads and UNI 10411-1 point 5, the openings with their place, the
// hook and the masses lifted).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { FRAME } from '@/drawing';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { valueMarks } from '@/lib/lift/marks';
import { buildTavole } from '@/lib/tavole/build';
import { storedInput } from '@/lib/tavole/compose';
import { roomNote } from '@/lib/tavole/notes';
import { hebNote } from '@/lib/tavole/room-rows';
import { KV_VERT } from '@/shaft/norme-vert';
import { ROOM_LEGEND } from '@/lib/tavole/room-legend';
import { fallSlants, slantText, surveySheetData } from '@/lib/tavole/survey-data';
import { roomRows } from '@/lib/report/tecnica-room';
import type { SurveyTavoleInput } from '@/lib/tavole/survey-input';
import { buildTecnica } from '@/lib/report/tecnica';
import { designRoomBlocks } from '@/lib/report/tecnica-site';
import { supportLoad } from '@/lib/lift/support';
import { roomGeo } from '@/shaft/machine-room';
import { deriveRoom } from '../room/derive';
import { startSurvey, surveySchema, type Survey } from '../room/survey';

type Room = NonNullable<LiftInputs['shaft']['room']>;
const base = newLift(), room = base.shaft.room as Room;
const sheets = (inp: LiftInputs) => {
  const d = deriveLift(inp), marks = valueMarks(inp.auto, d, d.bottom, d.collaudo), project = { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: '', client: '' };
  const x = storedInput(d.values, d.layout, { number: '26-001', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S', projectData: project, plant: {}, revisions: [] }, null, marks);
  assert.ok(x);
  return buildTavole(x);
};
const pageTexts = (r: ReturnType<typeof sheets>, i: number): string[] => r.doc.pages[i]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? [];

test('foglio 1: gancio, reazioni R1…Rn, P4 non indicato; nota sulle HEB; cartiglio non più piccolo', () => {
  for (const [name, inp, heb] of [['tipico', base, false], ['HEB', { ...base, shaft: { ...base.shaft, room: { ...room, heb: {} } } }, true]] as const) {
    const r = sheets(inp), t = pageTexts(r, 0);
    assert.ok(t.includes('GANCIO DI SOLLEVAMENTO SOPRA L’ARGANO: PORTATA'), `${name}: gancio`);
    assert.ok(t.some((x) => x.startsWith('REAZIONI APPOGGI R1')), `${name}: reazioni`);
    assert.ok(t.some((x) => x.startsWith('P4 NON INDICATO')), `${name}: P4`);
    assert.equal(t.includes('PUTRELLE HEB SOPRA IL VANO'), heb, `${name}: nota HEB`);
    const c = r.doc.pages[0]?.shapes.find((s) => s.t === 'text' && s.text === 'COMMITTENTE :');
    assert.ok(c && c.t === 'text' && c.at[1] - 3 + 9 - FRAME.y0 >= 50.1 - 1e-6, `${name}: cartiglio`);
  }
});

test('pianta del locale: la legenda dei simboli alla scala di prima', () => {
  const r = sheets(base), t = pageTexts(r, 7);
  for (const it of ROOM_LEGEND) assert.ok(t.includes(it.text), it.text);
  assert.equal(r.sheets[7]?.scale, 25);
});

test('nota del locale: una presa 2P+PE per area di lavoro e il comando della luce a ogni accesso', () => {
  for (const kind of ['machine', 'pulleys', 'existing'] as const) assert.ok(roomNote(kind).text.includes('presa 2P+PE'), kind);
});

const DIRECT: FormValues = { ...PRESETS.C };
const surveyed = (extra: Partial<Survey> = {}): Survey => ({ ...startSurvey(600), ...extra });
const tavole = (s: Survey): SurveyTavoleInput => ({
  values: DIRECT, survey: s, collaudo: { norma: '10411-1', parti: ['machine'] }, plant: {},
  project: { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: null, client: null },
  company: { name: 'S', logo: null }, set: { number: '26-001', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'M.R.', revisions: [] },
});

test('rilievo: limitatore, aperture e basamento esistenti nelle verifiche', () => {
  const s0 = surveyed();
  assert.ok(surveySchema.safeParse({ ...s0, governor: { x: 600, y: 600, W: 400, D: 300, ropes: true }, openings: [{ x: 800, y: 900, W: 200, D: 150 }], existingSupport: { kind: 'beams', keep: false } }).success);
  assert.ok(!surveySchema.safeParse({ ...s0, governor: { x: 600, y: 600, W: 50, D: 300, ropes: true } }).success, 'limitatore troppo piccolo');
  assert.ok(!surveySchema.safeParse({ ...s0, existingSupport: { kind: 'wood', keep: false } }).success, 'basamento sconosciuto');
  const plain = deriveRoom(DIRECT, s0), ids = (d: typeof plain) => d.checks.map((c) => c.id);
  assert.ok(!ids(plain).includes('m_gov') && !ids(plain).includes('m_holes'));
  const d = deriveRoom(DIRECT, surveyed({ governor: { x: 2400, y: 2400, W: 400, D: 300, ropes: false }, openings: [{ x: 300, y: 300, W: 200, D: 150 }] }));
  assert.ok(ids(d).includes('m_gov') && ids(d).includes('m_govfree') && ids(d).includes('m_holes'));
  // an opening right under the support: its bearings on it
  const G = plain.G;
  assert.ok(G);
  const under = deriveRoom(DIRECT, surveyed({ openings: [{ x: Math.round(G.carDrop[0]), y: Math.round(G.carDrop[1]), W: 3000, D: 3000 }] }));
  assert.equal(under.checks.find((c) => c.id === 'm_holes')?.status, 'warn');
  // the existing machine among the pieces the hook lifts
  assert.deepEqual(d.site.pieces, d.analysis.ctx.compare && d.analysis.ctx.O.mass > 0 ? [d.analysis.ctx.O.mass] : []);
});

test('foglio 1 della sostituzione: calate col tiro diretto, rilievo in sito, gancio, reazioni; il quadro senza limitatore rilevato', () => {
  const s = surveyed(), d = deriveRoom(DIRECT, s), sh = surveySheetData(tavole(s), d, 3);
  const room = sh.room.map(([l]) => l);
  assert.ok(room.includes('NUOVA PULEGGIA Ø - FUNI INCLINATE PER LATO') && room.some((l) => l.startsWith('CALATE ESISTENTI')), 'calate');
  assert.ok(room.includes('RILIEVO: LIMITATORE - FORI - BASAMENTO ESISTENTE'));
  const loads = sh.loads.map(([l]) => l);
  assert.ok(loads.includes('GANCIO DI SOLLEVAMENTO SOPRA L’ARGANO: PORTATA') && loads.some((l) => l.startsWith('REAZIONI APPOGGI R1')));
  assert.ok(sh.checks.some(([l]) => l.endsWith('(limitatore non rilevato)')), 'm_quadro');
  const withGov = surveySheetData(tavole({ ...s, governor: { x: 2400, y: 2400, W: 400, D: 300, ropes: false } }), deriveRoom(DIRECT, { ...s, governor: { x: 2400, y: 2400, W: 400, D: 300, ropes: false } }), 3);
  assert.ok(!withGov.checks.some(([l]) => l.endsWith('(limitatore non rilevato)')));
});

test('relazione tecnica della sostituzione: punto 5 della UNI 10411-1, fori con il centro, gancio e masse, P4', () => {
  const s = surveyed({ existingSupport: { kind: 'beams', keep: false } }), d = deriveRoom(DIRECT, s);
  const doc = buildTecnica({
    room: { id: 'r', label: null, createdAt: new Date('2026-10-08T10:00:00Z'), sha256: '0'.repeat(64), engineVersion: 'x', author: null },
    calc: { id: 'c', label: null, createdAt: new Date('2026-10-08T10:00:00Z'), sha256: '0'.repeat(64), engineVersion: 'x', profileId: 'it' },
    project: { name: 'R', address: null, city: null, province: null, plantNumber: null, client: null }, company: 'S',
    values: DIRECT, survey: s, derived: d, collaudo: { norma: '10411-1', parti: ['machine'] }, plant: {}, sets: [], generatedAt: new Date('2026-10-08T10:00:00Z'),
  });
  const all = JSON.stringify(doc.blocks);
  assert.ok(all.includes('UNI 10411-1:2024, punto 5') && all.includes('da confermare dal tecnico'), 'punto 5');
  assert.ok(all.includes('Centro x') && all.includes('Centro y'), 'fori con il centro');
  assert.ok(all.includes('Gancio di sollevamento sopra il baricentro'), 'gancio');
  assert.ok(all.includes('Carico P4 non indicato'), 'P4');
  assert.ok(all.includes('Inclinazione delle funi della nuova puleggia'), 'calate');
  assert.ok(all.includes('Antivibranti e fissaggi'), 'antivibranti');
});

test('relazione del progetto: aperture con il centro, gancio, reazioni e antivibranti', () => {
  const d = deriveLift(base), L = d.layout, G = roomGeo(L, d.machine);
  assert.ok(G);
  const { ctx, res } = d.analysis, blocks = designRoomBlocks(L, d.machine, supportLoad(ctx, res.Mcw), (x, dp = 0) => x.toFixed(dp));
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('Centro dal muro sinistro del vano') && all.includes('R1 ') && all.includes('antivibranti'));
});

test('tiro diretto con la puleggia allineata alla calata della cabina: il ramo della cabina verticale, tutta l’inclinazione al contrappeso', () => {
  // round 36 review: dropAlign 'car' (calc/geometry.ts wrapAngles: dc = 0, dw = 2·half) — not half per side
  const s = surveyed(), centred = deriveRoom(DIRECT, s), car = deriveRoom({ ...DIRECT, dropAlign: 'car' }, s);
  const spread = centred.calata.measured - 2 * centred.M.ropeIn - centred.M.D;
  assert.ok(spread > 1, 'calate più larghe della nuova puleggia');
  assert.deepEqual(fallSlants(centred), { car: spread / 2, cw: spread / 2, aligned: false });
  assert.deepEqual(fallSlants(car), { car: 0, cw: spread, aligned: true });
  const row = (d: typeof car): string[] => surveySheetData(tavole(s), d, 3).room.find(([l]) => l.startsWith('NUOVA PULEGGIA'))?.map(String) ?? [];
  assert.equal(row(centred)[0], 'NUOVA PULEGGIA Ø - FUNI INCLINATE PER LATO');
  assert.ok(row(centred)[2]?.endsWith(` - ${slantText(spread / 2)}`), row(centred).join(' | '));
  assert.equal(row(car)[0], 'NUOVA PULEGGIA Ø - FUNI INCLINATE CABINA / CONTRAPPESO');
  assert.ok(row(car)[2]?.endsWith(` - 0 / ${slantText(spread)}`), row(car).join(' | '));
  const text = (d: typeof car): string => roomRows(s, d, (x, dp = 0) => x.toFixed(dp)).find(([k]) => k === 'Inclinazione delle funi della nuova puleggia')?.[1] ?? '';
  assert.ok(text(centred).includes(`ogni ramo inclinato di ${slantText(spread / 2)} mm per lato`), text(centred));
  assert.ok(text(car).includes('il ramo lato cabina scende verticale') && text(car).includes(`contrappeso inclinato di ${slantText(spread)} mm`), text(car));
});

test('pianta del locale piena fino al bordo: la legenda accanto al titolo, più piccola — i simboli mai senza spiegazione', () => {
  // round 36 review: a room 300 mm deeper fills the plan's area; the legend went missing while the symbols were drawn
  const deep = { ...base, shaft: { ...base.shaft, room: { ...room, D: room.D + 300 } } }, r = sheets(deep), t = pageTexts(r, 7);
  assert.ok(t.some((x) => x.startsWith('Punto luce')) && t.some((x) => x.startsWith('Presa 2P+PE')), 'legenda');
  const legend = r.doc.pages[7]?.shapes.filter((s) => s.t === 'text' && s.text.startsWith('Punto luce')) ?? [];
  // beside the title, between the strip and the drawing area
  assert.ok(legend.every((s) => s.t === 'text' && s.at[1] < FRAME.y0 + 30), 'accanto al titolo');
});

test('nota delle putrelle HEB: le piastre come le disegnano la pianta e il 3D (lunghe quanto l’appoggio)', () => {
  // round 36 review: the note wrote 250 × 250 × 15 while the plan, the 3D and the registry have 200 × 250 × 15
  assert.ok(hebNote('').text.includes(`piastre ${KV_VERT.hebBearing} × ${KV_VERT.hebPlateW} × ${KV_VERT.hebPlateT} mm`), hebNote('').text);
});
