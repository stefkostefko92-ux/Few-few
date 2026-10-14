// The save of a company's rights matrix (src/server/permission-actions.ts, round 42): only the owner of the company or
// the platform's administrator; never a colleague, whatever the company stored; never on a matrix changed meanwhile;
// never a right the hard rules lock; every change in the activity log with its role, right, before → after and who
// (the owner or the platform), in the same transaction as the rows.
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { capsOf, type Override } from '@/lib/rbac';
import { columnsOf, matrixText, type Grants } from '@/lib/permissions';

const src = (p: string) => new URL(`../../${p}`, import.meta.url).href;

type Row = Override & { companyId: string; updatedById?: string | null };
let rows: Row[] = [];
let audits: Record<string, unknown>[] = [];
let session: Record<string, unknown> | null = null;
const COMPANIES = new Set(['c1', 'c2']);
const key = (r: { companyId: string; role: string; capability: string }) => `${r.companyId}|${r.role}|${r.capability}`;
const tx = {
  company: { findUnique: async ({ where }: { where: { id: string } }) => (COMPANIES.has(where.id) ? { id: where.id } : null) },
  companyRolePermission: {
    findMany: async ({ where }: { where: { companyId: string } }) => rows.filter((r) => r.companyId === where.companyId)
      .map(({ role, capability, granted }) => ({ role, capability, granted })),
    deleteMany: async ({ where }: { where: Row }) => {
      const n = rows.length;
      rows = rows.filter((r) => key(r) !== key(where));
      return { count: n - rows.length };
    },
    upsert: async ({ where, create, update }: { where: { companyId_role_capability: Row }; create: Row; update: Partial<Row> }) => {
      const w = where.companyId_role_capability, i = rows.findIndex((r) => key(r) === key(w));
      if (i >= 0) rows[i] = { ...rows[i], ...update };
      else rows.push({ ...create });
      return {};
    },
  },
};
mock.module(src('lib/db.ts'), { namedExports: { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } } });
mock.module(src('lib/auth.ts'), { namedExports: { getSessionUser: async () => session } });
mock.module(src('lib/audit.ts'), { namedExports: { auditTx: async (_tx: unknown, a: Record<string, unknown>) => { audits.push(a); }, audit: async () => {} } });
mock.module(src('server/billing.ts'), { namedExports: { lockCompany: async () => {} } });

let n = 0;
const signIn = (role: string, over: Record<string, unknown> = {}) => {
  session = { id: `u${++n}`, role, companyId: 'c1', mustChangePassword: false, readOnly: false, caps: capsOf(role as never), ...over };
};
const stampOf = (companyId: string) => createHash('sha256').update(matrixText(rows.filter((r) => r.companyId === companyId))).digest('hex');
const columns = (companyId: string): Grants => columnsOf(rows.filter((r) => r.companyId === companyId));
const save = async (input: unknown) => (await import(src('server/permission-actions.ts'))).savePermissionsAction(input);
/** The Tecnico without the calculations, the Commerciale filling in the survey sheets. */
const changed = (companyId: string): Grants => {
  const g = columns(companyId);
  return { ...g, TECHNICIAN: g.TECHNICIAN.filter((c) => c !== 'calc:create'), SALES: [...g.SALES, 'rilievi:edit'] };
};

beforeEach(() => { rows = []; audits = []; signIn('OWNER'); });

test('il titolare salva la matrice della sua azienda: righe, versione nuova, una voce del registro per cambio', async () => {
  const r = await save({ companyId: 'c1', stamp: stampOf('c1'), grants: changed('c1') });
  assert.deepEqual(r, { ok: true, changed: 2, stamp: stampOf('c1') });
  assert.deepEqual(rows.map(({ role, capability, granted }) => ({ role, capability, granted })),
    [{ role: 'TECHNICIAN', capability: 'calc:create', granted: false }, { role: 'SALES', capability: 'rilievi:edit', granted: true }]);
  assert.ok(rows.every((x) => x.companyId === 'c1' && x.updatedById === session?.id));
  assert.deepEqual(audits.map((a) => [a.companyId, a.userId, a.action, a.entity, a.meta]), [
    ['c1', session?.id, 'PERMISSIONS_CHANGED', 'Permission', { role: 'TECHNICIAN', capability: 'calc:create', from: true, to: false, by: 'owner' }],
    ['c1', session?.id, 'PERMISSIONS_CHANGED', 'Permission', { role: 'SALES', capability: 'rilievi:edit', from: false, to: true, by: 'owner' }],
  ]);
  // back to the defaults: no row left, two more entries
  const back = await save({ companyId: 'c1', stamp: stampOf('c1'), grants: columnsOf([]) });
  assert.equal(back.ok && back.changed, 2);
  assert.deepEqual(rows, []);
  assert.equal(audits.length, 4);
});

