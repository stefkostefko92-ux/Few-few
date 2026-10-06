// The server actions' own guards, found by the red team (2026-10-06), each pinned with its probe: a full project does
// not take a calculator's record and a replacement does not take the one form's; a company without free slots gets the
// same answer for any address, so it cannot probe which addresses have an account elsewhere.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

type Where = Record<string, unknown>;
const PROJECTS = [{ id: 'pfull', companyId: 'c1', archivedAt: null, kind: 'FULL' }, { id: 'prepl', companyId: 'c1', archivedAt: null, kind: 'REPLACEMENT' }];
const match = (p: Record<string, unknown>, w: Where) => Object.entries(w).every(([k, v]) => p[k] === v);
const accounts = new Set(['someone@other-company.example']);
let role = 'TECHNICIAN';
const tx = {
  $queryRaw: async () => [],
  company: { findUnique: async () => ({ billingExempt: false, subscriptionStatus: null, trialEndsAt: new Date(Date.now() + 864e5), seatPack: 'NONE' }) },
  user: { count: async () => 0, create: async () => { throw new Error('no slot: nothing is created'); } },
  invite: { count: async () => 0, findUnique: async () => null, upsert: async () => { throw new Error('no slot: nothing is invited'); } },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  project: { findFirst: async ({ where }: { where: Where }) => (PROJECTS.find((p) => match(p, where)) ? { id: String(where.id) } : null) },
  calculation: { create: async () => { throw new Error('the guard must stop before the record'); } },
  user: { findUnique: async ({ where }: { where: { email: string } }) => (accounts.has(where.email) ? { id: 'u-other' } : null) },
  formDraft: { deleteMany: async () => ({ count: 0 }) },
  $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
} } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => ({ id: 'u1', role, companyId: 'c1', mustChangePassword: false, readOnly: false }) } });
mock.module(src('lib/mail.ts'), { namedExports: { mailConfigured: () => true } });
mock.module(src('lib/inactive.ts'), { namedExports: { purgeInactive: async () => ({ told: 0, deleted: 0 }) } });
mock.module(src('lib/account-mail.ts'), { namedExports: { mailAccount: () => {} } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async () => {} } });
mock.module(src('lib/billing-config.ts'), { namedExports: { billingConfigured: () => true, billingConfig: () => ({ trialDays: 14 }) } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: () => { throw new Error('redirect'); } } });

test('a full project takes no calculator record (its calculation comes from the one form)', async () => {
  const { PRESETS } = await import(src('calc/presets.ts'));
  const { saveCalculationAction } = await import(src('server/calc-actions.ts'));
  role = 'TECHNICIAN';
  const r = await saveCalculationAction({ projectId: 'pfull', values: { ...PRESETS.A, r: PRESETS.A.r ?? 1 }, label: 'x' });
  assert.deepEqual(r, { ok: false, error: 'notFound' });
});

test('a replacement takes no one-form record (it becomes a full project first)', async () => {
  const { defaultLift } = await import(src('lib/lift/index.ts'));
  const { saveLiftDesignAction } = await import(src('server/lift-actions.ts'));
  role = 'TECHNICIAN';
  const r = await saveLiftDesignAction({ projectId: 'prepl', inputs: defaultLift(), source: null, label: 'x' });
  assert.deepEqual(r, { ok: false, error: 'notFound' });
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
