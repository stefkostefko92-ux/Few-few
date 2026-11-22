// Интеграционни тестове на поръчките на планове срещу РЕАЛЕН Postgres (FOR
// UPDATE, условни записи, транзакции) с фалшив Revolut и имейл. Пускат се само
// при DATABASE_URL_TEST (мигрирана празна база); без него се пропускат.
//   DATABASE_URL_TEST=postgresql://…/linketto_test npx tsx --test src/lib/__tests__/plan-order-service.int.test.ts
import { after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createPlanOrderService } from '../plan-order-core';

const DB_URL = process.env.DATABASE_URL_TEST;
const skip = DB_URL ? false : 'DATABASE_URL_TEST не е зададен';
const db = DB_URL ? new PrismaClient({ datasourceUrl: DB_URL }) : (null as unknown as PrismaClient);
const DAY = 86_400_000;
// Примерите от merchant.yaml (2026-09-22): Res-Refund-Declined/Failed, Res-Dispute-Card.
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8'));

const live = new Map<string, unknown>();
const disputes = new Map<string, unknown>();
const refunds: { orderId: string; amountCents: number; idempotencyKey: string }[] = [];
let refundImmediate = 'pending';
// Отговорът на POST /refund с код 2xx (по подразбиране — поръчка с refundImmediate).
let refundResponse: ((id: string) => unknown) | null = null;
// Кука на живото четене (GET /api/orders/{id}): стойност/обещание или null = от `live`.
let getOrderHook: ((id: string) => Promise<unknown> | null) | null = null;
const sent: { to: string; subject: string }[] = [];
const alerts: string[] = [];
const alertLines: string[][] = [];
// Тръгнало ли е поне едно писмо до админите (false = Brevo не прие / няма ADMIN_EMAILS).
let notifyOk = true;
const limited: string[] = [];

/** Грешка от клиента на Revolut с HTTP статус (като revolut.ts). */
const httpError = (status: number) => Object.assign(new Error(`revolut GET /api/disputes: ${status}`), { status });

const service = createPlanOrderService({
  db,
  revolut: {
    getOrder: async (id) => {
      const hooked = getOrderHook?.(id);
      if (hooked) return hooked;
      return live.get(id) ?? { state: 'pending' };
    },
    refund: async (input) => {
      refunds.push(input);
      const id = `rf-${randomUUID()}`;
      // Като Order-v7 при Revolut: refund поръчка със сумата и валутата (сверката е fail closed).
      const body = refundResponse ? refundResponse(id) : { id, state: refundImmediate, type: 'refund', amount: input.amountCents, currency: 'EUR' };
      // Тестът може сам да зададе живата refund поръчка (различна от краткия отговор на POST).
      if (!live.has(id)) live.set(id, body);
      return body as { id: string; state: string };
    },
    getDispute: async (id: string) => {
      const value = disputes.get(id);
      if (value instanceof Error) throw value;
      if (value === undefined) throw httpError(404);
      return value;
    },
  },
  email: {
    configured: () => true,
    send: async (input) => {
      sent.push({ to: input.to, subject: input.subject });
      return true;
    },
  },
  notifyAdmins: async (subject, lines) => {
    alerts.push(subject);
    alertLines.push(lines);
    return notifyOk;
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
  disputes.clear();
  refunds.length = 0;
  sent.length = 0;
  alerts.length = 0;
  alertLines.length = 0;
  limited.length = 0;
  refundImmediate = 'pending';
  refundResponse = null;
  getOrderHook = null;
  notifyOk = true;
  await db.revolutDispute.deleteMany({ where: { disputeId: { startsWith: 'dsp-int-' } } });
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

test('I4: уреждането чака заключения ред на потребителя (FOR UPDATE) и после го вижда', { skip }, async () => {
  // Детерминистично: външна транзакция държи реда; без FOR UPDATE в ядрото
  // уреждането НЕ чака и проверката „още pending“ пада.
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let locked!: () => void;
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const holder = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      // Докато държим реда, „друг процес“ сменя плана — уреждането трябва да го види.
      await tx.user.update({ where: { id: user.id }, data: { plan: 'FOUNDER' } });
      locked();
      await gate;
    },
    { timeout: 20_000 },
  );
  await isLocked;
  const settling = service.settlePlanOrder({ id: a.id });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal((await reload(a.id)).state, 'pending', 'уреждането трябва да чака заключването');
  release();
  await holder;
  // След освобождаването вижда FOUNDER → PRO вече не е позволен → conflict.
  assert.equal(await settling, 'conflict');
  assert.equal((await userOf(user.id)).plan, 'FOUNDER');
});

test('I4b: две поръчки, уредени едновременно → и двете удължения', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  const b = await mkOrder(user.id, 'PRO', 'monthly', 400);
  const results = await Promise.all([service.settlePlanOrder({ id: a.id }), service.settlePlanOrder({ id: b.id })]);
  assert.deepEqual(results.sort(), ['completed', 'completed']);
  const days = (((await userOf(user.id)).planExpiresAt as Date).getTime() - Date.now()) / DAY;
  assert.ok(days > 58 && days < 63, `≈2 месеца, получено ${days}`);
});

