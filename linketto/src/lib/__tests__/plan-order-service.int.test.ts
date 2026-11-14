// Интеграционни тестове на поръчките на планове срещу РЕАЛЕН Postgres (FOR
// UPDATE, условни записи, транзакции) с фалшив Revolut и имейл. Пускат се само
// при DATABASE_URL_TEST (мигрирана празна база); без него се пропускат.
//   DATABASE_URL_TEST=postgresql://…/linketto_test npx tsx --test src/lib/__tests__/plan-order-service.int.test.ts
import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createPlanOrderService } from '../plan-order-core';

const DB_URL = process.env.DATABASE_URL_TEST;
const skip = DB_URL ? false : 'DATABASE_URL_TEST не е зададен';
const db = DB_URL ? new PrismaClient({ datasourceUrl: DB_URL }) : (null as unknown as PrismaClient);
const DAY = 86_400_000;

const live = new Map<string, unknown>();
const refunds: { orderId: string; amountCents: number; idempotencyKey: string }[] = [];
let refundImmediate = 'pending';
const sent: { to: string; subject: string }[] = [];
const alerts: string[] = [];
const limited: string[] = [];

const service = createPlanOrderService({
  db,
  revolut: {
    getOrder: async (id) => live.get(id) ?? { state: 'pending' },
    refund: async (input) => {
      refunds.push(input);
      const id = `rf-${randomUUID()}`;
      live.set(id, { id, state: refundImmediate });
      return { id, state: refundImmediate };
    },
  },
  email: {
    configured: () => true,
    send: async (input) => {
      sent.push({ to: input.to, subject: input.subject });
      return true;
    },
  },
  notifyAdmins: async (subject) => {
    alerts.push(subject);
  },
  applyPlanLimits: async (userId) => {
    limited.push(userId);
  },
  siteUrl: 'https://l.example',
  log: () => undefined,
});

const paid = (amount: number) => ({
  state: 'completed',
  amount,
  currency: 'EUR',
  payments: [{ state: 'completed', payment_method: { card_country_code: 'BG' }, billing_address: { country_code: 'BG' } }],
});

async function mkUser(data: { plan?: 'FREE' | 'PRO' | 'BUSINESS' | 'FOUNDER'; planExpiresAt?: Date | null; referredById?: string } = {}) {
  return db.user.create({
    data: {
      email: `${randomUUID()}@int.test`,
      passwordHash: 'x',
      plan: data.plan ?? 'FREE',
      planExpiresAt: data.planExpiresAt ?? null,
      referredById: data.referredById ?? null,
    },
  });
}

async function mkOrder(userId: string, plan: 'PRO' | 'BUSINESS' | 'FOUNDER', interval: string, amountCents: number, liveAmount = amountCents) {
  const revolutOrderId = `rev-${randomUUID()}`;
  live.set(revolutOrderId, paid(liveAmount));
  return db.planOrder.create({
    data: {
      userId,
      plan,
      interval,
      amountCents,
      vatRateBp: 2000,
      vatCents: Math.round((amountCents * 2000) / 12000),
      netCents: amountCents - Math.round((amountCents * 2000) / 12000),
      vatCountry: 'BG',
      revolutOrderId,
    },
  });
}

const reload = (id: string) => db.planOrder.findUniqueOrThrow({ where: { id } });
const userOf = (id: string) => db.user.findUniqueOrThrow({ where: { id } });

beforeEach(async () => {
  if (!DB_URL) return;
  live.clear();
  refunds.length = 0;
  sent.length = 0;
  alerts.length = 0;
  limited.length = 0;
  refundImmediate = 'pending';
  await db.referral.deleteMany({ where: { referrer: { email: { endsWith: '@int.test' } } } });
  await db.planOrder.deleteMany({ where: { user: { email: { endsWith: '@int.test' } } } });
  await db.user.updateMany({ where: { email: { endsWith: '@int.test' } }, data: { referredById: null } });
  await db.user.deleteMany({ where: { email: { endsWith: '@int.test' } } });
});

after(async () => {
  if (DB_URL) await db.$disconnect();
});

test('I1: платена поръчка дава плана веднъж; потвърждението — веднъж', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'quarterly', 1080);
  assert.equal(await service.settlePlanOrder({ id: order.id }), 'completed');
  assert.equal(await service.settlePlanOrder({ id: order.id }), 'noop');
  assert.equal(await service.settlePlanOrder({ revolutOrderId: order.revolutOrderId as string }), 'noop');
  const u = await userOf(user.id);
  assert.equal(u.plan, 'PRO');
  const days = ((u.planExpiresAt as Date).getTime() - Date.now()) / DAY;
  assert.ok(days > 88 && days < 93, `≈3 месеца, получено ${days}`);
  const o = await reload(order.id);
  assert.equal(o.state, 'completed');
  assert.equal(o.applied, true);
  assert.equal(o.prevPlan, 'FREE');
  assert.ok(o.confirmationSentAt);
  assert.equal(sent.length, 1);
  assert.equal(await service.sendPlanConfirmation(order.id), false);
  assert.equal(sent.length, 1);
});

