// Договорът за плановете (core: пари). Кодовете на тестовете (C, P, S, U, R, F, G, RF, X, D, L, H, B …)
// са критериите за приемане в linketto/docs/billing-spec.md — раздел 4 и 9–9.4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCheckout,
  buildPlanPriceMap,
  planForPriceIds,
  subscriptionGrantsPlan,
  decideSubscriptionSync,
  paymentReversal,
  decideFounderPayment,
  shouldClearRevocationOnGrant,
  disputeHoldSubscriptionId,
  decidePlanSubscriptionCollection,
  decidePlanSubscriptionDispute,
  selectAdoptableSubscription,
  decideCheckoutPlanGrant,
  decideReferralReversal,
  type PlanUserSnapshot,
  type SubscriptionSnapshot,
  type ChargeSnapshot,
  type PaymentReversal,
  type ReferralSnapshot,
  type PayoutSnapshot,
} from '../billing-sync';
import {
  applyFounderDecision,
  applyPlanSubscriptionDispute,
  applyPlanSync,
  applyReferralDecision,
} from './plan-model';
import { canWithdraw } from '../referral';
import type { PlanId } from '../plans';

// ── Фабрики (ефимерни, синтетични id-та; суми в цели центове) ──────────
const ENV = {
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro_m',
  STRIPE_PRICE_BUSINESS_ANNUAL: 'price_bus_y',
  STRIPE_PRICE_PRO: 'price_pro_legacy',
  STRIPE_PRICE_FOUNDER: 'price_founder',
};
const PRICE_MAP = buildPlanPriceMapSafe();
function buildPlanPriceMapSafe() {
  return buildPlanPriceMap(ENV);
}

function U(
  plan: PlanId,
  sub: string | null = null,
  pi: string | null = null,
  revoked: 'refund' | 'dispute' | null = null,
): PlanUserSnapshot {
  return {
    id: 'u1',
    plan,
    stripeCustomerId: 'cus_1',
    planSubscriptionId: sub,
    planPaymentIntentId: pi,
    planRevokedReason: revoked,
  };
}
function S(id: string, status: string, priceIds: string[] = [], customerId = 'cus_1'): SubscriptionSnapshot {
  return { id, customerId, status, priceIds };
}
function C(amountCents: number, amountRefundedCents: number): ChargeSnapshot {
  return { amountCents, amountRefundedCents };
}

const NOT_REVERSED: PaymentReversal = { reversed: false };
const R_REFUND: PaymentReversal = { reversed: true, reason: 'refund' };
const R_DISPUTE: PaymentReversal = { reversed: true, reason: 'dispute' };

const T0 = new Date('2026-01-10T10:00:00Z');
const T1 = new Date('2026-01-20T10:00:00Z');
const T2 = new Date('2026-01-25T10:00:00Z');
const T_MINUS1 = new Date('2026-01-01T10:00:00Z');
const NOW = new Date('2026-02-01T10:00:00Z');

function referral(over: Partial<ReferralSnapshot> = {}): ReferralSnapshot {
  return {
    id: 'ref_1',
    referrerId: 'u_ref',
    rewardCents: 735,
    createdAt: T0,
    stripePaymentIntentId: 'pi_R',
    reversedAt: null,
    reversalReason: null,
    ...over,
  };
}
function payout(id: string, requestedAt: Date, status: 'pending' | 'paid' = 'pending'): PayoutSnapshot {
  return { id, requestedAt, status };
}

/** Един "webhook" за реферал: решение върху текущото състояние, после прилагане. */
function referralStep(
  state: { referral: ReferralSnapshot; balanceCents: number },
  pi: string,
  reversal: PaymentReversal,
  payouts: readonly PayoutSnapshot[] = [],
) {
  const decision = decideReferralReversal(state.referral, pi, reversal, payouts);
  return { decision, next: applyReferralDecision(state, decision, NOW) };
}

// ── 4.1 Класификация и цени ─────────────────────────────────────────

test('C1: kind=plan с FOUNDER се класифицира като plan', () => {
  assert.deepEqual(classifyCheckout({ kind: 'plan', userId: 'u1', plan: 'FOUNDER' }), {
    kind: 'plan',
    userId: 'u1',
    plan: 'FOUNDER',
  });
});

test('C2: магазин с plan на продавача и без userId е shop, не plan', () => {
  assert.deepEqual(classifyCheckout({ productId: 'prod_1', profileId: 'prof_1', plan: 'PRO' }), {
    kind: 'shop',
    productId: 'prod_1',
    profileId: 'prof_1',
  });
});

test('C3: заварен checkout без kind (userId + plan) е plan', () => {
  assert.deepEqual(classifyCheckout({ userId: 'u1', plan: 'PRO' }), {
    kind: 'plan',
    userId: 'u1',
    plan: 'PRO',
  });
});

test('C4: userId + plan + productId + profileId без kind е ignore ambiguous', () => {
  assert.deepEqual(
    classifyCheckout({ userId: 'u1', plan: 'PRO', productId: 'prod_1', profileId: 'prof_1' }),
    { kind: 'ignore', reason: 'ambiguous' },
  );
});

test('C5: plan FREE или непознат план е ignore unknown-plan', () => {
  assert.deepEqual(classifyCheckout({ kind: 'plan', userId: 'u1', plan: 'FREE' }), {
    kind: 'ignore',
    reason: 'unknown-plan',
  });
  assert.deepEqual(classifyCheckout({ kind: 'plan', userId: 'u1', plan: 'XYZ' }), {
    kind: 'ignore',
    reason: 'unknown-plan',
  });
});

test('C6: null и празни метаданни са ignore no-metadata', () => {
  assert.deepEqual(classifyCheckout(null), { kind: 'ignore', reason: 'no-metadata' });
  assert.deepEqual(classifyCheckout({}), { kind: 'ignore', reason: 'no-metadata' });
});

test('P1: картата цена → план включва заварените цени и изключва FOUNDER', () => {
  const map = buildPlanPriceMap(ENV);
  assert.equal(map.get('price_pro_m'), 'PRO');
  assert.equal(map.get('price_bus_y'), 'BUSINESS');
  assert.equal(map.get('price_pro_legacy'), 'PRO');
  assert.equal(map.has('price_founder'), false);
  assert.equal(map.size, 3);
});

test('P2: една цена за два плана е грешна конфигурация и хвърля', () => {
  assert.throws(() =>
    buildPlanPriceMap({
      STRIPE_PRICE_PRO_MONTHLY: 'price_same',
      STRIPE_PRICE_BUSINESS_MONTHLY: 'price_same',
    }),
  );
});

test('P3: непозната цена → planForPriceIds връща null', () => {
  assert.equal(planForPriceIds(['price_x'], PRICE_MAP), null);
});

test('P4: цени от различни планове → planForPriceIds връща null', () => {
  assert.equal(planForPriceIds(['price_pro_m', 'price_bus_y'], PRICE_MAP), null);
});

test('P5: една цена на BUSINESS → BUSINESS', () => {
  assert.equal(planForPriceIds(['price_bus_y'], PRICE_MAP), 'BUSINESS');
});

// ── 4.2 Абонамент → план ───────────────────────────────────────────

test('S0: кои статуси дават план (fail-closed за непознат)', () => {
  for (const s of ['active', 'trialing', 'past_due']) {
    assert.equal(subscriptionGrantsPlan(s), true, s);
  }
  for (const s of ['incomplete', 'incomplete_expired', 'unpaid', 'paused', 'canceled', 'foo']) {
    assert.equal(subscriptionGrantsPlan(s), false, s);
  }
});

test('U1: същият план и активен абонамент → noop unchanged', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('PRO', 'sub_1'), S('sub_1', 'active', ['price_pro_m']), PRICE_MAP),
    { action: 'noop', reason: 'unchanged' },
  );
});

test('U2: смяна през Portal на нова цена → set BUSINESS', () => {
  const d = decideSubscriptionSync(U('PRO', 'sub_1'), S('sub_1', 'active', ['price_bus_y']), PRICE_MAP);
  assert.equal(d.action, 'set');
  assert.equal(d.action === 'set' && d.plan, 'BUSINESS');
});

test('U3: unpaid сваля до FREE, но planSubscriptionId остава', () => {
  const d = decideSubscriptionSync(U('PRO', 'sub_1'), S('sub_1', 'unpaid', ['price_pro_m']), PRICE_MAP);
  assert.equal(d.action, 'set');
  assert.equal(d.action === 'set' && d.plan, 'FREE');
  const after = applyPlanSync(U('PRO', 'sub_1'), d);
  assert.equal(after.plan, 'FREE');
  assert.equal(after.planSubscriptionId, 'sub_1');
});

