// The Progetto saved on its «Calcolo argano» (round 45, phase 3 step 6; src/server/lift-actions.ts): the browser sends the
// drawing and the base's id, never the calculation — the strict schema refuses the calculation, the test, the
// catalogue and the switches of the car's mass and the machine; the base is a step-2 calculation of this active
// installation of the company (else not found; none sent — the calculation first), reproduced by the running engine;
// the stored inputs are the drawing composed on it, the design names it and its calculation takes its declared type;
// the draft goes with the save; read-only mode and the rights refuse before anything is looked up.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { snapshotOf } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';
import { defaultLift } from '@/lib/lift';
import { liftInputsSchema } from '@/lib/lift-input';
import { liftInputsOf, progettoOf } from '@/lib/lift/progetto';
import { capsOf } from '@/lib/rbac';
import { snapshotHash } from '@/lib/snapshot-hash';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
type Row = Record<string, unknown>;
let calcs: Row[] = [], role = 'ENGINEER', readOnly = false;
let created: { ok: true; id: string } | { ok: false; error: string } = { ok: true, id: 'ld1' };
const saved: unknown[][] = [], dropped: unknown[] = [];
const PROJECTS = [{ id: 'p1', companyId: 'c1', archivedAt: null }, { id: 'p2', companyId: 'c1', archivedAt: null }, { id: 'parch', companyId: 'c1', archivedAt: new Date(0) }];
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  project: { findFirst: async ({ where }: { where: Row }) => PROJECTS.find((p) => p.id === where.id && p.companyId === where.companyId && p.archivedAt === where.archivedAt) ?? null },
  // calcolo-base.ts: a step-2 calculation of the active project of the company, the one asked
  calculation: { findFirst: async ({ where }: { where: Row }) => calcs.find((c) => c.projectId === where.projectId && c.companyId === where.companyId && !c.archived
    && c.liftDesign === null && c.shaftDesignId === null && (!where.id || c.id === where.id)) ?? null },
  formDraft: { deleteMany: async ({ where }: { where: Row }) => { dropped.push(where); return { count: 1 }; } },
} } });
mock.module(src('server/save.ts'), { namedExports: { createLiftDesign: async (...a: unknown[]) => { saved.push(a); return created; } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => ({ id: 'u1', role, companyId: 'c1', mustChangePassword: false, readOnly, caps: capsOf(role as 'ENGINEER') }) } });

const snap = (V: FormValues) => { const s = snapshotOf(V); return { inputs: s.values, sha256: snapshotHash(s) }; };
const calc = (id: string, over: Row = {}): Row => ({
  id, projectId: 'p1', companyId: 'c1', createdAt: new Date(0), liftDesign: null, shaftDesignId: null, collaudo: { norma: '10411-1', parti: ['machine', 'controller'] },
  intervento: 'AMMODERNAMENTO', ...snap(PRESETS.B), ...over,
});
const progetto = () => progettoOf(defaultLift());
const save = async (x: Row) => (await import(src('server/lift-actions.ts'))).saveLiftDesignAction({ projectId: 'p1', progetto: progetto(), source: null, label: 'x', ...x });

beforeEach(() => {
  calcs = [calc('b1'), calc('legacy1', { intervento: null }), calc('theirs', { companyId: 'c2' }), calc('elsewhere', { projectId: 'p2' }),
    calc('lift1', { liftDesign: { id: 'd1' } }), calc('arch1', { shaftDesignId: 's1' }), calc('stale1', { sha256: '0'.repeat(64) }),
    calc('dm1', { collaudo: { norma: '10411-1', parti: ['machine', 'car'], aggiuntive: ['dm236'] } })];
  saved.length = 0; dropped.length = 0; role = 'ENGINEER'; readOnly = false; created = { ok: true, id: 'ld1' };
});

test('progetto: sul calcolo argano di questo impianto, composto dal server; il tipo passa al calcolo del progetto', async () => {
  assert.deepEqual(await save({ baseCalculationId: 'b1' }), { ok: true, id: 'ld1' });
  const [, projectId, inputs, label, source, from, base] = saved[0] ?? [];
  assert.deepEqual([projectId, label, source, from], ['p1', 'x', null, undefined]);
  const b = calcs[0] as { inputs: FormValues; collaudo: never };
  assert.deepEqual(inputs, liftInputsSchema.parse(liftInputsOf(progetto(), { values: b.inputs, collaudo: b.collaudo })), 'the drawing on its base');
  assert.deepEqual(base, { id: 'b1', intervento: 'AMMODERNAMENTO' });
  assert.deepEqual(dropped, [{ companyId: 'c1', projectId: 'p1', scope: 'lift' }], 'the draft goes with the save');
  // a «Calcolo argano» saved before the type: none on the drawing's calculation either (the documents' words of that time)
  await save({ baseCalculationId: 'legacy1' });
  assert.deepEqual(saved[1]?.[6], { id: 'legacy1', intervento: null });
});

