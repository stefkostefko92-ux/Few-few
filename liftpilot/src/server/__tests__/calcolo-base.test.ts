// The «Calcolo argano» of an installation (round 45): the base is a step-2 calculation of an active project of the
// company — the one asked for, else the latest —; the installation's type is its latest step-2 calculation's (unless a
// design of the one form is newer than it: the design's), else that of its latest calculation of any provenance read by
// its shape, else none («da definire»). Against a database in memory
// that applies the where clause as Prisma would for these fields.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { snapshotOf } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';
import type { SessionUser } from '@/lib/auth';
import { canonHash } from '@/lib/canon-hash';
import { capsOf } from '@/lib/rbac';
import { PARTI_RIFACIMENTO } from '@/lib/lift';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
type Row = { id: string; companyId: string; projectId: string; createdAt: Date; inputs: unknown; sha256: string; collaudo: unknown; intervento: string | null;
  shaftDesignId: string | null; liftDesign: { id: string; baseCalculationId?: string | null } | null; archived: boolean };
const REPL = { ...PRESETS.A, context: 'repl' }, NEW = { ...PRESETS.A, context: 'new' };
const sha = (V: FormValues) => canonHash(snapshotOf(V));
let n = 0;
const calc = (x: Partial<Row>): Row => ({
  id: `c${++n}`, companyId: 'c1', projectId: 'p1', createdAt: new Date(Date.UTC(2026, 9, 1, n)), inputs: REPL, sha256: sha(REPL), collaudo: null, intervento: null,
  shaftDesignId: null, liftDesign: null, archived: false, ...x,
});
const ROWS: Row[] = [
  // p1: a legacy replacement calculation, then a lift design's (newer), then a declared step-2 one
  calc({ id: 'legacy' }),
  calc({ id: 'ofLift', inputs: NEW, sha256: sha(NEW), liftDesign: { id: 'l1' }, shaftDesignId: 's1' }),
  calc({ id: 'declared', intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-11', parti: ['machine', 'car'] } }),
  calc({ id: 'archive', shaftDesignId: 's0' }),
  // p2: only a lift design's calculation (a whole project before round 45), tested as new
  calc({ id: 'onlyLift', projectId: 'p2', inputs: NEW, sha256: sha(NEW), liftDesign: { id: 'l2' }, shaftDesignId: 's2', collaudo: { norma: 'en81', parti: [] } }),
  // p3: a renovation saved before round 45; p4: archived; p5: another company's
  calc({ id: 'rif', projectId: 'p3', collaudo: { norma: '10411-1', parti: PARTI_RIFACIMENTO, rifacimento: true } }),
  calc({ id: 'arch', projectId: 'p4', archived: true }),
  calc({ id: 'foreign', projectId: 'p5', companyId: 'c2' }),
  // p6: a replacement, then made whole (before round 45): its newer design of the one form; p7: a design drawn on a step-2
  // calculation of its own, newer than it
  calc({ id: 'repl6', projectId: 'p6' }),
  calc({ id: 'whole6', projectId: 'p6', inputs: NEW, sha256: sha(NEW), liftDesign: { id: 'l6', baseCalculationId: null }, shaftDesignId: 's6' }),
  calc({ id: 'solo7', projectId: 'p7', intervento: 'SOLO_ARGANO', collaudo: { norma: '10411-1', parti: ['machine'] } }),
  calc({ id: 'drawn7', projectId: 'p7', inputs: REPL, sha256: sha(REPL), liftDesign: { id: 'l7', baseCalculationId: 'solo7' }, shaftDesignId: 's7', intervento: 'SOLO_ARGANO' }),
];
type Where = Record<string, unknown> & { project?: { archivedAt: null }; liftDesign?: { is: null } };
const matches = (r: Row, w: Where): boolean => Object.entries(w).every(([k, v]) => {
  if (k === 'project') return !r.archived;
  if (k === 'liftDesign') return r.liftDesign === null;
  return (r as unknown as Record<string, unknown>)[k] === v;
});
mock.module(src('lib/db.ts'), { namedExports: { prisma: { calculation: {
  findFirst: async ({ where }: { where: Where }) => ROWS.filter((r) => matches(r, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
} } } });

const base = (): Promise<typeof import('../calcolo-base')> => import(src('server/calcolo-base.ts'));
const user: SessionUser = {
  id: 'u1', email: 'tecnico@example.com', name: 'Tecnico', role: 'TECHNICIAN', locale: 'it', companyId: 'c1', companyName: 'Ditta', mustChangePassword: false,
  access: 'active', trialDays: 0, readOnly: false, caps: capsOf('TECHNICIAN'), terms: 'ok', termsBinding: null,
};

test('calcoloBase: un calcolo di passo 2 del progetto attivo dell’azienda, quello chiesto o l’ultimo', async () => {
  const { calcoloBase } = await base();
  const latest = await calcoloBase(user, 'p1');
  assert.equal(latest?.id, 'declared', 'the latest step-2 calculation: never a lift design’s or one of the archive');
  assert.equal(latest?.tipo, 'AMMODERNAMENTO');
  assert.equal(latest?.dichiarato, true);
  assert.equal(latest?.same, true);
  assert.deepEqual(latest?.collaudo, { norma: '10411-11', parti: ['machine', 'car'] });
  const legacy = await calcoloBase(user, 'p1', 'legacy');
  assert.equal(legacy?.tipo, 'SOLO_ARGANO');
  assert.equal(legacy?.dichiarato, false);
  assert.deepEqual(legacy?.collaudo, { norma: '10411-1', parti: ['machine'] });
  // not a step-2 calculation of this project, archived, foreign: nothing
  for (const [p, id] of [['p1', 'ofLift'], ['p1', 'archive'], ['p2', 'legacy'], ['p4', 'arch'], ['p5', 'foreign']] as const) assert.equal(await calcoloBase(user, p, id), null, `${p}/${id}`);
  assert.equal(await calcoloBase(user, 'p2'), null, 'a whole project before round 45 has no step-2 calculation');
});

test('tipoImpianto: dal passo 2, altrimenti dall’ultimo calcolo letto per forma, altrimenti da definire', async () => {
  const { tipoImpianto, tipoDi } = await base();
  assert.equal(await tipoImpianto(user, 'p1'), 'AMMODERNAMENTO');
  assert.equal(await tipoImpianto(user, 'p2'), 'TRASFORMAZIONE_COMPLETA');
  assert.equal(await tipoImpianto(user, 'p3'), 'AMMODERNAMENTO', 'a renovation read by its shape');
  assert.equal(await tipoImpianto(user, 'p9'), null);
  assert.equal(await tipoImpianto(user, 'p5'), null, 'another company’s installation');
  assert.equal(await tipoImpianto(user, 'p6'), 'TRASFORMAZIONE_COMPLETA', 'a design of the one form newer than the step-2 calculation: the design’s');
  assert.equal(await tipoImpianto(user, 'p7'), 'SOLO_ARGANO', 'a design drawn on its calculation: the calculation’s');
  // the column wins over the shape
  assert.equal(tipoDi({ inputs: NEW, collaudo: null, intervento: 'SOLO_ARGANO' }), 'SOLO_ARGANO');
  assert.equal(tipoDi({ inputs: REPL, collaudo: { norma: '10411-1', parti: ['machine', 'landingDoors'] }, intervento: null }), 'AMMODERNAMENTO');
  assert.equal(tipoDi({ inputs: REPL, collaudo: { bad: true }, intervento: null }), 'SOLO_ARGANO', 'an unreadable test reads as none chosen');
});

test('tipoDaUltimi (le liste, round 45): il tipo dichiarato, altrimenti per forma; il passo 2 prima; nessun calcolo — da definire', async () => {
  const { tipoDaUltimi } = await base();
  const solo = { intervento: null, context: 'repl', collaudo: null }, nuovo = { intervento: null, context: 'new', collaudo: null };
  assert.equal(tipoDaUltimi(null, null), null);
  assert.equal(tipoDaUltimi({ intervento: 'AMMODERNAMENTO', context: 'repl', collaudo: null }, nuovo), 'AMMODERNAMENTO', 'the column, the step-2 first');
  assert.equal(tipoDaUltimi(solo, nuovo), 'SOLO_ARGANO', 'a replacement before round 45, by its shape');
  assert.equal(tipoDaUltimi(null, nuovo), 'TRASFORMAZIONE_COMPLETA', 'a whole project before round 45: its design’s calculation');
  assert.equal(tipoDaUltimi(null, { intervento: null, context: 'repl', collaudo: { norma: '10411-1', parti: ['machine', 'landingDoors'] } }), 'AMMODERNAMENTO');
  assert.equal(tipoDaUltimi(null, { intervento: null, context: 'repl', collaudo: { norma: 'en81', parti: [] } }), 'TRASFORMAZIONE_COMPLETA');
  // a design of the one form newer than the latest step-2 calculation (an installation made whole after its replacement)
  const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
  assert.equal(tipoDaUltimi({ ...solo, createdAt: at(1) }, { ...nuovo, createdAt: at(2), legacy: true }), 'TRASFORMAZIONE_COMPLETA', 'the newer design’s');
  assert.equal(tipoDaUltimi({ ...solo, createdAt: at(3) }, { ...nuovo, createdAt: at(2), legacy: true }), 'SOLO_ARGANO', 'older than the calculation');
  assert.equal(tipoDaUltimi({ ...solo, createdAt: at(1) }, { ...nuovo, createdAt: at(2), legacy: false }), 'SOLO_ARGANO', 'drawn on a calculation');
});

test('legacyPiuNuovo: un progetto del modulo unico più nuovo dell’ultimo calcolo di passo 2', async () => {
  const { legacyPiuNuovo } = await base();
  const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
  assert.equal(legacyPiuNuovo({ createdAt: at(1) }, { baseCalculationId: null, createdAt: at(2) }), true);
  assert.equal(legacyPiuNuovo({ createdAt: at(3) }, { baseCalculationId: null, createdAt: at(2) }), false);
  assert.equal(legacyPiuNuovo({ createdAt: at(1) }, { baseCalculationId: 'c1', createdAt: at(2) }), false);
  assert.equal(legacyPiuNuovo(null, { baseCalculationId: null, createdAt: at(2) }), false);
  assert.equal(legacyPiuNuovo({ createdAt: at(1) }, null), false);
});
