// The drawing set as a document: sheet 1's title block (R0, the last four revisions, the plant number to be assigned or
// given, the designer's stamp), the band over it (dimensions to check on site, the checks that do not pass, the records
// the set goes with), the names of the loads, the machine named by the catalogue, the smallest lettering of the drawings
// and its leaders, the hitches of a 2:1 roping tagged, the registry of what the set writes, and the CAD files of an
// issued set (its title block a block with attributes, concrete hatched) read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as acad from '@node-projects/acad-ts';
import { PRESETS } from '@/calc/presets';
import { DIMENSIONS_NOTE, TEXT, renderView, type Shape } from '@/drawing';
import { defaultInputs, layout, type ShaftInputs } from '@/shaft';
import { hitchTags } from '@/shaft/room-loads';
import { TAG_R, letteringBoxes, placeTags } from '@/shaft/tag-place';
import { inputViews } from '../cad/project';
import { readCad } from '../cad/read';
import { TITLE_BLOCK, inTitleBlock, mendAttributes, setToDwg, setToDxf, type IssuedSet } from '../cad/set-export';
import { VOCI_IMPIANTO } from '../lift/norme';
import { buildTavole } from '../tavole/build';
import { dataSheet } from '../tavole/data';
import { FAILED, TITLE_H } from '../tavole/datasheet';
import type { TavoleInput } from '../tavole/input';
import { emptyPlant, issueChecks } from '../tavole/issue-check';
import type { Plant } from '../plant';
import { GOVERNOR_LOAD_UNSET, loadNames } from '../tavole/loads';
import { machineConflict, machineName, machineText, modelCore } from '../tavole/machine-name';
import { MACHINES } from '../catalog/machines';
import { VOCI_TAVOLE } from '../tavole/norme-tavole';
import { FIRST_ISSUE, currentRevision, refBand, revisionRows, titleBlock, titleFields, titleFrame } from '../tavole/title-block';
import { DRAFT_NUMBER, plantMark, refsText, titleOf } from '../tavole/title-data';
import { analyse } from '../present/analysis';

const SHA_C = 'a3f1c2d4e5b6978812345678abcdef0011223344556677889900aabbccddeeff', SHA_D = '0f9e8d7c6b5a49382716abcdefabcdefabcdefabcdefabcdefabcdefabcdef01';
const day = (d: number): Date => new Date(Date.UTC(2026, 9, d, 10));

const input = (I: Partial<ShaftInputs> = {}, plant: TavoleInput['plant'] = { machine: 'M 73 (Sx)', governorLoad: 300, safetyGear: 'progressive' }): TavoleInput => ({
  values: PRESETS.C, layout: layout({ ...defaultInputs(1740, 1445), Q: 400, access: 'none', ...I }), plant,
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: null, client: 'Condominio' },
  company: { name: 'Ascensori di prova', logo: null },
  set: { number: '26-189', issuedAt: day(12), author: 'A.C.', revisions: [{ mark: 'R1', text: 'QUOTE DEL VANO DA RILIEVO', date: day(12) }], firstIssuedAt: day(8) },
  records: { calc: { id: 'calc1', sha256: SHA_C }, design: { id: 'design1', sha256: SHA_D } },
});
const texts = (shapes: readonly Shape[]): string[] => shapes.flatMap((s) => (s.t === 'text' ? [s.text] : []));

test('argano: il nome del catalogo, il testo dell’impianto per riferimento, la contraddizione ferma l’emissione', () => {
  const cat = { brand: 'SICOR', model: 'SH140' };
  assert.equal(machineName({ machine: 'M 73 (Sx)' }, cat), 'SICOR SH140');
  assert.equal(machineName({ machine: ' M 73 ' }, null), 'M 73');
  assert.equal(machineText({ machine: 'M 73 (Sx)' }, cat), 'SICOR SH140 (rif. impianto: M 73 (Sx))');
  assert.equal(machineText({ machine: 'sicor sh-140' }, cat), 'SICOR SH140');
  assert.equal(machineText({}, cat), 'SICOR SH140');
  assert.equal(machineConflict({ machine: 'M 73 (Sx)' }, cat), true);
  assert.equal(machineConflict({ machine: 'Sicor SH 140 Dx' }, cat), false);
  assert.equal(machineConflict({}, cat), false);
  assert.equal(machineConflict({ machine: 'M 73' }, null), false);
  const full: Plant = { control: 'APB', voltage: 400, lightVoltage: 230, frequency: 50, duty: 40, safetyGear: 'progressive', governorLoad: 300 };
  assert.deepEqual(issueChecks({ ...full, machine: 'M 73' }, cat, { plantNumber: null, client: ' ' }, true, { whole: false }),
    { machine: { named: 'M 73', catalog: 'SICOR SH140' }, plantNumber: true, client: true, empty: [] });
  assert.deepEqual(issueChecks(full, cat, { plantNumber: null, client: 'Condominio' }, false, { whole: false }), { machine: null, plantNumber: false, client: false, empty: [] });
});

