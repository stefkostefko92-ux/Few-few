// The checks behind a record's result pill (src/server/verdict-checks.ts): for records made by the save path itself
// (src/server/save.ts, against a database in memory), the panel lists as many checks not passed and with a warning as
// the record's stored counts — the pill's number — for the four kinds, in Italian; a record of another
// company is not found; a record the engines no longer reproduce, or whose counts the data no longer give, says why.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import { capsOf } from '@/lib/rbac';
import { defaultLift, newLift, type LiftInputs } from '@/lib/lift';
import { startSurvey } from '@/lib/room/survey';
import it from '../../../messages/it.json';
import calcIt from '../../../messages/calc/it.json';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
type Row = Record<string, unknown>;
type Model = 'calculation' | 'shaftDesign' | 'liftDesign' | 'roomDesign';

// ---- the database as the save path writes it: JSON as stored, the relations read back by their ids
const db: Record<Model, Row[]> = { calculation: [], shaftDesign: [], liftDesign: [], roomDesign: [] };
let seq = 0;
const related = (r: Row): Row => ({
  ...r,
  ...(r.calculationId ? { calculation: db.calculation.find((c) => c.id === r.calculationId) } : {}),
  ...(r.shaftDesignId ? { shaftDesign: db.shaftDesign.find((c) => c.id === r.shaftDesignId) } : {}),
});
const model = (name: Model) => ({
  create: async ({ data }: { data: Row }) => {
    const row = { id: `${name}${++seq}`, ...(JSON.parse(JSON.stringify(data)) as Row) };
    db[name].push(row);
    return { id: row.id };
  },
  findFirst: async ({ where }: { where: { id: string; companyId: string } }) => {
    const r = db[name].find((x) => x.id === where.id && x.companyId === where.companyId);
    return r ? related(r) : null;
  },
});
const prisma: Row = {
  calculation: model('calculation'), shaftDesign: model('shaftDesign'), liftDesign: model('liftDesign'), roomDesign: model('roomDesign'),
  project: { update: async () => ({}) }, auditLog: { create: async () => ({}) },
};
prisma.$transaction = async (f: (tx: Row) => Promise<unknown>) => f(prisma);
mock.module(src('lib/db.ts'), { namedExports: { prisma } });
mock.module(src('lib/log.ts'), { namedExports: { log: { info: () => {}, warn: () => {}, error: () => {} } } });

// ---- next-intl's translations from the real messages, `{name}` replaced
const MESSAGES = { it } as const, CALC = { it: calcIt } as const;
type Loc = keyof typeof MESSAGES;
const fill = (s: string, v?: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v?.[k] ?? `{${k}}`));
mock.module(import.meta.resolve('next-intl/server'), { namedExports: {
  getMessages: async ({ locale }: { locale: Loc }) => ({ ...MESSAGES[locale], calc: CALC[locale] }),
  getTranslations: async ({ locale, namespace }: { locale: Loc; namespace: string }) => {
    const ns = (MESSAGES[locale] as unknown as Record<string, Record<string, string>>)[namespace] ?? {};
    const t = (k: string, v?: Record<string, unknown>) => fill(ns[k] ?? `${namespace}.${k}`, v);
    return Object.assign(t, { has: (k: string) => k in ns });
  },
} });

const save = (): Promise<typeof import('../save')> => import(src('server/save.ts'));
const verdict = (): Promise<typeof import('../verdict-checks')> => import(src('server/verdict-checks.ts'));
const user: SessionUser = {
  id: 'u1', email: 'tecnico@example.com', name: 'Tecnico', role: 'ENGINEER', locale: 'it', companyId: 'c1', companyName: 'Ditta', mustChangePassword: false,
  access: 'active', trialDays: 0, readOnly: false, caps: capsOf('ENGINEER'), terms: 'ok', termsBinding: null,
};
const other: SessionUser = { ...user, id: 'u2', companyId: 'c2' };
const row = (m: Model, id: string): Row => { const r = db[m].find((x) => x.id === id); assert.ok(r, `${m} ${id}`); return r; };

/** The panel of a record against its stored counts: the same numbers, nothing to explain. */
async function matches(kind: 'calc' | 'shaft' | 'room' | 'lift', m: Model, id: string, locale: Loc = 'it') {
  const { verdictDetail } = await verdict();
  const r = row(m, id), d = await verdictDetail(user, kind, id, locale);
  assert.ok(d, `${kind} ${id}`);
  assert.equal(d.fails.length, r.failCount, `${kind}: as many not passed as the pill says`);
  assert.equal(d.warns.length, r.warnCount, `${kind}: as many warnings as the record keeps`);
  assert.equal(d.note, null, `${kind}: nothing to explain`);
  for (const x of [...d.fails, ...d.warns]) {
    assert.ok(x.name && !x.name.startsWith('shaft.') && !/^c_/.test(x.name), `${kind}: named in Italian (${x.name})`);
    assert.ok(x.value, `${kind}: ${x.name} has its value`);
  }
  return d;
}

const NEW_SMALL = ((n: LiftInputs): LiftInputs => ({ ...n, shaft: { ...n.shaft, W: 1300, D: 1400 } }))(newLift());
const MOD_KEEP_D = ((n: LiftInputs): LiftInputs => ({ ...n, calc: { ...n.calc, n_D: '320' }, auto: { ...n.auto, machine: false } }))(defaultLift());

test('calcolo salvato: tante non superate e attenzioni quante l’esito, con valore e limite', async () => {
  const { createCalculation } = await save();
  const made = await createCalculation(user, 'p1', PRESETS.B, null, null);
  assert.ok(made.ok);
  const r = row('calculation', made.id);
  assert.ok(Number(r.failCount) > 0 && Number(r.warnCount) > 0, 'the example fails and warns');
  const d = await matches('calc', 'calculation', made.id);
  // the traction going up does not pass: named as the calculator names it, its limit with its sense
  assert.ok(d.fails.some((x) => /Aderenza/.test(x.name) && /^[≤≥]/.test(x.limit)), JSON.stringify(d.fails));
});

