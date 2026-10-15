// «Aggiorna il progetto con l'ultimo calcolo» (round 45, phase 3 step 7; src/server/ridisegna-actions.ts): a lift design
// drawn on an older «Calcolo argano» (or of the one form, older than the latest) is drawn again on the installation's
// latest step-2 calculation — its drawing as saved, composed on it, saved naming it — for whoever draws the project and
// not in read-only mode; an archived or foreign design, one already on the latest, or one of the one form newer than the
// latest, is left as it is; one already
// drawn again on it is not copied; a second click at the same moment is busy; a drawing that no longer passes, or a
// latest calculation not reproduced, opens the Progetto on that calculation from this drawing.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PRESETS } from '@/calc/presets';
import { snapshotOf } from '@/calc/snapshot';
import type { FormValues } from '@/calc/types';
import { defaultLift } from '@/lib/lift';
import { liftInputsSchema } from '@/lib/lift-input';
import { liftInputsOf, progettoOf } from '@/lib/lift/progetto';
import { capsOf } from '@/lib/rbac';
import { snapshotHash } from '@/lib/snapshot-hash';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;
type Row = Record<string, unknown>;
class Redirect extends Error { constructor(readonly to: string) { super(`redirect ${to}`); } }

let calcs: Row[] = [], lifts: Row[] = [], audit: Row[] = [], role = 'ENGINEER', readOnly = false;
let created: { ok: true; id: string } | { ok: false; error: string } = { ok: true, id: 'new1' }, gate: Promise<void> | null = null;
const saved: unknown[][] = [];
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  // calcolo-base.ts: the latest step-2 calculation of the active project of the company
  calculation: { findFirst: async ({ where }: { where: Row }) => calcs.filter((c) => c.projectId === where.projectId && c.companyId === where.companyId
    && c.liftDesign === null && c.shaftDesignId === null && !c.archived && (!where.id || c.id === where.id))
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))[0] ?? null },
  liftDesign: { findFirst: async ({ where }: { where: Row }) => lifts.find((d) => d.id === where.id && d.companyId === where.companyId
    && (!('project' in where) || !d.archived)) ?? null },
  auditLog: { findFirst: async ({ where }: { where: { companyId: string; action: string; meta: { equals: string } } }) =>
    audit.find((a) => a.companyId === where.companyId && a.action === where.action && a.updates === where.meta.equals) ?? null },
} } });
mock.module(src('server/save.ts'), { namedExports: { createLiftDesign: async (...a: unknown[]) => { saved.push(a); await gate; return created; } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => ({ id: 'u1', role, companyId: 'c1', mustChangePassword: false, readOnly, caps: capsOf(role as 'ENGINEER') }) } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Redirect(to); } } });

const snap = (V: FormValues) => { const s = snapshotOf(V); return { inputs: s.values, sha256: snapshotHash(s) }; };
const calc = (id: string, at: number, over: Row = {}): Row => ({
  id, projectId: 'p1', companyId: 'c1', createdAt: new Date(at), liftDesign: null, shaftDesignId: null, collaudo: { norma: '10411-1', parti: ['machine', 'controller'] },
  intervento: 'AMMODERNAMENTO', ...snap(PRESETS.B), ...over,
});
const stored = () => liftInputsSchema.parse(liftInputsOf(progettoOf(defaultLift()), { values: snap(PRESETS.B).inputs as FormValues, collaudo: { norma: '10411-1', parti: ['machine', 'controller'] } }));
const design = (id: string, over: Row = {}): Row => ({ id, projectId: 'p1', companyId: 'c1', label: 'x', inputs: stored(), source: null, baseCalculationId: 'old',
  createdAt: new Date(1.5), calculation: { intervento: 'AMMODERNAMENTO' }, ...over });
const fd = (id: string) => { const f = new FormData(); f.set('id', id); f.set('locale', 'it'); return f; };
async function go(id: string): Promise<string> {
  const { ridisegnaDalCalcoloAction } = await import(src('server/ridisegna-actions.ts'));
  try { await ridisegnaDalCalcoloAction(fd(id)); } catch (e) { if (e instanceof Redirect) return e.to; throw e; }
  throw new Error('no redirect');
}

beforeEach(() => {
  calcs = [calc('old', 1), calc('latest', 2, { intervento: null, ...snap({ ...PRESETS.B, H: Number(PRESETS.B.H) + 1 }) })];
  lifts = [design('ld1'), design('legacy', { baseCalculationId: null }), design('onlatest', { baseCalculationId: 'latest' }), design('arch', { archived: true }),
    design('theirs', { companyId: 'c2' }), design('upgraded', { baseCalculationId: null, createdAt: new Date(3) })];
  audit = []; saved.length = 0; created = { ok: true, id: 'new1' }; gate = null; role = 'ENGINEER'; readOnly = false;
});