test('I5: бонус веднъж (задържан); връщането го сторнира и връща предишния план и срок', { skip }, async () => {
  const referrer = await mkUser();
  const before = new Date(Date.now() + 10 * DAY);
  const user = await mkUser({ plan: 'PRO', planExpiresAt: before, referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: order.id }), 'completed');
  // abuse-money-spec А1: бонусът е задържан — не е в баланса до срока за отказ/спор.
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
  assert.equal((await db.referral.findUniqueOrThrow({ where: { planOrderId: order.id } })).releasedAt, null);
  assert.ok(((await userOf(user.id)).planExpiresAt as Date).getTime() > before.getTime() + 27 * DAY);

  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  const pending = await reload(order.id);
  assert.equal(pending.state, 'refund_pending');
  assert.ok(pending.refundOrderId);
  assert.equal(refunds[0].idempotencyKey, `${order.id}-1`);
  assert.equal(refunds[0].amountCents, 400);
  assert.equal(await service.settlePlanRefund({ refundOrderId: pending.refundOrderId as string }), 'pending');

  live.set(pending.refundOrderId as string, { type: 'refund', state: 'completed', amount: 400, currency: 'EUR' });
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

// ── F1: отказан refund (Revolut-Api-Version 2026-08-17 → 400; от 2026-09-22 при
// Revolut Pay → 200 с отказано плащане). И двата пътя връщат поръчката към платена.

test('F1a: синхронен отказ 400 → поръчката е пак платена, грешка към админа; новият опит е с нов ключ', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  refundResponse = () => {
    throw Object.assign(new Error('revolut POST /api/orders: 400'), { status: 400 });
  };
  await assert.rejects(service.requestPlanRefund(a.id));
  const back = await reload(a.id);
  assert.equal(back.state, 'completed');
  assert.equal(back.refundOrderId, null);
  assert.equal((await userOf(user.id)).plan, 'PRO');
  refundResponse = null;
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  assert.equal(refunds[1].idempotencyKey, `${a.id}-2`);
});

test('F1b: 200 с отказано плащане (Res-Refund-Declined) минава по пътя на 400 — не остава „в ход“', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  refundResponse = () => fixture('revolut-refund-declined');
  await assert.rejects(service.requestPlanRefund(a.id), /refund/);
  const back = await reload(a.id);
  assert.equal(back.state, 'completed');
  assert.equal(back.refundOrderId, null);
  assert.equal(back.refundedAt, null);
  assert.equal((await userOf(user.id)).plan, 'PRO');
  assert.deepEqual(limited, []);
  // Нов опит — нов ключ (иначе Revolut би върнал стария отказ).
  refundResponse = null;
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  assert.equal(refunds[1].idempotencyKey, `${a.id}-2`);
});

test('F1c: 200 с неуспешно плащане (Res-Refund-Failed) при conflict поръчка → пак conflict', { skip }, async () => {
  const user = await mkUser({ plan: 'FOUNDER' });
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  assert.equal(await service.settlePlanOrder({ id: a.id }), 'conflict');
  refundResponse = () => fixture('revolut-refund-failed');
  await assert.rejects(service.requestPlanRefund(a.id));
  const back = await reload(a.id);
  assert.equal(back.state, 'conflict');
  assert.equal(back.refundOrderId, null);
});

test('F1d: асинхронен отказ — refund поръчката в processing с отказано плащане → failed, аларма (уебхук)', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  const pending = await reload(a.id);
  const refundOrderId = pending.refundOrderId as string;
  live.set(refundOrderId, { ...fixture('revolut-refund-declined'), id: refundOrderId });
  assert.equal(await service.settlePlanRefund({ refundOrderId }), 'failed');
  const back = await reload(a.id);
  assert.equal(back.state, 'completed');
  assert.equal(back.refundOrderId, null);
  assert.equal((await userOf(user.id)).plan, 'PRO');
  // Бонусът е задържан (А1) и НЕ е сторниран — парите не са върнати.
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
  assert.equal((await db.referral.findUniqueOrThrow({ where: { planOrderId: a.id } })).reversedAt, null);
  assert.ok(alerts.some((s) => /неуспешно/.test(s)));
  assert.ok(alertLines.flat().some((line) => /suspected_fraud/.test(line)), 'причината за отказа е в алармата');
  // Повторно събитие за същия refund — нищо.
  assert.equal(await service.settlePlanRefund({ refundOrderId }), 'noop');
});

test('F1e: асинхронен отказ (Res-Refund-Failed) през cron-а → failed', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'BUSINESS', 'monthly', 900);
  await service.settlePlanOrder({ id: a.id });
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  const refundOrderId = (await reload(a.id)).refundOrderId as string;
  live.set(refundOrderId, { ...fixture('revolut-refund-failed'), id: refundOrderId });
  assert.equal(await service.settlePlanRefund({ id: a.id }), 'failed');
  assert.equal((await reload(a.id)).state, 'completed');
});

test('F1f: refund в ход (refund_validated) остава refund_pending', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  const refundOrderId = (await reload(a.id)).refundOrderId as string;
  live.set(refundOrderId, { id: refundOrderId, type: 'refund', state: 'processing', payments: [{ state: 'refund_validated' }] });
  assert.equal(await service.settlePlanRefund({ id: a.id }), 'pending');
  assert.equal((await reload(a.id)).state, 'refund_pending');
});

// ── F2: споровете (DISPUTE_* → GET /api/disputes/{id}). Записват се и се
// съобщават; планът и бонусът НЕ се пипат автоматично — решава човек.

const disputeFor = (revolutOrderId: string, state: string, extra: Record<string, unknown> = {}) => ({
  ...fixture('revolut-dispute-card'),
  state,
  substate: state === 'needs_response' ? 'new' : 'lost_accepted',
  payment: { ...(fixture('revolut-dispute-card').payment as object), order_id: revolutOrderId },
  ...extra,
});

test('F2a: спор по платена поръчка → одит, аларма със срока; планът остава, бонусът се сторнира (А4)', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, disputeFor(a.revolutOrderId as string, 'needs_response', { id, response_due_date: '2026-12-02T09:00:00Z' }));

  assert.equal(await service.recordDispute(id), 'recorded');
  const rows = await db.revolutDispute.findMany({ where: { disputeId: id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].planOrderId, a.id);
  assert.equal(rows[0].state, 'needs_response');
  assert.equal(rows[0].amountCents, 1500);
  assert.equal(rows[0].responseDueAt.toISOString(), '2026-12-02T09:00:00.000Z');
  assert.ok(rows[0].notifiedAt, 'алармата е тръгнала → notifiedAt');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /[Сс]пор/);
  const lines = alertLines[0].join('\n');
  assert.match(lines, /2026-12-02/);
  assert.match(lines, new RegExp(a.id));
  // Планът и поръчката — нищо автоматично; задържаният бонус е сторниран (А4), без пипане на баланса.
  assert.equal((await userOf(user.id)).plan, 'PRO');
  assert.equal((await reload(a.id)).state, 'completed');
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
  const reversed = await db.referral.findUniqueOrThrow({ where: { planOrderId: a.id } });
  assert.ok(reversed.reversedAt);
  assert.equal(reversed.reversalReason, 'dispute');
  assert.deepEqual(limited, []);

  // Повторно известие за същото състояние (ретрай) — без нов ред и без нова аларма.
  assert.equal(await service.recordDispute(id), 'unchanged');
  assert.equal(await db.revolutDispute.count({ where: { disputeId: id } }), 1);
  assert.equal(alerts.length, 1);

  // Загубен спор — нов ред и аларма; пак нищо автоматично.
  disputes.set(id, disputeFor(a.revolutOrderId as string, 'lost', { id }));
  assert.equal(await service.recordDispute(id), 'recorded');
  assert.equal(await db.revolutDispute.count({ where: { disputeId: id } }), 2);
  assert.equal(alerts.length, 2);
  assert.equal((await userOf(user.id)).plan, 'PRO');
  assert.equal((await reload(a.id)).state, 'completed');
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
});