test('nessun collega cambia i permessi, nemmeno con tutto concesso; senza sessione o con la password da cambiare nemmeno', async () => {
  for (const role of ['CHIEF_TECHNICIAN', 'ENGINEER', 'TECHNICIAN', 'SALES']) {
    signIn(role, { caps: capsOf(role as never, [{ role: role as never, capability: 'permissions:manage', granted: true }]) });
    assert.deepEqual(await save({ companyId: 'c1', stamp: stampOf('c1'), grants: changed('c1') }), { ok: false, error: 'forbidden' }, role);
  }
  session = null;
  assert.deepEqual(await save({ companyId: 'c1', stamp: stampOf('c1'), grants: changed('c1') }), { ok: false, error: 'unauthorized' });
  signIn('OWNER', { mustChangePassword: true });
  assert.deepEqual(await save({ companyId: 'c1', stamp: stampOf('c1'), grants: changed('c1') }), { ok: false, error: 'forbidden' });
  assert.deepEqual(rows, []);
  assert.deepEqual(audits, []);
});

test('un’altra azienda: per il titolare non esiste; la piattaforma la cambia e il registro lo attribuisce alla piattaforma', async () => {
  assert.deepEqual(await save({ companyId: 'c2', stamp: stampOf('c2'), grants: changed('c2') }), { ok: false, error: 'notFound' });
  assert.equal(rows.length, 0);
  signIn('SUPERADMIN', { companyId: 'platform' });
  const r = await save({ companyId: 'c2', stamp: stampOf('c2'), grants: changed('c2') });
  assert.equal(r.ok, true);
  assert.ok(rows.every((x) => x.companyId === 'c2'));
  assert.ok(audits.length === 2 && audits.every((a) => a.companyId === 'c2' && (a.meta as { by: string }).by === 'platform'));
  assert.deepEqual(await save({ companyId: 'c9', stamp: stampOf('c9'), grants: columnsOf([]) }), { ok: false, error: 'notFound' });
});

test('una matrice cambiata nel frattempo: conflitto, nulla scritto', async () => {
  const opened = stampOf('c1');
  assert.equal((await save({ companyId: 'c1', stamp: opened, grants: changed('c1') })).ok, true);
  audits = [];
  const before = JSON.stringify(rows);
  assert.deepEqual(await save({ companyId: 'c1', stamp: opened, grants: columnsOf([]) }), { ok: false, error: 'conflict' });
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(audits, []);
});

test('un diritto bloccato dalle regole fisse è un input falsato: rifiutato prima di tutto', async () => {
  const g = columns('c1');
  for (const grants of [{ ...g, SALES: [...g.SALES, 'users:manage'] }, { ...g, ENGINEER: [...g.ENGINEER, 'company:export'] }, { ...g, OWNER: [] }]) {
    assert.deepEqual(await save({ companyId: 'c1', stamp: stampOf('c1'), grants }), { ok: false, error: 'invalidFields' });
  }
  // the Capotecnico may have the company's data
  const r = await save({ companyId: 'c1', stamp: stampOf('c1'), grants: { ...g, CHIEF_TECHNICIAN: [...g.CHIEF_TECHNICIAN, 'company:export'] } });
  assert.equal(r.ok && r.changed, 1);
  assert.deepEqual(rows.map((x) => [x.role, x.capability, x.granted]), [['CHIEF_TECHNICIAN', 'company:export', true]]);
});

test('in sola lettura il titolare gestisce ancora i permessi (come i colleghi)', async () => {
  signIn('OWNER', { readOnly: true });
  assert.equal((await save({ companyId: 'c1', stamp: stampOf('c1'), grants: changed('c1') })).ok, true);
});
