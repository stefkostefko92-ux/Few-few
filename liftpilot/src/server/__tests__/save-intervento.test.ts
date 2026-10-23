// The intervention and the base of a drawing in the saves (round 45, migration 21): a save from the calculator stores the
// type declared and the test, normalised, always — a stored default reads as the default it was; a calculation made
// again from a record keeps that record's rule and type (none before round 45: none); a lift design drawn on a
// «Calcolo argano» names it and its calculation takes the base's type, one of the one form names none. And no code but
// save.ts creates a calculation. Against a database in memory.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '@/calc/presets';
import type { SessionUser } from '@/lib/auth';
import { capsOf } from '@/lib/rbac';
import { PARTI, collaudoOf, defaultLift, newLift } from '@/lib/lift';
import { liftInputsSchema } from '@/lib/lift-input';
import { liftInputsOf, progettoOf } from '@/lib/lift/progetto';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
type Row = Record<string, unknown>;
type Model = 'calculation' | 'shaftDesign' | 'liftDesign';
const db: Record<Model, Row[]> = { calculation: [], shaftDesign: [], liftDesign: [] };
const audits: Row[] = [];
let seq = 0;
const model = (name: Model) => ({
  create: async ({ data }: { data: Row }) => {
    const row = { id: `${name}${++seq}`, ...(JSON.parse(JSON.stringify(data)) as Row) };
    db[name].push(row);
    return { id: row.id };
  },
});
const prisma: Row = {
  calculation: model('calculation'), shaftDesign: model('shaftDesign'), liftDesign: model('liftDesign'),
  project: { update: async () => ({}) }, auditLog: { create: async ({ data }: { data: Row }) => { audits.push(data); return {}; } },
};
prisma.$transaction = async (f: (tx: Row) => Promise<unknown>) => f(prisma);
mock.module(src('lib/db.ts'), { namedExports: { prisma } });
mock.module(src('lib/log.ts'), { namedExports: { log: { info: () => {}, warn: () => {}, error: () => {} } } });

const save = (): Promise<typeof import('../save')> => import(src('server/save.ts'));
const user: SessionUser = {
  id: 'u1', email: 'tecnico@example.com', name: 'Tecnico', role: 'TECHNICIAN', locale: 'it', companyId: 'c1', companyName: 'Ditta', mustChangePassword: false,
  access: 'active', trialDays: 0, readOnly: false, caps: capsOf('TECHNICIAN'), terms: 'ok', termsBinding: null,
};
const row = (m: Model, id: string): Row => { const r = db[m].find((x) => x.id === id); assert.ok(r, `${m} ${id}`); return r; };
const REPL = { ...PRESETS.A, context: 'repl' };

test('dal calcolatore: il tipo dichiarato e la prova normalizzata, sempre', async () => {
  const { createCalculation } = await save();
  const solo = await createCalculation(user, 'p1', REPL, null, { norma: '10411-1', parti: ['machine', 'ropes'] }, 'SOLO_ARGANO');
  assert.ok(solo.ok);
  assert.equal(row('calculation', solo.id).intervento, 'SOLO_ARGANO');
  assert.deepEqual(row('calculation', solo.id).collaudo, { norma: '10411-1', parti: ['machine', 'ropes'] });
  // a transformation sent without a test: tested as new, stored as such
  const tr = await createCalculation(user, 'p1', { ...PRESETS.A, context: 'new' }, null, null, 'TRASFORMAZIONE_COMPLETA');
  assert.ok(tr.ok);
  assert.deepEqual(row('calculation', tr.id).collaudo, { norma: 'en81', parti: [...PARTI] });
  // nothing chosen on a replacement: the default stored, which reads back as the same default (collaudoOf idempotent)
  const none = await createCalculation(user, 'p1', REPL, null, null, null);
  assert.ok(none.ok);
  const stored = row('calculation', none.id);
  assert.equal(stored.intervento, undefined, 'no type: the column stays NULL');
  assert.deepEqual(stored.collaudo, { norma: '10411-1', parti: ['machine'] });
  assert.deepEqual(collaudoOf(REPL, stored.collaudo as never), collaudoOf(REPL));
});

test('rifatto da un record: la regola e il tipo del record (prima del giro 45 nessuno)', async () => {
  const { createCalculation } = await save();
  const legacy = await createCalculation(user, 'p1', REPL, null, null, null, 'old1');
  assert.ok(legacy.ok);
  const r = row('calculation', legacy.id);
  assert.equal(r.collaudo, undefined, 'a refreshed legacy calculation without a test stores none, as before');
  assert.equal(r.intervento, undefined);
  const chosen = await createCalculation(user, 'p1', REPL, null, { norma: '10411-11', parti: ['machine', 'controller'] }, 'AMMODERNAMENTO', 'old2');
  assert.ok(chosen.ok);
  assert.equal(row('calculation', chosen.id).intervento, 'AMMODERNAMENTO');
  assert.deepEqual(row('calculation', chosen.id).collaudo, { norma: '10411-11', parti: ['machine', 'controller'] });
  assert.deepEqual(audits.at(-1)?.meta, { updates: 'old2' });
});