test('F2b: две известия за едно състояние едновременно → един ред, една аларма', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, disputeFor(a.revolutOrderId as string, 'under_review', { id }));
  const results = await Promise.all([service.recordDispute(id), service.recordDispute(id)]);
  assert.deepEqual(results.sort(), ['recorded', 'unchanged']);
  assert.equal(await db.revolutDispute.count({ where: { disputeId: id } }), 1);
  assert.equal(alerts.length, 1);
});

test('F2c: спор по плащане, което не е поръчка за план → записва се без връзка, аларма', { skip }, async () => {
  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, disputeFor(`rev-unknown-${randomUUID()}`, 'needs_response', { id }));
  assert.equal(await service.recordDispute(id), 'recorded');
  const row = await db.revolutDispute.findFirstOrThrow({ where: { disputeId: id } });
  assert.equal(row.planOrderId, null);
  assert.equal(alerts.length, 1);
});

test('F2d: спорът не се чете (404 в Sandbox, 401) или е непознат → аларма с id-то, без запис', { skip }, async () => {
  const id = `dsp-int-${randomUUID()}`;
  assert.equal(await service.recordDispute(id), 'unreadable');
  assert.equal(alerts.length, 1);
  assert.match(alertLines[0].join('\n'), new RegExp(id));
  disputes.set(id, { ...fixture('revolut-dispute-card'), id, state: 'brand_new_state' });
  assert.equal(await service.recordDispute(id), 'unreadable');
  disputes.set(id, { ...fixture('revolut-dispute-card'), id: 'друг' });
  assert.equal(await service.recordDispute(id), 'unreadable');
  assert.equal(await db.revolutDispute.count({ where: { disputeId: id } }), 0);
  assert.equal(alerts.length, 3);
});

test('F2e: временна грешка (503, мрежа) → хвърля (уебхукът връща 409 → Revolut опитва пак), без аларма', { skip }, async () => {
  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, httpError(503));
  await assert.rejects(service.recordDispute(id));
  disputes.set(id, httpError(429));
  await assert.rejects(service.recordDispute(id));
  disputes.set(id, new Error('fetch failed'));
  await assert.rejects(service.recordDispute(id));
  assert.equal(alerts.length, 0);
  assert.equal(await db.revolutDispute.count({ where: { disputeId: id } }), 0);
});

// ── Ревю на Кодаджията (2026-11-17), т. 1–3.

test('R1: нов срок или ново подсъстояние при същото състояние → нов ред и аларма; същото → нищо', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  const id = `dsp-int-${randomUUID()}`;
  const ord = a.revolutOrderId as string;
  disputes.set(id, disputeFor(ord, 'needs_response', { id, substate: 'new', response_due_date: '2026-12-02T09:00:00Z' }));
  assert.equal(await service.recordDispute(id), 'recorded');
  assert.equal(await service.recordDispute(id), 'unchanged');
  // Revolut удължи срока.
  disputes.set(id, disputeFor(ord, 'needs_response', { id, substate: 'new', response_due_date: '2026-12-09T09:00:00Z' }));
  assert.equal(await service.recordDispute(id), 'recorded');
  // Нов етап (representment) — пак needs_response, със същия срок.
  disputes.set(id, disputeFor(ord, 'needs_response', { id, substate: 'representment', response_due_date: '2026-12-09T09:00:00Z' }));
  assert.equal(await service.recordDispute(id), 'recorded');
  assert.equal(await service.recordDispute(id), 'unchanged');
  assert.equal(await db.revolutDispute.count({ where: { disputeId: id } }), 3);
  assert.equal(alerts.length, 3);
  assert.match(alertLines[1].join('\n'), /2026-12-09/);
});

test('R1b: спор без подсъстояние и без срок — повторът се засича (NULL не пробива уникалния ключ)', { skip }, async () => {
  const id = `dsp-int-${randomUUID()}`;
  const bare = { ...disputeFor(`rev-x-${randomUUID()}`, 'under_review', { id }), substate: undefined, response_due_date: undefined };
  disputes.set(id, bare);
  assert.equal(await service.recordDispute(id), 'recorded');
  assert.equal(await service.recordDispute(id), 'unchanged');
  assert.deepEqual(await Promise.all([service.recordDispute(id), service.recordDispute(id)]), ['unchanged', 'unchanged']);
  assert.equal(await db.revolutDispute.count({ where: { disputeId: id } }), 1);
  assert.equal(alerts.length, 1);
  assert.match(alertLines[0].join('\n'), /не е посочен/);
});