test('emissione: i dati dell’impianto che il foglio 1 legge e nessuno ha inserito, nell’ordine del loro modulo', () => {
  const cat = { brand: 'SICOR', model: 'SH140' };
  // a whole design with nothing entered: everything its sheet 1 reads, the parts of the car mass of its loads too (a
  // dash each); the machine named by the catalogue
  const MASSES = ['massShell', 'massFloor', 'massDoors', 'massFrame'];
  const sheetLoads = (plant: Plant) => { const x = input({}, plant); return dataSheet(x, analyse(x.values), 12).sheet.loads; };
  assert.deepEqual(emptyPlant({}, cat, { whole: true, rails: true }), ['control', 'shaft', 'carFinish', 'safetyGear', 'liftUse', 'governorLoad', 'currentIn',
    'currentStart', 'voltage', 'lightVoltage', 'frequency', 'duty', ...MASSES]);
  // the lift's use only with the check of the rails; a machine off the catalogue: its name, in the optional ones before
  // the masses; under the pit: the counterweight's gear and what trips it (nothing trips a pillar)
  assert.equal(emptyPlant({}, cat, { whole: true, rails: false }).includes('liftUse'), false);
  assert.deepEqual(emptyPlant({}, null, { whole: true }).slice(-5), ['machine', ...MASSES]);
  // the loads of sheet 1 print a dash for each part not given: the very ones listed
  const loads = sheetLoads({ control: 'APB' }), dashed = loads.filter((r) => r[1] === '—').map((r) => r[0]);
  assert.deepEqual(dashed, ['CABINA', 'PAVIMENTO DEL CLIENTE (MAX)', 'OPERATORE E ANTINE', 'ARCATA']);
  const parts = { massShell: 250, massFloor: 60, massDoors: 90, massFrame: 200 };
  assert.equal(sheetLoads(parts).some((r) => r[1] === '—'), false);
  assert.equal(emptyPlant({ massShell: 0, massFloor: 60, massDoors: 90, massFrame: 200 }, cat, { whole: true }).some((k) => k.startsWith('mass')), false);
  assert.deepEqual(emptyPlant({}, cat, { whole: true, underPit: true }).filter((k) => k.startsWith('cw')), ['cwSafetyGear', 'cwGearTrip']);
  assert.deepEqual(emptyPlant({ cwSafetyGear: 'pillar' }, cat, { whole: true, underPit: true }).filter((k) => k.startsWith('cw')), []);
  // a replacement's sheet 1: no shaft, car finish, lift's use, currents or parts of the car mass
  assert.deepEqual(emptyPlant({}, cat, { whole: false, rails: true, underPit: true }), ['control', 'safetyGear', 'governorLoad', 'voltage', 'lightVoltage', 'frequency', 'duty']);
  // a blank text counts as not entered, every value entered leaves nothing
  assert.deepEqual(emptyPlant({ control: '  ', shaft: 'muratura', carFinish: 'inox', liftUse: 'passengers', currentIn: 12, currentStart: 40, voltage: 400,
    lightVoltage: 230, frequency: 50, duty: 40, safetyGear: 'progressive', governorLoad: 300, ...parts }, cat, { whole: true, rails: true }), ['control']);
});

