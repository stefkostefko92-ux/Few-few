import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Browser,
  CUSTOMER_PASSWORD,
  expectedCountry,
  mailTo,
  prisma,
  startApp,
  stopApp,
} from './harness.js';
import { customer, sessionCsrf, staff } from './people.js';

before(startApp);
after(stopApp);

async function idOf(email: string): Promise<string> {
  return (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
}

test('the admin sees IP, country and — with consent — HWID of every sign-in', async () => {
  const admin = await staff('ADMIN', 'admin1@example.test');
  await customer('seen@example.test', undefined, '8.8.8.8', true);
  const page = await admin.browser.get(`/admin/accounts/${await idOf('seen@example.test')}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /8\.8\.8\.8/);
  if (expectedCountry()) assert.match(page.body, /Съединени щати/);
  assert.match(page.body, /HW-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/);
  const list = await admin.browser.get('/admin/accounts?q=8.8.8.8');
  assert.match(list.body, /seen@example\.test/, 'search by IP');
});

test('ban with a reason: sessions end, the reason shows only with the right password; unban restores access', async () => {
  const admin = await staff('SUPPORT', 'support1@example.test');
  const victim = await customer('banned@example.test');
  const id = await idOf('banned@example.test');
  const csrf = await sessionCsrf(admin.browser, `/admin/accounts/${id}`);
  const ban = await admin.browser.post(`/admin/accounts/${id}/ban`, {
    _csrf: csrf,
    reason: 'Повторни тестови периоди.',
  });
  assert.equal(ban.status, 302);
  assert.equal((await victim.get('/app')).status, 302, 'the banned session is gone');

  const wrong = await new Browser().login('banned@example.test', 'Wrong-Password-000');
  assert.equal(wrong.status, 401);
  assert.doesNotMatch(
    wrong.body,
    /Повторни тестови периоди/,
    'no reason without the right password',
  );
  const right = await new Browser().login('banned@example.test', CUSTOMER_PASSWORD);
  assert.equal(right.status, 403);
  assert.match(right.body, /Достъпът е спрян/);
  assert.match(right.body, /Повторни тестови периоди\./);

  const unban = await admin.browser.post(`/admin/accounts/${id}/unban`, {
    _csrf: csrf,
    note: 'обжалвано',
  });
  assert.equal(unban.status, 302);
  assert.equal((await new Browser().login('banned@example.test', CUSTOMER_PASSWORD)).status, 302);
  const bans = await prisma.accountBan.findMany({ where: { userId: id } });
  assert.equal(bans.length, 1);
  assert.ok(bans[0]?.liftedAt);
});

test('a ban needs a real reason: a one-letter one bans nobody', async () => {
  const support = await staff('SUPPORT', 'support.reason@example.test');
  await customer('reason@example.test');
  const id = await idOf('reason@example.test');
  const csrf = await sessionCsrf(support.browser, `/admin/accounts/${id}`);
  const ban = (reason: string) =>
    support.browser.post(`/admin/accounts/${id}/ban`, { _csrf: csrf, reason });
  assert.equal((await ban('x')).status, 302);
  assert.equal(support.browser.flash(), 'admin.errors.banReason');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id } })).bannedAt, null);
  assert.equal(await prisma.accountBan.count({ where: { userId: id } }), 0);
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'admin.account.banned', targetId: id } }),
    0,
  );
  await ban('Споделен акаунт с друга фирма.');
  assert.equal(support.browser.flash(), 'flash.banned');
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id } })).bannedAt);
});

test('plan changes: Premium by months after the running trial, Lifetime, Trial days; history and email', async () => {
  const manager = await staff('MANAGER', 'manager1@example.test');
  await customer('plan@example.test');
  const id = await idOf('plan@example.test');
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  const csrf = await sessionCsrf(manager.browser, `/admin/accounts/${id}`);

  await manager.browser.post(`/admin/accounts/${id}/plan`, {
    _csrf: csrf,
    plan: 'PREMIUM',
    mode: 'months',
    months: '12',
    notify: 'yes',
  });
  let user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.plan, 'PREMIUM');
  const expected = new Date(before.planExpiresAt!.getTime());
  expected.setUTCMonth(expected.getUTCMonth() + 12);
  assert.ok(
    Math.abs(user.planExpiresAt!.getTime() - expected.getTime()) < 2 * 86_400_000,
    'months start after the trial',
  );
  assert.match((await mailTo('plan@example.test', /Планът ви/)).text, /Premium/);

  await manager.browser.post(`/admin/accounts/${id}/plan`, { _csrf: csrf, plan: 'LIFETIME' });
  user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.deepEqual([user.plan, user.planExpiresAt], ['LIFETIME', null]);

  await manager.browser.post(`/admin/accounts/${id}/plan`, {
    _csrf: csrf,
    plan: 'TRIAL',
    days: '7',
  });
  user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.plan, 'TRIAL');
  assert.ok(Math.abs(user.planExpiresAt!.getTime() - Date.now() - 7 * 86_400_000) < 60_000);

  const history = await prisma.planChange.findMany({
    where: { userId: id },
    orderBy: { createdAt: 'asc' },
  });
  // registration, trial start at the confirmation, then the three changes
  assert.deepEqual(
    history.map((h) => h.toPlan),
    ['TRIAL', 'TRIAL', 'PREMIUM', 'LIFETIME', 'TRIAL'],
  );
  assert.equal(history[2]?.listPriceCents, 24000);
  const audit = await prisma.auditLog.count({
    where: { action: 'admin.plan.changed', targetId: id },
  });
  assert.equal(audit, 3);
});

test('a plan request is priced on the server and closed when the plan is activated', async () => {
  const manager = await staff('MANAGER', 'manager2@example.test');
  const c = await customer('request@example.test');
  const csrf = await sessionCsrf(c, '/account/plan');
  await c.post('/account/plan/request', {
    _csrf: csrf,
    option: 'm6',
    buyer: 'business',
    message: 'Фирма ЕООД',
    price: '1',
  });
  const request = await prisma.upgradeRequest.findFirstOrThrow({
    where: { user: { email: 'request@example.test' } },
  });
  assert.deepEqual([request.status, request.listPriceCents, request.months], ['OPEN', 13500, 6]);
  const id = await idOf('request@example.test');
  const adminCsrf = await sessionCsrf(
    manager.browser,
    `/admin/accounts/${id}?request=${request.id}`,
  );
  await manager.browser.post(`/admin/accounts/${id}/plan`, {
    _csrf: adminCsrf,
    plan: 'PREMIUM',
    mode: 'months',
    months: '6',
    requestId: request.id,
  });
  assert.equal(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: request.id } })).status,
    'DONE',
  );
});