test('R2: писмото за спора не тръгва → редът остава ненотифициран; cron-ът го праща по-късно, веднъж', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, disputeFor(a.revolutOrderId as string, 'needs_response', { id, response_due_date: '2026-12-02T09:00:00Z' }));
  notifyOk = false;
  assert.equal(await service.recordDispute(id), 'recorded');
  assert.equal((await db.revolutDispute.findFirstOrThrow({ where: { disputeId: id } })).notifiedAt, null);
  // Повторна доставка на същото събитие не праща второ писмо паралелно с първото.
  assert.equal(await service.recordDispute(id), 'unchanged');
  assert.equal(alerts.length, 1);
  // Cron-ът веднага след това не пипа пресни редове (уебхукът може още да праща).
  notifyOk = true;
  assert.equal(await service.resendDisputeAlerts(new Date()), 0);
  // По-късно — праща, записва notifiedAt, и не праща втори път.
  const later = new Date(Date.now() + 11 * 60_000);
  assert.equal(await service.resendDisputeAlerts(later), 1);
  assert.equal(alerts.length, 2);
  assert.match(alerts[1], /[Сс]пор/);
  assert.match(alertLines[1].join('\n'), /2026-12-02/);
  assert.match(alertLines[1].join('\n'), new RegExp(a.id));
  assert.ok((await db.revolutDispute.findFirstOrThrow({ where: { disputeId: id } })).notifiedAt);
  assert.equal(await service.resendDisputeAlerts(later), 0);
  assert.equal(alerts.length, 2);
  // И при нов неуспех cron-ът опитва пак следващия път.
  const id2 = `dsp-int-${randomUUID()}`;
  disputes.set(id2, disputeFor(a.revolutOrderId as string, 'lost', { id: id2 }));
  notifyOk = false;
  await service.recordDispute(id2);
  assert.equal(await service.resendDisputeAlerts(later), 0);
  notifyOk = true;
  assert.equal(await service.resendDisputeAlerts(later), 1);
});

test('R2b: нечетим спор и писмото не тръгва → хвърля (уебхукът връща 409 → Revolut опитва пак)', { skip }, async () => {
  const id = `dsp-int-${randomUUID()}`;
  notifyOk = false;
  await assert.rejects(service.recordDispute(id));
  notifyOk = true;
  assert.equal(await service.recordDispute(id), 'unreadable');
});

test('R3: таймаут/5XX при refund → остава refund_pending без refund id; повторът е със СЪЩИЯ ключ', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  for (const error of [httpError(503), new Error('The operation was aborted due to timeout')]) {
    refundResponse = () => {
      throw error;
    };
    assert.equal(await service.requestPlanRefund(a.id), 'stuck');
    const stuck = await reload(a.id);
    assert.equal(stuck.state, 'refund_pending', 'Revolut може вече да е създал refund-а — не е „пак платена“');
    assert.equal(stuck.refundOrderId, null);
  }
  refundResponse = null;
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  assert.deepEqual(
    refunds.map((r) => r.idempotencyKey),
    [`${a.id}-1`, `${a.id}-1`, `${a.id}-1`],
  );
  assert.equal((await userOf(user.id)).plan, 'PRO');
});

test('R3b: 2xx без id на refund поръчката → остава в ход (повтаря се със същия ключ)', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  refundResponse = () => ({ state: 'processing' });
  assert.equal(await service.requestPlanRefund(a.id), 'stuck');
  assert.equal((await reload(a.id)).state, 'refund_pending');
  refundResponse = null;
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  assert.deepEqual(refunds.map((r) => r.idempotencyKey), [`${a.id}-1`, `${a.id}-1`]);
});

// ── Повторното ревю на Кодаджията (2026-11-17), Low 1–2.

test('L1: повтор на заседнал refund, докато първата заявка още тече (409 за същия ключ) → остава в ход', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  refundResponse = () => {
    throw httpError(504);
  };
  assert.equal(await service.requestPlanRefund(a.id), 'stuck');
  refundResponse = () => {
    throw Object.assign(new Error('revolut POST /api/orders: 409'), { status: 409 });
  };
  assert.equal(await service.requestPlanRefund(a.id), 'stuck');
  const back = await reload(a.id);
  assert.equal(back.state, 'refund_pending', '409 не е отказ — поръчката не става „платена“');
  assert.equal(back.refundOrderId, null);
  refundResponse = null;
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  assert.deepEqual(refunds.map((r) => r.idempotencyKey), [`${a.id}-1`, `${a.id}-1`, `${a.id}-1`]);
});

test('L1b: refund приет от Revolut, но поръчката вече не е refund_pending → аларма „без запис у нас“', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  let refundId = '';
  // Докато тази заявка чака Revolut, паралелна е върнала поръчката в „платена“
  // (детерминистично: състоянието се сменя, преди Revolut да отговори).
  refundResponse = async (id: string) => {
    refundId = id;
    await db.planOrder.updateMany({ where: { id: a.id }, data: { state: 'completed' } });
    return { id, type: 'refund', state: 'processing', payments: [{ state: 'refund_validated' }] };
  };
  await assert.rejects(service.requestPlanRefund(a.id), /без запис/);
  assert.ok(refundId);
  assert.ok(alerts.some((x) => /без запис/.test(x)), 'аларма до админите');
  const lines = alertLines.flat().join('\n');
  assert.match(lines, new RegExp(a.id));
  assert.match(lines, new RegExp(refundId));
  const back = await reload(a.id);
  assert.equal(back.state, 'completed');
  assert.equal(back.refundOrderId, null);
});

test('L2: заседнал refund_pending без refund id, по-стар от 1 ч. → аларма веднъж; неуспешно писмо → пак', { skip }, async () => {
  const user = await mkUser();
  const a = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: a.id });
  refundResponse = () => {
    throw httpError(503);
  };
  assert.equal(await service.requestPlanRefund(a.id), 'stuck');
  assert.equal(alerts.length, 0);
  // Пресен — не (може още да се повтаря от /admin).
  assert.equal(await service.alertStuckRefunds(new Date()), 0);
  const later = new Date(Date.now() + 61 * 60_000);
  notifyOk = false;
  assert.equal(await service.alertStuckRefunds(later), 0, 'писмото не тръгна → не е броено');
  notifyOk = true;
  assert.equal(await service.alertStuckRefunds(later), 1);
  assert.match(alerts.at(-1) as string, /в ход/);
  assert.match((alertLines.at(-1) as string[]).join('\n'), new RegExp(a.id));
  assert.equal(await service.alertStuckRefunds(later), 0, 'веднъж за опит');
  const sentAlerts = alerts.length;
  // Нов опит, който пак заседне, е нов случай.
  refundResponse = null;
  assert.equal(await service.requestPlanRefund(a.id), 'requested');
  assert.equal(await service.alertStuckRefunds(later), 0, 'с refund id не е заседнал');
  assert.equal(alerts.length, sentAlerts);
});