test('argano: il modello del catalogo a parole intere — un modello che ne comincia un altro, un altro costruttore contraddicono', () => {
  const conflict = (own: string, brand: string, model: string): boolean => machineConflict({ machine: own }, { brand, model });
  // the name of another model of the catalogue that begins with the chosen one's
  assert.equal(conflict('SICOR SH130G', 'SICOR', 'SH130'), true);
  assert.equal(conflict('M73AL', 'Montanari', 'M73'), true);
  assert.equal(conflict('Montanari M73H', 'Montanari', 'M73'), true);
  assert.equal(conflict('MR21TS', 'SICOR', 'MR21'), true);
  assert.equal(conflict('HW134VF', 'GEM', 'HW134'), true);
  assert.equal(conflict('PENTA 830', 'Montanari', 'PENTA'), true);
  assert.equal(conflict('M73 H', 'Montanari', 'M73'), true);
  // «Sx» is the left hand of the M73, a word of its own: the M73, not the M73S
  assert.equal(conflict('M 73 (Sx)', 'Montanari', 'M73S'), true);
  assert.equal(conflict('M 73 (Sx)', 'Montanari', 'M73'), false);
  // the model without its sheave, its mounting, its note in brackets; a core over several words
  assert.equal(conflict('SICOR MR12', 'SICOR', 'MR12 (storico)'), false);
  assert.equal(conflict('HW134', 'GEM', 'HW134 Ø600'), false);
  assert.equal(conflict('GEM HW134VF', 'GEM', 'HW134VF con supporto'), false);
  assert.equal(conflict('GEM HW134L (Dx)', 'GEM', 'HW134L Ø600'), false);
  assert.equal(conflict('MR21 TS', 'SICOR', 'MR21TS'), false);
  assert.equal(conflict('Montanari Penta 830', 'Montanari', 'PENTA 830'), false);
  assert.deepEqual(['MR12 (storico)', 'HW134 Ø600', 'HW134VF con supporto', 'PENTA 830', 'HW135L-VF'].map(modelCore), ['MR12', 'HW134', 'HW134VF', 'PENTA830', 'HW135LVF']);
  // another maker's name
  assert.equal(conflict('Montanari SH140', 'SICOR', 'SH140'), true);
  // every machine of the catalogue, named as the catalogue names it, with its maker or without
  for (const m of MACHINES) for (const own of [m.model, `${m.brand} ${m.model}`]) assert.equal(machineConflict({ machine: own }, m), false, own);
});

test('cartiglio: R0 prima emissione, le ultime quattro revisioni, la revisione corrente, timbro e firma del progettista', () => {
  const revs = (n: number) => Array.from({ length: n }, (_, i) => ({ mark: `R${i + 1}`, text: `NOTA ${i + 1}`, date: `1${i}/10/2026` }));
  assert.deepEqual(revisionRows({ first: '08/10/2026', revisions: [] }), [{ mark: 'R0', text: FIRST_ISSUE, date: '08/10/2026' }]);
  assert.deepEqual(revisionRows({ first: '08/10/2026', revisions: revs(4) }).map((r) => r.mark), ['R1', 'R2', 'R3', 'R4']);
  assert.deepEqual(revisionRows({ first: null, revisions: [] }), []);
  assert.equal(currentRevision({ first: null, revisions: [] }), '');
  assert.equal(currentRevision({ first: '08/10/2026', revisions: [] }), 'R0 08/10/2026');
  assert.equal(currentRevision({ first: '08/10/2026', revisions: revs(2) }), 'R2 11/10/2026');
  const d = titleOf(input(), 10, false), yb = 59;
  const fields = new Map(titleFields(d, yb).map((f) => [f.tag, f.text]));
  assert.equal(fields.get('DIS_N'), '26-189');
  assert.equal(fields.get('REVISIONE'), 'R1 12/10/2026');
  assert.equal(fields.get('REV_1'), 'R0');
  assert.equal(fields.get('REV_1_DATA'), '08/10/2026');
  assert.equal(fields.get('MATRICOLA'), 'DA ASSEGNARE');
  assert.equal(fields.get('PAGINA'), 'PAGINA N° 1/10');
  assert.ok(texts(titleFrame(d, yb)).includes('TIMBRO E FIRMA DEL PROGETTISTA') && texts(titleFrame(d, yb)).includes('MATRICOLA N°'));
  // a draft has no R0 and leaves the revision to be written by hand
  const draft = titleOf({ ...input(), set: { ...input().set, number: DRAFT_NUMBER, revisions: [] } }, 10, false);
  assert.equal(draft.first, null);
  assert.ok(texts(titleBlock(draft, yb)).includes('R_  __/__/__'));
});

