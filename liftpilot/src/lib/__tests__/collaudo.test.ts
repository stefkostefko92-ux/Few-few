// The acceptance test's standard: a new lift is tested to EN 81-20/50 whatever was chosen, a modification as chosen
// (by default UNI 10411-1 with the machine replaced); a check applies when the intervention touches what it checks,
// the others stay "existing", shown and out of the verdict; the choice goes through the server's schema, the
// derivation, the relazione and sheet 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CheckId } from '@/calc/types';
import { PRESETS } from '@/calc/presets';
import { defaultInputs, layout, type ShaftCheckId, type ShaftInputs } from '@/shaft';
import { liftInputsSchema } from '@/lib/lift-input';
import { AMBITO_VERIFICHE, PARTI, adeguamentiDovuti, ambitoOf, collaudoOf, collaudoVerdict, defaultLift, deriveLift, type Collaudo } from '@/lib/lift';
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
