import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mailTo, prisma, STAFF_INBOX, startApp, stopApp } from './harness.js';
import { placeOrder, sessionCsrf, staff, withdraw } from './people.js';

before(startApp);
after(stopApp);

const { changePlan } = await import('../../src/services/admin-plan.js');
const DAY = 86_400_000;

test('withdrawal: a button, a confirmation step, the plan goes back, and a receipt with the date and time', async () => {
  const manager = await staff('MANAGER', 'orders.manager2@example.test');
  const { c, row } = await placeOrder('withdraw@example.test', {
    option: 'm1',
    buyer: 'consumer',
    early: 'yes',
  });
  assert.ok(row.earlyStartRequestedAt);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
  const csrf = await sessionCsrf(
    manager.browser,
    `/admin/accounts/${row.userId}?request=${row.id}`,
  );
  await manager.browser.post(`/admin/accounts/${row.userId}/plan`, {
    _csrf: csrf,
    plan: 'PREMIUM',
    mode: 'months',
    months: '1',
    requestId: row.id,
  });
  const activated = await prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
  assert.equal(activated.plan, 'PREMIUM', 'early start: activated at once');

  const list = await c.get('/account/plan');
  assert.match(
    list.body,
    new RegExp(`href="/account/plan/withdraw/${row.id}">Откажете се от договора тук</a>`),
  );
  const page = await c.get(`/account/plan/withdraw/${row.id}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /С настоящото уведомявам, че се отказвам/);
  assert.match(page.body, />Потвърждавам отказа<\/button>/);
  const done = await withdraw(c, row.id);
  assert.equal(done.status, 302);

  const closed = await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(closed.status, 'WITHDRAWN');
  assert.ok(closed.withdrawnAt && closed.withdrawalAckSentAt);
  const after = await prisma.user.findUniqueOrThrow({ where: { id: row.userId } });
  assert.deepEqual(
    [after.plan, after.planExpiresAt?.getTime()],
    [before.plan, before.planExpiresAt?.getTime()],
    'the plan is back to what it was before the order',
  );
  const receipt = await mailTo('withdraw@example.test', /Получихме отказа ви/);
  assert.match(receipt.text, /подадено на \d+ \S+ \d{4} г\. в \d{1,2}:\d{2} \(UTC\+0[23]:00\)/);
  assert.match(receipt.text, new RegExp(`поръчка № ${row.id}`));
  assert.match(receipt.text, /Планът ви е върнат такъв, какъвто беше преди поръчката\./);
  assert.match(receipt.text, /задържаме частта от цената/);
  const notice = await mailTo(STAFF_INBOX, /Отказ от договора в Korpora: withdraw@example\.test/);
  assert.match(notice.text, /Планът е върнат автоматично/);

  const again = await c.post(`/account/plan/withdraw/${row.id}`, {
    _csrf: await sessionCsrf(c, '/account/plan'),
  });
  assert.equal(again.status, 302);
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'plan.request.withdrawn', targetId: row.id } }),
    1,
  );
});

test('activation after a withdrawal is refused; a plan changed since activation is left to the team', async () => {
  const { actor } = await staff('MANAGER', 'orders.manager3@example.test');
  const { c, row } = await placeOrder('race@example.test', { option: 'm3', buyer: 'consumer' });
  await withdraw(c, row.id);
  const refused = await changePlan(
    actor,
    row.userId,
    { plan: 'PREMIUM', mode: 'months', months: 3, notify: false, requestId: row.id },
    new Date(row.createdAt.getTime() + 25 * DAY),
  );
  assert.deepEqual(refused, { ok: false, key: 'admin.errors.requestGone' });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: row.userId } })).plan, 'TRIAL');

  const { c: c2, row: second } = await placeOrder('manual@example.test', {
    option: 'm1',
    buyer: 'consumer',
    early: 'yes',
  });
  assert.deepEqual(
    await changePlan(actor, second.userId, {
      plan: 'PREMIUM',
      mode: 'months',
      months: 1,
      notify: false,
      requestId: second.id,
    }),
    { ok: true },
  );
  assert.deepEqual(
    await changePlan(actor, second.userId, { plan: 'TRIAL', days: 5, notify: false }),
    { ok: true },
  );
  await withdraw(c2, second.id);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: second.userId } });
  assert.equal(user.plan, 'TRIAL', 'the later change by the team stays');
  const notice = await mailTo(STAFF_INBOX, /Отказ от договора в Korpora: manual@example\.test/);
  assert.match(notice.text, /Планът НЕ е върнат автоматично/);
});

test('after the period there is no withdrawal button; an unpaid order can still be cancelled', async () => {
  const { c, row } = await placeOrder('late@example.test', { option: 'm6', buyer: 'consumer' });
  await prisma.upgradeRequest.update({
    where: { id: row.id },
    data: { createdAt: new Date(Date.now() - 20 * DAY) },
  });
  const page = await c.get('/account/plan');
  assert.doesNotMatch(page.body, /Откажете се от договора тук<\/a>/);
  assert.equal((await c.get(`/account/plan/withdraw/${row.id}`)).status, 302);
  const csrf = await sessionCsrf(c, '/account/plan');
  await c.post(`/account/plan/withdraw/${row.id}`, { _csrf: csrf });
  assert.equal(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } })).status,
    'OPEN',
  );
  await c.post(`/account/plan/request/${row.id}/cancel`, { _csrf: csrf });
  assert.equal(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } })).status,
    'CANCELLED',
  );
});

test('a request from before the orders is no contract under these rules; a plan changed by hand is left to the team', async () => {
  const { actor } = await staff('MANAGER', 'orders.manager4@example.test');
  const { c, row } = await placeOrder('legacy@example.test', { option: 'm1', buyer: 'consumer' });
  await prisma.upgradeRequest.update({ where: { id: row.id }, data: { termsVersion: null } });
  assert.doesNotMatch((await c.get('/account/plan')).body, /Откажете се от договора тук<\/a>/);
  assert.deepEqual(
    await changePlan(actor, row.userId, {
      plan: 'PREMIUM',
      mode: 'months',
      months: 1,
      notify: false,
      requestId: row.id,
    }),
    { ok: true },
    'activated without waiting for a withdrawal period it never had',
  );

  const { c: c2, row: second } = await placeOrder('byhand@example.test', {
    option: 'm1',
    buyer: 'consumer',
    early: 'yes',
  });
  // a paid plan by hand waits for the open order (business:A1); trial days by hand do not
  assert.deepEqual(
    await changePlan(actor, second.userId, { plan: 'TRIAL', days: 5, notify: false }),
    { ok: true },
  );
  await withdraw(c2, second.id);
  const notice = await mailTo(STAFF_INBOX, /Отказ от договора в Korpora: byhand@example\.test/);
  assert.match(notice.text, /Планът НЕ е върнат автоматично/);
});

test('another customer can neither withdraw from nor cancel someone else’s order', async () => {
  const { actor } = await staff('MANAGER', 'orders.manager5@example.test');
  const { row: paid } = await placeOrder('victim-order@example.test', {
    option: 'm1',
    buyer: 'consumer',
    early: 'yes',
  });
  assert.deepEqual(
    await changePlan(actor, paid.userId, {
      plan: 'PREMIUM',
      mode: 'months',
      months: 1,
      notify: false,
      requestId: paid.id,
    }),
    { ok: true },
  );
  const firm = await placeOrder('victim-firm@example.test', { option: 'm3', buyer: 'business' });
  const before = await prisma.user.findUniqueOrThrow({ where: { id: paid.userId } });
  const { c: other } = await placeOrder('other-customer@example.test', {
    option: 'm1',
    buyer: 'consumer',
  });

  const page = await other.get(`/account/plan/withdraw/${paid.id}`);
  assert.equal(page.status, 302);
  assert.equal(other.flash(), 'plan.withdraw.unavailable');
  assert.doesNotMatch(page.body, /victim-order@example\.test/);
  const csrf = await sessionCsrf(other, '/account/plan');
  const tried = await other.post(`/account/plan/withdraw/${paid.id}`, { _csrf: csrf });
  assert.equal(tried.status, 302);
  assert.equal(other.flash(), 'plan.withdraw.unavailable');
  const cancel = await other.post(`/account/plan/request/${firm.row.id}/cancel`, { _csrf: csrf });
  assert.equal(cancel.status, 302);
  assert.equal(other.flash(), 'error.notFoundText');

  assert.equal(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: paid.id } })).status,
    'DONE',
  );
  assert.equal(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: firm.row.id } })).status,
    'OPEN',
  );
  const after = await prisma.user.findUniqueOrThrow({ where: { id: paid.userId } });
  assert.deepEqual(
    [after.plan, after.planExpiresAt?.getTime()],
    [before.plan, before.planExpiresAt?.getTime()],
    'the paid plan stays',
  );
  assert.equal(
    await prisma.auditLog.count({
      where: {
        action: { in: ['plan.request.withdrawn', 'plan.request.cancelled'] },
        targetId: { in: [paid.id, firm.row.id] },
      },
    }),
    0,
  );
  await assert.rejects(mailTo('victim-order@example.test', /Получихме отказа ви/, 300));
});