test('l’argano che resta è quello esistente: nessun modello del catalogo, dal calcolatore e da «Aggiorna»', async () => {
  const { createCalculation } = await save();
  const resta = { norma: '10411-1' as const, parti: ['controller' as const] }, V = { ...REPL, n_model: 'Montanari M75H' };
  const model = (r: Awaited<ReturnType<typeof createCalculation>>): unknown => (r.ok ? (row('calculation', r.id).inputs as Row).n_model : 'refused');
  assert.equal(model(await createCalculation(user, 'p1', V, null, resta, 'AMMODERNAMENTO')), '', 'from the form');
  // a record saved before round 46 made again with the software of now (refresh-actions.ts remakeCalc): the model goes
  assert.equal(model(await createCalculation(user, 'p1', V, null, resta, 'AMMODERNAMENTO', 'old5')), '', 'from «Aggiorna»');
  // the machine replaced keeps the catalogue's model taken from the advice
  assert.equal(model(await createCalculation(user, 'p1', V, null, { norma: '10411-1', parti: ['machine', 'controller'] }, 'AMMODERNAMENTO')), 'Montanari M75H');
  assert.equal(model(await createCalculation(user, 'p1', V, null, null, null, 'old6')), 'Montanari M75H', 'a record without a type: as it was');
});

test('il progetto disegnato su un calcolo argano lo nomina e ne prende il tipo; quello del modulo unico nessuno', async () => {
  const { createLiftDesign } = await save();
  const based = await createLiftDesign(user, 'p1', newLift(), null, null, undefined, { id: 'calcBase', intervento: 'TRASFORMAZIONE_COMPLETA' });
  assert.ok(based.ok, JSON.stringify(based));
  const L = row('liftDesign', based.id);
  assert.equal(L.baseCalculationId, 'calcBase');
  assert.equal(row('calculation', String(L.calculationId)).intervento, 'TRASFORMAZIONE_COMPLETA');
  assert.deepEqual(audits.at(-1)?.meta, { base: 'calcBase' });
  // a legacy base (no type declared): the design names it, its calculation has no type either
  const legacyBase = await createLiftDesign(user, 'p1', defaultLift(), null, null, 'old3', { id: 'calcOld', intervento: null });
  assert.ok(legacyBase.ok);
  const L2 = row('liftDesign', legacyBase.id);
  assert.equal(L2.baseCalculationId, 'calcOld');
  assert.equal(row('calculation', String(L2.calculationId)).intervento, undefined);
  assert.deepEqual(audits.at(-1)?.meta, { updates: 'old3', base: 'calcOld' });
  // the one form as before: no base, no type
  const plain = await createLiftDesign(user, 'p1', newLift(), null, null);
  assert.ok(plain.ok);
  const L3 = row('liftDesign', plain.id);
  assert.equal(L3.baseCalculationId, undefined);
  assert.equal(row('calculation', String(L3.calculationId)).intervento, undefined);
});

test('progetto su un «Solo argano»: la corsa disegnata diversa dal libretto rivede il tipo, su ogni via che salva un disegno (round 46)', async () => {
  // the Progetto, «Aggiorna il progetto con l'ultimo calcolo» and «Aggiorna con il software attuale» all save through
  // createLiftDesign: a «Solo argano» base whose drawing (its travel) brings a change of travel by the logbook is refused
  const { createLiftDesign } = await save();
  const { deriveLift } = await import(src('lib/lift/derive.ts'));
  const on = (libretto?: { H: number }) => liftInputsSchema.parse(liftInputsOf(progettoOf(defaultLift()),
    { values: PRESETS.B, collaudo: { norma: '10411-1', parti: ['machine'], ...(libretto ? { libretto } : {}) } }));
  const H = Number(deriveLift(on()).values.H), n = db.liftDesign.length;
  assert.deepEqual(await createLiftDesign(user, 'p1', on({ H: H - 2 }), null, null, 'old7', { id: 'calcSolo', intervento: 'SOLO_ARGANO' }), { ok: false, error: 'tipoDaRivedere' });
  assert.equal(db.liftDesign.length, n, 'nothing saved');
  // the logbook's travel drawn as it is, no logbook, a modernisation (its travel among the parts), a base without a type
  for (const [inputs, intervento] of [[on({ H }), 'SOLO_ARGANO'], [on(), 'SOLO_ARGANO'], [on({ H: H - 2 }), 'AMMODERNAMENTO'], [on({ H: H - 2 }), null]] as const) {
    const r = await createLiftDesign(user, 'p1', inputs, null, null, undefined, { id: 'calcB', intervento });
    assert.ok(r.ok, `${intervento} ${JSON.stringify(inputs.collaudo?.libretto)}: ${JSON.stringify(r)}`);
  }
});

test('nessun codice fuori da save.ts crea un calcolo', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== '__tests__' && f !== 'node_modules') walk(p); } else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk(root);
  const creators = files.filter((f) => /\b(prisma|tx)\.calculation\.(create|createMany|upsert)\b/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(creators.map((f) => f.slice(root.length)), ['server/save.ts']);
});