test('U4: paused сваля до FREE', () => {
  const d = decideSubscriptionSync(U('PRO', 'sub_1'), S('sub_1', 'paused', ['price_pro_m']), PRICE_MAP);
  assert.equal(d.action, 'set');
  assert.equal(d.action === 'set' && d.plan, 'FREE');
});

test('U5: past_due е гратис, планът не се пипа', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('PRO', 'sub_1'), S('sub_1', 'past_due', ['price_pro_m']), PRICE_MAP),
    { action: 'noop', reason: 'unchanged' },
  );
});

test('U6: след unpaid, платена фактура (active) връща PRO', () => {
  const afterU3 = applyPlanSync(
    U('PRO', 'sub_1'),
    decideSubscriptionSync(U('PRO', 'sub_1'), S('sub_1', 'unpaid', ['price_pro_m']), PRICE_MAP),
  );
  const d = decideSubscriptionSync(afterU3, S('sub_1', 'active', ['price_pro_m']), PRICE_MAP);
  assert.equal(d.action, 'set');
  assert.equal(d.action === 'set' && d.plan, 'PRO');
  assert.equal(applyPlanSync(afterU3, d).plan, 'PRO');
});

test('U7: FOUNDER без абонамент не се сваля при deleted на стар абонамент', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('FOUNDER', null), S('sub_old', 'canceled', ['price_pro_m']), PRICE_MAP),
    { action: 'noop', reason: 'founder' },
  );
});

test('U7b: FOUNDER със записан стар абонамент не се сваля при deleted', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('FOUNDER', 'sub_old'), S('sub_old', 'canceled'), PRICE_MAP),
    { action: 'noop', reason: 'founder' },
  );
});

test('U8: deleted на стар абонамент не сваля плана, вързан към друг абонамент', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('PRO', 'sub_2'), S('sub_1', 'canceled'), PRICE_MAP),
    { action: 'noop', reason: 'not-plan-subscription' },
  );
});

test('U9: заварен потребител без planSubscriptionId осиновява абонамента (set, дори при същия план)', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('PRO', null), S('sub_1', 'active', ['price_pro_legacy']), PRICE_MAP),
    { action: 'set', plan: 'PRO', adoptSubscriptionId: 'sub_1' },
  );
});

test('U10: абонамент на друг customer не се осиновява', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('PRO', null), S('sub_9', 'canceled', [], 'cus_OTHER'), PRICE_MAP),
    { action: 'noop', reason: 'not-plan-subscription' },
  );
});

test('U11: членство в магазина (цена извън картата) не засяга плана на продавача', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('BUSINESS', null), S('sub_m', 'canceled', ['price_adhoc']), PRICE_MAP),
    { action: 'noop', reason: 'not-plan-subscription' },
  );
});

test('U12: активен абонамент с непозната цена не сваля плащащ клиент', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('PRO', 'sub_1'), S('sub_1', 'active', ['price_x']), PRICE_MAP),
    { action: 'noop', reason: 'unknown-price' },
  );
});

test('U13: няма потребител → noop no-user', () => {
  assert.deepEqual(
    decideSubscriptionSync(null, S('sub_1', 'active', ['price_pro_m']), PRICE_MAP),
    { action: 'noop', reason: 'no-user' },
  );
});

test('U14: обратен ред deleted/updated при live canceled → винаги FREE', () => {
  const live = S('sub_1', 'canceled', ['price_pro_m']);
  // Двете събития четат един и същ live snapshot, затова редът не може да има значение.
  for (const order of [['deleted', 'updated'], ['updated', 'deleted']]) {
    let user = U('PRO', 'sub_1');
    for (let step = 0; step < order.length; step += 1) {
      user = applyPlanSync(user, decideSubscriptionSync(user, live, PRICE_MAP));
    }
    assert.equal(user.plan, 'FREE', order.join('>'));
  }
});

test('U15: повторено unpaid събитие → първо set FREE, после noop unchanged, едно крайно състояние', () => {
  const live = S('sub_1', 'unpaid', ['price_pro_m']);
  const user0 = U('PRO', 'sub_1');
  const d1 = decideSubscriptionSync(user0, live, PRICE_MAP);
  assert.equal(d1.action, 'set');
  assert.equal(d1.action === 'set' && d1.plan, 'FREE');
  const user1 = applyPlanSync(user0, d1);
  const d2 = decideSubscriptionSync(user1, live, PRICE_MAP);
  assert.deepEqual(d2, { action: 'noop', reason: 'unchanged' });
  assert.deepEqual(applyPlanSync(user1, d2), user1);
});

// ── 4.3 Обърнато плащане (P5) ──────────────────────────────────────

test('R1: пълен refund е обърнато плащане', () => {
  assert.deepEqual(paymentReversal(C(4900, 4900), []), R_REFUND);
});

test('R2: частичен refund не обръща плащането', () => {
  assert.deepEqual(paymentReversal(C(4900, 1000), []), NOT_REVERSED);
});

test('R3: два частични refund-а (2000 + 2900), които стигат пълната сума, са обърнато плащане', () => {
  assert.deepEqual(paymentReversal(C(4900, 2000 + 2900), []), R_REFUND);
});

test('R4: спор needs_response е обърнато плащане', () => {
  assert.deepEqual(paymentReversal(C(4900, 0), ['needs_response']), R_DISPUTE);
});

test('R5: inquiry (warning_*) не е chargeback', () => {
  for (const s of ['warning_needs_response', 'warning_under_review', 'warning_closed']) {
    assert.deepEqual(paymentReversal(C(4900, 0), [s]), NOT_REVERSED, s);
  }
});

test('R6: спечелен или предотвратен спор не обръща плащането', () => {
  for (const s of ['won', 'prevented']) {
    assert.deepEqual(paymentReversal(C(4900, 0), [s]), NOT_REVERSED, s);
  }
});

test('R7: lost, under_review и appeal_* са обърнато плащане', () => {
  for (const s of ['lost', 'under_review', 'appeal_needs_response', 'appeal_under_review']) {
    assert.deepEqual(paymentReversal(C(4900, 0), [s]), R_DISPUTE, s);
  }
});

test('R8: няколко спора, един от които е отворен → обърнато', () => {
  assert.deepEqual(paymentReversal(C(4900, 0), ['won', 'needs_response']), R_DISPUTE);
});

test('R9: непознат статус на спор се брои за обърнато (fail-closed)', () => {
  assert.deepEqual(paymentReversal(C(4900, 0), ['brand_new_status']), R_DISPUTE);
});

test('R10: плащане със сума 0 не е обърнато', () => {
  assert.deepEqual(paymentReversal(C(0, 0), []), NOT_REVERSED);
});

test('R11: refund има предимство пред спор в причината', () => {
  assert.deepEqual(paymentReversal(C(4900, 4900), ['needs_response']), R_REFUND);
});

// ── 4.4 FOUNDER ────────────────────────────────────────────────────

test('F1: пълен refund на FOUNDER плащането отнема плана', () => {
  const user = U('FOUNDER', null, 'pi_F');
  const d = decideFounderPayment(user, 'pi_F', R_REFUND);
  assert.deepEqual(d, { action: 'revoke', reason: 'refund' });
  const after = applyFounderDecision(user, d);
  assert.equal(after.plan, 'FREE');
  assert.equal(after.planRevokedReason, 'refund');
});

test('F2: частичен refund не пипа FOUNDER', () => {
  const user = U('FOUNDER', null, 'pi_F');
  const d = decideFounderPayment(user, 'pi_F', paymentReversal(C(4900, 1000), []));
  assert.deepEqual(d, { action: 'noop', reason: 'unchanged' });
  assert.equal(applyFounderDecision(user, d).plan, 'FOUNDER');
});

test('F3: повторен refund webhook е noop unchanged', () => {
  const user0 = U('FOUNDER', null, 'pi_F');
  const user1 = applyFounderDecision(user0, decideFounderPayment(user0, 'pi_F', R_REFUND));
  const d = decideFounderPayment(user1, 'pi_F', R_REFUND);
  assert.deepEqual(d, { action: 'noop', reason: 'unchanged' });
  assert.deepEqual(applyFounderDecision(user1, d), user1);
});