// ── abuse-money-spec А/Б: задържане на бонуса и пропорционално връщане ──────────

async function backdate(orderId: string, days: number) {
  const order = await reload(orderId);
  const shift = (d: Date | null) => (d ? new Date(d.getTime() - days * DAY) : d);
  await db.planOrder.update({ where: { id: orderId }, data: { completedAt: shift(order.completedAt) } });
  await db.referral.updateMany({ where: { planOrderId: orderId }, data: { createdAt: new Date(Date.now() - days * DAY) } });
}

test('A2: бонусът се освобождава след 30 дни по чиста поръчка — веднъж', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  assert.equal((await service.releaseReferralBonuses()).released, 0, 'преди срока — задържан');
  await backdate(order.id, 31);
  assert.equal((await service.releaseReferralBonuses()).released, 1);
  assert.equal((await userOf(referrer.id)).referralCreditCents, 60);
  assert.equal((await service.releaseReferralBonuses()).released, 0, 'повторно — нищо');
  assert.equal((await userOf(referrer.id)).referralCreditCents, 60);
});

test('A7: освободен бонус → връщането го сторнира с decrement; задържан → без пипане на баланса', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await backdate(order.id, 31);
  await service.releaseReferralBonuses();
  refundImmediate = 'completed';
  assert.equal(await service.requestPlanRefund(order.id), 'refunded');
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
  const referral = await db.referral.findUniqueOrThrow({ where: { planOrderId: order.id } });
  assert.ok(referral.reversedAt && referral.releasedAt);
});

test('A8: при Revolut поръчката има върната сума → бонусът остава задържан, аларма', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await backdate(order.id, 31);
  live.set(order.revolutOrderId as string, { ...paid(400), refunded_amount: 400 });
  assert.equal((await service.releaseReferralBonuses()).released, 0);
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
  assert.ok(alerts.some((s) => /бонус не е освободен/.test(s)));
});

test('Б4: частично връщане — към Revolut отива сметнатата сума, с референция; повторът е със същата', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await db.planOrder.update({ where: { id: order.id }, data: { refundCents: 271, withdrawalRequestedAt: new Date() } });
  refundResponse = () => {
    throw Object.assign(new Error('revolut POST: 503'), { status: 503 });
  };
  assert.equal(await service.requestPlanRefund(order.id), 'stuck');
  refundResponse = null;
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  assert.equal(refunds.length, 2);
  assert.deepEqual(refunds.map((r) => r.amountCents), [271, 271]);
  assert.equal(refunds[0].idempotencyKey, refunds[1].idempotencyKey);
  assert.equal((refunds[0] as { reference?: string }).reference, `${order.id}-r1`);
});

test('Б4: удръжка = цялата сума (refundCents 0) → без заявка към Revolut, договорът приключва', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await db.planOrder.update({ where: { id: order.id }, data: { refundCents: 0, withdrawalRequestedAt: new Date() } });
  assert.equal(await service.requestPlanRefund(order.id), 'refunded');
  assert.equal(refunds.length, 0);
  assert.equal((await reload(order.id)).state, 'refunded');
});

test('Б4: refund поръчка с друга сума → не се приключва, аларма', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await db.planOrder.update({ where: { id: order.id }, data: { refundCents: 271, withdrawalRequestedAt: new Date() } });
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  const pending = await reload(order.id);
  live.set(pending.refundOrderId as string, { type: 'refund', state: 'completed', amount: 400, currency: 'EUR' });
  assert.equal(await service.settlePlanRefund({ refundOrderId: pending.refundOrderId as string }), 'pending');
  assert.equal((await reload(order.id)).state, 'refund_pending');
  assert.ok(alerts.some((s) => /различна сума/.test(s)));
  live.set(pending.refundOrderId as string, { type: 'refund', state: 'completed', amount: 271, currency: 'EUR' });
  assert.equal(await service.settlePlanRefund({ refundOrderId: pending.refundOrderId as string }), 'refunded');
});

test('Б5: отказ от по-висок план → старият срок се удължава с ползваното време', { skip }, async () => {
  const before = new Date(Date.now() + 20 * DAY);
  const user = await mkUser({ plan: 'PRO', planExpiresAt: before });
  const order = await mkOrder(user.id, 'BUSINESS', 'monthly', 900);
  await service.settlePlanOrder({ id: order.id });
  const fiveDays = 5 * 86_400;
  await db.planOrder.update({
    where: { id: order.id },
    data: { withdrawalRequestedAt: new Date(), withdrawalUsedSec: fiveDays, refundCents: 755 },
  });
  refundImmediate = 'completed';
  live.clear();
  refundResponse = (id) => ({ id, state: 'completed', type: 'refund', amount: 755, currency: 'EUR' });
  assert.equal(await service.requestPlanRefund(order.id), 'refunded');
  refundResponse = null;
  const u = await userOf(user.id);
  assert.equal(u.plan, 'PRO');
  assert.equal((u.planExpiresAt as Date).getTime(), before.getTime() + fiveDays * 1000);
});

test('А4в: спечелен спор → сторнираният бонус се връща в задържане; cron-ът го освобождава веднъж', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await backdate(order.id, 31);
  await service.releaseReferralBonuses();
  assert.equal((await userOf(referrer.id)).referralCreditCents, 60);

  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, disputeFor(order.revolutOrderId as string, 'needs_response', { id }));
  assert.equal(await service.recordDispute(id), 'recorded');
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0, 'освободеният бонус е сторниран');

  disputes.set(id, disputeFor(order.revolutOrderId as string, 'won', { id }));
  assert.equal(await service.recordDispute(id), 'recorded');
  const back = await db.referral.findUniqueOrThrow({ where: { planOrderId: order.id } });
  assert.equal(back.reversedAt, null);
  assert.equal(back.releasedAt, null, 'обратно в задържане — освобождава го cron-ът след живо четене');
  assert.equal((await service.releaseReferralBonuses()).released, 1);
  assert.equal((await userOf(referrer.id)).referralCreditCents, 60);

  // Повторно известие „won“ и повторен cron — без втори бонус.
  assert.equal(await service.recordDispute(id), 'unchanged');
  assert.equal((await service.releaseReferralBonuses()).released, 0);
  assert.equal((await userOf(referrer.id)).referralCreditCents, 60);
});

