// Дефект 2 (ядро: пари): втори абонамент/„Основател“ за същия потребител.
// Преди plan checkout потребителят винаги има ЕДИН Stripe Customer, живото
// състояние в Stripe блокира дубъл, а webhook-ът не презаписва customer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customerClaimWhere,
  customerIdempotencyKey,
  customerLinkUpdate,
  founderSessionPayment,
  isPlanSession,
  planCheckoutSessionParams,
  preparePlanCheckout,
  type PlanCheckoutPorts,
  type PlanCheckoutUser,
} from '../plan-checkout';
import { createPlanStripePorts, type PlanStripeClient } from '../plan-checkout-stripe';

interface FakeState {
  stored: string | null;
  created: { userId: string; key: string }[];
  claimWinner?: string; // загубена надпревара: друг запис вече е спечелил
  subs: Record<string, string[]>;
  founderPaid: Record<string, string[]>;
  founderPending: Record<string, string[]>;
  piStatus: Record<string, string>;
  reversed: Set<string>;
  open: Record<string, { id: string; kind: 'plan' | 'shop' }[]>;
  expired: string[];
}

function fake(init: Partial<FakeState> = {}): { s: FakeState; ports: PlanCheckoutPorts } {
  const s: FakeState = {
    stored: null,
    created: [],
    subs: {},
    founderPaid: {},
    founderPending: {},
    piStatus: {},
    reversed: new Set(),
    open: {},
    expired: [],
    ...init,
  };
  const ports: PlanCheckoutPorts = {
    async createCustomer(input, idempotencyKey) {
      s.created.push({ userId: input.userId, key: idempotencyKey });
      return `cus_new_${s.created.length}`;
    },
    async claimCustomer(_userId, customerId) {
      if (s.claimWinner) return s.claimWinner;
      if (s.stored === null) s.stored = customerId;
      return s.stored;
    },
    async listSubscriptionStatuses(customerId) {
      return s.subs[customerId] ?? [];
    },
    async listFounderSessions(customerId) {
      return [
        ...(s.founderPaid[customerId] ?? []).map((pi) => ({ paymentIntentId: pi, paid: true })),
        ...(s.founderPending[customerId] ?? []).map((pi) => ({ paymentIntentId: pi, paid: false })),
      ];
    },
    async paymentIntentStatus(pi) {
      return s.piStatus[pi] ?? 'processing';
    },
    async isPaymentReversed(pi) {
      return s.reversed.has(pi);
    },
    async listOpenPlanSessionIds(customerId) {
      return (s.open[customerId] ?? []).filter((x) => x.kind === 'plan').map((x) => x.id);
    },
    async expireSession(id) {
      s.expired.push(id);
    },
  };
  return { s, ports };
}

function user(over: Partial<PlanCheckoutUser> = {}): PlanCheckoutUser {
  return {
    id: 'u1',
    email: 'buyer@example.test',
    stripeCustomerId: null,
    planPaymentIntentId: null,
    ...over,
  };
}

const BASE = {
  userId: 'u1',
  plan: 'PRO' as const,
  priceId: 'price_pro_m',
  oneTime: false,
  successUrl: 'https://x.test/ok',
  cancelUrl: 'https://x.test/no',
};

// КП1: null customer → създава Customer (idempotency по user.id) и не праща customer_email.
test('PC1 stripeCustomerId=null → един Customer с idempotency key по user.id', async () => {
  const { s, ports } = fake();
  const r = await preparePlanCheckout(user(), ports);
  assert.deepEqual(r, { ok: true, customerId: 'cus_new_1' });
  assert.equal(s.created.length, 1);
  assert.equal(s.created[0].key, customerIdempotencyKey('u1'));
  assert.ok(s.created[0].key.includes('u1'));
  assert.equal(s.stored, 'cus_new_1', 'записан атомарно в базата');
});

test('PC1b загубена надпревара → ползва записания customer', async () => {
  const { ports } = fake({ claimWinner: 'cus_winner' });
  const r = await preparePlanCheckout(user(), ports);
  assert.deepEqual(r, { ok: true, customerId: 'cus_winner' });
});