test('F4: refund на покупка в магазина не сваля FOUNDER на продавача', () => {
  const user = U('FOUNDER', null, 'pi_F');
  const d = decideFounderPayment(user, 'pi_S', R_REFUND);
  assert.deepEqual(d, { action: 'noop', reason: 'not-founder-payment' });
  assert.equal(applyFounderDecision(user, d).plan, 'FOUNDER');
});

test('F4b: refund на покупка в магазина не засяга продавач с PRO (няма planPaymentIntentId)', () => {
  assert.deepEqual(decideFounderPayment(U('PRO', 'sub_1'), 'pi_S', R_REFUND), {
    action: 'noop',
    reason: 'not-founder-payment',
  });
});

test('F5: без потребител → noop not-founder-payment', () => {
  assert.deepEqual(decideFounderPayment(null, 'pi_X', R_REFUND), {
    action: 'noop',
    reason: 'not-founder-payment',
  });
});

test('F6: отворен спор на FOUNDER плащането отнема плана с причина dispute', () => {
  const user = U('FOUNDER', null, 'pi_F');
  const d = decideFounderPayment(user, 'pi_F', paymentReversal(C(4900, 0), ['needs_response']));
  assert.deepEqual(d, { action: 'revoke', reason: 'dispute' });
  const after = applyFounderDecision(user, d);
  assert.equal(after.plan, 'FREE');
  assert.equal(after.planRevokedReason, 'dispute');
});

test('F7: спечелен спор връща FOUNDER и чисти причината', () => {
  const revoked = U('FREE', null, 'pi_F', 'dispute');
  const d = decideFounderPayment(revoked, 'pi_F', paymentReversal(C(4900, 0), ['won']));
  assert.deepEqual(d, { action: 'restore' });
  const after = applyFounderDecision(revoked, d);
  assert.equal(after.plan, 'FOUNDER');
  assert.equal(after.planRevokedReason, null);
});

test('F8: спечелен спор след покупка на друг план само вдига flag, плана не се пипа', () => {
  const user = U('PRO', 'sub_1', 'pi_F', 'dispute');
  const d = decideFounderPayment(user, 'pi_F', NOT_REVERSED);
  assert.deepEqual(d, { action: 'flag', reason: 'restore-blocked-plan-changed' });
  assert.deepEqual(applyFounderDecision(user, d), user);
});

test('F9: след refund провален refund (amount_refunded 0) не връща плана автоматично', () => {
  const refunded = U('FREE', null, 'pi_F', 'refund');
  const d = decideFounderPayment(refunded, 'pi_F', paymentReversal(C(4900, 0), []));
  assert.deepEqual(d, { action: 'noop', reason: 'refund-terminal' });
  assert.equal(applyFounderDecision(refunded, d).plan, 'FREE');
});

test('F10: inquiry (warning_needs_response) не отнема FOUNDER', () => {
  const user = U('FOUNDER', null, 'pi_F');
  const d = decideFounderPayment(user, 'pi_F', paymentReversal(C(4900, 0), ['warning_needs_response']));
  assert.deepEqual(d, { action: 'noop', reason: 'unchanged' });
  assert.equal(applyFounderDecision(user, d).plan, 'FOUNDER');
});

test('F11: събитие за абонамент никога не пипа FOUNDER (виж U7/U7b)', () => {
  for (const sub of [null, 'sub_old']) {
    assert.deepEqual(
      decideSubscriptionSync(U('FOUNDER', sub), S('sub_old', 'canceled', ['price_pro_m']), PRICE_MAP),
      { action: 'noop', reason: 'founder' },
      String(sub),
    );
  }
});

test('F12: закъсняло checkout събитие след refund не връща FOUNDER', () => {
  assert.deepEqual(
    decideCheckoutPlanGrant({
      plan: 'FOUNDER',
      mode: 'payment',
      paymentStatus: 'paid',
      paymentIntentId: 'pi_F',
      subscriptionId: null,
      reversal: R_REFUND,
      subscriptionStatus: null,
      currentPlan: 'FREE',
    }),
    { action: 'skip', reason: 'payment-reversed' },
  );
});

// ── 4.5 Предоставяне от checkout ───────────────────────────────────

const GRANT_BASE = {
  plan: 'PRO' as const,
  mode: 'subscription' as const,
  paymentStatus: 'paid' as const,
  paymentIntentId: null,
  subscriptionId: 'sub_1',
  reversal: null,
  subscriptionStatus: 'active',
  currentPlan: 'FREE' as PlanId,
};

test('G1: платен FOUNDER checkout дава FOUNDER, вързан към PaymentIntent', () => {
  assert.deepEqual(
    decideCheckoutPlanGrant({
      plan: 'FOUNDER',
      mode: 'payment',
      paymentStatus: 'paid',
      paymentIntentId: 'pi_F',
      subscriptionId: null,
      reversal: NOT_REVERSED,
      subscriptionStatus: null,
      currentPlan: 'FREE',
    }),
    { action: 'grant', plan: 'FOUNDER', link: { paymentIntentId: 'pi_F' } },
  );
});

test('G2: PRO абонамент със статус active дава PRO, вързан към абонамента', () => {
  assert.deepEqual(decideCheckoutPlanGrant(GRANT_BASE), {
    action: 'grant',
    plan: 'PRO',
    link: { subscriptionId: 'sub_1' },
  });
});

test('G3: закъсняло checkout събитие при live canceled абонамент не дава план', () => {
  assert.deepEqual(decideCheckoutPlanGrant({ ...GRANT_BASE, subscriptionStatus: 'canceled' }), {
    action: 'skip',
    reason: 'subscription-not-granting',
  });
});

test('G4: неплатен FOUNDER checkout не дава план', () => {
  assert.deepEqual(
    decideCheckoutPlanGrant({
      plan: 'FOUNDER',
      mode: 'payment',
      paymentStatus: 'unpaid',
      paymentIntentId: 'pi_F',
      subscriptionId: null,
      reversal: NOT_REVERSED,
      subscriptionStatus: null,
      currentPlan: 'FREE',
    }),
    { action: 'skip', reason: 'not-paid' },
  );
});

test('G5: FOUNDER в режим subscription е mode-mismatch', () => {
  assert.deepEqual(
    decideCheckoutPlanGrant({
      plan: 'FOUNDER',
      mode: 'subscription',
      paymentStatus: 'paid',
      paymentIntentId: null,
      subscriptionId: 'sub_1',
      reversal: null,
      subscriptionStatus: 'active',
      currentPlan: 'FREE',
    }),
    { action: 'skip', reason: 'mode-mismatch' },
  );
});

test('G6: платен FOUNDER без paymentIntentId е missing-link', () => {
  assert.deepEqual(
    decideCheckoutPlanGrant({
      plan: 'FOUNDER',
      mode: 'payment',
      paymentStatus: 'paid',
      paymentIntentId: null,
      subscriptionId: null,
      reversal: NOT_REVERSED,
      subscriptionStatus: null,
      currentPlan: 'FREE',
    }),
    { action: 'skip', reason: 'missing-link' },
  );
});

test('G7: PRO покупка при текущ FOUNDER е already-founder', () => {
  assert.deepEqual(decideCheckoutPlanGrant({ ...GRANT_BASE, currentPlan: 'FOUNDER' }), {
    action: 'skip',
    reason: 'already-founder',
  });
});

test('G8: пробен период (no_payment_required + live trialing) дава PRO', () => {
  assert.deepEqual(
    decideCheckoutPlanGrant({ ...GRANT_BASE, paymentStatus: 'no_payment_required', subscriptionStatus: 'trialing' }),
    { action: 'grant', plan: 'PRO', link: { subscriptionId: 'sub_1' } },
  );
});

// ── 4.6 Реферал (награда 735 ¢ = 15% от 4900 ¢) ───────────────────

test('RF1: пълен refund сторнира наградата, балансът става 0', () => {
  const state = { referral: referral(), balanceCents: 735 };
  const { decision, next } = referralStep(state, 'pi_R', R_REFUND);
  assert.deepEqual(decision, {
    action: 'reverse',
    reason: 'refund',
    decrementCents: 735,
    clawbackPayoutId: null,
    clawbackPayoutStatus: null,
  });
  assert.equal(next.balanceCents, 0);
  assert.notEqual(next.referral.reversedAt, null);
  assert.equal(next.referral.reversalReason, 'refund');
});

test('RF2: повторен refund webhook е noop и балансът не става -735', () => {
  const s0 = { referral: referral(), balanceCents: 735 };
  const s1 = referralStep(s0, 'pi_R', R_REFUND).next;
  const again = referralStep(s1, 'pi_R', R_REFUND);
  assert.deepEqual(again.decision, { action: 'noop', reason: 'unchanged' });
  assert.equal(again.next.balanceCents, 0);
  assert.deepEqual(again.next, s1);
});

