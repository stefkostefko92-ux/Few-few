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
import { inputViews } from '../cad/project';
import { readCad } from '../cad/read';
import { TITLE_BLOCK, inTitleBlock, mendAttributes, setToDwg, setToDxf, type IssuedSet } from '../cad/set-export';
import { VOCI_IMPIANTO } from '../lift/norme';
import { buildTavole } from '../tavole/build';
import { FAILED, TITLE_H } from '../tavole/datasheet';
import type { TavoleInput } from '../tavole/input';
import { issueChecks } from '../tavole/issue-check';
import { GOVERNOR_LOAD_UNSET, loadNames } from '../tavole/loads';
import { machineConflict, machineName, machineText } from '../tavole/machine-name';
import { VOCI_TAVOLE } from '../tavole/norme-tavole';
import { FIRST_ISSUE, currentRevision, refBand, revisionRows, titleBlock, titleFields, titleFrame } from '../tavole/title-block';
import { DRAFT_NUMBER, plantMark, refsText, titleOf } from '../tavole/title-data';

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
  assert.deepEqual(issueChecks({ machine: 'M 73' }, cat, { plantNumber: null, client: ' ' }, true), { machine: { named: 'M 73', catalog: 'SICOR SH140' }, plantNumber: true, client: true });
  assert.deepEqual(issueChecks({}, cat, { plantNumber: null, client: 'Condominio' }, false), { machine: null, plantNumber: false, client: false });
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
  // the failed checks counted over the table of sheet 1
  const failed = t.filter((x) => x === FAILED).length, band = t.find((x) => x.startsWith('VERIFICHE NON SUPERATE'));
  assert.equal(band, failed ? `VERIFICHE NON SUPERATE: ${failed} — VEDI TABELLA` : undefined);
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
  assert.ok(text('tavole.cad').includes(TITLE_BLOCK) && text('tavole.argano').includes('(rif. impianto: …)'));
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
