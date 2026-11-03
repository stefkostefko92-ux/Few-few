import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateReferralCode,
  referralLink,
  referralRewardCents,
  REFERRAL_PERCENT,
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