test('matricola da assegnare o da comunicare; elaborati collegati con il loro SHA-256', () => {
  assert.equal(plantMark(null, false), 'DA ASSEGNARE');
  assert.equal(plantMark('  ', true), 'DA COMUNICARE');
  assert.equal(plantMark('MI 1/98', true), 'MI 1/98');
  assert.equal(refsText(undefined), null);
  assert.equal(refsText({ calc: { id: 'calc1', sha256: SHA_C }, design: { id: 'design1', sha256: SHA_D } }),
    `ELABORATI COLLEGATI: relazione di calcolo del calcolo calc1 (SHA-256 ${SHA_C.slice(0, 16)}); progetto del vano design1 (SHA-256 ${SHA_D.slice(0, 16)})`);
  assert.match(refsText({ calc: { id: 'calc1', sha256: SHA_C }, room: { id: 'room1', sha256: SHA_D } }) ?? '', /rilievo del locale room1 \(SHA-256 0f9e8d7c6b5a4938\) e relazione di calcolo del calcolo calc1/);
});

test('foglio 1: quote da verificare, verifiche non superate, elaborati collegati, nomi dei carichi, cartiglio emesso', () => {
  const r = buildTavole(input()), t = texts(r.doc.pages[0]?.shapes ?? []);
  for (const x of [DIMENSIONS_NOTE, 'TIMBRO E FIRMA DEL PROGETTISTA', FIRST_ISSUE, 'R0', 'R1 12/10/2026', '26-189']) assert.ok(t.includes(x), x);
  assert.ok(t.some((x) => x.startsWith('ELABORATI COLLEGATI: relazione di calcolo del calcolo calc1')), 'elaborati');
  assert.ok(t.includes('DA ASSEGNARE') || t.includes('DA COMUNICARE'), 'matricola');
  loadNames(false).forEach((name, i) => assert.ok(t.includes(`P${i + 1} ${name}`), `P${i + 1} ${name}`));
  assert.equal(r.title.number, '26-189');
  assert.equal(currentRevision(r.title), 'R1 12/10/2026');
  // the failed checks counted over their table, on the last sheet of the set (checks-sheet.ts); sheet 1 says where it is
  const n = r.doc.pages.length, last = texts(r.doc.pages[n - 1]?.shapes ?? []), failed = last.filter((x) => x === FAILED).length;
  assert.ok(t.includes(failed ? `VERIFICHE NON SUPERATE: ${failed} — VEDI FOGLIO ${n}` : `VERIFICHE DEL PROGETTO: FOGLIO ${n}`), 'dove sono le verifiche');
  assert.ok(texts(refBand(100, 3, null, 12)).includes('VERIFICHE NON SUPERATE: 3 — VEDI FOGLIO 12'));
  assert.ok(texts(refBand(100, 3, null)).includes('VERIFICHE NON SUPERATE: 3 — VEDI TABELLA'));
  assert.ok(!texts(refBand(100, 0, null)).some((x) => x.startsWith('VERIFICHE')));
  // the governor's load not known: its maker gives it
  const none = texts(buildTavole(input({}, { machine: 'M 73 (Sx)', safetyGear: 'progressive' })).doc.pages[0]?.shapes ?? []);
  assert.ok(none.includes(GOVERNOR_LOAD_UNSET));
  // every drawing sheet lettered at 2 mm at least (the labels of the strip; names and codes at TEXT.min)
  for (const [n, p] of r.doc.pages.entries()) {
    if (n === 0) continue;
    for (const s of p.shapes) if (s.t === 'text') assert.ok(s.size >= 2 - 1e-9, `foglio ${n + 1}: «${s.text}» a ${s.size}`);
  }
});

test('scritte dei disegni: mai sotto il corpo minimo; un nome che non ci sta esce con una linea di richiamo', () => {
  const place = { scale: 50, ox: 0, oy: 0 };
  const small = renderView([{ e: 'text', at: [0, 0], text: 'ARGANO', size: 1.2 }], place).shapes.filter((s) => s.t === 'text');
  assert.equal(small[0]?.t === 'text' ? small[0].size : 0, TEXT.min);
  // 200 mm of the room are 4 mm of paper at 1:50: the name keeps its size and goes out on a leader with a dot
  const out = renderView([{ e: 'text', at: [0, 0], text: 'INTERRUTTORE GENERALE', fit: 200, out: [2000, 1000] }], place).shapes;
  const name = out.find((s) => s.t === 'text');
  assert.ok(name?.t === 'text' && name.size >= TEXT.min && name.at[0] > 30, 'il nome fuori');
  assert.ok(out.some((s) => s.t === 'line') && out.some((s) => s.t === 'circle'), 'linea di richiamo e punto');
  // a name that fits stays where it is
  const fits = renderView([{ e: 'text', at: [0, 0], text: 'P1', fit: 2000, out: [2000, 1000] }], place).shapes;
  assert.equal(fits.length, 1);
  // the references of the loads in their circles at the smallest lettering
  const tag = renderView([{ e: 'tag', at: [0, 0], text: 'P6' }], place).shapes.find((s) => s.t === 'text');
  assert.equal(tag?.t === 'text' ? tag.size : 0, TEXT.min);
});