test('А4в: открит или загубен спор държи бонуса; „won“ не връща бонус, сторниран заради връщане', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await backdate(order.id, 31);
  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, disputeFor(order.revolutOrderId as string, 'lost', { id }));
  assert.equal(await service.recordDispute(id), 'recorded');
  assert.equal((await service.releaseReferralBonuses()).released, 0);

  const other = await mkUser({ referredById: referrer.id });
  const paidBack = await mkOrder(other.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: paidBack.id });
  refundImmediate = 'completed';
  assert.equal(await service.requestPlanRefund(paidBack.id), 'refunded');
  const won = `dsp-int-${randomUUID()}`;
  disputes.set(won, disputeFor(paidBack.revolutOrderId as string, 'won', { id: won }));
  assert.equal(await service.recordDispute(won), 'recorded');
  const kept = await db.referral.findUniqueOrThrow({ where: { planOrderId: paidBack.id } });
  assert.ok(kept.reversedAt);
  assert.equal(kept.reversalReason, 'refund');
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
});

test('A8б: бонус, който не е чист при Revolut → аларма веднъж, не при всеки cron', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await backdate(order.id, 31);
  live.set(order.revolutOrderId as string, { ...paid(400), refunded_amount: 100 });
  await service.releaseReferralBonuses();
  await service.releaseReferralBonuses();
  assert.equal(alerts.filter((s) => /бонус не е освободен/.test(s)).length, 1);
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0);
});

test('A6: бонус, създаден без releasedAt (стар код след миграцията) → смята се за освободен', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  // Като стария код: create без releasedAt + веднага increment.
  const legacy = await db.referral.create({ data: { referrerId: referrer.id, referredUserId: user.id, plan: 'PRO', rewardCents: 60 } });
  assert.ok(legacy.releasedAt, 'DEFAULT на колоната = освободен');
  assert.equal((await service.releaseReferralBonuses()).released, 0, 'не се кредитира втори път');
});

test('А4в: „won“ по поръчка, върната междувременно → бонусът остава сторниран (причина refund)', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, disputeFor(order.revolutOrderId as string, 'needs_response', { id }));
  await service.recordDispute(id);
  refundImmediate = 'completed';
  assert.equal(await service.requestPlanRefund(order.id), 'refunded');
  disputes.set(id, disputeFor(order.revolutOrderId as string, 'won', { id }));
  assert.equal(await service.recordDispute(id), 'recorded');
  const r = await db.referral.findUniqueOrThrow({ where: { planOrderId: order.id } });
  assert.ok(r.reversedAt, 'не е върнат в задържане');
  assert.equal(r.reversalReason, 'refund');
});

test('А4в: „won“ пристигнал преди „needs_response“ (разменени уебхуци) → бонусът не се сторнира', { skip }, async () => {
  const referrer = await mkUser();
  const user = await mkUser({ referredById: referrer.id });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  const id = `dsp-int-${randomUUID()}`;
  disputes.set(id, disputeFor(order.revolutOrderId as string, 'won', { id }));
  assert.equal(await service.recordDispute(id), 'recorded');
  disputes.set(id, disputeFor(order.revolutOrderId as string, 'needs_response', { id }));
  assert.equal(await service.recordDispute(id), 'recorded');
  const r = await db.referral.findUniqueOrThrow({ where: { planOrderId: order.id } });
  assert.equal(r.reversedAt, null, 'спорът вече е спечелен — закъснялото „needs_response“ не сторнира');
});

test('Б4: отговорът на POST refund е „completed“ без сума → живо четене на refund поръчката решава', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  // Кратък отговор (Order-v7 няма задължителни полета) — пълната поръчка е при GET.
  refundResponse = (id) => {
    live.set(id, { id, type: 'refund', state: 'completed', amount: 400, currency: 'EUR' });
    return { id, state: 'completed' };
  };
  assert.equal(await service.requestPlanRefund(order.id), 'refunded');
  assert.equal((await reload(order.id)).state, 'refunded');

  // И живото четене без сума → не се приключва, аларма.
  const other = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: other.id });
  refundResponse = (id) => {
    live.set(id, { id, state: 'completed' });
    return { id, state: 'completed' };
  };
  assert.equal(await service.requestPlanRefund(other.id), 'requested');
  assert.ok(alerts.some((s) => /различна сума/.test(s)));
  refundResponse = null;
});

// ── Червен екип (2026-11-22): инвариантът на връщането ──────────────────────────────
// Приключва се САМО по живо четене: type refund + state completed + точна сума + EUR.
// Остаряло решение за стар refund не пипа по-нов (CAS по refundOrderId/опита).

test('РЕ-C1: POST „completed“ с точна сума, живо = failed → не приключва; поръчката е пак платена', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  refundResponse = (id) => {
    live.set(id, { id, type: 'refund', state: 'failed', amount: 400, currency: 'EUR' });
    return { id, type: 'refund', state: 'completed', amount: 400, currency: 'EUR' };
  };
  await assert.rejects(service.requestPlanRefund(order.id), /declined/);
  const back = await reload(order.id);
  assert.equal(back.state, 'completed', 'парите не са върнати → пак платена');
  assert.equal(back.refundOrderId, null);
  assert.equal((await userOf(user.id)).plan, 'PRO');
  assert.equal(limited.length, 0);
});

test('РЕ-C2: кратък „completed“, живо = точна сума, но state processing → не приключва', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  refundResponse = (id) => {
    live.set(id, { id, type: 'refund', state: 'processing', amount: 400, currency: 'EUR', payments: [{ state: 'refund_validated' }] });
    return { id, state: 'completed' };
  };
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  assert.equal((await reload(order.id)).state, 'refund_pending');
  assert.equal((await userOf(user.id)).plan, 'PRO');
});