test('PC1c сесията винаги носи customer, никога customer_email', () => {
  for (const tax of [false, true]) {
    for (const oneTime of [false, true]) {
      const p = planCheckoutSessionParams({
        ...BASE,
        oneTime,
        plan: oneTime ? 'FOUNDER' : 'PRO',
        customerId: 'cus_1',
        taxEnabled: tax,
      });
      assert.equal(p.customer, 'cus_1');
      assert.equal('customer_email' in p, false);
      assert.equal(p.mode, oneTime ? 'payment' : 'subscription');
      assert.deepEqual(p.metadata, { kind: 'plan', userId: 'u1', plan: oneTime ? 'FOUNDER' : 'PRO' });
    }
  }
});

// КП5: съществуващ customer — поведението не се сменя.
test('PC5 съществуващ customer: без нов Customer; customer_update при Stripe Tax както досега', async () => {
  const { s, ports } = fake();
  const r = await preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), ports);
  assert.deepEqual(r, { ok: true, customerId: 'cus_old' });
  assert.equal(s.created.length, 0);
  const p = planCheckoutSessionParams({ ...BASE, customerId: 'cus_old', taxEnabled: true });
  assert.deepEqual(p.customer_update, { address: 'auto', name: 'auto' });
  assert.deepEqual(p.automatic_tax, { enabled: true });
  assert.deepEqual(p.tax_id_collection, { enabled: true });
  assert.equal(p.billing_address_collection, 'required');
  const noTax = planCheckoutSessionParams({ ...BASE, customerId: 'cus_old', taxEnabled: false });
  assert.equal('customer_update' in noTax, false);
  assert.equal('automatic_tax' in noTax, false);
});

// КП2: активен абонамент в Stripe при FREE в базата → error=plan.
for (const status of ['active', 'trialing', 'past_due', 'unpaid']) {
  test(`PC2 абонамент „${status}“ в Stripe при FREE в базата → plan`, async () => {
    const { ports } = fake({ subs: { cus_old: ['canceled', status] } });
    const r = await preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), ports);
    assert.deepEqual(r, { ok: false, error: 'plan' });
  });
}

test('PC2b само мъртви абонаменти не блокират', async () => {
  const { ports } = fake({ subs: { cus_old: ['canceled', 'incomplete_expired'] } });
  const r = await preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), ports);
  assert.equal(r.ok, true);
});

test('PC2c платен „Основател“, още незаписан от webhook-а → plan', async () => {
  const { ports } = fake({ founderPaid: { cus_old: ['pi_f'] } });
  const r = await preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), ports);
  assert.deepEqual(r, { ok: false, error: 'plan' });
});

test('PC2d „Основател“, отнет (записан PI) или сторниран → не блокира', async () => {
  const revoked = fake({ founderPaid: { cus_old: ['pi_f'] } });
  const a = await preparePlanCheckout(
    user({ stripeCustomerId: 'cus_old', planPaymentIntentId: 'pi_f' }),
    revoked.ports,
  );
  assert.equal(a.ok, true);
  const refunded = fake({ founderPaid: { cus_old: ['pi_f'] }, reversed: new Set(['pi_f']) });
  const b = await preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), refunded.ports);
  assert.equal(b.ok, true);
});

// КП3: отворена plan сесия на същия customer → expire.
test('PC3 отворените plan сесии на customer-а се изтичат, магазинните не', async () => {
  const { s, ports } = fake({
    open: {
      cus_old: [
        { id: 'cs_plan_a', kind: 'plan' },
        { id: 'cs_shop', kind: 'shop' },
        { id: 'cs_plan_b', kind: 'plan' },
      ],
    },
  });
  const r = await preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), ports);
  assert.equal(r.ok, true);
  assert.deepEqual(s.expired, ['cs_plan_a', 'cs_plan_b']);
});

