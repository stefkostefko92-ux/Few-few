// «Calcolo argano» with ?dal=progetto (round 45, phase 3 step 7; src/server/dal-progetto.ts): the drawing being made (the
// Progetto's draft, complete, composed on the calculation's values) gives the calculation its travel, rope beyond the
// travel and diverting pulley — never the extra bends, the machine, the rated load, the speed or the car's mass; an
// incomplete draft gives nothing and the latest saved lift design gives them instead; a direct pull whose falls the
// plan hangs gives the sheave; another company's drawing is never read.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { FormValues } from '@/calc/types';
import { deriveLift, newLift } from '@/lib/lift';
import { liftInputsOf, progettoOf, type ProgettoInputs } from '@/lib/lift/progetto';
import { capsOf } from '@/lib/rbac';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
type Row = Record<string, unknown>;
let drafts: Row[] = [], lifts: Row[] = [];
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  formDraft: { findFirst: async ({ where }: { where: Row }) => drafts.find((d) => d.projectId === where.projectId && d.scope === where.scope && d.companyId === where.companyId) ?? null },
  liftDesign: { findFirst: async ({ where }: { where: Row }) => lifts.filter((d) => d.projectId === where.projectId && d.companyId === where.companyId)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] ?? null },
} } });

const user = { id: 'u1', role: 'ENGINEER', companyId: 'c1', mustChangePassword: false, readOnly: false, caps: capsOf('ENGINEER') } as never;
const V: FormValues = { ...newLift().calc, H: 9, L0: 1.5, dx: 0.25, h: 0.5 };
const on = (p: ProgettoInputs): ProgettoInputs => ({ ...p, auto: { L0: true, dx: true, Hv: true, panel: true } });
const draftOf = (progetto: ProgettoInputs, blank: string[] = [], companyId = 'c1') => ({ projectId: 'p1', scope: 'lift', companyId, updatedAt: new Date(5), data: { progetto, blank } });
const dal = async () => (await import(src('server/dal-progetto.ts'))).dalProgetto(user, 'p1', V);

beforeEach(() => { drafts = []; lifts = []; });

test('dal progetto: il disegno in corso, completo, sul calcolo — corsa, fune e rinvio, mai i rinvii in più, l’argano o la portata', async () => {
  const p = on(progettoOf(newLift()));
  drafts = [draftOf(p)];
  const r = await dal();
  assert.ok(r);
  const d = deriveLift(liftInputsOf(p, { values: V })).values;
  assert.deepEqual(Object.keys(r.valori), ['H', 'L0', 'dx', 'h']);
  for (const k of ['H', 'L0', 'dx', 'h']) assert.equal(String(r.values[k]), String(d[k]), k);
  for (const k of ['nps', 'Q', 'v', 'P', 'n_D', 'n_i', 'r', 'layout']) assert.deepEqual(r.values[k], V[k], k);
  assert.equal(r.prima.H, '9', 'the value it replaced');
  assert.deepEqual(r.at, new Date(5));
  assert.equal(r.sheave, null, 'not a direct pull');
});

test('dal progetto: bozza incompleta o di un’altra azienda — l’ultimo progetto salvato; niente — nulla', async () => {
  assert.equal(await dal(), null);
  drafts = [draftOf(on(progettoOf(newLift())), ['W'])];
  assert.equal(await dal(), null, 'an incomplete drawing gives nothing');
  const L = { ...newLift(), auto: { ...newLift().auto, L0: true, dx: false, Hv: true } };
  lifts = [{ projectId: 'p1', companyId: 'c1', createdAt: new Date(7), inputs: L }, { projectId: 'p1', companyId: 'c2', createdAt: new Date(9), inputs: newLift() }];
  drafts.push(draftOf(on(progettoOf(newLift())), [], 'c2'));
  const r = await dal();
  assert.ok(r);
  assert.deepEqual(r.at, new Date(7), 'the company’s latest design');
  assert.ok(!('dx' in r.valori), 'its diverting pulley’s distance was the calculation’s');
  assert.equal(String(r.values.H), String(deriveLift(L).values.H));
});

test('dal progetto: un tiro diretto dà la puleggia da cui il disegno appende le funi', async () => {
  const L = { ...newLift(), calc: { ...newLift().calc, layout: 'top' } };
  drafts = [draftOf(on(progettoOf(L)))];
  const W = { ...V, layout: 'top' }, r = (await import(src('server/dal-progetto.ts'))).dalProgetto(user, 'p1', W);
  const got = await r, d = deriveLift(liftInputsOf(on(progettoOf(L)), { values: W }));
  assert.ok(got && d.calata !== null);
  assert.equal(got.sheave, Math.round(d.calata));
});
