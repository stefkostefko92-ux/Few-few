import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPaidOrder,
  checkPurchase,
  expiryAction,
  planOrderAmountCents,
} from '../plan-orders';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-14T10:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

// P1: сумата идва само от plans.ts
test('P1: цена по план и период (с отстъпката), FOUNDER — еднократна', () => {
  assert.equal(planOrderAmountCents('PRO', 'monthly'), 400);
  assert.equal(planOrderAmountCents('PRO', 'annual'), 3840); // 4 × 12 × 0,80
  assert.equal(planOrderAmountCents('BUSINESS', 'quarterly'), 2430); // 9 × 3 × 0,90
  assert.equal(planOrderAmountCents('FOUNDER', 'monthly'), 4900);
  assert.equal(planOrderAmountCents('FREE', 'monthly'), null);
});

// P6: кой може да купи какво
test('P6: FOUNDER не купува; даунгрейд при активен платен период — отказ', () => {
  assert.equal(checkPurchase({ plan: 'FOUNDER', expiresAt: null, want: 'PRO', now: NOW }), 'founder');
  assert.equal(checkPurchase({ plan: 'BUSINESS', expiresAt: at(10), want: 'PRO', now: NOW }), 'downgrade-active');
  assert.equal(checkPurchase({ plan: 'BUSINESS', expiresAt: at(-1), want: 'PRO', now: NOW }), 'ok');
  assert.equal(checkPurchase({ plan: 'PRO', expiresAt: at(10), want: 'PRO', now: NOW }), 'ok');
  assert.equal(checkPurchase({ plan: 'PRO', expiresAt: at(10), want: 'BUSINESS', now: NOW }), 'ok');
  assert.equal(checkPurchase({ plan: 'FREE', expiresAt: null, want: 'FOUNDER', now: NOW }), 'ok');
});

test('P6: същият план се удължава от изтичането; изтекъл — от сега', () => {
  const renewed = applyPaidOrder({ plan: 'PRO', expiresAt: at(10), want: 'PRO', interval: 'monthly', now: NOW });
  assert.equal(renewed.plan, 'PRO');
  assert.equal(renewed.expiresAt?.toISOString(), new Date('2026-12-24T10:00:00Z').toISOString());
  const fresh = applyPaidOrder({ plan: 'FREE', expiresAt: null, want: 'PRO', interval: 'quarterly', now: NOW });
  assert.equal(fresh.expiresAt?.toISOString(), new Date('2027-02-14T10:00:00Z').toISOString());
});

test('P6: ъпгрейд PRO→BUSINESS пренася остатъка по месечната цена', () => {
  // 30 дни PRO (€4/мес.) = 30 × 4/9 ≈ 13,33 дни BUSINESS → закръглено надолу до ден
  const up = applyPaidOrder({ plan: 'PRO', expiresAt: at(30), want: 'BUSINESS', interval: 'monthly', now: NOW });
  assert.equal(up.plan, 'BUSINESS');
  assert.equal(up.expiresAt?.toISOString(), new Date('2026-12-27T10:00:00Z').toISOString()); // +1 мес. +13 дни
});

test('P6: FOUNDER е завинаги (без изтичане)', () => {
  const f = applyPaidOrder({ plan: 'PRO', expiresAt: at(5), want: 'FOUNDER', interval: 'monthly', now: NOW });
  assert.deepEqual(f, { plan: 'FOUNDER', expiresAt: null });
});

// P7 + P8
test('P7: изтекъл PRO/BUSINESS → сваляне; FOUNDER и FREE — нищо', () => {
  assert.deepEqual(expiryAction({ plan: 'PRO', expiresAt: at(-0.01), reminded: null, now: NOW }), { downgrade: true });
  assert.deepEqual(expiryAction({ plan: 'FOUNDER', expiresAt: null, reminded: null, now: NOW }), { downgrade: false });
  assert.deepEqual(expiryAction({ plan: 'FREE', expiresAt: at(-3), reminded: null, now: NOW }), { downgrade: false });
});

test('P8: напомняне на 7 дни и на 1 ден — по веднъж на етап', () => {
  assert.deepEqual(expiryAction({ plan: 'PRO', expiresAt: at(6), reminded: null, now: NOW }), { downgrade: false, remind: 7 });
  assert.deepEqual(expiryAction({ plan: 'PRO', expiresAt: at(6), reminded: 7, now: NOW }), { downgrade: false });
  assert.deepEqual(expiryAction({ plan: 'PRO', expiresAt: at(0.5), reminded: 7, now: NOW }), { downgrade: false, remind: 1 });
  assert.deepEqual(expiryAction({ plan: 'PRO', expiresAt: at(0.5), reminded: 1, now: NOW }), { downgrade: false });
  assert.deepEqual(expiryAction({ plan: 'PRO', expiresAt: at(20), reminded: null, now: NOW }), { downgrade: false });
});