test('I2: несъвпадаща сума → conflict без промяна на плана, аларма', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'quarterly', 1080, 999);
  assert.equal(await service.settlePlanOrder({ id: order.id }), 'conflict');
  assert.equal((await userOf(user.id)).plan, 'FREE');
  const o = await reload(order.id);
  assert.equal(o.state, 'conflict');
  assert.equal(o.applied, false);
  assert.equal(alerts.length, 1);
  assert.equal(sent.length, 0);
});

test('I3: стара висяща PRO поръчка, платена след FOUNDER → conflict, FOUNDER остава', { skip }, async () => {
  const user = await mkUser({ plan: 'FOUNDER' });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: order.id }), 'conflict');
  const u = await userOf(user.id);
  assert.equal(u.plan, 'FOUNDER');
  assert.equal(u.planExpiresAt, null);
});

test('I4: две поръчки, уредени едновременно → и двете удължения (FOR UPDATE)', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  const b = await mkOrder(user.id, 'PRO', 'monthly', 400);
  const results = await Promise.all([service.settlePlanOrder({ id: a.id }), service.settlePlanOrder({ id: b.id })]);
  assert.deepEqual(results.sort(), ['completed', 'completed']);
  const days = (((await userOf(user.id)).planExpiresAt as Date).getTime() - Date.now()) / DAY;
  assert.ok(days > 58 && days < 63, `≈2 месеца, получено ${days}`);
});

test('I5: бонус веднъж; връщането сторнира бонуса и връща предишния план и срок', { skip }, async () => {
  const referrer = await mkUser();
  const before = new Date(Date.now() + 10 * DAY);
  const user = await mkUser({ plan: 'PRO', planExpiresAt: before, referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: order.id }), 'completed');
  assert.equal((await userOf(referrer.id)).referralCreditCents, 60);
  assert.ok(((await userOf(user.id)).planExpiresAt as Date).getTime() > before.getTime() + 27 * DAY);

  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  const pending = await reload(order.id);
  assert.equal(pending.state, 'refund_pending');
  assert.ok(pending.refundOrderId);
  assert.equal(refunds[0].idempotencyKey, `${order.id}-1`);
  assert.equal(refunds[0].amountCents, 400);
  assert.equal(await service.settlePlanRefund({ refundOrderId: pending.refundOrderId as string }), 'pending');

  live.set(pending.refundOrderId as string, { state: 'completed' });
  assert.equal(await service.settlePlanRefund({ refundOrderId: pending.refundOrderId as string }), 'refunded');
  assert.equal(await service.settlePlanRefund({ id: order.id }), 'noop');
  const u = await userOf(user.id);
  assert.equal(u.plan, 'PRO');
  assert.equal((u.planExpiresAt as Date).getTime(), before.getTime());
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
  const referral = await db.referral.findUniqueOrThrow({ where: { planOrderId: order.id } });
  assert.ok(referral.reversedAt);
  assert.deepEqual(limited, [user.id]);
  assert.equal((await reload(order.id)).state, 'refunded');
});

test('I6: по-стара приложена поръчка не се връща преди по-новата', { skip }, async () => {
  const user = await mkUser();
  const older = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: older.id }), 'completed');
  await new Promise((r) => setTimeout(r, 5));
  const newer = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: newer.id }), 'completed');
  assert.equal(await service.requestPlanRefund(older.id), 'newer-first');
  assert.equal(refunds.length, 0);
  assert.equal(await service.requestPlanRefund(newer.id), 'requested');
});

test('I7: нова поръчка, платена докато тече връщане → conflict', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: a.id }), 'completed');
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  const b = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: b.id }), 'conflict');
  assert.equal((await reload(b.id)).applied, false);
});

test('I8: неуспешен refund → поръчката е пак платена, аларма; новият опит е с нов ключ', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  const pending = await reload(a.id);
  live.set(pending.refundOrderId as string, { state: 'failed' });
  assert.equal(await service.settlePlanRefund({ id: a.id }), 'failed');
  const back = await reload(a.id);
  assert.equal(back.state, 'completed');
  assert.equal(back.refundOrderId, null);
  assert.ok(alerts.some((s) => /неуспешно/.test(s)));
  assert.equal((await userOf(user.id)).plan, 'PRO');
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  assert.equal(refunds[1].idempotencyKey, `${a.id}-2`);
});

test('I9: refund, завършил веднага → refunded; FREE отпреди', { skip }, async () => {
  refundImmediate = 'completed';
  const user = await mkUser();
  const a = await mkOrder(user.id, 'BUSINESS', 'annual', 8640);
  await service.settlePlanOrder({ id: a.id });
  assert.equal(await service.requestPlanRefund(a.id), 'refunded');
  const u = await userOf(user.id);
  assert.equal(u.plan, 'FREE');
  assert.equal(u.planExpiresAt, null);
});

test('I10: conflict поръчка се връща без да пипа плана', { skip }, async () => {
  refundImmediate = 'completed';
  const user = await mkUser({ plan: 'FOUNDER' });
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: a.id }), 'conflict');
  assert.equal(await service.requestPlanRefund(a.id), 'refunded');
  assert.equal((await userOf(user.id)).plan, 'FOUNDER');
  assert.deepEqual(limited, []);
});
