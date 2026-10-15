// The server actions' own guards, found by the red team (2026-10-06), each pinned with its probe: «Calcolo argano» takes
// any active installation of the company but only with its type of intervention agreeing with its values and test
// (round 45), and the Progetto draws only on a «Calcolo argano» (round 45: none sent, the calculation first); a company without free slots gets the
// same answer for any address, so it cannot probe which addresses have an account elsewhere; a company in read-only
// mode (no subscription after its trial, or the terms not accepted) saves nothing.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

type Where = Record<string, unknown>;
// (the ids keep the names of the kinds of installation before round 45, which no code reads any more)
const PROJECTS = [{ id: 'pfull', companyId: 'c1', archivedAt: null }, { id: 'prepl', companyId: 'c1', archivedAt: null },
  { id: 'parch', companyId: 'c1', archivedAt: new Date('2026-10-01') }, { id: 'pforeign', companyId: 'c2', archivedAt: null }];
const match = (p: Record<string, unknown>, w: Where) => Object.entries(w).every(([k, v]) => p[k] === v);
const accounts = new Set(['someone@other-company.example']);
let role = 'TECHNICIAN', readOnly = false;
/** the rights resolved with the session (round 42): none — the role's defaults */
let caps: ReadonlySet<string> | undefined;
const tx = {
  $queryRaw: async () => [],
  company: { findUnique: async () => ({ billingExempt: false, subscriptionStatus: null, trialEndsAt: new Date(Date.now() + 864e5), seatPack: 'NONE' }) },
  user: { count: async () => 0, create: async () => { throw new Error('no slot: nothing is created'); } },
  invite: { count: async () => 0, findUnique: async () => null, findFirst: async () => null, upsert: async () => { throw new Error('no slot: nothing is invited'); } },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  project: { findFirst: async ({ where }: { where: Where }) => (PROJECTS.find((p) => match(p, where)) ? { id: String(where.id) } : null) },
  calculation: { create: async () => { throw new Error('the guard must stop before the record'); } },
  user: { findUnique: async ({ where }: { where: { email: string } }) => (accounts.has(where.email) ? { id: 'u-other' } : null) },
  formDraft: { deleteMany: async () => ({ count: 0 }) },
  $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
} } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => ({ id: 'u1', role, companyId: 'c1', mustChangePassword: false, readOnly, ...(caps ? { caps } : {}) }) } });
mock.module(src('lib/mail.ts'), { namedExports: { mailConfigured: () => true } });
mock.module(src('lib/inactive.ts'), { namedExports: { purgeInactive: async () => ({ told: 0, deleted: 0 }) } });
mock.module(src('lib/account-mail.ts'), { namedExports: { mailAccount: () => {} } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async () => {} } });
mock.module(src('lib/billing-config.ts'), { namedExports: { billingConfigured: () => true, billingConfig: () => ({ trialDays: 14 }) } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: () => { throw new Error('redirect'); } } });

test('«Calcolo argano» for every installation (round 45): a full project takes it too; no type, nothing saved', async () => {
  const { PRESETS } = await import(src('calc/presets.ts'));
  const { saveCalculationAction } = await import(src('server/calc-actions.ts'));
  role = 'TECHNICIAN';
  const values = { ...PRESETS.A, r: PRESETS.A.r ?? 1 };
  // a transformation (PRESETS.A is a new lift) on a project created as a whole one: past every guard, to the record
  await assert.rejects(saveCalculationAction({ projectId: 'pfull', values, label: 'x', intervento: 'TRASFORMAZIONE_COMPLETA' }), /the guard must stop before the record/);
  assert.deepEqual(await saveCalculationAction({ projectId: 'pfull', values, label: 'x' }), { ok: false, error: 'invalidIntervento', fields: ['intervento'] });
  // archived or another company's: not found
  for (const projectId of ['parch', 'pforeign']) {
    assert.deepEqual(await saveCalculationAction({ projectId, values, label: 'x', intervento: 'TRASFORMAZIONE_COMPLETA' }), { ok: false, error: 'notFound' }, projectId);
  }
});

test('the Progetto of any installation draws on a «Calcolo argano»: none sent, the calculation first (round 45)', async () => {
  const { defaultLift } = await import(src('lib/lift/index.ts'));
  const { progettoOf } = await import(src('lib/lift/progetto.ts'));
  const { saveLiftDesignAction } = await import(src('server/lift-actions.ts'));
  // the Progetto is the project's drawing: the Progettista's (the Tecnico does not draw it: round 42)
  role = 'ENGINEER';
  for (const projectId of ['prepl', 'pfull']) {
    assert.deepEqual(await saveLiftDesignAction({ projectId, progetto: progettoOf(defaultLift()), source: null, label: 'x' }), { ok: false, error: 'noCalc' }, projectId);
  }
  // the one form's inputs (the calculation with them) are no drawing: refused by the strict schema
  assert.equal((await saveLiftDesignAction({ projectId: 'pfull', baseCalculationId: 'cmbase', progetto: defaultLift(), source: null, label: 'x' })).ok, false);
});

test('without a free slot the answer is the same for any address', async () => {
  const { createUserAction } = await import(src('server/user-actions.ts'));
  role = 'OWNER';
  const ask = async (email: string) => {
    const fd = new FormData();
    fd.set('email', email); fd.set('name', 'X'); fd.set('role', 'TECHNICIAN');
    return createUserAction({}, fd);
  };
  assert.deepEqual(await ask('someone@other-company.example'), await ask('nobody@example.org'));
});