test('progetto dell’impianto nuovo (vano stretto): il progetto, il suo vano e il suo calcolo', async () => {
  const { createLiftDesign } = await save();
  const made = await createLiftDesign(user, 'p1', NEW_SMALL, null, null);
  assert.ok(made.ok);
  const L = row('liftDesign', made.id);
  assert.ok(Number(L.failCount) >= 5 && Number(L.warnCount) >= 1, `${L.failCount}/${L.warnCount}`);
  await matches('lift', 'liftDesign', made.id);
  await matches('shaft', 'shaftDesign', String(L.shaftDesignId));
  await matches('calc', 'calculation', String(L.calculationId));
  // a shaft check with its unit, from the check's definition
  const d = await matches('shaft', 'shaftDesign', String(L.shaftDesignId));
  assert.ok(d.fails.some((x) => /\u00a0mm$/.test(x.value)), JSON.stringify(d.fails));
});

test('modifica (UNI 10411-1): solo le verifiche che il collaudo prende, come l’esito', async () => {
  const { createLiftDesign } = await save();
  const made = await createLiftDesign(user, 'p1', MOD_KEEP_D, null, null);
  assert.ok(made.ok);
  const L = row('liftDesign', made.id), C = row('calculation', String(L.calculationId));
  assert.ok(Number(L.failCount) > 0);
  // the calculation counts all its checks, the lift design only the test's: the lists differ as the counts do
  assert.ok(Number(C.failCount) + Number(C.warnCount) >= Number(L.failCount) + Number(L.warnCount));
  await matches('lift', 'liftDesign', made.id);
  await matches('calc', 'calculation', String(L.calculationId));
});

test('locale macchina della sostituzione: le verifiche del collaudo scelto col calcolo', async () => {
  const { createCalculation, createRoomDesign } = await save();
  const V: FormValues = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 };
  const calc = await createCalculation(user, 'p2', V, null, null);
  assert.ok(calc.ok);
  const c = row('calculation', calc.id), s = startSurvey(780);
  const made = await createRoomDesign(user, { id: calc.id, inputs: c.inputs, sha256: String(c.sha256), collaudo: c.collaudo ?? null, projectId: 'p2' },
    { ...s, cw: { x: s.cw.x, y: s.cw.y + 30 } }, null);
  assert.ok(made.ok, JSON.stringify(made));
  assert.ok(Number(row('roomDesign', made.id).failCount) > 0, 'the drop measured elsewhere does not pass');
  const d = await matches('room', 'roomDesign', made.id);
  // the drop's name says what the calculation's drops are (the diverting pulley's: room/derive.ts roomCheckKey)
  assert.ok(d.fails.some((x) => x.name === it.shaft.c_m_calata_defl), JSON.stringify(d.fails));
});

test('un record di un’altra ditta, o che non c’è: nessuna risposta, la stessa', async () => {
  const { createCalculation } = await save();
  const { verdictDetail } = await verdict();
  const made = await createCalculation(user, 'p1', PRESETS.B, null, null);
  assert.ok(made.ok);
  assert.equal(await verdictDetail(other, 'calc', made.id, 'it'), null);
  assert.equal(await verdictDetail(user, 'calc', 'nessuno', 'it'), null);
  assert.equal(await verdictDetail(user, 'lift', made.id, 'it'), null, 'an id of another kind');
});

test('da aggiornare o contato altrimenti: l’elenco dice perché non torna', async () => {
  const { createLiftDesign } = await save();
  const { verdictDetail } = await verdict();
  const made = await createLiftDesign(user, 'p1', NEW_SMALL, null, null);
  assert.ok(made.ok);
  const L = row('liftDesign', made.id);
  // the derivation changed since (its version): what the calculation and the shaft design keep, said to be partial
  L.engineVersion = '0.0.0';
  const old = await verdictDetail(user, 'lift', made.id, 'it');
  assert.ok(old?.note, 'no note');
  assert.ok(old.fails.length > 0);
  // with both numbers when the stored records give fewer than the result counted
  assert.equal(old.note, old.fails.length === L.failCount && old.warns.length === L.warnCount ? it.verdictChecks.note_partial
    : it.verdictChecks.note_partial_diff.replace('{fails}', String(old.fails.length)).replace('{warns}', String(old.warns.length))
      .replace('{failCount}', String(L.failCount)).replace('{warnCount}', String(L.warnCount)));
  assert.ok(old.note.includes('ricalcolate dal software attuale'), 'the note says the page shows the running software\'s checks');
  // a calculation of an earlier engine whose counts its data still give: the stored list, said to be the stored one
  const C = row('calculation', String(L.calculationId)), engine = C.engineVersion;
  C.engineVersion = '0.0.0';
  const kept = await verdictDetail(user, 'calc', String(C.id), 'it');
  assert.equal(kept?.fails.length, C.failCount);
  assert.equal(kept?.note, it.verdictChecks.note_outdated);
  C.engineVersion = engine;
  assert.equal((await verdictDetail(user, 'calc', String(C.id), 'it'))?.note, null, 'a calculation of the running engine: nothing to explain');
  // a count the stored data no longer give (an earlier version counted otherwise): both numbers, and the way out
  C.failCount = Number(C.failCount) + 1;
  const off = await verdictDetail(user, 'calc', String(C.id), 'it');
  assert.ok(off?.note && off.note.includes(String(C.failCount)) && off.note.includes(String(off.fails.length)), off?.note ?? 'no note');
});
