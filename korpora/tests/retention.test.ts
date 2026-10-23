import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translatorFor } from '../src/i18n.js';
import {
  ORDER_RETENTION_YEARS,
  ordersKeptText,
  retentionText,
  yearsBefore,
} from '../src/retention.js';

test('the audit retention in the privacy policy is the configured number of days', () => {
  assert.equal(retentionText(1825, translatorFor('bg')), '5 години');
  assert.equal(retentionText(1825, translatorFor('en')), '5 years');
  assert.equal(retentionText(1825, translatorFor('it')), '5 anni');
  assert.equal(retentionText(365, translatorFor('bg')), '1 година');
  assert.equal(retentionText(365, translatorFor('en')), '1 year');
  assert.equal(retentionText(365, translatorFor('it')), '1 anno');
});

test('a retention that is not whole years is stated in days, never rounded', () => {
  assert.equal(retentionText(1000, translatorFor('bg')), '1000 дни');
  assert.equal(retentionText(1000, translatorFor('en')), '1000 days');
  assert.equal(retentionText(1000, translatorFor('it')), '1000 giorni');
});

test('orders of a deleted account are kept five calendar years: leap days count, never a day short', () => {
  const DAY = 86_400_000;
  const now = new Date('2031-03-01T10:00:00Z');
  const cutoff = yearsBefore(now, ORDER_RETENTION_YEARS);
  assert.equal(cutoff.toISOString(), '2026-03-01T10:00:00.000Z');
  // 2028 is a leap year: five years here are 1826 days, so 5 × 365 days would delete a day early
  assert.equal((now.getTime() - cutoff.getTime()) / DAY, 1826);
  const deletedFiveTimes365DaysAgo = new Date(now.getTime() - 5 * 365 * DAY);
  assert.ok(deletedFiveTimes365DaysAgo > cutoff, 'not yet five years — kept');
  // 29 February in a year without it becomes 28 February: the boundary moves earlier, never later
  assert.equal(
    yearsBefore(new Date('2032-02-29T08:30:00Z'), 5).toISOString(),
    '2027-02-28T08:30:00.000Z',
  );
  assert.equal(
    yearsBefore(new Date('2031-12-31T23:59:59Z'), 5).toISOString(),
    '2026-12-31T23:59:59.000Z',
  );
});

test('the retention of the orders reads in years in every language', () => {
  assert.equal(ordersKeptText(translatorFor('bg')), '5 години');
  assert.equal(ordersKeptText(translatorFor('en')), '5 years');
  assert.equal(ordersKeptText(translatorFor('it')), '5 anni');
});
