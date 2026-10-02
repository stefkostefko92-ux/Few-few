// The acceptance test's standards: a new lift is tested to EN 81-20/50 whatever was chosen, a modification as chosen
// (by default UNI 10411-1 with the machine replaced); a check applies when the intervention touches what it checks,
// the others stay "existing", shown and out of the verdict; standards added to the base one (EN 81-20/50 as a whole,
// DM 236/1989) each have their result, the test's is the worst; the choice goes through the server's schema, the
// derivation, the relazione and sheet 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CheckId } from '@/calc/types';
import { PRESETS } from '@/calc/presets';
import { defaultInputs, layout, type ShaftCheckId, type ShaftInputs } from '@/shaft';
import { liftInputsSchema } from '@/lib/lift-input';
import { AMBITO_VERIFICHE, PARTI, adeguamentiDovuti, ambitoOf, collaudoOf, collaudoVerdict, defaultLift, deriveLift, esitiNorme, type Collaudo } from '@/lib/lift';
import { buildReport } from '../report/build';
import type { ReportDoc } from '../report/model';
import { buildTavole } from '../tavole/build';
import type { TavoleInput } from '../tavole/input';

const REPL = { context: 'repl' }, NEW = { context: 'new' };
const marks = (collaudo: Collaudo) => ({ pEstimate: false, geometry: [], machineProposed: false, collaudo });

test('norma: impianto nuovo sempre EN 81-20/50; modifica come scelta, di default UNI 10411-1 con la macchina', () => {
  assert.deepEqual(collaudoOf(NEW, { norma: '10411-1', parti: ['ropes'] }), { norma: 'en81', parti: PARTI });
  assert.deepEqual(collaudoOf(REPL), { norma: '10411-1', parti: ['machine'] });
  // the parts in their own order, once each
  assert.deepEqual(collaudoOf(REPL, { norma: '10411-11', parti: ['speed', 'machine', 'speed'] }), { norma: '10411-11', parti: ['machine', 'speed'] });
  // tested as new: every part, whatever was ticked
  assert.deepEqual(collaudoOf(REPL, { norma: 'en81', parti: ['ropes'] }), { norma: 'en81', parti: PARTI });
  assert.equal(adeguamentiDovuti(collaudoOf(REPL)), true);
  assert.equal(adeguamentiDovuti({ norma: '10411-1', parti: ['ropes'] }), false);
  assert.equal(adeguamentiDovuti({ norma: '10411-11', parti: ['machine'] }), false);
});

test('ambito: ogni verifica del calcolo e del vano ha le sue parti; la macchina sostituita porta dentro le sue', () => {
  const d = deriveLift(defaultLift()), ids = [...d.analysis.res.checks, ...d.layout.checks, ...d.supportChecks].map((c) => c.id);
  for (const id of ids) assert.ok(Array.isArray(AMBITO_VERIFICHE[id]), `${id}: parti`);
  const M: Collaudo = { norma: '10411-1', parti: ['machine'] };
  for (const id of ['tr_load', 'tr_stall', 'r_sfa', 'b_one', 'b_up', 's_force', 'm_beam'] as const) assert.equal(ambitoOf(M, id), 'applies', id);
  for (const id of ['v_door', 'v_area', 'h_refuge', 'p_refuge', 'b_runby', 'm_height', 'm_door'] as const) assert.equal(ambitoOf(M, id), 'existing', id);
  // a new speed brings in the headroom, the pit and the buffers; a new car its area and doors' clearances
  const V: Collaudo = { norma: '10411-1', parti: ['speed'] }, C: Collaudo = { norma: '10411-11', parti: ['car'] };
  for (const id of ['h_refuge', 'h_clear', 'p_refuge', 'b_type', 'b_car', 'b_cw'] as const) assert.equal(ambitoOf(V, id), 'applies', id);
  for (const id of ['v_area', 'v_fit', 'h_parapet', 'v_doorcar'] as const) assert.equal(ambitoOf(C, id), 'applies', id);
  // the building's machine room is never the intervention's
  for (const id of ['m_height', 'm_door'] as const) assert.equal(ambitoOf({ norma: '10411-1', parti: PARTI }, id), 'existing', id);
  // tested as new, everything applies
  for (const id of Object.keys(AMBITO_VERIFICHE) as (CheckId | ShaftCheckId)[]) assert.equal(ambitoOf(collaudoOf(NEW), id), 'applies', id);
});