test('RF3: частичен refund не сторнира реферала', () => {
  const state = { referral: referral(), balanceCents: 735 };
  const { decision, next } = referralStep(state, 'pi_R', paymentReversal(C(4900, 1000), []));
  assert.deepEqual(decision, { action: 'noop', reason: 'unchanged' });
  assert.equal(next.balanceCents, 735);
});

test('RF4: вече поискано теглене (pending) → дълг в клаузата, баланс -735', () => {
  const state = { referral: referral(), balanceCents: 0 };
  const { decision, next } = referralStep(state, 'pi_R', R_REFUND, [payout('p1', T1, 'pending')]);
  assert.deepEqual(decision, {
    action: 'reverse',
    reason: 'refund',
    decrementCents: 735,
    clawbackPayoutId: 'p1',
    clawbackPayoutStatus: 'pending',
  });
  assert.equal(next.balanceCents, -735);
});

test('RF5: вече платено теглене (paid) → clawback paid, баланс -735, не може да се тегли', () => {
  const state = { referral: referral(), balanceCents: 0 };
  const { decision, next } = referralStep(state, 'pi_R', R_REFUND, [payout('p1', T1, 'paid')]);
  assert.equal(decision.action, 'reverse');
  assert.equal(decision.action === 'reverse' && decision.clawbackPayoutId, 'p1');
  assert.equal(decision.action === 'reverse' && decision.clawbackPayoutStatus, 'paid');
  assert.equal(next.balanceCents, -735);
  assert.equal(canWithdraw(next.balanceCents), false);
});

test('RF6: теглене преди наградата не е засегнато → clawback null, баланс 0', () => {
  const state = { referral: referral(), balanceCents: 735 };
  const { decision, next } = referralStep(state, 'pi_R', R_REFUND, [payout('p0', T_MINUS1, 'paid')]);
  assert.equal(decision.action === 'reverse' && decision.clawbackPayoutId, null);
  assert.equal(next.balanceCents, 0);
});

test('RF7: clawback е най-ранното теглене след наградата, независимо от реда на входа', () => {
  const payouts = [payout('p2', T2, 'pending'), payout('p0', T_MINUS1, 'paid'), payout('p1', T1, 'paid')];
  const { decision } = referralStep({ referral: referral(), balanceCents: 0 }, 'pi_R', R_REFUND, payouts);
  assert.equal(decision.action === 'reverse' && decision.clawbackPayoutId, 'p1');
});

test('RF8: refund на плащане по подновяване не пипа реферала', () => {
  const { decision, next } = referralStep({ referral: referral(), balanceCents: 735 }, 'pi_renewal', R_REFUND);
  assert.deepEqual(decision, { action: 'noop', reason: 'not-referral-payment' });
  assert.equal(next.balanceCents, 735);
});

test('RF9: спор го сторнира, спечелен спор го възстановява, втори won е noop', () => {
  const s0 = { referral: referral(), balanceCents: 735 };
  const s1 = referralStep(s0, 'pi_R', paymentReversal(C(4900, 0), ['needs_response']));
  assert.equal(s1.decision.action === 'reverse' && s1.decision.reason, 'dispute');
  assert.equal(s1.next.balanceCents, 0);

  const won = paymentReversal(C(4900, 0), ['won']);
  const s2 = referralStep(s1.next, 'pi_R', won);
  assert.deepEqual(s2.decision, { action: 'restore', incrementCents: 735 });
  assert.equal(s2.next.balanceCents, 735);
  assert.equal(s2.next.referral.reversedAt, null);

  const s3 = referralStep(s2.next, 'pi_R', won);
  assert.deepEqual(s3.decision, { action: 'noop', reason: 'unchanged' });
  assert.equal(s3.next.balanceCents, 735);
});

test('RF10: след refund провален refund не връща наградата автоматично', () => {
  const s1 = referralStep({ referral: referral(), balanceCents: 735 }, 'pi_R', R_REFUND).next;
  const { decision, next } = referralStep(s1, 'pi_R', paymentReversal(C(4900, 0), []));
  assert.deepEqual(decision, { action: 'noop', reason: 'refund-terminal' });
  assert.equal(next.balanceCents, 0);
});

test('RF11: refund на покупка в магазина от поканения не сторнира реферала', () => {
  const { decision } = referralStep({ referral: referral(), balanceCents: 735 }, 'pi_S', R_REFUND);
  assert.deepEqual(decision, { action: 'noop', reason: 'not-referral-payment' });
});

test('RF12: сторнира се записаната rewardCents, а не преизчислена по текущия процент', () => {
  for (const rewardCents of [735, 490]) {
    const { decision } = referralStep(
      { referral: referral({ rewardCents }), balanceCents: rewardCents },
      'pi_R',
      R_REFUND,
    );
    assert.equal(decision.action === 'reverse' && decision.decrementCents, rewardCents);
  }
});

test('RF13: заварен реферал без stripePaymentIntentId не се разпознава', () => {
  const { decision } = referralStep(
    { referral: referral({ stripePaymentIntentId: null }), balanceCents: 735 },
    'pi_R',
    R_REFUND,
  );
  assert.deepEqual(decision, { action: 'noop', reason: 'not-referral-payment' });
});

// ── 4.7 Спор по плановия абонамент (O-1: пауза на таксуването, не отмяна) ──

test('X1: спор върху плащане по плановия абонамент (active) → pause', () => {
  assert.equal(decidePlanSubscriptionCollection(U('PRO', 'sub_1'), 'sub_1', R_DISPUTE, 'active', false), 'pause');
});

test('X2: пълен refund не паузира таксуването (P7)', () => {
  assert.equal(decidePlanSubscriptionCollection(U('PRO', 'sub_1'), 'sub_1', R_REFUND, 'active', false), 'none');
});

test('X3: inquiry (reversed:false) не паузира таксуването', () => {
  assert.equal(decidePlanSubscriptionCollection(U('PRO', 'sub_1'), 'sub_1', NOT_REVERSED, 'active', false), 'none');
});

test('X4: вече отменен абонамент (canceled) → none', () => {
  assert.equal(decidePlanSubscriptionCollection(U('PRO', 'sub_1'), 'sub_1', R_DISPUTE, 'canceled', false), 'none');
});

test('X5: плащане на друг абонамент → none', () => {
  assert.equal(decidePlanSubscriptionCollection(U('PRO', 'sub_2'), 'sub_1', R_DISPUTE, 'active', false), 'none');
});

test('X6: FOUNDER → none', () => {
  assert.equal(decidePlanSubscriptionCollection(U('FOUNDER', 'sub_1'), 'sub_1', R_DISPUTE, 'active', false), 'none');
  assert.equal(decidePlanSubscriptionCollection(U('FOUNDER', null), null, R_DISPUTE, 'active', false), 'none');
});

test('X7: спечелен спор, таксуването е паузирано от нас (planRevokedReason=dispute) → resume', () => {
  const paused = U('FREE', 'sub_1', null, 'dispute');
  assert.equal(decidePlanSubscriptionCollection(paused, 'sub_1', NOT_REVERSED, 'active', true), 'resume');
});

test('X8: повторено събитие за спор при вече зададено pause_collection → none (идемпотентност)', () => {
  const revoked = U('FREE', 'sub_1', null, 'dispute');
  assert.equal(decidePlanSubscriptionCollection(revoked, 'sub_1', R_DISPUTE, 'active', true), 'none');
  // Преди записа в БД (срив между Stripe и БД): пак none, защото живото състояние вече е паузирано.
  assert.equal(decidePlanSubscriptionCollection(U('PRO', 'sub_1'), 'sub_1', R_DISPUTE, 'active', true), 'none');
});

test('X8b: повторен won при вече възобновено таксуване → none', () => {
  const paused = U('FREE', 'sub_1', null, 'dispute');
  assert.equal(decidePlanSubscriptionCollection(paused, 'sub_1', NOT_REVERSED, 'active', false), 'none');
});

test('X9: won без наша причина (planRevokedReason null) не възобновява чужда пауза', () => {
  assert.equal(decidePlanSubscriptionCollection(U('PRO', 'sub_1'), 'sub_1', NOT_REVERSED, 'active', true), 'none');
});

test('X10: won при отменен абонамент → none', () => {
  const paused = U('FREE', 'sub_1', null, 'dispute');
  assert.equal(decidePlanSubscriptionCollection(paused, 'sub_1', NOT_REVERSED, 'canceled', true), 'none');
});

