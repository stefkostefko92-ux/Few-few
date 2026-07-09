import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateReferralCode,
  referralLink,
  referralRewardCents,
  REFERRAL_PERCENT,
} from '../referral';

test('бонусът е процент от платената сума', () => {
  assert.equal(REFERRAL_PERCENT, 25);
  assert.equal(referralRewardCents(0), 0);
  assert.equal(referralRewardCents(400), 100); // 25% от €4
  assert.equal(referralRewardCents(3840), 960); // 25% от годишен Pro €38.40
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