test('esito del collaudo: solo le verifiche che si applicano', () => {
  const checks = [{ id: 'tr_load', status: 'ok' }, { id: 'p_refuge', status: 'fail' }, { id: 'v_door', status: 'warn' }] as const;
  assert.deepEqual(collaudoVerdict({ norma: '10411-1', parti: ['machine'] }, checks), { verdict: 'ok', fails: 0, warns: 0 });
  assert.deepEqual(collaudoVerdict({ norma: '10411-1', parti: ['machine', 'speed'] }, checks), { verdict: 'fail', fails: 1, warns: 0 });
  assert.deepEqual(collaudoVerdict({ norma: '10411-11', parti: ['landingDoors'] }, checks), { verdict: 'warn', fails: 0, warns: 1 });
  assert.deepEqual(collaudoVerdict(collaudoOf(NEW), checks), { verdict: 'fail', fails: 1, warns: 1 });
});

test('dal modulo al server: lo schema accetta solo norme e parti note; la derivazione la porta', () => {
  const base = defaultLift();
  const ok = liftInputsSchema.safeParse({ ...base, collaudo: { norma: '10411-11', parti: ['machine', 'ropes'] } });
  assert.ok(ok.success, 'scelta valida');
  for (const bad of [{ norma: '10411-2', parti: [] }, { norma: '10411-1', parti: ['roof'] }, { norma: 'en81', parti: [], extra: 1 }, { norma: 'en81', parti: Array(20).fill('machine') }]) {
    assert.equal(liftInputsSchema.safeParse({ ...base, collaudo: bad }).success, false, JSON.stringify(bad));
  }
  assert.ok(liftInputsSchema.safeParse(base).success, 'senza scelta');
  const repl = { ...base, calc: { ...base.calc, context: 'repl' } };
  assert.deepEqual(deriveLift({ ...repl, collaudo: { norma: '10411-11', parti: ['ropes'] } }).collaudo, { norma: '10411-11', parti: ['ropes'] });
  assert.deepEqual(deriveLift({ ...repl, calc: { ...repl.calc, context: 'new' }, collaudo: { norma: '10411-11', parti: ['ropes'] } }).collaudo.norma, 'en81');
});

