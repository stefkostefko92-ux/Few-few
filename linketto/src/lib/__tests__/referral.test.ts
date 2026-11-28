import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateReferralCode,
  referralLink,
  referralRewardCents,
  REFERRAL_PERCENT,
  payoutProgressPercent,
  REFERRAL_MIN_PAYOUT_CENTS,
  canWithdraw,
} from '../referral';

test('бонусът е процент от платената сума', () => {
  assert.equal(REFERRAL_PERCENT, 15);
  assert.equal(referralRewardCents(0), 0);
  assert.equal(referralRewardCents(400), 60); // 15% от €4
  assert.equal(referralRewardCents(3840), 576); // 15% от годишен Pro €38.40
  assert.equal(referralRewardCents(-5), 0);
});

test('реферален код: 8 hex знака, уникален', () => {
  const a = generateReferralCode();
  assert.match(a, /^[0-9a-f]{8}$/);
  const codes = new Set(Array.from({ length: 50 }, () => generateReferralCode()));
  assert.equal(codes.size, 50);
});

test('реферален линк сочи към регистрация с ?ref', () => {
  assert.equal(
    referralLink('https://linketto.eu', 'bg', 'abcd1234'),
    'https://linketto.eu/bg/register?ref=abcd1234',
  );
});

test('прагът за теглене е €100', () => {
  assert.equal(canWithdraw(9999), false);
  assert.equal(canWithdraw(10000), true);
  assert.equal(canWithdraw(25000), true);
});

// M4 (Правният Разбирач, 02.11.2026): при сторниран бонус балансът е отрицателен → width „-7%“ е
// невалиден CSS, вътрешният div пада на auto и лентата към прага се рисува ПЪЛНА. Процентът е в [0, 100].
test('payoutProgressPercent: отрицателен баланс → 0, над прага → 100', () => {
  assert.equal(payoutProgressPercent(-735), 0);
  assert.equal(payoutProgressPercent(0), 0);
  assert.equal(payoutProgressPercent(5000), 50);
  assert.equal(payoutProgressPercent(REFERRAL_MIN_PAYOUT_CENTS), 100);
  assert.equal(payoutProgressPercent(25000), 100);
});

test('бонусът се освобождава само след задържането и само по чиста поръчка (abuse-money-spec А2)', async () => {
  const { referralReleaseDue, REFERRAL_HOLD_DAYS } = await import('../referral');
  const day = 24 * 60 * 60 * 1000;
  const completedAt = new Date('2026-03-01T00:00:00Z');
  const ok = {
    completedAt,
    orderState: 'completed',
    withdrawalRequestedAt: null,
    disputed: false,
    releasedAt: null,
    reversedAt: null,
  };
  assert.equal(REFERRAL_HOLD_DAYS, 30);
  assert.equal(referralReleaseDue({ ...ok, now: new Date(completedAt.getTime() + 29 * day) }), false);
  const after = new Date(completedAt.getTime() + 30 * day + 1);
  assert.equal(referralReleaseDue({ ...ok, now: after }), true);
  // Отказ, връщане, спор, вече освободен или сторниран → никога.
  assert.equal(referralReleaseDue({ ...ok, withdrawalRequestedAt: new Date(), now: after }), false);
  assert.equal(referralReleaseDue({ ...ok, orderState: 'refund_pending', now: after }), false);
  assert.equal(referralReleaseDue({ ...ok, orderState: 'refunded', now: after }), false);
  assert.equal(referralReleaseDue({ ...ok, disputed: true, now: after }), false);
  assert.equal(referralReleaseDue({ ...ok, releasedAt: new Date(), now: after }), false);
  assert.equal(referralReleaseDue({ ...ok, reversedAt: new Date(), now: after }), false);
  assert.equal(referralReleaseDue({ ...ok, completedAt: null, now: after }), false);
});
