// Round 37: the relazione as the engineer who signs it reads it — every check of the shaft with its own clauses, every
// document once, only the UNI 10411 part of the test (L2-01); UNI EN 81-1 only where the machine or its buffers follow
// it, in the edition the test names, its analogies marked as the software's choice (L2-04); a modification that keeps
// the sling under a new car or rated load: the sling to check for the new loads, the documented loads missing, the
// obligations of every part replaced (L2-02); the pillar in place of the counterweight's safety gear by the part of UNI
// 10411 (L6-04).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import appIt from '../../../messages/it.json';
import { PRESETS } from '@/calc/presets';
import { VOCI } from '@/calc/norme';
import type { FormValues } from '@/calc/types';
import { SHAFT_ENGINE_VERSION, VOCI_VANO, defaultInputs, layout, type ShaftCheckId, type ShaftInputs } from '@/shaft';
import { NORME_COLLAUDO, PARTI_RIFACIMENTO, defaultLift, deriveLift, newLift, type Collaudo, type LiftInputs } from '@/lib/lift';
import { slingCheck, tStarOf } from '../lift/arcata';
import { valueMarks } from '../lift/marks';
import { obblighiParti } from '../lift/norme-collaudo';
import { buildReport } from '../report/build';
import { underPitText } from '../report/build-parts';
import { collaudoNote, pilastroRif, riferimentiRows, std81_1 } from '../report/collaudo';
import type { ReportDoc } from '../report/model';
import { checkRefs } from '../report/refs';
import { analyse } from '../present/analysis';
import { buildTavole } from '../tavole/build';
import { dataSheet } from '../tavole/data';
import type { TavoleInput } from '../tavole/input';
import { clientNotes, underNote } from '../tavole/notes';

const DAY = new Date('2026-10-09T08:00:00Z');
const project = { name: 'Impianto di prova', address: null, city: 'Monza', province: 'MB', plantNumber: null, client: null };

