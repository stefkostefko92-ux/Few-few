// A company always keeps an active owner (round 42, hard rule): from the team the owner's role never changes, and the
// last active owner is not deactivated (src/server/user-actions.ts updateUserAction) — only the platform's administrator
// outranks an owner, so the probe signs in as one.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;
const req = createRequire(import.meta.url);
const pkg = (m: string) => pathToFileURL(req.resolve(m)).href;

const OWNER = { id: 'uowner', companyId: 'c1', role: 'OWNER', active: true };
let otherOwners = 0;
let updates: Record<string, unknown>[] = [];
const tx = {
  user: {
    findFirst: async () => ({ active: OWNER.active, role: OWNER.role }),
    count: async () => otherOwners,
    update: async (a: Record<string, unknown>) => { updates.push(a); return {}; },
  },
  session: { deleteMany: async () => ({ count: 0 }) },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: {
  user: { findFirst: async ({ where }: { where: { id: string; companyId: string } }) => (where.id === OWNER.id && where.companyId === 'c1' ? OWNER : null) },
  $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
} } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => ({ id: 'uadmin', role: 'SUPERADMIN', companyId: 'c1', mustChangePassword: false, readOnly: false }) } });
mock.module(src('lib/audit.ts'), { namedExports: { audit: async () => {} } });
mock.module(src('lib/mail.ts'), { namedExports: { mailConfigured: () => false } });
mock.module(src('lib/account-mail.ts'), { namedExports: { mailAccount: () => {} } });
mock.module(src('server/billing.ts'), { namedExports: { lockCompany: async () => {}, seatAvailable: async () => true, enforceSeats: async () => {} } });
mock.module(pkg('next/cache'), { namedExports: { revalidatePath: () => {} } });
mock.module(pkg('next/navigation'), { namedExports: { redirect: (to: string) => { throw new Error(`redirect:${to}`); } } });

const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const update = async (o: Record<string, string>) => (await import(src('server/user-actions.ts'))).updateUserAction(form({ locale: 'it', id: OWNER.id, ...o }));

beforeEach(() => { updates = []; otherOwners = 0; });

test('il ruolo del titolare non cambia dalla squadra', async () => {
  await update({ role: 'ENGINEER' });
  assert.equal(updates.length, 0);
});

test('l’ultimo titolare attivo non si disattiva; con un altro titolare sì', async () => {
  await assert.rejects(update({ active: '0' }), /redirect:\/it\/app\/team\?e=lastOwner/);
  assert.equal(updates.length, 0);
  otherOwners = 1;
  await update({ active: '0', role: 'SALES' });
  assert.equal(updates.length, 1);
  assert.deepEqual((updates[0].data as Record<string, unknown>).active, false);
  assert.equal('role' in (updates[0].data as Record<string, unknown>), false, 'the owner stays the owner');
});