test('O-1: докато planRevokedReason=dispute, синхронизацията не връща плана дори при active', () => {
  const disputed = U('FREE', 'sub_1', null, 'dispute');
  const d = decideSubscriptionSync(disputed, S('sub_1', 'active', ['price_pro_m']), PRICE_MAP);
  const grantsPaidPlan = d.action === 'set' && d.plan !== 'FREE';
  assert.equal(grantsPaidPlan, false);
  assert.equal(applyPlanSync(disputed, d).plan, 'FREE');
});

test('O-1/В4: причината на noop при блокиран план е dispute-hold', () => {
  assert.deepEqual(
    decideSubscriptionSync(U('FREE', 'sub_1', null, 'dispute'), S('sub_1', 'active', ['price_pro_m']), PRICE_MAP),
    { action: 'noop', reason: 'dispute-hold' },
  );
  // Към FREE синхронизацията не е блокирана: вече е FREE → unchanged.
  assert.deepEqual(
    decideSubscriptionSync(U('FREE', 'sub_1', null, 'dispute'), S('sub_1', 'canceled', ['price_pro_m']), PRICE_MAP),
    { action: 'noop', reason: 'unchanged' },
  );
});

// ── 4.8 Спор по плановия абонамент → FREE и обратно (O-1, O-3) ─────────

test('A1: спор по плащане на плановия абонамент → revoke dispute; apply: FREE, абонаментът остава вързан', () => {
  const user = U('PRO', 'sub_1');
  const d = decidePlanSubscriptionDispute(user, 'sub_1', R_DISPUTE);
  assert.deepEqual(d, { action: 'revoke', reason: 'dispute' });
  const after = applyPlanSubscriptionDispute(user, d);
  assert.equal(after.plan, 'FREE');
  assert.equal(after.planRevokedReason, 'dispute');
  assert.equal(after.planSubscriptionId, 'sub_1');
});

test('A2: повторено събитие за спора → noop unchanged, същото състояние', () => {
  const user1 = applyPlanSubscriptionDispute(U('PRO', 'sub_1'), { action: 'revoke', reason: 'dispute' });
  const d = decidePlanSubscriptionDispute(user1, 'sub_1', R_DISPUTE);
  assert.deepEqual(d, { action: 'noop', reason: 'unchanged' });
  assert.deepEqual(applyPlanSubscriptionDispute(user1, d), user1);
});

test('A3: пълен refund по абонамента не сваля плана (P7)', () => {
  const user = U('PRO', 'sub_1');
  const d = decidePlanSubscriptionDispute(user, 'sub_1', R_REFUND);
  assert.deepEqual(d, { action: 'noop', reason: 'unchanged' });
  assert.equal(applyPlanSubscriptionDispute(user, d).plan, 'PRO');
});

test('A4: inquiry (reversed:false) без наша причина → unchanged', () => {
  assert.deepEqual(decidePlanSubscriptionDispute(U('PRO', 'sub_1'), 'sub_1', NOT_REVERSED), {
    action: 'noop',
    reason: 'unchanged',
  });
});

test('A5: плащане на друг абонамент или без абонамент → not-plan-subscription-payment', () => {
  for (const sub of ['sub_2', null]) {
    assert.deepEqual(decidePlanSubscriptionDispute(U('PRO', 'sub_1'), sub, R_DISPUTE), {
      action: 'noop',
      reason: 'not-plan-subscription-payment',
    }, String(sub));
  }
  assert.deepEqual(decidePlanSubscriptionDispute(null, 'sub_1', R_DISPUTE), {
    action: 'noop',
    reason: 'not-plan-subscription-payment',
  });
});

test('A6: FOUNDER не се пипа от спор по абонамент', () => {
  assert.deepEqual(decidePlanSubscriptionDispute(U('FOUNDER', 'sub_1'), 'sub_1', R_DISPUTE), {
    action: 'noop',
    reason: 'founder',
  });
});

test('A7: спечелен спор → restore чисти причината; планът се връща от синхронизацията по живия статус', () => {
  const revoked = U('FREE', 'sub_1', null, 'dispute');
  const d = decidePlanSubscriptionDispute(revoked, 'sub_1', paymentReversal(C(400, 0), ['won']));
  assert.deepEqual(d, { action: 'restore' });
  const cleared = applyPlanSubscriptionDispute(revoked, d);
  assert.equal(cleared.planRevokedReason, null);
  assert.equal(cleared.plan, 'FREE');
  const sync = decideSubscriptionSync(cleared, S('sub_1', 'active', ['price_pro_m']), PRICE_MAP);
  assert.equal(sync.action === 'set' && sync.plan, 'PRO');
});

test('A8: втори won след restore → unchanged', () => {
  const cleared = U('FREE', 'sub_1');
  assert.deepEqual(decidePlanSubscriptionDispute(cleared, 'sub_1', NOT_REVERSED), {
    action: 'noop',
    reason: 'unchanged',
  });
});

test('A9: цял сценарий — спор → пауза и FREE → active събитие не връща → won → възобновяване и PRO', () => {
  const live = S('sub_1', 'active', ['price_pro_m']);
  let user = U('PRO', 'sub_1');
  let paused = false;
  // 1) charge.dispute.created (needs_response)
  const rev = paymentReversal(C(400, 0), ['needs_response']);
  assert.equal(decidePlanSubscriptionCollection(user, 'sub_1', rev, live.status, paused), 'pause');
  paused = true;
  user = applyPlanSubscriptionDispute(user, decidePlanSubscriptionDispute(user, 'sub_1', rev));
  assert.equal(user.plan, 'FREE');
  // 2) customer.subscription.updated (pause_collection), статусът остава active
  assert.deepEqual(decideSubscriptionSync(user, live, PRICE_MAP), { action: 'noop', reason: 'dispute-hold' });
  // 3) повторено dispute събитие: нищо ново
  assert.equal(decidePlanSubscriptionCollection(user, 'sub_1', rev, live.status, paused), 'none');
  assert.deepEqual(decidePlanSubscriptionDispute(user, 'sub_1', rev), { action: 'noop', reason: 'unchanged' });
  // 4) charge.dispute.closed (won)
  const won = paymentReversal(C(400, 0), ['won']);
  assert.equal(decidePlanSubscriptionCollection(user, 'sub_1', won, live.status, paused), 'resume');
  paused = false;
  user = applyPlanSubscriptionDispute(user, decidePlanSubscriptionDispute(user, 'sub_1', won));
  user = applyPlanSync(user, decideSubscriptionSync(user, live, PRICE_MAP));
  assert.equal(user.plan, 'PRO');
  assert.equal(user.planRevokedReason, null);
  // 5) повторен won: нищо
  assert.equal(decidePlanSubscriptionCollection(user, 'sub_1', won, live.status, paused), 'none');
});

test('G9: закъсняло checkout събитие за абонамент под спор не връща плана (dispute-hold)', () => {
  assert.deepEqual(decideCheckoutPlanGrant({ ...GRANT_BASE, holdSubscriptionId: 'sub_1' }), {
    action: 'skip',
    reason: 'dispute-hold',
  });
  // Нов абонамент (друг id) не е блокиран от стария спор.
  assert.equal(decideCheckoutPlanGrant({ ...GRANT_BASE, subscriptionId: 'sub_2', holdSubscriptionId: 'sub_1' }).action, 'grant');
});

test('L1: заварен клиент — събитие за мъртъв абонамент, а има жив планов → осиновява се живият', () => {
  const dead = S('sub_old', 'canceled', ['price_pro_m']);
  const alive = S('sub_new', 'active', ['price_bus_y']);
  assert.deepEqual(selectAdoptableSubscription(dead, [dead, alive], PRICE_MAP), alive);
  const d = decideSubscriptionSync(U('PRO', null), selectAdoptableSubscription(dead, [dead, alive], PRICE_MAP), PRICE_MAP);
  assert.deepEqual(d, { action: 'set', plan: 'BUSINESS', adoptSubscriptionId: 'sub_new' });
});

test('L2: няма жив планов абонамент → остава събитийният (сваляне до FREE)', () => {
  const dead = S('sub_old', 'canceled', ['price_pro_m']);
  const shop = S('sub_m', 'active', ['price_adhoc']);
  assert.deepEqual(selectAdoptableSubscription(dead, [dead, shop], PRICE_MAP), dead);
});