/** The relazione of a lift design, as the server makes it from the one form. */
function relazione(inp: LiftInputs): ReportDoc {
  const d = deriveLift(inp);
  return buildReport({
    calc: { id: 'cmtest0037', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project, company: 'Ditta di prova', values: d.values, generatedAt: DAY, reviews: [],
    design: { id: 'cmdesign37', label: null, createdAt: DAY, sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION, profileId: 'IT-2026.1', author: null, layout: d.layout, source: null },
    marks: valueMarks(inp.auto, d, d.bottom, d.collaudo), plant: null, drawings: [],
  });
}
/** The relazione of a calculation alone, with the test chosen. */
const calcReport = (values: FormValues, collaudo: Collaudo): ReportDoc => buildReport({
  calc: { id: 'cmtest0037', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
  project, company: 'Ditta di prova', values, generatedAt: DAY, reviews: [], marks: { pEstimate: false, geometry: [], machineProposed: false, collaudo },
});
const withCollaudo = (L: LiftInputs, collaudo: Collaudo, documentato?: Collaudo['documentato']): LiftInputs =>
  ({ ...L, calc: { ...L.calc, context: 'repl', keepRopes: false }, collaudo: { ...collaudo, ...(documentato ? { documentato } : {}) } });
const RIF11: Collaudo = { norma: '10411-11', parti: PARTI_RIFACIMENTO, rifacimento: true };

const S: Readonly<Record<string, string>> = appIt.shaft;
const plain = (label: string): string => label.replace(/\s*\((UNI|DM) [^)]*\)$/, '');
/** The «Riferimento» of the shaft's checks (the grid of «Verifiche del vano») by check, and of the machine's by row. */
function shaftRefs(doc: ReportDoc): Map<string, string> {
  const g = doc.blocks.find((b) => b.t === 'grid' && b.head.includes('Riferimento') && b.rows.some((r) => r[0] === plain(S.c_v_area ?? '')));
  assert.ok(g && g.t === 'grid', 'tabella del vano');
  return new Map(g.rows.map((r) => [r[0] ?? '', r[4] ?? '']));
}
const shaftRef = (doc: ReportDoc, id: ShaftCheckId): string | undefined => shaftRefs(doc).get(plain(S[`c_${id}`] ?? id));
function machineRefs(doc: ReportDoc): Map<string, string> {
  const g = doc.blocks.find((b) => b.t === 'grid' && b.head.includes('Riferimento') && b.rows.some((r) => r[0]?.includes('Aderenza')));
  assert.ok(g && g.t === 'grid', 'tabella della macchina');
  return new Map(g.rows.map((r) => [r[0] ?? '', r[4] ?? '']));
}
const machineRef = (doc: ReportDoc, start: string): string => [...machineRefs(doc)].find(([k]) => k.startsWith(start))?.[1] ?? '';
const kv = (doc: ReportDoc): Map<string, string> => new Map(doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
/** The documents a reference names (the acronym before the first clause), each «UNI EN 81-20:2020»-like. */
const docsOf = (ref: string): string[] => ref.split('; ').map((x) => x.split(', ')[0] ?? '').filter((x) => /^(UNI|DM|NTC|DPR)\b/.test(x));

test('vano: ogni verifica con le sue clausole, ogni documento una volta (L2-01)', () => {
  const doc = relazione(newLift()), refs = shaftRefs(doc);
  for (const [check, ref] of refs) {
    const docs = docsOf(ref);
    assert.equal(new Set(docs).size, docs.length, `${check}: un documento una volta — ${ref}`);
  }
  // the buffers' rows: the type for the speed and the stroke, not the runby's text
  assert.equal(shaftRef(doc, 'b_type'), 'UNI EN 81-20:2020, 5.8.1.5');
  assert.equal(shaftRef(doc, 'b_car'), 'UNI EN 81-20:2020, 5.8.2.1.1.1');
  assert.equal(shaftRef(doc, 'b_cw'), 'UNI EN 81-20:2020, 5.8.2.1.1.1');
  assert.ok(shaftRef(doc, 'b_runby')?.startsWith('UNI EN 81-20:2020, 5.12.2.1'));
  // the machine room: each check its clause
  assert.equal(shaftRef(doc, 'm_height'), 'UNI EN 81-20:2020, 5.2.6.3.2.1 (altezza libera)');
  assert.equal(shaftRef(doc, 'm_panel'), 'UNI EN 81-20:2020, 5.2.6.3.2.1 a)');
  assert.equal(shaftRef(doc, 'm_free'), 'UNI EN 81-20:2020, 5.2.6.3.2.1 b)');
  assert.equal(shaftRef(doc, 'm_route'), 'UNI EN 81-20:2020, 5.2.6.3.2.2');
  assert.equal(shaftRef(doc, 'm_door'), 'UNI EN 81-20:2020, 5.2.3.2 a)');
  assert.equal(shaftRef(doc, 'm_above'), 'UNI EN 81-20:2020, 5.2.6.3.2.3');
  // the governor in the room: the free area beside it is the standard's, its place the plan's; the rope's analogy only on the rope
  assert.equal(shaftRef(doc, 'm_govfree'), 'UNI EN 81-20:2020, 5.2.6.3.2.1 b)');
  assert.equal(shaftRef(doc, 'm_gov'), 'modello di calcolo del software');
  for (const id of ['m_gov', 'm_govfree', 'v_govrail'] as const) assert.ok(!shaftRef(doc, id)?.includes('11.3'), id);
  assert.ok(shaftRef(doc, 'v_gov')?.includes('50 mm scelta del software, come tra cabina e contrappeso in UNI EN 81-1:2008, 11.3'));
  // the refuge on the car roof: not the pit's clause, not the old standard's
  const roof = shaftRef(doc, 'h_refuge') ?? '';
  assert.equal(roof, 'UNI EN 81-20:2020, 5.2.5.6.1.1 (Prospetto 2), 5.2.5.7.1 (Prospetto 3) e 5.2.5.7.3');
  assert.ok(!(shaftRef(doc, 'h_stand') ?? '').includes('UNI EN 81-1'));
  assert.equal(shaftRef(doc, 'p_refuge'), 'UNI EN 81-20:2020, 5.2.5.8.1 (Prospetto 4) e 5.2.5.8.2 a)');
  assert.equal(shaftRef(doc, 'h_guide'), 'UNI EN 81-20:2020, 5.2.5.6.1.1 (Prospetto 2) e 5.2.5.6.2');
});

test('vano: solo la parte della UNI 10411 del collaudo (L2-01)', () => {
  const rif11 = relazione(withCollaudo(defaultLift(), RIF11)), v80 = relazione(defaultLift());
  for (const [check, ref] of shaftRefs(rif11)) assert.ok(!ref.includes('UNI 10411-1:') && !ref.includes('UNI EN 81-21'), `-11 ${check}: ${ref}`);
  for (const [check, ref] of shaftRefs(v80)) assert.ok(!ref.includes('UNI 10411-11:'), `-1 ${check}: ${ref}`);
  assert.equal(shaftRef(rif11, 'm_hexist'), 'UNI 10411-11:2024, 9.2 (resta l’altezza esistente)');
  assert.equal(shaftRef(v80, 'm_hexist'), 'UNI 10411-1:2024, 9.2 (misure della UNI EN 81-21:2022, 5.9)');
  // tested as new: the check is of UNI 10411-1 only, and says so
  const en81 = relazione(withCollaudo(defaultLift(), { norma: 'en81', parti: [] }));
  assert.equal(shaftRef(en81, 'm_hexist'), 'UNI 10411-1:2024, 9.2 (verifica della sola UNI 10411-1)');
});

test('ammortizzatori: le voci del tipo montato su cabina e contrappeso (L2-01)', () => {
  const at = (id: ShaftCheckId, types: ('spring' | 'pu' | 'oil')[]) => checkRefs(VOCI_VANO, id, { norma: 'en81', ammortizzatori: types }, Infinity);
  assert.equal(at('b_car', ['pu']), 'UNI EN 81-20:2020, 5.8.1.7, 5.8.2.1.2.1 e 5.8.2.1.2.2 (compresso al 90 %); UNI EN 81-50:2020, 5.5.4 (esame di tipo)');
  assert.equal(at('b_cw', ['oil']), 'UNI EN 81-20:2020, 5.8.2.2.1 (corsa); la corsa ridotta di 5.8.2.2.2 non è usata');
  assert.equal(at('b_type', ['spring', 'oil']), 'UNI EN 81-20:2020, 5.8.1.5 e 5.8.1.6');
  // the runby is of every type
  assert.ok(checkRefs(VOCI_VANO, 'b_runby', { norma: 'en81' }).startsWith('UNI EN 81-20:2020, 5.12.2.1'));
});

test('registro: nessuna verifica perde i riferimenti per la norma del collaudo', () => {
  // a check with no clause under one test has none under any: its clauses are never all of the other part
  const shaft = [...new Set(VOCI_VANO.flatMap((v) => v.verifiche ?? []))];
  for (const id of shaft) {
    const by = NORME_COLLAUDO.map((norma) => checkRefs(VOCI_VANO, id, { norma }, Infinity));
    // the existing sling is a check of a modification only (arcata.ts)
    const of = id === 'sl_frame' ? by.slice(1) : by;
    assert.ok(of.every((r) => r === '') || of.every((r) => r !== ''), `${id}: ${JSON.stringify(by)}`);
  }
  const machine = [...new Set(VOCI.flatMap((v) => v.verifiche ?? []))];
  for (const id of machine) {
    for (const std of ['en81-20', 'en81-1'] as const) {
      const by = NORME_COLLAUDO.map((norma) => checkRefs(VOCI, id, { norma, groove: 'U', std, corsaRidotta: true }));
      assert.ok(by.every((r) => r === '') || by.every((r) => r !== ''), `${id} ${std}: ${JSON.stringify(by)}`);
    }
  }
});

test('macchina: la UNI EN 81-1 solo dove la macchina o gli ammortizzatori la seguono (L2-04)', () => {
  const NEW = { ...PRESETS.A, context: 'new' } as FormValues;
  const fresh = calcReport(NEW, { norma: 'en81', parti: [] });
  assert.ok(!machineRef(fresh, 'Aderenza · Frenatura di emergenza, cabina in discesa').includes('M.2.1.2'));
  const stall = machineRef(fresh, 'Aderenza · Contrappeso o cabina bloccati');
  assert.ok(stall.includes('UNI EN 81-20:2020, 5.5.3 c) 2)') && !stall.includes('9.3 c)'), stall);
  assert.equal(machineRef(fresh, 'Manovra di emergenza · Forza al volantino'), 'UNI EN 81-20:2020, 5.9.2.3.3 e 5.12.1.6');
  // UNI EN 81-1:2008 in a new lift's references only as a pointer («ex …») or a choice of the software by analogy
  for (const [check, ref] of machineRefs(fresh)) {
    const bare = ref.replace(/\(ex UNI EN 81-1:2008, [^)]*\)/g, '').replace(/come nella UNI EN 81-1:2008, M\.2\.1\.2/g, '');
    assert.ok(!bare.includes('UNI EN 81-1:2008'), `${check}: ${ref}`);
  }
  // the reduced-stroke buffers: their deceleration, the software's choice by the old standard
  const ridotti = calcReport({ ...NEW, buffers: true, ae: '' }, { norma: 'en81', parti: [] });
  assert.ok(machineRef(ridotti, 'Aderenza · Frenatura di emergenza, cabina in discesa').includes('valore scelto dal software come nella UNI EN 81-1:2008, M.2.1.2'));
  // a machine to UNI EN 81-1: its clauses in the edition of the test, with the clause that admits it
  const old = { ...PRESETS.B, context: 'repl', machineStd: 'en81-1' } as FormValues;
  const one = calcReport(old, { norma: '10411-1', parti: ['machine'] }), eleven = calcReport(old, { norma: '10411-11', parti: ['machine'] });
  assert.equal(machineRef(one, 'Aderenza · Contrappeso o cabina bloccati').split('; ').filter((x) => !x.startsWith('UNI EN 81-50')).join('; '),
    'UNI EN 81-1:2010, 9.3 c); UNI 10411-1:2024, 14.1 b)');
  assert.ok(machineRef(eleven, 'Aderenza · Contrappeso o cabina bloccati').endsWith('UNI EN 81-1 (edizione dell’impianto), 9.3 c); UNI 10411-11:2024, 14.1'));
  assert.equal(machineRef(one, 'Manovra di emergenza · Forza al volantino'), 'UNI EN 81-1:2010, 12.5.1–12.5.2 e 14.2.1.4; UNI 10411-1:2024, 14.1 b)');
  for (const doc of [one, eleven]) for (const [check, ref] of machineRefs(doc)) assert.ok(!/UNI EN 81-1, |UNI EN 81-1:2008, (9\.3|12\.5)/.test(ref), `${check}: ${ref}`);
  // the object and the references of the relazione name the same edition
  assert.ok(std81_1('10411-1').includes('(UNI 10411-1:2024, 14.1 b)), la UNI EN 81-1:2010'));
  assert.ok(std81_1('10411-11').includes('(UNI 10411-11:2024, 14.1), la UNI EN 81-1 (edizione dell’impianto)'));
  assert.deepEqual(riferimentiRows(true, { norma: '10411-11', parti: ['machine'] }, 'en81-1', false).at(-1)?.[0], 'UNI EN 81-1 (edizione dell’impianto)');
  assert.ok(!riferimentiRows(true, { norma: '10411-11', parti: ['machine'] }, 'en81-1', false).flat().some((x) => x.includes('UNI 10411-1:')));
});

test('arcata esistente: T* aumentato o non noto chiede la sua verifica per i nuovi carichi (L2-02)', () => {
  const ora = { Q: 630, P: 700, Mcw: 1015 };
  // no documented loads: not comparable — a warning while the sling stays under a new car
  assert.equal(tStarOf(RIF11, ora), 'ignoto');
  assert.equal(slingCheck(RIF11, ora)?.status, 'warn');
  // documented: an increase (any under -11; under -1 beyond prospetto 1) brings it, a decrease does not
  assert.equal(slingCheck({ ...RIF11, documentato: { Q: 630, P: 650, Mcw: 965 } }, ora)?.status, 'warn');
  assert.equal(slingCheck({ ...RIF11, documentato: { Q: 630, P: 750, Mcw: 1065 } }, ora), null);
  const RIF1: Collaudo = { ...RIF11, norma: '10411-1' };
  assert.equal(slingCheck({ ...RIF1, documentato: { Q: 630, P: 690, Mcw: 1005 } }, ora), null, 'entro il prospetto 1');
  assert.equal(slingCheck({ ...RIF1, documentato: { Q: 630, P: 520, Mcw: 835 } }, ora)?.status, 'warn', 'oltre il prospetto 1');
  // the machine alone, a new sling, a lift tested as new: none
  assert.equal(slingCheck({ norma: '10411-1', parti: ['machine'] }, ora), null);
  assert.equal(slingCheck({ norma: '10411-11', parti: ['car', 'sling'] }, ora), null);
  assert.equal(slingCheck({ norma: 'en81', parti: [] }, ora), null);
  // the derivation carries it as the design's check: the screen, the record's verdict, the relazione and sheet 1
  const d = deriveLift(withCollaudo(defaultLift(), RIF11));
  assert.equal(d.supportChecks.find((c) => c.id === 'sl_frame')?.status, 'warn');
  assert.ok(!deriveLift(defaultLift()).supportChecks.some((c) => c.id === 'sl_frame'));
});

test('relazione del rifacimento: carichi mancanti, arcata da verificare, obblighi di ogni parte (L2-02)', () => {
  const doc = relazione(withCollaudo(defaultLift(), RIF11)), rows = kv(doc);
  const v = rows.get('Variazione dei carichi') ?? '';
  assert.ok(v.startsWith('⚠ Carichi documentati mancanti: T* non confrontabile (UNI 10411-11, 6.1): indicare nei dati del collaudo'), v);
  assert.ok(v.includes('L’arcata esistente va verificata per i nuovi carichi (6.9)'), v);
  assert.equal(shaftRef(doc, 'sl_frame'), 'UNI 10411-11:2024, 6.1, 6.9 e 22');
  // the documented loads with T* increased: the variation says what it brings, the sling among it
  const docd = relazione(withCollaudo(defaultLift(), RIF11, { Q: 600, P: 600, Mcw: 900 }));
  assert.ok((kv(docd).get('Variazione dei carichi') ?? '').includes('aumento (UNI 10411-11, 6.1)') && (kv(docd).get('Variazione dei carichi') ?? '').includes('L’arcata esistente'));
  // the adaptations: the machine's, then every other part replaced with its clause
  const at = doc.blocks.findIndex((b) => b.t === 'h3' && b.text === 'Altre parti sostituite o modificate'), list = doc.blocks[at + 1];
  assert.ok(at > 0 && list && list.t === 'list');
  assert.deepEqual(list.items.map((x) => x.split(': ')[0]), ['UNI 10411-11:2024, 22', 'UNI 10411-11:2024, 12.1–12.3', 'UNI 10411-11:2024, 19',
    'UNI 10411-11:2024, 11.1', 'UNI 10411-11:2024, 17', 'UNI 10411-11:2024, 18']);
  assert.ok(list.items[0]?.includes('tra cui l’arcata (6.9)'));
  // the duties: the machine's case of art. 2 c.1 lett. cc), the other parts' for the engineer to name
  const duties = doc.blocks.flatMap((b) => (b.t === 'list' ? b.items : [])).filter((x) => x.startsWith('DPR 162/1999, art. 2 c.1 lett. cc)'));
  assert.equal(duties.length, 2);
  assert.ok(duties[1]?.includes('quadro di manovra') && duties[1].endsWith('(da verificare sul testo vigente).'), duties[1]);
  // the machine alone: as before
  const v80 = relazione(defaultLift());
  assert.equal(kv(v80).get('Variazione dei carichi'), undefined);
  assert.ok(!v80.blocks.some((b) => b.t === 'h3' && b.text === 'Altre parti sostituite o modificate'));
});

test('obblighi delle parti: la cabina solo sull’arcata esistente, la modifica sostanziale (L2-02)', () => {
  const rif = obblighiParti({ norma: '10411-1', parti: PARTI_RIFACIMENTO }).map((p) => p.rif);
  // the car doors under -1: 12.1 and 12.3 (its 12.2 is the landing doors' locks, with them)
  assert.deepEqual(rif, ['UNI 10411-1:2024, 22', 'UNI 10411-1:2024, 12.1 e 12.3', 'UNI 10411-1:2024, 19 e 12.2', 'UNI 10411-1:2024, 11.1', 'UNI 10411-1:2024, 17', 'UNI 10411-1:2024, 18']);
  // the new car on the old sling under -1: T* or the rated load beyond prospetto 1 bring 6.3–6.12 and 6.15 (6.1)
  const car1 = obblighiParti({ norma: '10411-1', parti: ['car'] })[0]?.testo ?? '';
  assert.ok(car1.endsWith('con T* o la portata oltre il prospetto 1 i punti 6.3–6.12 e 6.15, tra cui l’arcata (6.9)'), car1);
  const all = obblighiParti({ norma: '10411-11', parti: [...PARTI_RIFACIMENTO, 'sling'] }).map((p) => p.rif);
  assert.equal(all[0], 'UNI 10411-11:2024, 21.1');
  assert.ok(!all.includes('UNI 10411-11:2024, 22'), 'cabina e arcata nuove insieme: non è la 22');
  assert.deepEqual(obblighiParti({ norma: 'en81', parti: PARTI_RIFACIMENTO }), []);
});

/** A drawing set of a design with the test `collaudo` (the calculation's values PRESETS.C). */
const tavole = (collaudo: Collaudo): TavoleInput => ({
  values: PRESETS.C, layout: layout({ ...defaultInputs(1740, 1445), Q: 630, access: 'none', room: null } satisfies ShaftInputs), plant: {},
  marks: { pEstimate: false, geometry: [], machineProposed: false, collaudo },
  project, company: { name: 'Ditta di prova', logo: null }, set: { number: '26-037', issuedAt: DAY, author: 'LP', revisions: [] },
});
/** Sheet 1's texts. */
const sheet1 = (collaudo: Collaudo): string =>
  (buildTavole(tavole(collaudo)).doc.pages[0]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? []).join(' ');

test('foglio 1 del rifacimento: la nota del collaudo e la verifica dell’arcata (L2-02)', () => {
  const rif = sheet1({ ...RIF11, norma: '10411-1' });
  assert.ok(rif.includes('Carichi documentati mancanti: T* non confrontabile (UNI 10411-1, 6.1).'), 'carichi mancanti');
  assert.ok(rif.includes('L’arcata esistente va verificata per i nuovi carichi (6.9).'), 'arcata');
  const checks = dataSheet(tavole({ ...RIF11, norma: '10411-1' }), analyse(PRESETS.C), 6).sheet.checks;
  assert.deepEqual(checks.find((c) => c[0] === S.c_sl_frame), [S.c_sl_frame, '—', '—', 'ATTENZIONE'], 'la verifica nella tabella del foglio 1');
  const machine = sheet1({ norma: '10411-1', parti: ['machine'] });
  assert.ok(!machine.includes('Carichi documentati mancanti') && !machine.includes('L’arcata esistente va verificata'));
  // without the design's loads the note is as before
  assert.ok(!(collaudoNote(RIF11, 'x')?.text ?? '').includes('T*'));
});

test('pilastro al posto del paracadute del contrappeso: la clausola della parte della UNI 10411 (L6-04)', () => {
  assert.equal(pilastroRif('10411-1'), 'UNI 10411-1:2024, 6.14');
  assert.equal(pilastroRif('10411-11'), 'UNI EN 81-1 (edizione dell’impianto), 5.5 a); UNI 10411-11:2024, 6.6 e 6.13');
  const L = layout({ ...defaultInputs(1740, 1445), Q: 630, access: 'none', room: null });
  const note = (norma: Collaudo['norma']): string => clientNotes(L, true, { scheme: 'under', norma })
    .find((n) => n.title === 'SPAZIO ACCESSIBILE SOTTO IL VANO')?.text ?? '';
  assert.ok(note('10411-11').includes('pilastro fondato sul terreno, verificato per i nuovi carichi (UNI EN 81-1 (edizione dell’impianto), 5.5 a); UNI 10411-11:2024, 6.6 e 6.13)'));
  assert.ok(!note('10411-11').includes('UNI 10411-1:2024'));
  assert.ok(note('10411-1').includes('verificato per i nuovi carichi (UNI 10411-1:2024, 6.14)'));
  assert.ok(!note('en81').includes('pilastro'));
  assert.equal(underNote('10411-1').text, note('10411-1'));
  assert.ok(underPitText('10411-11').includes('(UNI EN 81-1 (edizione dell’impianto), 5.5 a); UNI 10411-11:2024, 6.6 e 6.13): è una scelta del progettista'));
  assert.ok(underPitText('10411-1').includes('(UNI 10411-1:2024, 6.14): è una scelta del progettista') && !underPitText('en81').includes('pilastro'));
});