test('РЕ-C3: кратък „completed“, живо = отказано със сума → не приключва', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  refundResponse = (id) => {
    live.set(id, { id, type: 'refund', state: 'failed', amount: 400, currency: 'EUR', payments: [{ state: 'declined', decline_reason: 'x' }] });
    return { id, state: 'completed' };
  };
  await assert.rejects(service.requestPlanRefund(order.id), /declined/);
  assert.notEqual((await reload(order.id)).state, 'refunded');
  assert.equal((await userOf(user.id)).plan, 'PRO');
});

test('РЕ-F2: отказ с удръжка (271) — POST твърди „completed“ 271, живо 400 → не приключва, аларма', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  await db.planOrder.update({ where: { id: order.id }, data: { refundCents: 271, withdrawalRequestedAt: new Date() } });
  refundResponse = (id) => {
    live.set(id, { id, type: 'refund', state: 'completed', amount: 400, currency: 'EUR' });
    return { id, type: 'refund', state: 'completed', amount: 271, currency: 'EUR' };
  };
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  assert.equal((await reload(order.id)).state, 'refund_pending');
  assert.ok(alerts.some((x) => /различна сума/.test(x)));
});

test('РЕ-B: живото четене хвърля (503) → „в ход“ без аларма за различна сума; cron-ът после приключва', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  let rid = '';
  refundResponse = (id) => {
    rid = id;
    return { id, state: 'completed' };
  };
  getOrderHook = (id) => (id === rid ? Promise.reject(httpError(503)) : null);
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  assert.equal((await reload(order.id)).state, 'refund_pending');
  assert.equal(alerts.filter((x) => /различна сума/.test(x)).length, 0, 'временна грешка ≠ разминаване');
  getOrderHook = null;
  live.set(rid, { id: rid, type: 'refund', state: 'completed', amount: 400, currency: 'EUR' });
  assert.equal(await service.settlePlanRefund({ id: order.id }), 'refunded');
});

test('РЕ-G: остаряло „failed“ за R1 (cron) не изтрива по-новия R2', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  const r1 = (await reload(order.id)).refundOrderId as string;
  live.set(r1, { id: r1, type: 'refund', state: 'failed', payments: [{ state: 'declined' }] });
  let r2 = '';
  let fired = false;
  // Cron-ът прочита поръчката с R1 и чака Revolut; междувременно уебхукът урежда R1
  // („платена“) и админът пуска нов refund R2.
  getOrderHook = (id) => {
    if (id !== r1 || fired) return null;
    fired = true;
    return (async () => {
      assert.equal(await service.settlePlanRefund({ refundOrderId: r1 }), 'failed');
      assert.equal(await service.requestPlanRefund(order.id), 'requested');
      r2 = (await reload(order.id)).refundOrderId as string;
      return live.get(r1);
    })();
  };
  await service.settlePlanRefund({ id: order.id });
  const now = await reload(order.id);
  assert.ok(r2 && r2 !== r1);
  assert.equal(now.state, 'refund_pending');
  assert.equal(now.refundOrderId, r2, 'R2 не бива да се губи');
  live.set(r2, { id: r2, type: 'refund', state: 'completed', amount: 400, currency: 'EUR' });
  assert.equal(await service.settlePlanRefund({ refundOrderId: r2 }), 'refunded');
  assert.equal(refunds.length, 2);
});

test('РЕ-H: закъснял отговор на POST за R1 не презаписва записания R2', { skip }, async () => {
  const user = await mkUser();
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  let call = 0;
  let r1 = '';
  let r2 = '';
  let release: (value: unknown) => void = () => {};
  refundResponse = (id) => {
    call += 1;
    if (call === 1) {
      r1 = id;
      // Revolut създаде R1, но отговорът виси в мрежата.
      return new Promise((resolve) => (release = resolve));
    }
    if (call === 2) return { id: r1, state: 'pending', type: 'refund', amount: 400, currency: 'EUR' };
    r2 = id;
    return { id, state: 'pending', type: 'refund', amount: 400, currency: 'EUR' };
  };
  const first = service.requestPlanRefund(order.id);
  await new Promise((resolve) => setTimeout(resolve, 100));
  // Админът повтаря „заседналото“ (същият ключ) → R1 е записан; R1 пропада; нов опит → R2.
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  live.set(r1, { id: r1, type: 'refund', state: 'failed', payments: [{ state: 'declined' }] });
  assert.equal(await service.settlePlanRefund({ id: order.id }), 'failed');
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  assert.equal((await reload(order.id)).refundOrderId, r2);
  release({ id: r1, state: 'pending', type: 'refund', amount: 400, currency: 'EUR' });
  await first.catch(() => undefined);
  assert.equal((await reload(order.id)).refundOrderId, r2, 'R2 презаписан със стария R1');
});

// ── Ръчно приключване и дневна аларма (docs/refund-manual-close-spec.md) ─────────────

/** Платена поръчка с refund при Revolut, който е `completed`, но с друга сума (разминаване). */
async function mismatchedRefund(opts: { liveAmount?: number; referrerId?: string } = {}) {
  const user = await mkUser({ referredById: opts.referrerId });
  const order = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: order.id });
  let rid = '';
  refundResponse = (id) => {
    rid = id;
    live.set(id, { id, type: 'refund', state: 'completed', amount: opts.liveAmount ?? 399, currency: 'EUR' });
    return { id, state: 'completed' };
  };
  assert.equal(await service.requestPlanRefund(order.id), 'requested');
  refundResponse = null;
  return { user, order, rid };
}
const mismatchAlerts = () => alerts.filter((x) => /различна сума/.test(x)).length;

test('А1–А3: аларма за разминаване — веднага, после най-много веднъж на 24 ч', { skip }, async () => {
  const { order } = await mismatchedRefund();
  assert.equal(mismatchAlerts(), 1, 'А1: първото разминаване — аларма веднага');
  assert.ok((await reload(order.id)).refundStuckAlertedAt, 'маркерът е записан');
  assert.equal(await service.settlePlanRefund({ id: order.id }), 'pending');
  assert.equal(await service.settlePlanRefund({ id: order.id }), 'pending');
  assert.equal(mismatchAlerts(), 1, 'А2: ежечасният cron не праща пак до 24 ч');
  await db.planOrder.update({ where: { id: order.id }, data: { refundStuckAlertedAt: new Date(Date.now() - 25 * 3_600_000) } });
  assert.equal(await service.settlePlanRefund({ id: order.id }), 'pending');
  assert.equal(mismatchAlerts(), 2, 'А3: след 24 ч — пак');
  assert.match((alertLines.at(-1) as string[]).join('\n'), /Приключи ръчно/, 'А5: насочва към бутона');
});

