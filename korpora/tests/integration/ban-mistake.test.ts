import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Plan } from '@prisma/client';
import { prisma, startApp, stopApp } from './harness.js';
import { customer, sessionCsrf, staff, type StaffMember } from './people.js';

before(startApp);
after(stopApp);

const DAY = 86_400_000;

/**
 * A verified customer on `plan`, banned through the panel and then moved back in time: the ban started
 * `daysAgo` days ago, both on the account and on its row in the ban history.
 */
async function bannedCustomer(
  support: StaffMember,
  email: string,
  plan: Plan,
  expiresInDays: number | null,
  daysAgo = 10,
) {
  await customer(email);
  const { id } = await prisma.user.update({
    where: { email },
    data: {
      plan,
      planExpiresAt: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * DAY),
    },
  });
  const ban = await support.browser.post(`/admin/accounts/${id}/ban`, {
    _csrf: await sessionCsrf(support.browser, `/admin/accounts/${id}`),
    reason: 'Споделен акаунт (раздел „Акаунт“): вход от две фирми в един ден.',
  });
  assert.equal(ban.status, 302);
  assert.equal(support.browser.flash(), 'flash.banned');
  const bannedAt = new Date(Date.now() - daysAgo * DAY);
  await prisma.user.update({ where: { id }, data: { bannedAt } });
  await prisma.accountBan.updateMany({ where: { userId: id }, data: { createdAt: bannedAt } });
  const before = await prisma.user.findUniqueOrThrow({ where: { id } });
  return { id, bannedAt, expiresBefore: before.planExpiresAt };
}

async function unban(member: StaffMember, id: string, form: Record<string, string>) {
  return member.browser.post(`/admin/accounts/${id}/unban`, {
    _csrf: await sessionCsrf(member.browser, `/admin/accounts/${id}`),
    ...form,
  });
}

async function lifted(id: string) {
  const rows = await prisma.accountBan.findMany({ where: { userId: id } });
  assert.equal(rows.length, 1);
  const row = rows[0]!;
  assert.ok(row.liftedAt, 'the ban is lifted');
  return { ...row, liftedAt: row.liftedAt };
}

test('a ban lifted as a mistake extends Premium by exactly the time it lasted, once', async () => {
  const support = await staff('SUPPORT', 'mistake-support@example.test');
  const { id, bannedAt, expiresBefore } = await bannedCustomer(
    support,
    'mistake-premium@example.test',
    'PREMIUM',
    20,
  );
  assert.ok(expiresBefore);
  assert.equal(
    (await unban(support, id, { note: 'Фирмите са една и съща', mistake: 'yes' })).status,
    302,
  );
  assert.equal(support.browser.flash(), 'flash.unbanned');

  const row = await lifted(id);
  assert.equal(row.mistake, true, 'the ban history keeps the mark');
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(user.bannedAt, null);
  assert.equal(user.plan, 'PREMIUM');
  assert.equal(
    user.planExpiresAt!.getTime() - expiresBefore.getTime(),
    row.liftedAt.getTime() - bannedAt.getTime(),
    'the plan moves by the time of the ban, to the millisecond',
  );

  const change = await prisma.planChange.findFirstOrThrow({
    where: { userId: id, note: '@ban-mistake' },
  });
  assert.equal(change.actorId, support.id);
  assert.equal(change.fromPlan, 'PREMIUM');
  assert.equal(change.toPlan, 'PREMIUM');
  assert.equal(change.fromExpiresAt?.getTime(), expiresBefore.getTime());
  assert.equal(change.toExpiresAt?.getTime(), user.planExpiresAt!.getTime());

  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'admin.account.unbanned', targetId: id },
  });
  assert.equal(entry.actorId, support.id);
  assert.deepEqual(entry.detail, {
    mistake: true,
    from: expiresBefore.toISOString(),
    until: user.planExpiresAt!.toISOString(),
  });

  // a second lift (a double click, a stale tab) finds nothing to lift and moves nothing
  assert.equal((await unban(support, id, { mistake: 'yes' })).status, 302);
  assert.equal(support.browser.flash(), 'admin.errors.notBanned');
  const again = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(again.planExpiresAt?.getTime(), user.planExpiresAt!.getTime());
  assert.equal(await prisma.planChange.count({ where: { userId: id, note: '@ban-mistake' } }), 1);

  const page = await support.browser.get(`/admin/accounts/${id}`);
  assert.match(page.body, /блокирането е било грешка/, 'the history shows the mark');
});

