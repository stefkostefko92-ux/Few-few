import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, CUSTOMER_PASSWORD, prisma, startApp, stopApp } from './harness.js';
import { customer, sessionCsrf, staff } from './people.js';

before(startApp);
after(stopApp);

interface Export {
  truncated: { logins: boolean; auditLog: boolean };
  logins: Array<{ at: string; ip: string | null }>;
  planHistory: Array<{ to: string; by: string }>;
  auditLog: Array<{ action: string; by: string; ip: string | null }>;
}

async function exportOf(b: Browser): Promise<{ data: Export; text: string }> {
  const reply = await b.post('/account/data/export', {
    _csrf: await sessionCsrf(b, '/account/data'),
  });
  assert.equal(reply.status, 200);
  return { data: JSON.parse(reply.body) as Export, text: reply.body };
}

/** Must match EXPORT_MAX_LOGINS in services/account-export.ts. */
const EXPORT_MAX_LOGINS = 5000;

test('an account with more sign-ins than the export holds gets the newest ones, and is told so', async () => {
  const b = await customer('many-logins@example.test');
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'many-logins@example.test' },
  });
  const oldest = Date.now() - 2 * 86_400_000;
  await prisma.loginEvent.createMany({
    data: Array.from({ length: EXPORT_MAX_LOGINS + 1 }, (_, k) => ({
      userId: user.id,
      outcome: 'BAD_PASSWORD' as const,
      ip: `10.0.${Math.floor(k / 250)}.${k % 250}`,
      createdAt: new Date(oldest + k * 1000),
    })),
  });
  const real = await prisma.loginEvent.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  const { data } = await exportOf(b);
  assert.equal(data.logins.length, EXPORT_MAX_LOGINS);
  assert.equal(data.truncated.logins, true);
  assert.equal(data.truncated.auditLog, false);
  const times = data.logins.map((l) => Date.parse(l.at));
  assert.deepEqual(
    times,
    [...times].sort((x, y) => x - y),
    'in the order of time',
  );
  assert.equal(times.at(-1), real.createdAt.getTime(), 'the newest sign-in is there');
  assert.ok((times[0] ?? 0) > oldest, 'the oldest ones are the ones left out');
  assert.ok(!data.logins.some((l) => l.ip === '10.0.0.0'));
});

test('what the team and the system did shows as „team“ and „system“, without their name, email or IP', async () => {
  const manager = await staff('MANAGER', 'export.manager@example.test');
  const b = await customer('exported-plan@example.test');
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'exported-plan@example.test' },
  });
  const changed = await manager.browser.post(`/admin/accounts/${user.id}/plan`, {
    _csrf: await sessionCsrf(manager.browser, `/admin/accounts/${user.id}`),
    plan: 'LIFETIME',
  });
  assert.equal(changed.status, 302);
  assert.equal(manager.browser.flash(), 'flash.planChanged');
  // someone else tries to sign up with the same address: the system records it
  const stranger = new Browser('203.0.113.77');
  await stranger.register('Някой', 'exported-plan@example.test', CUSTOMER_PASSWORD);

  const { data, text } = await exportOf(b);
  assert.deepEqual(data.planHistory.map((h) => [h.to, h.by]).at(-1), ['LIFETIME', 'team']);
  const byTeam = data.auditLog.find((a) => a.action === 'admin.plan.changed');
  assert.deepEqual([byTeam?.by, byTeam?.ip], ['team', null]);
  const duplicate = data.auditLog.find((a) => a.action === 'account.register.duplicate');
  assert.deepEqual([duplicate?.by, duplicate?.ip], ['system', null]);
  for (const other of ['export.manager@example.test', 'Екип MANAGER', '203.0.113.77'])
    assert.ok(!text.includes(other), `the export carries ${other}`);
});
