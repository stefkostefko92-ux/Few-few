import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const { audit, pruneAudit, SYSTEM_ACTOR, verifyAuditChain, AUDIT_VERSION } =
  await import('../../src/audit.js');
const YEAR = 366 * 86_400_000;

test('new entries are keyed (v2) and the chain verifies with its head', async () => {
  for (let k = 0; k < 3; k++) await audit(SYSTEM_ACTOR, { action: `test.entry.${k}` });
  const rows = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  assert.ok(rows.every((r) => r.v === AUDIT_VERSION));
  const chain = await verifyAuditChain({ full: true });
  assert.equal(chain.ok, true);
  assert.equal(chain.count, rows.length);
  assert.deepEqual(chain.head, { id: rows.at(-1)!.id, hash: rows.at(-1)!.hash });
});

test('retention removes entries past the period and the chain goes on from the last removed one', async () => {
  const before = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
  const chain = await verifyAuditChain({ full: true });
  // seen from six years ahead, every entry is past the five-year period
  const removed = await pruneAudit(chain, new Date(Date.now() + 6 * YEAR));
  assert.equal(removed, before.length);
  const base = await prisma.auditBase.findUniqueOrThrow({ where: { id: 1 } });
  assert.deepEqual([base.lastId, base.lastHash], [before.at(-1)!.id, before.at(-1)!.hash]);
  await audit(SYSTEM_ACTOR, { action: 'test.after.prune' });
  const next = await prisma.auditLog.findFirstOrThrow({ orderBy: { id: 'desc' } });
  assert.equal(next.prevHash, base.lastHash, 'the next entry chains to the removed one');
  const after = await verifyAuditChain({ full: true });
  assert.equal(after.ok, true);
  assert.equal(after.count, 1);
});

test('a changed entry breaks the chain; nothing is pruned then, and the alarm stays', async () => {
  await audit(SYSTEM_ACTOR, { action: 'test.before.tamper' });
  const row = await prisma.auditLog.findFirstOrThrow({ orderBy: { id: 'asc' } });
  await prisma.auditLog.update({ where: { id: row.id }, data: { actorLabel: 'someone else' } });
  const broken = await verifyAuditChain({ full: true });
  assert.equal(broken.ok, false);
  assert.equal(broken.brokenAt, row.id);
  assert.equal(await pruneAudit(broken, new Date(Date.now() + 6 * YEAR)), 0);
  await prisma.auditLog.update({ where: { id: row.id }, data: { actorLabel: row.actorLabel } });
  const later = await verifyAuditChain({ full: true });
  assert.equal(later.ok, false, 'restoring the row does not clear the alarm in this process');
});
