import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser, CUSTOMER_PASSWORD, prisma, startApp, stopApp } from './harness.js';
import { customer, placeOrder, sessionCsrf, staff } from './people.js';

before(startApp);
after(stopApp);

const DAY = 86_400_000;

/** An open order written straight to the base — for team members, who cannot order through the form. */
async function openOrderOf(userId: string): Promise<string> {
  const order = await prisma.upgradeRequest.create({
    data: { userId, option: 'm1', months: 1, listPriceCents: 2500, termsVersion: '2026-10-03' },
  });
  return order.id;
}

test('a manager rejects a customer’s order, but not one of a higher rank or their own', async () => {
  const manager = await staff('MANAGER', 'reject.manager@example.test');
  const admin = await staff('ADMIN', 'reject.admin@example.test');
  const { row } = await placeOrder('reject-me@example.test', { option: 'm1', buyer: 'business' });
  const cases = [
    [await openOrderOf(admin.id), 'admin.errors.rank'],
    [await openOrderOf(manager.id), 'admin.errors.self'],
    [row.id, 'flash.requestRejected'],
  ] as const;
  const csrf = await sessionCsrf(manager.browser, '/admin/requests');
  for (const [id, key] of cases) {
    const reply = await manager.browser.post(`/admin/requests/${id}/reject`, { _csrf: csrf });
    assert.equal(reply.status, 302, key);
    assert.equal(reply.location, '/admin/requests');
    assert.equal(manager.browser.flash(), key);
  }
  const statuses = await prisma.upgradeRequest.findMany({
    where: { id: { in: cases.map(([id]) => id) } },
    select: { id: true, status: true },
  });
  assert.deepEqual(
    cases.map(([id]) => statuses.find((s) => s.id === id)?.status),
    ['OPEN', 'OPEN', 'REJECTED'],
  );
  assert.equal(await prisma.auditLog.count({ where: { action: 'admin.request.rejected' } }), 1);
  const support = await staff('SUPPORT', 'reject.support@example.test');
  const refused = await support.browser.post(`/admin/requests/${cases[0][0]}/reject`, {
    _csrf: await sessionCsrf(support.browser, '/admin'),
  });
  assert.equal(refused.status, 403, 'support has no right to handle orders');
});

test('the audit page takes only a real page cursor: anything else shows the first page', async () => {
  const analyst = await staff('ANALYST', 'audit.analyst@example.test');
  const newest = await prisma.auditLog.findFirstOrThrow({ orderBy: { id: 'desc' } });
  const firstRow = (body: string) =>
    /<td data-label="#" class="num mono-sm">(\d+)<\/td>/.exec(body);
  for (const before of ['99999999999', '2147483648', '-5', '0', 'abc']) {
    const page = await analyst.browser.get(`/admin/audit?before=${before}`);
    assert.equal(page.status, 200, before);
    assert.ok(Number(firstRow(page.body)?.[1]) >= newest.id, `${before}: the first page`);
  }
  const older = await analyst.browser.get(`/admin/audit?before=${newest.id}`);
  assert.equal(older.status, 200);
  assert.ok(Number(firstRow(older.body)?.[1]) < newest.id, 'a real cursor pages back');
});

test('every card of the dashboard counts exactly the accounts its link lists', async () => {
  const owner = await staff('OWNER', 'dash.owner@example.test');
  const accounts = {
    active: 'dash-active@example.test',
    expired: 'dash-expired@example.test',
    banned: 'dash-banned@example.test',
    premium: 'dash-premium@example.test',
    premiumOld: 'dash-premium-old@example.test',
  };
  for (const email of Object.values(accounts)) await customer(email);
  await new Browser().register('Непотвърден', 'dash-unverified@example.test', CUSTOMER_PASSWORD);
  const past = new Date(Date.now() - DAY);
  const future = new Date(Date.now() + 30 * DAY);
  await prisma.user.update({
    where: { email: accounts.expired },
    data: { planExpiresAt: past },
  });
  await prisma.user.update({
    where: { email: accounts.banned },
    data: { bannedAt: new Date(), banReason: 'тест' },
  });
  await prisma.user.update({
    where: { email: accounts.premium },
    data: { plan: 'PREMIUM', planExpiresAt: future },
  });
  await prisma.user.update({
    where: { email: accounts.premiumOld },
    data: { plan: 'PREMIUM', planExpiresAt: past },
  });

  const dashboard = await owner.browser.get('/admin');
  assert.equal(dashboard.status, 200);
  const cards = [
    ...dashboard.body.matchAll(
      /<a class="stat" href="(\/admin\/accounts\?[^"]+)"><span class="stat-v">([\d\s ]+)<\/span>/g,
    ),
  ];
  assert.equal(cards.length, 7, 'the plan and status cards');
  for (const [, href = '', shown = ''] of cards) {
    const value = Number(shown.replace(/\D/g, ''));
    assert.ok(value >= 1, `${href}: the test made at least one such account`);
    const list = await owner.browser.get(href.replaceAll('&amp;', '&'));
    const total = /<p class="muted">(\d+) акаунт/.exec(list.body)?.[1];
    assert.equal(Number(total), value, href);
  }
});
