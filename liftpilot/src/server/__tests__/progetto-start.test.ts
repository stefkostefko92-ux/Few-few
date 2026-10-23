// Where the Progetto of an installation starts (src/server/progetto-start.ts, round 45): the drawing of the saved design
// chosen (?from=), else the drawing's draft (one of the one form before round 45 no longer reads), else the latest
// design's drawing, else what the installation already has (a shaft design, a survey of its machine room), else empty —
// always the user's company; the calculation's values are the base's, never the start's.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { defaultLift } from '@/lib/lift';
import { autoNuovo, blankProgetto, progettoOf, type BaseCalcolo } from '@/lib/lift/progetto';
import { startSurvey } from '@/lib/room/survey';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

type Row = Record<string, unknown>;
const db: { lift: Row[]; draft: Row[]; shaft: Row[]; room: Row[] } = { lift: [], draft: [], shaft: [], room: [] };
const matches = (r: Row, w: Row) => Object.entries(w).every(([k, v]) => r[k] === v);
const newest = (rows: Row[]) => [...rows].sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
const find = (rows: Row[]) => async ({ where }: { where: Row }) => newest(rows.filter((r) => matches(r, where)))[0] ?? null;
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  liftDesign: { findFirst: async (a: { where: Row }) => find(db.lift)(a) },
  formDraft: { findFirst: async (a: { where: Row }) => find(db.draft)(a) },
  shaftDesign: { findFirst: async (a: { where: Row }) => find(db.shaft)(a) },
  roomDesign: { findFirst: async (a: { where: Row }) => find(db.room)(a) },
} } });

const user = { id: 'u1', role: 'ENGINEER', companyId: 'c1', companyName: 'X', mustChangePassword: false, readOnly: false } as never;
const at = (n: number) => new Date(Date.UTC(2026, 9, 1, 0, n));
const withW = (W: number) => { const d = defaultLift(); return { ...d, shaft: { ...d.shaft, W } }; };
const lift = (id: string, W: number, over: Row = {}): Row => ({ id, projectId: 'p1', companyId: 'c1', createdAt: at(W % 100), inputs: withW(W), ...over });
const disegno = (W: number) => ({ progetto: progettoOf(withW(W)), blank: [], base: 'b1' });
/** a «Calcolo argano» of an existing lift (a replacement's values) and a transformation's */
const REPL: BaseCalcolo = { values: PRESETS.C, collaudo: { norma: '10411-1', parti: ['machine'] } };
const TRASF: BaseCalcolo = { values: { ...PRESETS.C, context: 'new' }, collaudo: null };
const empty = (base: BaseCalcolo) => { const b = blankProgetto(); return { progetto: { ...b.progetto, auto: autoNuovo(base) }, blank: b.blank, draftAt: null }; };
const start = async (projectId = 'p1', from: string | null = null, base: BaseCalcolo = REPL) =>
  (await import(src('server/progetto-start.ts'))).progettoStart(user, projectId, base, from);

beforeEach(() => { db.lift = []; db.draft = []; db.shaft = []; db.room = []; });

test('?from= vince su bozza e ultimo progetto', async () => {
  db.lift = [lift('old', 1500, { createdAt: at(1) }), lift('new', 1700, { createdAt: at(9) })];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: disegno(1900) }];
  const r = await start('p1', 'old');
  assert.equal(r.progetto.shaft.W, 1500);
  assert.equal(r.draftAt, null);
  assert.deepEqual(r.blank, []);
});

test('senza ?from=: la bozza vince sull’ultimo progetto e dice quando è stata tenuta', async () => {
  db.lift = [lift('new', 1700, { createdAt: at(9) })];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: disegno(1900) }];
  const r = await start();
  assert.equal(r.progetto.shaft.W, 1900);
  assert.equal(r.draftAt, at(5).toISOString());
});