test('read-only: neither a calculation nor a lift design is saved, before anything is looked up', async () => {
  const { PRESETS } = await import(src('calc/presets.ts'));
  const { defaultLift } = await import(src('lib/lift/index.ts'));
  const { saveCalculationAction } = await import(src('server/calc-actions.ts'));
  const { saveLiftDesignAction } = await import(src('server/lift-actions.ts'));
  role = 'OWNER';
  readOnly = true;
  try {
    assert.deepEqual(await saveCalculationAction({ projectId: 'prepl', values: { ...PRESETS.A, r: PRESETS.A.r ?? 1 }, label: 'x' }), { ok: false, error: 'forbidden' });
    assert.deepEqual(await saveLiftDesignAction({ projectId: 'pfull', baseCalculationId: 'cmbase', progetto: defaultLift(), source: null, label: 'x' }), { ok: false, error: 'forbidden' });
    // «Aggiorna il progetto con l'ultimo calcolo» (round 45) is a write: back to the app before any lookup (the mocked
    // database has no lift designs — a lookup would fail otherwise)
    const { ridisegnaDalCalcoloAction } = await import(src('server/ridisegna-actions.ts'));
    const fd = new FormData();
    fd.set('id', 'cmdesign');
    fd.set('locale', 'it');
    await assert.rejects(ridisegnaDalCalcoloAction(fd), /redirect/);
  } finally {
    readOnly = false;
  }
});

test('the rights of the matrix: the Tecnico calculates but does not draw the project, and a company may take the calculator away', async () => {
  const { defaultLift } = await import(src('lib/lift/index.ts'));
  const { PRESETS } = await import(src('calc/presets.ts'));
  const { saveLiftDesignAction } = await import(src('server/lift-actions.ts'));
  const { saveCalculationAction } = await import(src('server/calc-actions.ts'));
  role = 'TECHNICIAN';
  assert.deepEqual(await saveLiftDesignAction({ projectId: 'pfull', baseCalculationId: 'cmbase', progetto: defaultLift(), source: null, label: 'x' }), { ok: false, error: 'forbidden' });
  // the calculator answers past its right, on any installation (round 45: a full project's «Calcolo argano» too)
  await assert.rejects(saveCalculationAction({ projectId: 'pfull', values: { ...PRESETS.A, r: PRESETS.A.r ?? 1 }, label: 'x', intervento: 'TRASFORMAZIONE_COMPLETA' }),
    /the guard must stop before the record/);
  // the company took the calculations away from the Tecnico: refused before anything is looked up
  const { capsOf } = await import(src('lib/rbac.ts'));
  caps = capsOf('TECHNICIAN', [{ role: 'TECHNICIAN', capability: 'calc:create', granted: false }]);
  try {
    assert.deepEqual(await saveCalculationAction({ projectId: 'prepl', values: { ...PRESETS.A, r: PRESETS.A.r ?? 1 }, label: 'x' }), { ok: false, error: 'forbidden' });
  } finally {
    caps = undefined;
  }
});

test('the intervention declared with a calculation must agree with its values and test (round 45)', async () => {
  const { PRESETS } = await import(src('calc/presets.ts'));
  const { saveCalculationAction } = await import(src('server/calc-actions.ts'));
  role = 'TECHNICIAN';
  const values = { ...PRESETS.A, r: PRESETS.A.r ?? 1, context: 'repl', keepRopes: true, compare: true };
  const save = (x: Record<string, unknown>) => saveCalculationAction({ projectId: 'prepl', values, label: 'x', ...x });
  // not one of the three
  assert.deepEqual(await save({ intervento: 'FULL' }), { ok: false, error: 'invalidFields' });
  // a «Solo argano» with the landing doors, a transformation on an existing lift's values, a renovation keeping the sling
  assert.deepEqual(await save({ intervento: 'SOLO_ARGANO', collaudo: { norma: '10411-1', parti: ['machine', 'landingDoors'] } }),
    { ok: false, error: 'invalidIntervento', fields: ['parti'] });
  assert.deepEqual(await save({ intervento: 'TRASFORMAZIONE_COMPLETA' }), { ok: false, error: 'invalidIntervento', fields: ['context'] });
  assert.deepEqual(await save({ intervento: 'AMMODERNAMENTO', collaudo: { norma: 'en81', parti: ['machine', 'car'] } }), { ok: false, error: 'invalidIntervento', fields: ['norma'] });
  // agreeing: past the check, to the record, whatever the project was created as
  await assert.rejects(save({ intervento: 'SOLO_ARGANO', collaudo: { norma: '10411-1', parti: ['machine'] } }), /the guard must stop before the record/);
  // the machine and its ropes with the load the documented loads change (UNI 10411, 6.1): the modernisation the «Solo
  // argano» warning points to is saved; without the loads it is a «Solo argano» and is refused
  const C = { ...values, ...PRESETS.C, r: PRESETS.C.r ?? 1, context: 'repl', keepRopes: true, compare: true }, doc = { documentato: { Q: 400, P: 600, Mcw: 800 } };
  await assert.rejects(saveCalculationAction({ projectId: 'prepl', values: C, label: 'x', intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-1', parti: ['machine', 'ropes'], ...doc } }),
    /the guard must stop before the record/);
  assert.deepEqual(await saveCalculationAction({ projectId: 'prepl', values: C, label: 'x', intervento: 'AMMODERNAMENTO', collaudo: { norma: '10411-1', parti: ['machine', 'ropes'] } }),
    { ok: false, error: 'invalidIntervento', fields: ['parti'] });
  await assert.rejects(saveCalculationAction({ projectId: 'pfull', values, label: 'x', intervento: 'SOLO_ARGANO', collaudo: { norma: '10411-1', parti: ['machine'] } }),
    /the guard must stop before the record/);
});