test('a trial is extended too; without the mark nothing moves', async () => {
  const support = await staff('SUPPORT', 'mistake-support-trial@example.test');
  const trial = await bannedCustomer(support, 'mistake-trial@example.test', 'TRIAL', 5, 3);
  await unban(support, trial.id, { mistake: 'on' });
  const row = await lifted(trial.id);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: trial.id } });
  assert.equal(
    user.planExpiresAt!.getTime() - trial.expiresBefore!.getTime(),
    row.liftedAt.getTime() - trial.bannedAt.getTime(),
  );

  const plain = await bannedCustomer(support, 'mistake-none@example.test', 'PREMIUM', 20);
  await unban(support, plain.id, { note: 'Предупреждението е изпълнено' });
  assert.equal((await lifted(plain.id)).mistake, false);
  const kept = await prisma.user.findUniqueOrThrow({ where: { id: plain.id } });
  assert.equal(kept.planExpiresAt?.getTime(), plain.expiresBefore!.getTime(), 'no extension');
  assert.equal(
    await prisma.planChange.count({ where: { userId: plain.id, note: '@ban-mistake' } }),
    0,
  );
  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'admin.account.unbanned', targetId: plain.id },
  });
  assert.deepEqual(entry.detail, { mistake: false });
});

test('a plan that had ended before the ban gets nothing back; Lifetime keeps only the mark', async () => {
  const support = await staff('SUPPORT', 'mistake-support-ended@example.test');
  // Premium ran out 2 days before a ban of 5 days: no paid time was lost
  const ended = await bannedCustomer(support, 'mistake-ended@example.test', 'PREMIUM', -7, 5);
  await unban(support, ended.id, { mistake: 'yes' });
  assert.equal((await lifted(ended.id)).mistake, true);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ended.id } });
  assert.equal(user.planExpiresAt?.getTime(), ended.expiresBefore!.getTime());
  assert.equal(
    await prisma.planChange.count({ where: { userId: ended.id, note: '@ban-mistake' } }),
    0,
  );

  // Lifetime has no end date: the mark on the ban row is what extends its first months
  const life = await bannedCustomer(support, 'mistake-lifetime@example.test', 'LIFETIME', null);
  await unban(support, life.id, { mistake: 'yes' });
  assert.equal((await lifted(life.id)).mistake, true);
  const kept = await prisma.user.findUniqueOrThrow({ where: { id: life.id } });
  assert.equal(kept.plan, 'LIFETIME');
  assert.equal(kept.planExpiresAt, null);
  assert.equal(
    await prisma.planChange.count({ where: { userId: life.id, note: '@ban-mistake' } }),
    0,
  );
  const entry = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'admin.account.unbanned', targetId: life.id },
  });
  assert.deepEqual(entry.detail, { mistake: true });
});

test('two lifts sent at the same moment extend the plan once', async () => {
  const { unbanAccount } = await import('../../src/services/admin-security.js');
  const support = await staff('SUPPORT', 'mistake-support-twin@example.test');
  const { id, expiresBefore } = await bannedCustomer(
    support,
    'mistake-twin@example.test',
    'PREMIUM',
    20,
  );
  const results = await Promise.all(
    [1, 2].map(() => unbanAccount(support.actor, id, { note: '', mistake: true })),
  );
  assert.deepEqual(results.map((r) => (r.ok ? 'lifted' : r.key)).sort(), [
    'admin.errors.notBanned',
    'lifted',
  ]);
  const row = await lifted(id);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.equal(
    user.planExpiresAt!.getTime() - expiresBefore!.getTime(),
    row.liftedAt.getTime() - row.createdAt.getTime(),
  );
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'admin.account.unbanned', targetId: id } }),
    1,
  );
});

test('the mark is checked like every other field, and only the ban capability may lift', async () => {
  const { unbanAccount } = await import('../../src/services/admin-security.js');
  const support = await staff('SUPPORT', 'mistake-support-input@example.test');
  const viewer = await staff('VIEWER', 'mistake-viewer@example.test');
  const { id, expiresBefore } = await bannedCustomer(
    support,
    'mistake-input@example.test',
    'PREMIUM',
    20,
  );
  const wrong = await unbanAccount(support.actor, id, { note: '', mistake: 'yes' });
  assert.equal(wrong.ok ? 'lifted' : wrong.key, 'admin.errors.input');
  assert.equal((await unban(viewer, id, { mistake: 'yes' })).status, 403);
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  assert.ok(user.bannedAt, 'still banned');
  assert.equal(user.planExpiresAt?.getTime(), expiresBefore!.getTime());
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'admin.account.unbanned', targetId: id } }),
    0,
  );
});

test('the order form says, next to the button, that a block for a breach keeps the payment', async () => {
  const b = await customer('mistake-order-form@example.test');
  const page = await b.get('/account/plan');
  assert.equal(page.status, 200);
  const accept = /<p class="order-accept">([\s\S]*?)<\/p>/.exec(page.body)?.[1] ?? '';
  assert.match(accept, /платеното за плана — Premium или Lifetime — не се връща/);
  assert.match(
    accept,
    /<a href="\/terms#blocking" target="_blank" rel="noopener">раздел „Блокиране“<\/a>/,
  );
  const terms = await b.get('/terms');
  assert.equal(terms.status, 200);
  assert.ok(terms.body.includes('<h2 id="blocking">Блокиране</h2>'), 'the anchor exists');
});
