import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateReferralCode,
  referralLink,
  referralRewardCents,
} from '../referral';

test('наградата: 0 за Free, растяща за платените планове', () => {
  assert.equal(referralRewardCents('FREE'), 0);
  assert.equal(referralRewardCents('PRO'), 300);
  assert.equal(referralRewardCents('BUSINESS'), 500);
  assert.equal(referralRewardCents('FOUNDER'), 1000);
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
