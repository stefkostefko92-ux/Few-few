import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mailTo, prisma, STAFF_INBOX, startApp, stopApp } from './harness.js';
import { customer, placeOrder, sessionCsrf, staff, withdraw } from './people.js';

before(startApp);
after(stopApp);

const { changePlan } = await import('../../src/services/admin-plan.js');

async function manager(email: string) {
  return (await staff('MANAGER', email)).actor;
}

/** Waits until a session of this database waits for a row lock: the activation has reached it. */
async function someoneWaitsForALock(timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    const [row] = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    if ((row?.n ?? 0) > 0) return;
    if (Date.now() - start > timeoutMs) throw new Error('the activation never waited for the lock');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('activation reads the plan under the lock: a withdrawal of another order in between is not undone', async () => {
  const actor = await manager('race.manager@example.test');
  const { c, row: a } = await placeOrder('race2@example.test', {
    option: 'm12',
    buyer: 'consumer',
    early: 'yes',
  });
  const trial = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
  assert.deepEqual(
    await changePlan(actor, a.userId, {
      plan: 'PREMIUM',
      mode: 'months',
      months: 12,
      notify: false,
      requestId: a.id,
    }),
    { ok: true },
  );
  await c.post('/account/plan/request', {
    _csrf: await sessionCsrf(c, '/account/plan'),
    option: 'lifetime',
    buyer: 'consumer',
    early: 'yes',
  });
  const b = await prisma.upgradeRequest.findFirstOrThrow({
    where: { userId: a.userId, option: 'lifetime' },
  });

  // поръчка Б е задържана: активирането чака точно там, докато влезе отказът от А
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  let taken = (): void => undefined;
  const isTaken = new Promise<void>((resolve) => (taken = resolve));
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "UpgradeRequest" WHERE "id" = ${b.id} FOR UPDATE`;
      taken();
      await held;
    },
    { timeout: 30_000 },
  );
  await isTaken;
  const activating = changePlan(actor, a.userId, {
    plan: 'LIFETIME',
    notify: false,
    requestId: b.id,
  });
  // awaited below; a failed step before that must not leave it as an unhandled rejection
  activating.catch(() => undefined);
  try {
    // the state, not a fixed pause: the withdrawal goes in only while the activation waits on B
    await someoneWaitsForALock();
    assert.equal((await withdraw(c, a.id)).status, 302);
  } finally {
    release();
    await holder;
  }
  assert.deepEqual(await activating, { ok: true });

  const change = await prisma.planChange.findFirstOrThrow({ where: { requestId: b.id } });
  assert.deepEqual(
    [change.fromPlan, change.fromExpiresAt?.getTime()],
    [trial.plan, trial.planExpiresAt?.getTime()],
    'Lifetime starts from the plan as it is after A was withdrawn',
  );
  await withdraw(c, b.id);
  const end = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
  assert.deepEqual(
    [end.plan, end.planExpiresAt?.getTime()],
    [trial.plan, trial.planExpiresAt?.getTime()],
    'two withdrawals leave no plan that nobody paid for',
  );
});

test('two activated orders withdrawn in a row: neither plan is handed back automatically', async () => {
  const actor = await manager('chain.manager@example.test');
  const { c, row: a } = await placeOrder('chain@example.test', {
    option: 'm12',
    buyer: 'consumer',
    early: 'yes',
  });
  await changePlan(actor, a.userId, {
    plan: 'PREMIUM',
    mode: 'months',
    months: 12,
    notify: false,
    requestId: a.id,
  });
  await c.post('/account/plan/request', {
    _csrf: await sessionCsrf(c, '/account/plan'),
    option: 'm1',
    buyer: 'consumer',
    early: 'yes',
  });
  const b = await prisma.upgradeRequest.findFirstOrThrow({
    where: { userId: a.userId, option: 'm1' },
  });
  await changePlan(actor, a.userId, {
    plan: 'PREMIUM',
    mode: 'months',
    months: 1,
    notify: false,
    requestId: b.id,
  });
  const paid = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
  await withdraw(c, a.id);
  await withdraw(c, b.id);
  const end = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
  assert.deepEqual(
    [end.plan, end.planExpiresAt?.getTime()],
    [paid.plan, paid.planExpiresAt?.getTime()],
    'left for the team, not reverted to a state paid by the first order',
  );
  const notice = await mailTo(STAFF_INBOX, /Отказ от договора в Korpora: chain@example\.test/);
  assert.match(notice.text, /Планът НЕ е върнат автоматично/);
});

test('at most five orders a day per account, since each one sends two emails', async () => {
  const c = await customer('many@example.test');
  for (let k = 0; k < 6; k++) {
    await c.post('/account/plan/request', {
      _csrf: await sessionCsrf(c, '/account/plan'),
      option: 'm1',
      buyer: 'business',
    });
  }
  assert.equal(c.flash(), 'plan.errors.tooMany');
  assert.equal(
    await prisma.upgradeRequest.count({ where: { user: { email: 'many@example.test' } } }),
    5,
  );
});

test('orders sent at the same moment keep the daily cap and leave one open order', async () => {
  const c = await customer('burst@example.test');
  const csrf = await sessionCsrf(c, '/account/plan');
  const replies = await Promise.all(
    Array.from({ length: 10 }, () =>
      c.post('/account/plan/request', { _csrf: csrf, option: 'm1', buyer: 'business' }),
    ),
  );
  assert.ok(replies.every((r) => r.status === 302));
  const orders = await prisma.upgradeRequest.findMany({
    where: { user: { email: 'burst@example.test' } },
  });
  assert.equal(orders.length, 5, 'the cap holds under parallel requests');
  assert.equal(orders.filter((o) => o.status === 'OPEN').length, 1, 'one unfulfilled order');
  assert.ok(orders.every((o) => o.status === 'OPEN' || o.status === 'CANCELLED'));
});

test('a team note cannot pose as a system label', async () => {
  const actor = await manager('note.manager@example.test');
  await customer('noted@example.test');
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'noted@example.test' } });
  assert.deepEqual(
    await changePlan(actor, user.id, {
      plan: 'TRIAL',
      days: 5,
      notify: false,
      note: '@withdrawal',
    }),
    { ok: true },
  );
  const change = await prisma.planChange.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  assert.equal(change.note, 'withdrawal');
});