test('А4: неуспешно писмо за разминаване → маркерът се връща и следващото уреждане опитва пак', { skip }, async () => {
  notifyOk = false;
  const { order } = await mismatchedRefund();
  assert.equal(mismatchAlerts(), 1);
  assert.equal((await reload(order.id)).refundStuckAlertedAt, null, 'писмото не тръгна → без маркер');
  notifyOk = true;
  assert.equal(await service.settlePlanRefund({ id: order.id }), 'pending');
  assert.equal(mismatchAlerts(), 2);
  assert.ok((await reload(order.id)).refundStuckAlertedAt);
});

test('Б1: ръчно приключване само за refund_pending с refund id', { skip }, async () => {
  const user = await mkUser();
  const paidOrder = await mkOrder(user.id, 'PRO', 'monthly', 400);
  await service.settlePlanOrder({ id: paidOrder.id });
  assert.equal(await service.closeRefundManually(paidOrder.id), 'not-closable', 'платена');
  refundResponse = () => {
    throw httpError(503);
  };
  assert.equal(await service.requestPlanRefund(paidOrder.id), 'stuck');
  assert.equal(await service.closeRefundManually(paidOrder.id), 'not-closable', 'заседнал без refund id');
  assert.equal((await reload(paidOrder.id)).state, 'refund_pending');
  assert.equal(await service.closeRefundManually('няма-такава'), 'not-closable');
  assert.equal(limited.length, 0);
});

test('Б2: живото четене хвърля → ръчното приключване хвърля, нищо не се пипа', { skip }, async () => {
  const { order, rid } = await mismatchedRefund();
  getOrderHook = (id) => (id === rid ? Promise.reject(httpError(503)) : null);
  await assert.rejects(service.closeRefundManually(order.id));
  const now = await reload(order.id);
  assert.equal(now.state, 'refund_pending');
  assert.equal(now.refundOrderId, rid);
  assert.equal(limited.length, 0);
});

test('Б3: живо „отказано“ → пак платена (като автоматичния път), резултат refund-failed', { skip }, async () => {
  const { user, order, rid } = await mismatchedRefund();
  live.set(rid, { id: rid, type: 'refund', state: 'failed', payments: [{ state: 'declined' }] });
  assert.equal(await service.closeRefundManually(order.id), 'refund-failed');
  const now = await reload(order.id);
  assert.equal(now.state, 'completed');
  assert.equal(now.refundOrderId, null);
  assert.equal((await userOf(user.id)).plan, 'PRO');
  assert.equal(limited.length, 0);
});

test('Б4: живо „в ход“ → refund-in-progress, нищо не се пипа', { skip }, async () => {
  const { user, order, rid } = await mismatchedRefund();
  live.set(rid, { id: rid, type: 'refund', state: 'processing', amount: 399, currency: 'EUR', payments: [{ state: 'refund_validated' }] });
  assert.equal(await service.closeRefundManually(order.id), 'refund-in-progress');
  assert.equal((await reload(order.id)).state, 'refund_pending');
  assert.equal((await userOf(user.id)).plan, 'PRO');
});

test('Б5: живо „completed“ с друга сума → приключено по същия refund; реалната сума в счетоводството', { skip }, async () => {
  const referrer = await mkUser();
  const { user, order, rid } = await mismatchedRefund({ liveAmount: 399, referrerId: referrer.id });
  const before = alerts.length;
  assert.equal(await service.closeRefundManually(order.id), 'closed');
  const now = await reload(order.id);
  assert.equal(now.state, 'refunded');
  assert.equal(now.refundOrderId, rid);
  assert.equal(now.refundCents, 399, 'реалната сума от Revolut');
  assert.equal(now.refundVatCents, Math.round((order.vatCents * 399) / 400));
  assert.equal((await userOf(user.id)).plan, 'FREE', 'планът към снимката');
  assert.equal(limited.length, 1);
  assert.ok((await db.referral.findUniqueOrThrow({ where: { planOrderId: order.id } })).reversedAt, 'бонусът е сторниран');
  assert.ok(alerts.slice(before).some((x) => /приключено ръчно/i.test(x)), 'Б7: аларма до админите');
  assert.match((alertLines.at(-1) as string[]).join('\n'), /3\.99/);
});

test('Б5′: живо „completed“ в друга валута → приключено, счетоводно остава очакваната сума', { skip }, async () => {
  const { order, rid } = await mismatchedRefund();
  live.set(rid, { id: rid, type: 'refund', state: 'completed', amount: 400, currency: 'BGN' });
  assert.equal(await service.closeRefundManually(order.id), 'closed');
  const now = await reload(order.id);
  assert.equal(now.state, 'refunded');
  assert.equal(now.refundCents, null, 'не четем BGN като евро');
  assert.match((alertLines.at(-1) as string[]).join('\n'), /не е прочетена/);
});

test('Б6: две паралелни ръчни приключвания → сторно веднъж', { skip }, async () => {
  const referrer = await mkUser();
  const { order } = await mismatchedRefund({ referrerId: referrer.id });
  await db.referral.updateMany({ where: { planOrderId: order.id }, data: { releasedAt: new Date() } });
  const ref = await db.referral.findUniqueOrThrow({ where: { planOrderId: order.id } });
  await db.user.update({ where: { id: referrer.id }, data: { referralCreditCents: ref.rewardCents } });
  const results = await Promise.all([service.closeRefundManually(order.id), service.closeRefundManually(order.id)]);
  assert.deepEqual([...results].sort(), ['closed', 'not-closable']);
  assert.equal((await reload(order.id)).state, 'refunded');
  assert.equal((await userOf(referrer.id)).referralCreditCents, 0, 'не отрицателен');
  assert.equal(limited.length, 1);
});