test('fossa: i riferimenti dei carichi mai uno sull’altro — contrappeso di lato fuori asse, due accessi adiacenti', () => {
  // their circles (2,4 mm) 2r + 0,5 mm apart on the sheet at least, as the plan is drawn
  for (const I of [{ cw: 'right', plan: { cwPos: 700 } }, { cw: 'left', plan: { cwPos: 300 } }, { entrances: 'adjacent', side2: 'right' }, { entrances: 'adjacent', side2: 'left' }] as Partial<ShaftInputs>[]) {
    const r = buildTavole(input(I)), pit = r.doc.pages[r.sheets.findIndex((s) => s.title.endsWith('E IN FOSSA'))]?.shapes ?? [], tag = JSON.stringify(I);
    const at = pit.flatMap((s) => (s.t === 'text' && /^P[5-8]$/.test(s.text) ? [{ text: s.text, at: s.at }] : []));
    assert.ok(['P5', 'P6', 'P7', 'P8'].every((p) => at.some((t) => t.text === p)), `${tag}: ${at.map((t) => t.text).join(' ')}`);
    for (const [i, a] of at.entries()) for (const b of at.slice(i + 1)) {
      const d = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
      assert.ok(d >= 2 * 2.4 + 0.5 - 1e-9, `${tag}: ${a.text}–${b.text} a ${d.toFixed(2)} mm`);
    }
  }
});

test('riferimenti: il primo posto libero intorno a ciò che indicano, lontano dagli altri, dalle scritte, dentro il vano', () => {
  const room = { x0: 0, y0: 0, x1: 2000, y1: 2000 };
  // where it goes as a rule when free; else turned round what it names, off the one placed first
  const [a, b] = placeTags([{ text: 'P7', to: [1000, 1000], at: [1200, 1000] }, { text: 'P6', to: [1000, 1040], at: [1200, 1050], rank: 1 }], room, []);
  assert.ok(a.e === 'tag' && b.e === 'tag');
  assert.deepEqual(a.at, [1200, 1000]);
  assert.ok(Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) >= 2 * TAG_R + 0.5 * 25, `${b.at}`);
  // off a lettering in the way, inside the room
  const [c] = placeTags([{ text: 'P8', to: [100, 100], at: [100, 300] }], room, [], letteringBoxes([{ e: 'text', at: [100, 300], text: 'CONTRAPPESO', align: 'c' }]));
  assert.ok(c.e === 'tag' && (c.at[0] !== 100 || c.at[1] !== 300) && c.at[0] >= 0 && c.at[1] >= 0, `${c.e === 'tag' ? c.at : ''}`);
  // a load shared by several points: one reference, a leader to each
  const shapes = renderView([{ e: 'tag', at: [0, 0], text: 'P1', to: [1000, 0], also: [[0, 1000]] }], { scale: 50, ox: 0, oy: 0 }).shapes;
  assert.equal(shapes.filter((s) => s.t === 'line').length, 2);
});

test('2:1: P2 e P3 sugli attacchi delle funi, oltre l’attacco e fuori dalla linea delle calate', () => {
  const tags = hitchTags({ deadEnds: [{ at: [0, 0], dir: [0, 1] }, { at: [600, 0], dir: [0, 1] }], ux: 1, uy: 0 });
  assert.deepEqual(tags.map((t) => (t.e === 'tag' ? [t.text, t.at, t.to] : null)), [['P2', [-130, -180], [0, 0]], ['P3', [730, -180], [600, 0]]]);
  assert.deepEqual(hitchTags({ deadEnds: [], ux: 1, uy: 0 }), []);
});