test('senza ?from= e senza bozza: l’ultimo progetto dell’impianto', async () => {
  db.lift = [lift('old', 1500, { createdAt: at(1) }), lift('new', 1700, { createdAt: at(9) })];
  const r = await start();
  assert.equal(r.progetto.shaft.W, 1700);
  assert.equal(r.draftAt, null);
});

test('?from= di un’altra ditta: ignorato, si cade sulla bozza', async () => {
  db.lift = [lift('theirs', 1100, { companyId: 'c2' })];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: disegno(1900) }];
  const r = await start('p1', 'theirs');
  assert.equal(r.progetto.shaft.W, 1900);
});

test('?from= di un altro impianto o inesistente: ignorato, si cade sull’ultimo progetto', async () => {
  db.lift = [lift('mine', 1700), lift('elsewhere', 1100, { projectId: 'p2' })];
  assert.equal((await start('p1', 'elsewhere')).progetto.shaft.W, 1700);
  assert.equal((await start('p1', 'nonexistent')).progetto.shaft.W, 1700);
});

test('la bozza di un’altra ditta non si legge', async () => {
  db.draft = [{ projectId: 'p1', companyId: 'c2', scope: 'lift', updatedAt: at(5), data: disegno(1900) }];
  assert.deepEqual(await start(), empty(REPL));
});

test('un progetto di un’altra ditta non si prende come ultimo', async () => {
  db.lift = [lift('theirs', 1100, { companyId: 'c2' })];
  assert.deepEqual(await start(), empty(REPL));
});

test('bozza del modulo unico (prima del round 45) o che non si legge più: come nessuna, si cade sull’ultimo progetto', async () => {
  db.lift = [lift('mine', 1700)];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: { inputs: withW(1900), blank: [] } }];
  const r = await start();
  assert.equal(r.progetto.shaft.W, 1700);
  assert.equal(r.draftAt, null);
});

test('progetto illeggibile scelto con ?from=: come nessuno, si cade sulla bozza', async () => {
  db.lift = [lift('broken', 1500, { inputs: { nonsense: true } })];
  db.draft = [{ projectId: 'p1', companyId: 'c1', scope: 'lift', updatedAt: at(5), data: disegno(1900) }];
  assert.equal((await start('p1', 'broken')).progetto.shaft.W, 1900);
});

test('impianto vuoto: partenza vuota, i valori disegnati accesi (dx dalla pianta solo per una trasformazione)', async () => {
  assert.deepEqual(await start(), empty(REPL));
  assert.equal((await start()).progetto.auto.dx, false);
  assert.equal((await start('p1', null, TRASF)).progetto.auto.dx, true);
  for (const k of ['Q', 'Qkg', 'v', 'r', 'layout'] as const) assert.ok(!(await start()).blank.includes(k), `${k}: del calcolo`);
});

test('il rilievo del locale macchina porta vano e locale; il resto del disegno resta da inserire', async () => {
  const survey = { ...startSurvey(600), shaft: { W: 1450, D: 1620, wall: 250 } };
  db.room = [{ projectId: 'p1', companyId: 'c1', createdAt: at(3), inputs: survey }];
  const r = await start();
  assert.equal(r.carried, true);
  assert.deepEqual([r.progetto.shaft.W, r.progetto.shaft.D, r.progetto.shaft.wall], [1450, 1620, 250]);
  assert.ok(!r.blank.includes('W') && !r.blank.includes('D') && r.blank.includes('floors'), 'il vano rilevato, i piani da inserire');
  assert.ok(!r.blank.includes('Q') && !r.blank.includes('layout'), 'nulla del calcolo');
  assert.deepEqual(r.progetto.auto, autoNuovo(REPL));
});

test('un progetto del vano o un rilievo di un’altra ditta non si porta nel progetto', async () => {
  db.room = [{ projectId: 'p1', companyId: 'c2', createdAt: at(3), inputs: startSurvey(600) }];
  db.shaft = [{ projectId: 'p1', companyId: 'c2', createdAt: at(4), inputs: withW(1300).shaft }];
  assert.deepEqual(await start(), empty(REPL));
});