test('PC3b expire става ПРЕДИ проверката на абонаментите (затваря прозореца)', async () => {
  const order: string[] = [];
  const { ports } = fake({ open: { cus_old: [{ id: 'cs_a', kind: 'plan' }] } });
  const wrapped: PlanCheckoutPorts = {
    ...ports,
    expireSession: async (id) => {
      order.push(`expire:${id}`);
    },
    listSubscriptionStatuses: async () => {
      order.push('subs');
      return [];
    },
  };
  await preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), wrapped);
  assert.deepEqual(order, ['expire:cs_a', 'subs']);
});

test('PC3c провален expire се пропагира (fail-closed, без нова сесия)', async () => {
  const { ports } = fake({ open: { cus_old: [{ id: 'cs_a', kind: 'plan' }] } });
  await assert.rejects(
    preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), {
      ...ports,
      expireSession: async () => {
        throw new Error('not expireable');
      },
    }),
  );
});

// КП4: webhook-ът не презаписва stripeCustomerId с различен customer.
test('PC4 webhook: различен customer не се записва, разминаването се отбелязва', () => {
  assert.deepEqual(customerLinkUpdate('cus_A', 'cus_B'), { set: null, mismatch: true });
  assert.deepEqual(customerLinkUpdate('cus_A', 'cus_A'), { set: null, mismatch: false });
  assert.deepEqual(customerLinkUpdate(null, 'cus_B'), { set: 'cus_B', mismatch: false });
  assert.deepEqual(customerLinkUpdate('cus_A', null), { set: null, mismatch: false });
  assert.deepEqual(customerLinkUpdate(null, null), { set: null, mismatch: false });
});

// №1 (Кодаджията): „Основател“ със SEPA/iDEAL в обработка (complete + unpaid).
test('PC2e неплатен „Основател“ в обработка блокира; canceled/requires_payment_method — не', async () => {
  for (const [status, blocks] of [
    ['processing', true],
    ['succeeded', true],
    ['requires_action', true],
    ['canceled', false],
    ['requires_payment_method', false],
  ] as const) {
    const { ports } = fake({ founderPending: { cus_old: ['pi_p'] }, piStatus: { pi_p: status } });
    const r = await preparePlanCheckout(user({ stripeCustomerId: 'cus_old' }), ports);
    assert.equal(r.ok, !blocks, `PI ${status}`);
  }
});

// №4: чистите решения зад адаптерите.
test('PC6 isPlanSession: само plan сесии (вкл. заварени без kind)', () => {
  assert.equal(isPlanSession({ kind: 'plan', userId: 'u1', plan: 'PRO' }), true);
  assert.equal(isPlanSession({ userId: 'u1', plan: 'BUSINESS' }), true);
  assert.equal(isPlanSession({ kind: 'shop', productId: 'p', profileId: 'pr', plan: 'PRO' }), false);
  assert.equal(isPlanSession(null), false);
});

test('PC7 founderSessionPayment: само FOUNDER plan, paid → paid, unpaid → pending', () => {
  const base = {
    metadata: { kind: 'plan', userId: 'u1', plan: 'FOUNDER' },
    payment_intent: 'pi_f',
    mode: 'payment',
  };
  assert.deepEqual(founderSessionPayment({ ...base, payment_status: 'paid' }), {
    paymentIntentId: 'pi_f',
    paid: true,
  });
  assert.deepEqual(founderSessionPayment({ ...base, payment_status: 'unpaid' }), {
    paymentIntentId: 'pi_f',
    paid: false,
  });
  assert.equal(founderSessionPayment({ ...base, payment_status: 'no_payment_required' }), null);
  assert.equal(
    founderSessionPayment({ ...base, payment_status: 'paid', metadata: { kind: 'plan', userId: 'u1', plan: 'PRO' } }),
    null,
  );
  assert.equal(founderSessionPayment({ ...base, payment_status: 'paid', payment_intent: null }), null);
  assert.deepEqual(
    founderSessionPayment({ ...base, payment_status: 'paid', payment_intent: { id: 'pi_x' } }),
    { paymentIntentId: 'pi_x', paid: true },
  );
});

test('PC8 customerClaimWhere: CAS само върху празен stripeCustomerId', () => {
  assert.deepEqual(customerClaimWhere('u1'), { id: 'u1', stripeCustomerId: null });
});

// №4: Stripe адаптерът срещу mock клиент (параметри + филтри).
function list<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const i of items) yield i;
    },
  };
}