test('registro di quello che le tavole scrivono: le costanti del foglio', () => {
  const ids = new Set(VOCI_IMPIANTO.map((v) => v.id)), text = (id: string): string => VOCI_TAVOLE.find((v) => v.id === id)?.valore ?? '';
  for (const v of VOCI_TAVOLE) assert.ok(ids.has(v.id), v.id);
  assert.ok(text('tavole.caratteri').includes(`${String(TEXT.min).replace('.', ',')} mm`));
  assert.ok(text('tavole.matricola').includes(plantMark(null, false)) && text('tavole.matricola').includes(plantMark(null, true)));
  assert.ok(text('tavole.revisioni').includes(FIRST_ISSUE) && text('tavole.revisioni').includes('ultime 4'));
  assert.ok(text('tavole.limitatore').includes(GOVERNOR_LOAD_UNSET));
  assert.ok(text('tavole.elaborati').includes(DIMENSIONS_NOTE));
  assert.ok(text('tavole.cad').includes(TITLE_BLOCK) && text('tavole.argano').includes('(rif. impianto: …)') && text('tavole.argano').includes('parole intere'));
  assert.ok(text('tavole.carichi').includes('2r + 0,5 mm') && TAG_R === 2.4 * 25);
});

test('serie emessa in DXF e DWG: cartiglio come blocco con attributi, calcestruzzo campito, la stessa geometria', () => {
  const x = input(), r = buildTavole(x);
  const set: IssuedSet = { views: inputViews(x), sheet: r.doc.pages[0]?.shapes ?? [], title: r.title, caption: 'Impianto di prova · DIS. N° 26-189 R1 12/10/2026' };
  // the title block leaves sheet 1 for the block; the band over it stays on the sheet
  const yb = 7 + TITLE_H;
  assert.ok(titleBlock(r.title, yb).every(inTitleBlock));
  assert.ok(!refBand(yb + 1.6 + 7.4, 0, 'X').some(inTitleBlock));
  const dxf = setToDxf(set), dwg = setToDwg(set), n = titleFields({ ...r.title, logo: false, clientLogo: false }, yb).length;
  const count = (re: RegExp): number => (dxf.match(re) ?? []).length;
  assert.equal(count(/\nAcDbAttributeDefinition\n/g), n);
  assert.equal(count(/\nAcDbAttribute\n/g), n);
  assert.equal(count(/\n {2}0\nSEQEND\n/g), 1);
  assert.ok(count(/\n {2}2\nANSI31\n/g) > 0 && count(/\n 53\n45\n/g) > 0, 'ANSI31 a 45° (gradi nel DXF)');
  assert.ok(dxf.includes(set.caption), 'il numero e la revisione della serie sotto la prima vista');
  // the DWG read back: the insert of the title block with the set's words as its attributes
  const doc = acad.DwgReader.readFromStream(new Uint8Array(dwg).slice().buffer, null);
  const ins = [...(doc.modelSpace?.entities ?? [])].find((e): e is acad.Insert => e instanceof acad.Insert);
  const att = new Map([...(ins?.attributes ?? [])].map((a) => [a.tag, a.value]));
  assert.equal(ins?.block?.name, TITLE_BLOCK);
  assert.equal(att.get('DIS_N'), '26-189');
  assert.equal(att.get('REVISIONE'), 'R1 12/10/2026');
  assert.equal(att.get('REV_1'), 'R0');
  assert.equal(att.get('AZIENDA'), 'Ascensori di prova');
  // the same lines from both files, the title block's among them
  const a = readCad(new TextEncoder().encode(dxf), 'serie.dxf'), b = readCad(dwg, 'serie.dwg');
  assert.equal(a.count, b.count);
  assert.deepEqual(a.bounds, b.bounds);
});

test('DXF: gli attributi riscritti con la propria sottoclasse, la fine della sequenza una volta', () => {
  const rec = (type: string, h: string, extra: string[]): string[] => ['  0', type, '  5', h, '100', 'AcDbEntity', '100', 'AcDbText', '  1', 'X', ...extra];
  const raw = [...rec('ATTRIB', '2F', ['100', 'AcDbText', ' 73', '0']), '  0', 'SEQEND', '  5', '30', '  0', 'SEQEND', '  5', '30', '  8', '0', '  0', 'EOF', ''].join('\n');
  const out = mendAttributes(raw, new Map([['2F', { tag: 'DIS_N' }]]));
  assert.equal(out, [...rec('ATTRIB', '2F', ['100', 'AcDbAttribute', '  2', 'DIS_N', ' 70', '0', ' 73', '0', ' 74', '0']), '  0', 'SEQEND', '  5', '30', '  8', '0', '  0', 'EOF', ''].join('\n'));
  // an attribute whose handle is not listed, and plain texts, stay as they are
  assert.equal(mendAttributes(raw.replace('SEQEND\n  5\n30\n  0\n', ''), new Map()), raw.replace('SEQEND\n  5\n30\n  0\n', ''));
});