test('progetto: senza calcolo — prima il calcolo; base non del progetto, non di stadio 2, vecchia — rifiutata', async () => {
  assert.deepEqual(await save({}), { ok: false, error: 'noCalc' });
  for (const id of ['theirs', 'elsewhere', 'lift1', 'arch1', 'nonexistent']) assert.deepEqual(await save({ baseCalculationId: id }), { ok: false, error: 'notFound' }, id);
  assert.deepEqual(await save({ baseCalculationId: 'stale1' }), { ok: false, error: 'engineChanged' });
  assert.deepEqual(await save({ projectId: 'parch', baseCalculationId: 'b1' }), { ok: false, error: 'notFound' });
  assert.equal(saved.length, 0);
});

test('progetto: il browser non manda calcolo, collaudo, catalogo né massa e argano automatici', async () => {
  for (const extra of [{ calc: PRESETS.B }, { collaudo: { norma: 'en81', parti: [] } }, { catalog: { brand: 'SICOR' } }]) {
    const r = await save({ baseCalculationId: 'b1', progetto: { ...progetto(), ...extra } });
    assert.equal(r.ok, false, Object.keys(extra)[0]);
  }
  const p = progetto();
  assert.equal((await save({ baseCalculationId: 'b1', progetto: { ...p, auto: { ...p.auto, P: true } } })).ok, false, 'auto.P');
  assert.equal((await save({ baseCalculationId: 'b1', progetto: { ...p, auto: { ...p.auto, machine: true } } })).ok, false, 'auto.machine');
  // DM 236 added in the calculation: its case is the drawing's, never left at none
  assert.deepEqual(await save({ baseCalculationId: 'dm1', progetto: { ...p, shaft: { ...p.shaft, access: 'none' } } }), { ok: false, error: 'invalidFields', fields: ['access'] });
  assert.equal(saved.length, 0);
});

test('progetto: sola lettura e chi non disegna — rifiutati prima di ogni lettura', async () => {
  readOnly = true;
  assert.deepEqual(await save({ baseCalculationId: 'b1' }), { ok: false, error: 'forbidden' });
  readOnly = false;
  role = 'TECHNICIAN';
  assert.deepEqual(await save({ baseCalculationId: 'b1' }), { ok: false, error: 'forbidden' });
  assert.equal(saved.length, 0);
});

test('progetto su un «Solo argano»: il tipo da rivedere lo decide createLiftDesign (round 46) — il suo rifiuto torna al Progetto', async () => {
  // the rule (the drawing's travel against the logbook's on a «Solo argano» base) is save.ts's, shared by every path that
  // saves a drawing (save-intervento.test.ts): the action hands it the declared type and answers its refusal
  calcs.push(calc('sololong', { intervento: 'SOLO_ARGANO', collaudo: { norma: '10411-1', parti: ['machine'], libretto: { H: 3 } } }),
    calc('ammodlong', { collaudo: { norma: '10411-1', parti: ['machine', 'controller'], libretto: { H: 3 } } }));
  created = { ok: false, error: 'tipoDaRivedere' };
  assert.deepEqual(await save({ baseCalculationId: 'sololong' }), { ok: false, error: 'tipoDaRivedere' });
  assert.deepEqual(saved[0]?.[6], { id: 'sololong', intervento: 'SOLO_ARGANO' });
  assert.deepEqual((saved[0]?.[2] as { collaudo?: { libretto?: unknown } }).collaudo?.libretto, { H: 3 }, 'the logbook goes with the drawing');
  assert.deepEqual(dropped, [], 'the draft stays');
  // a modernisation: the stored test leaves the rule's travel out (the derivation brings it again on the drawing's travel)
  created = { ok: true, id: 'ld1' };
  assert.deepEqual(await save({ baseCalculationId: 'ammodlong' }), { ok: true, id: 'ld1' });
  assert.deepEqual((saved[1]?.[2] as { collaudo?: { parti: string[] } }).collaudo?.parti, ['machine', 'controller']);
});