function mockStripe() {
  const calls: { op: string; args: unknown[] }[] = [];
  type S = {
    id: string;
    metadata: Record<string, string>;
    payment_status: string;
    payment_intent: string | null;
    mode: string;
  };
  const sessions: { open: S[]; complete: S[] } = {
    open: [
      { id: 'cs_plan', metadata: { kind: 'plan', userId: 'u1', plan: 'PRO' }, payment_status: 'unpaid', payment_intent: null, mode: 'subscription' },
      { id: 'cs_shop', metadata: { kind: 'shop', productId: 'p', profileId: 'pr' }, payment_status: 'unpaid', payment_intent: null, mode: 'payment' },
    ],
    complete: [
      { id: 'cs_f_paid', metadata: { kind: 'plan', userId: 'u1', plan: 'FOUNDER' }, payment_status: 'paid', payment_intent: 'pi_paid', mode: 'payment' },
      { id: 'cs_f_pend', metadata: { kind: 'plan', userId: 'u1', plan: 'FOUNDER' }, payment_status: 'unpaid', payment_intent: 'pi_pend', mode: 'payment' },
      { id: 'cs_pro', metadata: { kind: 'plan', userId: 'u1', plan: 'PRO' }, payment_status: 'paid', payment_intent: null, mode: 'subscription' },
      { id: 'cs_shop_paid', metadata: { kind: 'shop', productId: 'p', profileId: 'pr', plan: 'FOUNDER' }, payment_status: 'paid', payment_intent: 'pi_shop', mode: 'payment' },
    ],
  };
  const client: PlanStripeClient = {
    customers: {
      create: async (params, options) => {
        calls.push({ op: 'customers.create', args: [params, options] });
        return { id: 'cus_new' };
      },
    },
    subscriptions: {
      list: (params) => {
        calls.push({ op: 'subscriptions.list', args: [params] });
        return list([{ status: 'canceled' }, { status: 'past_due' }]);
      },
    },
    checkout: {
      sessions: {
        list: (params) => {
          calls.push({ op: 'sessions.list', args: [params] });
          return list(params.status === 'open' ? sessions.open : sessions.complete);
        },
        expire: async (id) => {
          calls.push({ op: 'sessions.expire', args: [id] });
          return {};
        },
      },
    },
    paymentIntents: {
      retrieve: async (id) => {
        calls.push({ op: 'paymentIntents.retrieve', args: [id] });
        return { status: 'processing' };
      },
    },
  };
  return { client, calls };
}

test('PC9 Stripe адаптер: create с idempotency key; list-ове по customer; филтри plan/FOUNDER', async () => {
  const { client, calls } = mockStripe();
  const ports = createPlanStripePorts(client);
  assert.equal(await ports.createCustomer({ userId: 'u1', email: 'e@x.test' }, 'key-u1'), 'cus_new');
  assert.deepEqual(calls[0].args, [
    { email: 'e@x.test', metadata: { userId: 'u1' } },
    { idempotencyKey: 'key-u1' },
  ]);
  assert.deepEqual(await ports.listSubscriptionStatuses('cus_1'), ['canceled', 'past_due']);
  assert.deepEqual(calls.at(-1)!.args[0], { customer: 'cus_1', status: 'all', limit: 100 });
  assert.deepEqual(await ports.listOpenPlanSessionIds('cus_1'), ['cs_plan']);
  assert.deepEqual(calls.at(-1)!.args[0], { customer: 'cus_1', status: 'open', limit: 100 });
  assert.deepEqual(await ports.listFounderSessions('cus_1'), [
    { paymentIntentId: 'pi_paid', paid: true },
    { paymentIntentId: 'pi_pend', paid: false },
  ]);
  assert.deepEqual(calls.at(-1)!.args[0], { customer: 'cus_1', status: 'complete', limit: 100 });
  await ports.expireSession('cs_plan');
  assert.deepEqual(calls.at(-1), { op: 'sessions.expire', args: ['cs_plan'] });
  assert.equal(await ports.paymentIntentStatus('pi_pend'), 'processing');
});
