// Where «Calcolo argano» starts (round 45): the calculation asked for, else the draft, else the latest step-2
// calculation, else the latest of any provenance, else empty; the type declared or read by its shape, the context the
// type's; from a lift design's calculation the extra bends as entered on the design (never the derived ones, which
// count the head pulleys of a machine below), the design's test and the drawing's values marked «dal progetto»; a draft
// before round 45 read by its shape, one still without a type left to choose. Against a database in memory.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import { blankCalc } from '@/lib/calc-blank';
import { capsOf } from '@/lib/rbac';
import { PARTI, PARTI_RIFACIMENTO, defaultLift, deriveLift, newLift } from '@/lib/lift';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
type Calc = { id: string; projectId: string; companyId: string; createdAt: Date; inputs: FormValues; collaudo: unknown; intervento: string | null;
  shaftDesignId: string | null; liftDesign: { inputs: unknown; createdAt: Date } | null };
let calcs: Calc[] = [], draft: unknown = null;
type Where = Record<string, unknown>;
const ok = (c: Calc, w: Where): boolean => Object.entries(w).every(([k, v]) => (k === 'liftDesign' ? c.liftDesign === null : (c as unknown as Where)[k] === v));
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  calculation: { findFirst: async ({ where }: { where: Where }) => calcs.filter((c) => ok(c, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null },
  formDraft: { findFirst: async () => (draft ? { data: draft, updatedAt: new Date('2026-10-14T10:00:00Z') } : null) },
} } });
const start = (): Promise<typeof import('../calc-start')> => import(src('server/calc-start.ts'));
/** A start that exists (a ?from= of the project, or none). */
const must = async <T,>(p: Promise<T | null>): Promise<T> => { const x = await p; assert.ok(x, 'a start'); return x; };
const user: SessionUser = {
  id: 'u1', email: 'tecnico@example.com', name: 'Tecnico', role: 'TECHNICIAN', locale: 'it', companyId: 'c1', companyName: 'Ditta', mustChangePassword: false,
  access: 'active', trialDays: 0, readOnly: false, caps: capsOf('TECHNICIAN'), terms: 'ok', termsBinding: null,
};
let n = 0;
const calc = (x: Partial<Calc>): Calc => ({ id: `c${++n}`, projectId: 'p1', companyId: 'c1', createdAt: new Date(Date.UTC(2026, 9, 1, n)), inputs: { ...PRESETS.C },
  collaudo: null, intervento: null, shaftDesignId: null, liftDesign: null, ...x });

test('vuoto, senza tipo; la bozza col suo tipo, una di prima letta per forma, una senza tipo da scegliere', async () => {
  const { calcStart } = await start();
  calcs = []; draft = null;
  const blank = await must(calcStart(user, 'p1', null));
  assert.deepEqual([blank.mode, blank.intervento.tipo, blank.values.context], ['new', null, '']);
  draft = { values: { ...blankCalc(), Q: 630 }, collaudo: { norma: '10411-1', parti: ['machine', 'car'] }, intervento: 'AMMODERNAMENTO', risposte: ['machine', 'car', 'ropes'] };
  const d = await must(calcStart(user, 'p1', null));
  assert.deepEqual([d.mode, d.intervento.tipo, d.values.context], ['draft', 'AMMODERNAMENTO', 'repl']);
  assert.deepEqual(d.intervento.risposte, ['machine', 'car', 'ropes']);
  draft = { values: { ...blankCalc(), context: 'repl' }, collaudo: null };
  const old = await must(calcStart(user, 'p1', null));
  assert.deepEqual([old.intervento.tipo, old.intervento.collaudo], ['SOLO_ARGANO', { norma: '10411-1', parti: ['machine'] }], 'a draft before round 45');
  assert.deepEqual(old.intervento.risposte, ['machine'], 'only its «Sì»: the ropes asked again');
  draft = { values: blankCalc(), collaudo: null };
  assert.equal((await must(calcStart(user, 'p1', null))).intervento.tipo, null, 'still to choose');
  draft = null;
});

test('l’ultimo calcolo di passo 2, poi quello di qualsiasi provenienza; il tipo dichiarato o letto per forma', async () => {
  const { calcStart } = await start();
  const declared = calc({ intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-11', parti: ['machine', 'controller'] } });
  const archive = calc({ shaftDesignId: 's1' });
  calcs = [declared, archive];
  const s = await must(calcStart(user, 'p1', null));
  assert.equal(s.mode, null, 'a saved calculation continued');
  assert.deepEqual([s.intervento.tipo, s.values.context], ['AMMODERNAMENTO', 'repl']);
  assert.deepEqual(s.intervento.risposte, [...PARTI], 'declared: every part was answered');
  // asked for: the archive one, read by its shape
  assert.equal((await must(calcStart(user, 'p1', archive.id))).intervento.tipo, 'SOLO_ARGANO');
  // another project's id: none (the page answers 404 — never an empty form over the draft)
  assert.equal(await calcStart(user, 'p2', declared.id), null);
  // a renovation saved before round 45: a modernisation with its «Sì» answered
  calcs = [calc({ collaudo: { norma: '10411-1', parti: PARTI_RIFACIMENTO, rifacimento: true }, inputs: { ...PRESETS.C, keepRopes: false } })];
  const rif = await must(calcStart(user, 'p1', null));
  assert.equal(rif.intervento.tipo, 'AMMODERNAMENTO');
  assert.deepEqual(rif.intervento.risposte, [...PARTI_RIFACIMENTO]);
});

test('dal calcolo di un progetto dell’impianto: nps come inserito, la prova del progetto, i valori «dal progetto»', async () => {
  const { calcStart } = await start();
  // a machine below with the head scheme: the derived calculation counts its extra head pulleys among the bends
  const L = { ...newLift(), calc: { ...newLift().calc, layout: 'bottom', nps: 1 }, bottom: 'head' as const };
  const dv = deriveLift(L);
  assert.ok(Number(dv.values.nps) > 1, 'the derived bends include the extra head pulleys');
  const lift = calc({ inputs: dv.values, collaudo: { ...dv.collaudo }, shaftDesignId: 's1', liftDesign: { inputs: L, createdAt: new Date('2026-10-02T09:00:00Z') } });
  calcs = [lift];
  const s = await must(calcStart(user, 'p1', null));
  assert.equal(s.values.nps, 1, 'the bends entered on the design, never the derived ones');
  assert.deepEqual([s.intervento.tipo, s.values.context], ['TRASFORMAZIONE_COMPLETA', 'new']);
  assert.deepEqual(Object.keys(s.progetto?.valori ?? {}).sort(), ['H', 'Hv', 'L0']);
  assert.equal(s.progetto?.valori.H, String(dv.values.H));
  // a replacement drawn on the one form: its test as chosen there, its type by its shape
  const R = { ...defaultLift(), calc: { ...defaultLift().calc, context: 'repl', layout: 'topDefl' }, collaudo: { norma: '10411-11' as const, parti: ['machine' as const, 'ropes' as const] } };
  const rv = deriveLift(R);
  calcs = [calc({ inputs: rv.values, collaudo: { ...rv.collaudo }, shaftDesignId: 's2', liftDesign: { inputs: R, createdAt: new Date('2026-10-03T09:00:00Z') } })];
  const r = await must(calcStart(user, 'p1', null));
  assert.deepEqual([r.intervento.tipo, r.intervento.collaudo], ['SOLO_ARGANO', R.collaudo]);
  assert.deepEqual(Object.keys(r.progetto?.valori ?? {}).sort(), ['H', 'L0', 'dx', 'h']);
});