const report = (collaudo?: Collaudo): ReportDoc => buildReport({
  calc: { id: 'cmtest0001', label: null, createdAt: new Date('2026-10-02T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
  project: { name: 'Impianto di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null, client: null },
  company: 'Ditta di prova', values: PRESETS.B, generatedAt: new Date('2026-10-02T09:00:00Z'), reviews: [],
  ...(collaudo ? { marks: marks(collaudo) } : {}),
});
const kv = (doc: ReportDoc): Map<string, string> => new Map(doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
const heads = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => (b.t === 'h2' ? [b.text.replace(/^\d+\. /, '')] : []));
const checksGrid = (doc: ReportDoc) => doc.blocks.find((b) => b.t === 'grid' && b.head.includes('Riferimento'));

test('relazione: norma, parti, verifiche esistenti e adeguamenti secondo la scelta', () => {
  const def = report();
  assert.equal(kv(def).get('Normativa di riferimento per il collaudo'), 'UNI 10411-1:2024');
  assert.equal(kv(def).get('Parti sostituite o modificate'), 'macchina (argano)');
  assert.ok(heads(def).includes('Adeguamenti per la sostituzione (UNI 10411-1)'));
  // only the ropes: the drive and the brake stay the existing machine's
  const ropes = report({ norma: '10411-1', parti: ['ropes'] }), g = checksGrid(ropes);
  assert.ok(g && g.t === 'grid');
  const row = (start: string) => g.rows.findIndex((r) => r[0]?.startsWith(start));
  const tr = row('Aderenza'), dr = g.rows.findIndex((r) => (r[3] ?? '').startsWith('Esistente'));
  assert.ok(tr >= 0 && !(g.rows[tr]?.[3] ?? '').startsWith('Esistente'), 'aderenza: le funi la toccano');
  assert.ok(dr >= 0 && g.status?.[dr] === 'info', 'una verifica della macchina esistente');
  assert.ok(heads(ropes).includes('Adeguamenti'), 'la macchina resta');
  const eleven = report({ norma: '10411-11', parti: ['machine'] });
  assert.equal(kv(eleven).get('Normativa di riferimento per il collaudo'), 'UNI 10411-11:2024');
  assert.ok(heads(eleven).includes('Adeguamenti per la sostituzione (UNI 10411-11)'));
  const asNew = report({ norma: 'en81', parti: ['machine'] });
  assert.equal(kv(asNew).get('Parti sostituite o modificate'), "tutte: l'impianto si collauda come nuovo");
  assert.ok(heads(asNew).includes('Adeguamenti: collaudo come impianto nuovo'));
  const gNew = checksGrid(asNew);
  assert.ok(gNew && gNew.t === 'grid' && !gNew.rows.some((r) => (r[3] ?? '').startsWith('Esistente')), 'come nuovo: nessuna esistente');
});

const sheet1 = (collaudo?: Collaudo): string[] => {
  const I: ShaftInputs = { ...defaultInputs(1740, 1445), Q: 630, access: 'none', room: null };
  const x: TavoleInput = {
    values: PRESETS.C, layout: layout(I), plant: {}, ...(collaudo ? { marks: marks(collaudo) } : {}),
    project: { name: 'Impianto di prova', address: null, city: null, province: null, plantNumber: null, client: null },
    company: { name: 'Ditta di prova', logo: null }, set: { number: '26-008', issuedAt: new Date('2026-10-02T10:00:00Z'), author: 'LP', revisions: [] },
  };
  return buildTavole(x).doc.pages[0]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? [];
};

test('foglio 1: normativa del collaudo, esito «ESISTENTE» e la sua nota', () => {
  const machine = sheet1(), asNew = sheet1({ norma: 'en81', parti: [] }), eleven = sheet1({ norma: '10411-11', parti: ['machine', 'car'] });
  assert.ok(machine.includes('UNI 10411-1:2024') && machine.includes('ESISTENTE') && machine.includes('COLLAUDO'), 'modifica con la macchina');
  assert.ok(asNew.includes('UNI EN 81-20:2020') && !asNew.includes('ESISTENTE') && !asNew.includes('COLLAUDO'), 'come nuovo');
  assert.ok(eleven.includes('UNI 10411-11:2024'), 'UNI 10411-11');
});

test('più normative: in ordine e una volta; EN 81-20/50 si aggiunge solo a un’altra base', () => {
  const C = collaudoOf(REPL, { norma: '10411-1', aggiuntive: ['dm236', 'en81', 'dm236'], parti: ['machine'] });
  assert.deepEqual(C, { norma: '10411-1', parti: ['machine'], aggiuntive: ['en81', 'dm236'] });
  assert.deepEqual(collaudoOf(NEW, { norma: '10411-1', aggiuntive: ['en81', 'dm236'], parti: [] }), { norma: 'en81', parti: PARTI, aggiuntive: ['dm236'] });
  // none added: the same object as before the standards could be added (the saved designs keep their hash)
  assert.deepEqual(collaudoOf(REPL, { norma: '10411-11', aggiuntive: [], parti: ['ropes'] }), { norma: '10411-11', parti: ['ropes'] });
  // the schema: known standards only, at most each once
  const base = defaultLift();
  assert.ok(liftInputsSchema.safeParse({ ...base, collaudo: { norma: '10411-1', aggiuntive: ['en81', 'dm236'], parti: ['machine'] } }).success);
  for (const bad of [['en81-70'], ['dm236', 'dm236', 'en81']]) {
    assert.equal(liftInputsSchema.safeParse({ ...base, collaudo: { norma: '10411-1', aggiuntive: bad, parti: [] } }).success, false, JSON.stringify(bad));
  }
});

test('più normative: ognuna con il suo esito, quello del collaudo è il peggiore', () => {
  const checks = [{ id: 'tr_load', status: 'ok' }, { id: 'p_refuge', status: 'fail' }, { id: 'v_acc_door', status: 'warn' }] as const;
  const M: Collaudo = { norma: '10411-1', parti: ['machine'] };
  // the accessibility and the pit concern parts that stay: out of the base standard's result
  assert.deepEqual(collaudoVerdict(M, checks), { verdict: 'ok', fails: 0, warns: 0 });
  // DM 236 added: its checks enter whatever the parts; the pit stays out
  const D: Collaudo = { ...M, aggiuntive: ['dm236'] };
  assert.equal(ambitoOf(D, 'v_acc_door'), 'applies');
  assert.equal(ambitoOf(D, 'p_refuge'), 'existing');
  assert.deepEqual(collaudoVerdict(D, checks), { verdict: 'warn', fails: 0, warns: 1 });
  assert.deepEqual(esitiNorme(D, checks).map((e) => [e.norma, e.ids.length, e.verdict]), [['10411-1', 1, 'ok'], ['dm236', 1, 'warn']]);
  // EN 81-20/50 added: everything enters, the test fails with the pit
  const E: Collaudo = { ...M, aggiuntive: ['en81', 'dm236'] };
  assert.deepEqual(collaudoVerdict(E, checks), { verdict: 'fail', fails: 1, warns: 1 });
  assert.deepEqual(esitiNorme(E, checks).map((e) => e.verdict), ['ok', 'fail', 'warn']);
  // DM 236 without its case chosen in the shaft: no check computed under it
  assert.deepEqual(esitiNorme(D, checks.filter((c) => c.id !== 'v_acc_door')).map((e) => e.ids.length), [1, 0]);
});

test('relazione e foglio 1 con più normative: righe, sezione degli esiti, nota', () => {
  const doc = report({ norma: '10411-1', parti: ['machine'], aggiuntive: ['en81', 'dm236'] });
  assert.equal(kv(doc).get('Altre normative di collaudo'), 'UNI EN 81-20:2020 e UNI EN 81-50:2020; DM 236/1989 (barriere architettoniche)');
  assert.ok(heads(doc).includes('Esito del collaudo per normativa'));
  const g = doc.blocks.find((b) => b.t === 'grid' && b.head[0] === 'Normativa');
  assert.ok(g && g.t === 'grid');
  assert.deepEqual(g.rows.map((r) => r[1]), ['base', 'aggiunta', 'aggiunta']);
  // the calculation alone has no shaft: DM 236 has no check computed, and the report says why
  assert.equal(g.rows[2]?.[5], 'non calcolata');
  assert.ok(doc.blocks.some((b) => b.t === 'p' && b.text.startsWith('DM 236/1989: nessuna verifica calcolata')));
  assert.ok(doc.blocks.some((b) => b.t === 'verdict' && b.text.startsWith('Esito del collaudo:')));
  // without standards added the section is there with the base one alone
  const one = report(), g1 = one.blocks.find((b) => b.t === 'grid' && b.head[0] === 'Normativa');
  assert.ok(g1 && g1.t === 'grid' && g1.rows.length === 1 && !kv(one).has('Altre normative di collaudo'));
  // sheet 1: tested as new with DM 236 added has its note
  const asNew = sheet1({ norma: 'en81', parti: [], aggiuntive: ['dm236'] });
  assert.ok(asNew.includes('COLLAUDO'), 'nota del collaudo');
});