test('L3: събитийният абонамент е жив → не се търси друг', () => {
  const alive = S('sub_1', 'active', ['price_pro_m']);
  const other = S('sub_2', 'active', ['price_bus_y']);
  assert.deepEqual(selectAdoptableSubscription(alive, [other, alive], PRICE_MAP), alive);
});

// ── 9.2 Ревю на Кодаджията (A10, A11, G10, F13, L4, B1) ─────────────────────
// Новите износи се вземат динамично: липсващ износ дава ясен провал на ТЕСТА
// („липсва износ …"), а не SyntaxError за целия файл.
import * as billingSync from '../billing-sync';

function exported<T>(name: string): T {
  const fn = (billingSync as unknown as Record<string, unknown>)[name];
  if (typeof fn !== 'function') assert.fail(`липсва износ billing-sync.${name}`);
  return fn as T;
}

type Collection = 'pause' | 'resume' | 'none';
// Разширени (обратно съвместими) сигнатури: допълнителен trailing аргумент.
const collect = decidePlanSubscriptionCollection as unknown as (
  user: PlanUserSnapshot | null,
  sub: string | null,
  reversal: PaymentReversal,
  status: string,
  paused: boolean,
  paymentIntentId?: string | null,
) => Collection;
const disputeOf = decidePlanSubscriptionDispute as unknown as (
  user: PlanUserSnapshot | null,
  sub: string | null,
  reversal: PaymentReversal,
  paymentIntentId?: string | null,
) => ReturnType<typeof decidePlanSubscriptionDispute>;
const applyDispute = applyPlanSubscriptionDispute as unknown as (
  user: PlanUserSnapshot,
  d: ReturnType<typeof decidePlanSubscriptionDispute>,
  paymentIntentId?: string | null,
) => PlanUserSnapshot & { planDisputedPaymentIntentId?: string | null };

/** Потребител под спор по абонамента, с записан оспорен PaymentIntent (A10). */
function disputedUser(pi: string | null = 'pi_A'): PlanUserSnapshot {
  return { ...U('FREE', 'sub_1', null, 'dispute'), planDisputedPaymentIntentId: pi } as PlanUserSnapshot;
}
const WON: PaymentReversal = NOT_REVERSED;

test('A10a: apply на revoke записва кое плащане е оспорено', () => {
  const after = applyDispute(U('PRO', 'sub_1'), { action: 'revoke', reason: 'dispute' }, 'pi_A');
  assert.equal(after.plan, 'FREE');
  assert.equal(after.planDisputedPaymentIntentId, 'pi_A');
});

test('A10b: необърнато събитие за ДРУГ PaymentIntent при отворен спор → collection none', () => {
  assert.equal(collect(disputedUser('pi_A'), 'sub_1', WON, 'active', true, 'pi_B'), 'none');
});

test('A10c: необърнато събитие за записания оспорен PI → resume', () => {
  assert.equal(collect(disputedUser('pi_A'), 'sub_1', WON, 'active', true, 'pi_A'), 'resume');
});

test('A10d: необърнато събитие за ДРУГ PI → dispute noop unchanged (restore не се допуска)', () => {
  assert.deepEqual(disputeOf(disputedUser('pi_A'), 'sub_1', WON, 'pi_B'), {
    action: 'noop',
    reason: 'unchanged',
  });
});

test('A10e: необърнато събитие за записания PI → restore; apply чисти и записания PI', () => {
  const user = disputedUser('pi_A');
  const d = disputeOf(user, 'sub_1', WON, 'pi_A');
  assert.deepEqual(d, { action: 'restore' });
  const after = applyDispute(user, d, 'pi_A');
  assert.equal(after.planRevokedReason, null);
  assert.equal(after.planDisputedPaymentIntentId ?? null, null);
});

test('A10f: сценарий — успешно друго плащане по време на спора не връща плана; won по pi_A го връща', () => {
  let user = applyDispute(U('PRO', 'sub_1'), disputeOf(U('PRO', 'sub_1'), 'sub_1', R_DISPUTE, 'pi_A'), 'pi_A');
  assert.equal(user.plan, 'FREE');
  // Нов цикъл на таксуване (pause_collection още е зададено): друг PI, не е обърнат.
  assert.equal(collect(user, 'sub_1', WON, 'active', true, 'pi_B'), 'none');
  const dB = disputeOf(user, 'sub_1', WON, 'pi_B');
  user = applyDispute(user, dB, 'pi_B');
  assert.equal(user.planRevokedReason, 'dispute');
  assert.equal(user.plan, 'FREE');
  // Спорът по pi_A е спечелен.
  assert.equal(collect(user, 'sub_1', WON, 'active', true, 'pi_A'), 'resume');
  user = applyDispute(user, disputeOf(user, 'sub_1', WON, 'pi_A'), 'pi_A');
  assert.equal(user.planRevokedReason, null);
});

test('A10g: заварен ред без записан PI (null) остава съвместим — won възобновява по всеки PI', () => {
  assert.equal(collect(disputedUser(null), 'sub_1', WON, 'active', true, 'pi_X'), 'resume');
  assert.deepEqual(disputeOf(disputedUser(null), 'sub_1', WON, 'pi_X'), { action: 'restore' });
});

test('A11a: pause → първо БД (revoke), после Stripe; resume → първо Stripe, после БД', () => {
  const steps = exported<(c: Collection, d: ReturnType<typeof decidePlanSubscriptionDispute>) => string[]>(
    'planDisputeSteps',
  );
  assert.deepEqual(steps('pause', { action: 'revoke', reason: 'dispute' }), ['db-revoke', 'stripe-pause']);
  assert.deepEqual(steps('resume', { action: 'restore' }), ['stripe-resume', 'db-restore']);
});

test('A11b: ретрай — когато едната половина вече е направена, остава само другата', () => {
  const steps = exported<(c: Collection, d: ReturnType<typeof decidePlanSubscriptionDispute>) => string[]>(
    'planDisputeSteps',
  );
  // pause: БД е готова (unchanged), Stripe още не е.
  assert.deepEqual(steps('pause', { action: 'noop', reason: 'unchanged' }), ['stripe-pause']);
  // pause: Stripe е готов (none), БД още не е.
  assert.deepEqual(steps('none', { action: 'revoke', reason: 'dispute' }), ['db-revoke']);
  // resume: Stripe е готов (none), БД още не е възстановена.
  assert.deepEqual(steps('none', { action: 'restore' }), ['db-restore']);
  assert.deepEqual(steps('none', { action: 'noop', reason: 'unchanged' }), []);
});

test('A11c: срив на Stripe след pause не оставя платен план — БД е отнета ПРЕДИ заявката', () => {
  const steps = exported<(c: Collection, d: ReturnType<typeof decidePlanSubscriptionDispute>) => string[]>(
    'planDisputeSteps',
  );
  let user = U('PRO', 'sub_1');
  let paused = false;
  const planWhenStripeCalled: PlanId[] = [];
  const run = (stripeFails: boolean) => {
    const c = collect(user, 'sub_1', R_DISPUTE, 'active', paused);
    const d = disputeOf(user, 'sub_1', R_DISPUTE, 'pi_A');
    for (const step of steps(c, d)) {
      if (step === 'db-revoke') user = applyDispute(user, d, 'pi_A');
      if (step === 'stripe-pause') {
        planWhenStripeCalled.push(user.plan);
        if (stripeFails) throw new Error('stripe 500');
        paused = true;
      }
    }
  };
  assert.throws(() => run(true), /stripe 500/);
  assert.equal(user.plan, 'FREE'); // паричният риск е затворен веднага
  run(false); // ретрай довършва
  assert.equal(paused, true);
  assert.deepEqual(planWhenStripeCalled, ['FREE', 'FREE']);
});

test('A11d: сторното на реферала е отделен опит — тръгва и когато паузата се провали, и грешката се връща (→ 500/ретрай)', async () => {
  const runIsolated = exported<(tasks: readonly (() => Promise<unknown>)[]) => Promise<void>>('runIsolated');
  const ran: string[] = [];
  await assert.rejects(
    runIsolated([
      async () => {
        ran.push('pause');
        throw new Error('stripe down');
      },
      async () => {
        ran.push('referral');
      },
    ]),
    /stripe down/,
  );
  assert.deepEqual(ran, ['pause', 'referral']);
  // Без грешки — всички по ред, без хвърляне.
  const ok: string[] = [];
  await runIsolated([async () => void ok.push('a'), async () => void ok.push('b')]);
  assert.deepEqual(ok, ['a', 'b']);
});

