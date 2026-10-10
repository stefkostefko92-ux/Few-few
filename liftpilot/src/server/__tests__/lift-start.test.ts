// Where the one form of an installation starts (src/server/lift-start.ts): the saved design chosen (?from=), else the
// draft, else the latest design, else what the installation already has, else empty — always the user's company.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { defaultLift } from '@/lib/lift';
import { blankLift } from '@/lib/lift/blank';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

type Row = Record<string, unknown>;
const db: { lift: Row[]; draft: Row[]; calc: Row[]; shaft: Row[]; room: Row[] } = { lift: [], draft: [], calc: [], shaft: [], room: [] };
const matches = (r: Row, w: Row) => Object.entries(w).every(([k, v]) => r[k] === v);
const newest = (rows: Row[]) => [...rows].sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
const find = (rows: Row[]) => async ({ where }: { where: Row }) => newest(rows.filter((r) => matches(r, where)))[0] ?? null;
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  liftDesign: { findFirst: async (a: { where: Row }) => find(db.lift)(a) },
  formDraft: { findFirst: async (a: { where: Row }) => find(db.draft)(a) },
  calculation: { findFirst: async (a: { where: Row }) => find(db.calc)(a) },
  shaftDesign: { findFirst: async (a: { where: Row }) => find(db.shaft)(a) },
  roomDesign: { findFirst: async (a: { where: Row }) => find(db.room)(a) },
} } });

const user = { id: 'u1', role: 'TECHNICIAN', companyId: 'c1', companyName: 'X', mustChangePassword: false, readOnly: false } as never;
const at = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, n));
const withW = (W: number) => { const d = defaultLift(); return { ...d, shaft: { ...d.shaft, W } }; };
const lift = (id: string, W: number, over: Row = {}): Row => ({ id, projectId: 'p1', companyId: 'c1', createdAt: at(W % 100), inputs: withW(W), ...over });
const start = async (projectId = 'p1', from: string | null = null) => (await import(src('server/lift-start.ts'))).liftStart(user, projectId, from);

beforeEach(() => { db.lift = []; db.draft = []; db.calc = []; db.shaft = []; db.room = []; });

test('?from= vince su bozza e ultimo progetto', async () => {
  db.lift = [lift('old', 1500, { createdAt: at(1) }), lift('new', 1700, { createdAt: at(9) })];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: { inputs: withW(1900), blank: [] } }];
  const r = await start('p1', 'old');
  assert.equal(r.inputs.shaft.W, 1500);
  assert.equal(r.draftAt, null);
  assert.deepEqual(r.blank, []);
});

test('senza ?from=: la bozza vince sull’ultimo progetto e dice quando è stata tenuta', async () => {
  db.lift = [lift('new', 1700, { createdAt: at(9) })];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: { inputs: withW(1900), blank: [] } }];
  const r = await start();
  assert.equal(r.inputs.shaft.W, 1900);
  assert.equal(r.draftAt, at(5).toISOString());
});

test('senza ?from= e senza bozza: l’ultimo progetto dell’impianto', async () => {
  db.lift = [lift('old', 1500, { createdAt: at(1) }), lift('new', 1700, { createdAt: at(9) })];
  const r = await start();
  assert.equal(r.inputs.shaft.W, 1700);
  assert.equal(r.draftAt, null);
});

test('?from= di un’altra ditta: ignorato, si cade sulla bozza', async () => {
  db.lift = [lift('theirs', 1100, { companyId: 'c2' })];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: { inputs: withW(1900), blank: [] } }];
  const r = await start('p1', 'theirs');
  assert.equal(r.inputs.shaft.W, 1900);
});

test('?from= di un altro impianto o inesistente: ignorato, si cade sull’ultimo progetto', async () => {
  db.lift = [lift('mine', 1700), lift('elsewhere', 1100, { projectId: 'p2' })];
  assert.equal((await start('p1', 'elsewhere')).inputs.shaft.W, 1700);
  assert.equal((await start('p1', 'nonexistent')).inputs.shaft.W, 1700);
});

test('la bozza di un’altra ditta non si legge', async () => {
  db.draft = [{ projectId: 'p1', companyId: 'c2', scope: 'lift', updatedAt: at(5), data: { inputs: withW(1900), blank: [] } }];
  assert.deepEqual(await start(), { ...blankLift(), draftAt: null });
});

test('un progetto di un’altra ditta non si prende come ultimo', async () => {
  db.lift = [lift('theirs', 1100, { companyId: 'c2' })];
  assert.deepEqual(await start(), { ...blankLift(), draftAt: null });
});

test('bozza che non si legge più: come nessuna, si cade sull’ultimo progetto', async () => {
  db.lift = [lift('mine', 1700)];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: { inputs: { nonsense: true }, blank: [] } }];
  const r = await start();
  assert.equal(r.inputs.shaft.W, 1700);
  assert.equal(r.draftAt, null);
});

test('progetto illeggibile scelto con ?from=: come nessuno, si cade sulla bozza', async () => {
  db.lift = [lift('broken', 1500, { inputs: { nonsense: true } })];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: { inputs: withW(1900), blank: [] } }];
  assert.equal((await start('p1', 'broken')).inputs.shaft.W, 1900);
});

test('impianto vuoto: partenza vuota', async () => {
  assert.deepEqual(await start(), { ...blankLift(), draftAt: null });
});

test('sostituzione che diventa progetto intero: porta con sé il calcolo e le norme del collaudo', async () => {
  const collaudo = { norma: '10411-11', parti: ['machine', 'ropes'] };
  db.calc = [{ projectId: 'p1', companyId: 'c1', createdAt: at(3), inputs: PRESETS.C, collaudo }];
  const r = await start();
  assert.equal(r.inputs.shaft.Q, Math.round(Number(PRESETS.C.Q)));
  assert.ok(!r.blank.includes('Q'), 'il carico è inserito');
  assert.ok(r.blank.includes('floors'), 'i piani restano da inserire');
  assert.deepEqual(r.inputs.collaudo, collaudo);
});

test('il calcolo di un’altra ditta non si porta nel progetto', async () => {
  db.calc = [{ projectId: 'p1', companyId: 'c2', createdAt: at(3), inputs: PRESETS.C, collaudo: null }];
  assert.deepEqual(await start(), { ...blankLift(), draftAt: null });
});
