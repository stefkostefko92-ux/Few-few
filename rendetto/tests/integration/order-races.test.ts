import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customer,
  mailTo,
  placeOrder,
  prisma,
  sessionCsrf,
  staff,
  startApp,
  stopApp,
  type Browser,
} from './harness.js';

before(startApp);
after(stopApp);

const { changePlan } = await import('../../src/services/admin-plan.js');
const STAFF_INBOX = 'info@carbonstealth.eu';

async function manager(email: string) {
  const { id } = await staff('MANAGER', email);
  return { type: 'HUMAN' as const, id, label: 'Екип MANAGER', role: 'MANAGER' as const };
}

async function withdraw(c: Browser, orderId: string) {
  return c.post(`/account/plan/withdraw/${orderId}`, {
    _csrf: await sessionCsrf(c, `/account/plan/withdraw/${orderId}`),
  });
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
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await withdraw(c, a.id)).status, 302);
  release();
  await holder;
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
  const notice = await mailTo(STAFF_INBOX, /Отказ от договора в Rendetto: chain@example\.test/);
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
  assert.equal(
    await prisma.upgradeRequest.count({ where: { user: { email: 'many@example.test' } } }),
    5,
  );
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