test('G10a: след успешно предоставяне от абонамент се ресинхронизира по неговото id', () => {
  const resync = exported<(d: ReturnType<typeof decideCheckoutPlanGrant>) => string | null>(
    'subscriptionIdToResyncAfterGrant',
  );
  assert.equal(resync({ action: 'grant', plan: 'PRO', link: { subscriptionId: 'sub_1' } }), 'sub_1');
  assert.equal(resync({ action: 'grant', plan: 'FOUNDER', link: { paymentIntentId: 'pi_F' } }), null);
  assert.equal(resync({ action: 'skip', reason: 'not-paid' }), null);
});

test('G10b: състезание grant↔deleted — grant по стар active, после sync по жив canceled → FREE', () => {
  const resync = exported<(d: ReturnType<typeof decideCheckoutPlanGrant>) => string | null>(
    'subscriptionIdToResyncAfterGrant',
  );
  const grant = decideCheckoutPlanGrant({
    plan: 'PRO', mode: 'subscription', paymentStatus: 'paid', paymentIntentId: null,
    subscriptionId: 'sub_1', reversal: null, subscriptionStatus: 'active', currentPlan: 'FREE',
  });
  let user = U('PRO', 'sub_1'); // резултат от grant
  const target = resync(grant);
  assert.equal(target, 'sub_1');
  user = applyPlanSync(user, decideSubscriptionSync(user, S(target as string, 'canceled', ['price_pro_m']), PRICE_MAP));
  assert.equal(user.plan, 'FREE');
});

test('F13a: grant на не-FOUNDER план пази dispute причината, когато FOUNDER е отнет по спор', () => {
  const keep = exported<(u: PlanUserSnapshot, plan: PlanId) => boolean>('shouldClearRevocationOnGrant');
  const founderDisputed = U('FREE', null, 'pi_F', 'dispute');
  assert.equal(keep(founderDisputed, 'PRO'), false);
  assert.equal(keep(founderDisputed, 'BUSINESS'), false);
});

test('F13b: изчистването остава в останалите случаи', () => {
  const clear = exported<(u: PlanUserSnapshot, plan: PlanId) => boolean>('shouldClearRevocationOnGrant');
  assert.equal(clear(U('FREE', null, 'pi_F', 'dispute'), 'FOUNDER'), true); // нова FOUNDER покупка
  assert.equal(clear(U('FREE', null, 'pi_F', 'refund'), 'PRO'), true);
  assert.equal(clear(U('FREE', null, null, null), 'PRO'), true);
  assert.equal(clear(U('FREE', 'sub_1', null, 'dispute'), 'PRO'), true); // спор по абонамент, не по FOUNDER
});

test('F13c: сценарий — FOUNDER спор → PRO покупка → won по FOUNDER стига до flag (F8)', () => {
  const clear = exported<(u: PlanUserSnapshot, plan: PlanId) => boolean>('shouldClearRevocationOnGrant');
  let user = applyFounderDecision(U('FOUNDER', null, 'pi_F'), { action: 'revoke', reason: 'dispute' });
  user = {
    ...user,
    plan: 'PRO',
    planSubscriptionId: 'sub_9',
    planRevokedReason: clear(user, 'PRO') ? null : user.planRevokedReason,
  };
  assert.deepEqual(decideFounderPayment(user, 'pi_F', NOT_REVERSED), {
    action: 'flag',
    reason: 'restore-blocked-plan-changed',
  });
});

test('F13d: запазеният FOUNDER-спор не блокира синхронизацията на новия абонамент (няма dispute-hold)', () => {
  // PRO през sub_9, причината 'dispute' е от FOUNDER (planPaymentIntentId зададен).
  const user = U('PRO', 'sub_9', 'pi_F', 'dispute');
  assert.deepEqual(decideSubscriptionSync(user, S('sub_9', 'active', ['price_bus_y']), PRICE_MAP), {
    action: 'set',
    plan: 'BUSINESS',
    adoptSubscriptionId: null,
  });
});

test('L4a: осиновяване с цена извън STRIPE_PRICE_* → noop not-plan-subscription (непроменено) и обяснима причина', () => {
  const user = U('BUSINESS', null);
  const sub = S('sub_m', 'active', ['price_adhoc']);
  assert.deepEqual(decideSubscriptionSync(user, sub, PRICE_MAP), { action: 'noop', reason: 'not-plan-subscription' });
  const why = exported<(u: PlanUserSnapshot | null, s: SubscriptionSnapshot, m: typeof PRICE_MAP) => string | null>(
    'adoptionSkipReason',
  );
  assert.equal(why(user, sub, PRICE_MAP), 'unknown-price');
});

test('L4b: adoptionSkipReason — чужд customer, и null когато няма пропуск', () => {
  const why = exported<(u: PlanUserSnapshot | null, s: SubscriptionSnapshot, m: typeof PRICE_MAP) => string | null>(
    'adoptionSkipReason',
  );
  assert.equal(why(U('PRO', null), S('sub_9', 'active', ['price_pro_m'], 'cus_OTHER'), PRICE_MAP), 'customer-mismatch');
  assert.equal(why(U('PRO', null), S('sub_1', 'active', ['price_pro_m']), PRICE_MAP), null);
  // Вече вързан потребител не е „осиновяване“.
  assert.equal(why(U('PRO', 'sub_2'), S('sub_1', 'active', ['price_adhoc']), PRICE_MAP), null);
  assert.equal(why(null, S('sub_1', 'active', ['price_pro_m']), PRICE_MAP), null);
});

test('B1: реферал — първата сесия с paid и ненулев PI, не sessions[0]', async () => {
  const pick = exported<
    (
      sessions: readonly { id: string; payment_status: string }[],
      piOf: (s: { id: string }) => Promise<string | null>,
    ) => Promise<string | null>
  >('firstPaidPaymentIntent');
  const pis: Record<string, string | null> = { s0: 'pi_unpaid', s1: null, s2: 'pi_OK', s3: 'pi_later' };
  const asked: string[] = [];
  const result = await pick(
    [
      { id: 's0', payment_status: 'no_payment_required' },
      { id: 's1', payment_status: 'paid' },
      { id: 's2', payment_status: 'paid' },
      { id: 's3', payment_status: 'paid' },
    ],
    async (s) => {
      asked.push(s.id);
      return pis[s.id];
    },
  );
  assert.equal(result, 'pi_OK');
  assert.deepEqual(asked, ['s1', 's2']); // неплатената не се пита, след намерената спира
  assert.equal(await pick([{ id: 's0', payment_status: 'unpaid' }], async () => 'pi_x'), null);
  assert.equal(await pick([], async () => 'pi_x'), null);
});

// ── Дискриминатор на hold-а (Продавача, 9.1): само спор по абонамента ─────

test('H1: hold в grant важи за спор по абонамента, не за запазен FOUNDER-спор', () => {
  const holdOf = exported<(u: PlanUserSnapshot) => string | null>('disputeHoldSubscriptionId');
  // Спор по абонамента (заварен ред без FOUNDER PI) → hold на абонамента.
  assert.equal(holdOf(U('FREE', 'sub_1', null, 'dispute')), 'sub_1');
  // Спор по абонамента със записан оспорен PI (нов път), дори при стар FOUNDER PI.
  assert.equal(holdOf({ ...U('FREE', 'sub_1', 'pi_F', 'dispute'), planDisputedPaymentIntentId: 'pi_A' }), 'sub_1');
  // Запазен FOUNDER-спор (F13) не блокира grant на абонамента.
  assert.equal(holdOf(U('PRO', 'sub_9', 'pi_F', 'dispute')), null);
  assert.equal(holdOf(U('PRO', 'sub_1')), null);
  const grant = decideCheckoutPlanGrant({
    ...GRANT_BASE,
    subscriptionId: 'sub_9',
    holdSubscriptionId: holdOf(U('FREE', 'sub_9', 'pi_F', 'dispute')),
  });
  assert.equal(grant.action, 'grant');
});

test('H2: запазен FOUNDER-спор не възобновява и не „възстановява“ чужда пауза на абонамента', () => {
  const user = U('PRO', 'sub_9', 'pi_F', 'dispute');
  assert.equal(collect(user, 'sub_9', NOT_REVERSED, 'active', true, 'pi_X'), 'none');
  assert.deepEqual(disputeOf(user, 'sub_9', NOT_REVERSED, 'pi_X'), { action: 'noop', reason: 'unchanged' });
});