test('ridisegna: lo stesso disegno sull’ultimo calcolo argano, che il progetto nomina', async () => {
  assert.equal(await go('ld1'), '/it/app/lift-designs/new1');
  const [, projectId, inputs, label, source, from, base] = saved[0] ?? [];
  const { storedCollaudo } = await import(src('server/records.ts'));
  const latest = calcs[1] as { inputs: FormValues; collaudo: unknown };
  assert.deepEqual(inputs, liftInputsSchema.parse(liftInputsOf(progettoOf(stored()), { values: latest.inputs, collaudo: storedCollaudo(latest.inputs, latest.collaudo) })));
  assert.deepEqual([projectId, label, source, from], ['p1', 'x', null, 'ld1'], 'the design it updates (audit)');
  assert.deepEqual(base, { id: 'latest', intervento: null }, 'a base saved without a type: none on the drawing either');
  // a design of the one form, older than the latest calculation: drawn on it too
  assert.equal(await go('legacy'), '/it/app/lift-designs/new1');
  assert.deepEqual(saved[1]?.[6], { id: 'latest', intervento: null });
});

test('ridisegna: già sull’ultimo calcolo, già rifatto, archiviato o di un’altra azienda — nessun nuovo progetto', async () => {
  assert.equal(await go('onlatest'), '/it/app/lift-designs/onlatest');
  lifts.push(design('again', { baseCalculationId: 'latest' }));
  audit.push({ companyId: 'c1', action: 'LIFT_DESIGN_SAVED', updates: 'ld1', entityId: 'again' });
  assert.equal(await go('ld1'), '/it/app/lift-designs/again', 'the one already drawn again');
  for (const id of ['arch', 'theirs', 'nonexistent']) assert.equal(await go(id), '/it/app', id);
  // a design of the one form newer than the latest calculation (an installation made whole after its replacement): that
  // older calculation is not drawn on, whatever the form posted
  assert.equal(await go('upgraded'), '/it/app/lift-designs/upgraded', 'the page’s rule on the server');
  calcs = [];
  assert.equal(await go('legacy'), '/it/app/lift-designs/legacy', 'no calculation to draw on');
  assert.equal(saved.length, 0);
});

test('ridisegna: l’ultimo calcolo ha un altro intervento (tipo, rifacimento, parti) — il Progetto su quel calcolo, niente in un clic', async () => {
  // round 46: an «Ammodernamento» of the machine room's parts drawn again on a renovation with the existing sling
  calcs[1] = { ...calcs[1], intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-1', parti: ['machine', 'ropes', 'car', 'cw', 'rails', 'landingDoors', 'carDoors', 'buffers',
    'governor', 'controller'], rifacimento: true } };
  assert.equal(await go('ld1'), '/it/app/projects/p1/progetto?from=ld1&calc=latest');
  calcs[1] = { ...calcs[1], intervento: 'SOLO_ARGANO', collaudo: { norma: '10411-1', parti: ['machine'] } };
  assert.equal(await go('ld1'), '/it/app/projects/p1/progetto?from=ld1&calc=latest', 'another type');
  assert.equal(saved.length, 0);
});

test('ridisegna: chi non disegna il progetto o in sola lettura — niente, prima di cercare', async () => {
  role = 'TECHNICIAN';
  assert.equal(await go('ld1'), '/it/app');
  role = 'OWNER';
  readOnly = true;
  assert.equal(await go('ld1'), '/it/app');
  assert.equal(saved.length, 0);
});

test('ridisegna: il disegno non passa o il calcolo va aggiornato — il Progetto su quel calcolo; due clic insieme — uno', async () => {
  created = { ok: false, error: 'invalidInputs' };
  assert.equal(await go('ld1'), '/it/app/projects/p1/progetto?from=ld1&calc=latest');
  calcs[1] = { ...calcs[1], sha256: '0'.repeat(64) };
  const before = saved.length;
  assert.equal(await go('ld1'), '/it/app/projects/p1/progetto?from=ld1&calc=latest');
  assert.equal(saved.length, before, 'nothing saved on a calculation not reproduced');
  calcs[1] = { ...calcs[1], ...snap({ ...PRESETS.B, H: Number(PRESETS.B.H) + 1 }) };
  created = { ok: true, id: 'new2' };
  let open: () => void = () => {};
  gate = new Promise((r) => { open = r; });
  const held = saved.length, first = go('ld1');
  while (saved.length === held) await new Promise((r) => setImmediate(r));
  assert.equal(await go('ld1'), '/it/app/lift-designs/ld1', 'busy');
  open();
  assert.equal(await first, '/it/app/lift-designs/new2');
});