// ── 9.4 Второ ревю на Кодаджията (F13e, F14, A12, W1, W2) ────────────────────
// Веригата N1 (проба на Кодаджията): бивш FOUNDER (pi_F) → PRO sub_1 → спор по
// sub_1 (pi_S) → нов PRO sub_2.
function formerFounderSubDispute(): PlanUserSnapshot {
  return {
    ...U('FREE', 'sub_1', 'pi_F', 'dispute'),
    planDisputedPaymentIntentId: 'pi_S',
  } as PlanUserSnapshot;
}

test('F13e-a: спор по абонамента (записан pi_S) при бивш FOUNDER → grant ИЗЧИСТВА причината', () => {
  assert.equal(shouldClearRevocationOnGrant(formerFounderSubDispute(), 'PRO'), true);
  assert.equal(shouldClearRevocationOnGrant(formerFounderSubDispute(), 'BUSINESS'), true);
});

test('F13e-b: чист FOUNDER-спор (без записан PI) продължава да пази причината (F13a не се променя)', () => {
  const founderOnly = { ...U('FREE', null, 'pi_F', 'dispute'), planDisputedPaymentIntentId: null } as PlanUserSnapshot;
  assert.equal(shouldClearRevocationOnGrant(founderOnly, 'PRO'), false);
});

test('F13e-c: верига N1 — след grant на sub_2 смяната PRO→BUSINESS не е dispute-hold', () => {
  const before = formerFounderSubDispute();
  const grant = decideCheckoutPlanGrant({
    plan: 'PRO', mode: 'subscription', paymentStatus: 'paid', paymentIntentId: null,
    subscriptionId: 'sub_2', reversal: null, subscriptionStatus: 'active', currentPlan: 'FREE',
    holdSubscriptionId: disputeHoldSubscriptionId(before),
  });
  assert.equal(grant.action, 'grant');
  // Резултатът от grant-а, както го прилага webhook-ът: пази или чисти по решението.
  const clear = shouldClearRevocationOnGrant(before, 'PRO');
  const after = {
    ...before,
    plan: 'PRO' as const,
    planSubscriptionId: 'sub_2',
    planRevokedReason: clear ? null : before.planRevokedReason,
    planDisputedPaymentIntentId: clear ? null : before.planDisputedPaymentIntentId,
  } as PlanUserSnapshot;
  const d = decideSubscriptionSync(after, S('sub_2', 'active', ['price_bus_y']), PRICE_MAP);
  assert.deepEqual(d, { action: 'set', plan: 'BUSINESS', adoptSubscriptionId: null });
});

test('F14: необърнато плащане по pi_F при спор по абонамента → flag, не restore', () => {
  assert.deepEqual(decideFounderPayment(formerFounderSubDispute(), 'pi_F', NOT_REVERSED), {
    action: 'flag',
    reason: 'restore-blocked-plan-changed',
  });
});

test('F14b: чист FOUNDER-спор (без записан PI) → restore както досега', () => {
  const founderOnly = { ...U('FREE', null, 'pi_F', 'dispute'), planDisputedPaymentIntentId: null } as PlanUserSnapshot;
  assert.deepEqual(decideFounderPayment(founderOnly, 'pi_F', NOT_REVERSED), { action: 'restore' });
});

// A12: при необърнато плащане по абонамента стъпките ВИНАГИ завършват с 'resync'.
type StepsFn = (
  c: Collection,
  d: ReturnType<typeof decidePlanSubscriptionDispute>,
  reversal?: PaymentReversal,
) => string[];

test('A12a: необърнато плащане → винаги завършва с resync (и при вече свършени половини)', () => {
  const steps = exported<StepsFn>('planDisputeSteps');
  assert.deepEqual(steps('resume', { action: 'restore' }, NOT_REVERSED), ['stripe-resume', 'db-restore', 'resync']);
  assert.deepEqual(steps('none', { action: 'restore' }, NOT_REVERSED), ['db-restore', 'resync']);
  assert.deepEqual(steps('none', { action: 'noop', reason: 'unchanged' }, NOT_REVERSED), ['resync']);
  assert.deepEqual(steps('none', { action: 'noop', reason: 'not-plan-subscription-payment' }, NOT_REVERSED), ['resync']);
});

test('A12b: обърнато плащане → без resync; без трети аргумент → стара форма (A11 непроменен)', () => {
  const steps = exported<StepsFn>('planDisputeSteps');
  assert.deepEqual(steps('pause', { action: 'revoke', reason: 'dispute' }, R_DISPUTE), ['db-revoke', 'stripe-pause']);
  assert.deepEqual(steps('none', { action: 'noop', reason: 'unchanged' }, R_REFUND), []);
  assert.deepEqual(steps('none', { action: 'noop', reason: 'unchanged' }), []);
});

test('A12c: ретрай след срив между restore и sync → планът се връща от resync по живия статус', () => {
  const steps = exported<StepsFn>('planDisputeSteps');
  // Първият опит изчисти причината (db-restore), но се скъса преди sync: FREE, причина null.
  const user = U('FREE', 'sub_1', null, null);
  const live = S('sub_1', 'active', ['price_pro_m']);
  const plan = steps(
    collect(user, 'sub_1', WON, 'active', false, 'pi_A'),
    disputeOf(user, 'sub_1', WON, 'pi_A'),
    WON,
  );
  assert.deepEqual(plan, ['resync']);
  const after = applyPlanSync(user, decideSubscriptionSync(user, live, PRICE_MAP));
  assert.equal(after.plan, 'PRO');
});

// W1/W2: чисто решение за предупреждение (webhook-ът го праща в console.warn).
type WarnFn = (
  user: PlanUserSnapshot | null,
  paymentIntentId: string,
  reversal: PaymentReversal,
  dispute: ReturnType<typeof decidePlanSubscriptionDispute>,
) => 'second-dispute' | 'restore-founder-trace' | null;

test('W1: втори спор по ДРУГ PI на същия абонамент при записан → second-dispute', () => {
  const warn = exported<WarnFn>('planDisputeWarning');
  const user = disputedUser('pi_A');
  assert.equal(warn(user, 'pi_B', R_DISPUTE, disputeOf(user, 'sub_1', R_DISPUTE, 'pi_B')), 'second-dispute');
});

test('W1b: без предупреждение — повторено събитие за същия PI, първи спор, refund', () => {
  const warn = exported<WarnFn>('planDisputeWarning');
  const user = disputedUser('pi_A');
  assert.equal(warn(user, 'pi_A', R_DISPUTE, disputeOf(user, 'sub_1', R_DISPUTE, 'pi_A')), null);
  const fresh = U('PRO', 'sub_1');
  assert.equal(warn(fresh, 'pi_A', R_DISPUTE, disputeOf(fresh, 'sub_1', R_DISPUTE, 'pi_A')), null);
  assert.equal(warn(user, 'pi_B', R_REFUND, disputeOf(user, 'sub_1', R_REFUND, 'pi_B')), null);
});

test('W2: restore по абонамента при зададен planPaymentIntentId → restore-founder-trace', () => {
  const warn = exported<WarnFn>('planDisputeWarning');
  const user = { ...disputedUser('pi_A'), planPaymentIntentId: 'pi_F' } as PlanUserSnapshot;
  const d = disputeOf(user, 'sub_1', WON, 'pi_A');
  assert.deepEqual(d, { action: 'restore' });
  assert.equal(warn(user, 'pi_A', WON, d), 'restore-founder-trace');
});

test('W2b: restore без FOUNDER-следа, и noop решение → без предупреждение', () => {
  const warn = exported<WarnFn>('planDisputeWarning');
  const user = disputedUser('pi_A'); // planPaymentIntentId = null
  assert.equal(warn(user, 'pi_A', WON, disputeOf(user, 'sub_1', WON, 'pi_A')), null);
  assert.equal(warn(user, 'pi_B', WON, disputeOf(user, 'sub_1', WON, 'pi_B')), null);
});

// RR1 (ревю 4 на Кодаджията, 02.11.2026): мутантът `return null` в toReversalReason оцеляваше — без тази
// функция отнетият план и сторнираният реферал се четат като „без причина“ (restore/flag се губят).
test('RR1: toReversalReason — само refund и dispute, всичко друго → null', () => {
  const toReversalReason = exported<(v: string | null | undefined) => 'refund' | 'dispute' | null>('toReversalReason');
  assert.equal(toReversalReason('refund'), 'refund');
  assert.equal(toReversalReason('dispute'), 'dispute');
  for (const v of [null, undefined, '', 'Refund', 'foo', 'refund ']) assert.equal(toReversalReason(v), null);
});
