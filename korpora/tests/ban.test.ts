import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translatorFor } from '../src/i18n.js';
import { viewHelpers } from '../src/http/view.js';
import { banRuleDays, extendedAfterMistake, refundsUnderOldTerms } from '../src/plans/ban.js';
import { auditDetail } from '../src/services/audit-detail.js';

const DAY = 86_400_000;
const banned = new Date('2026-10-01T09:30:00Z');
const lifted = new Date('2026-10-11T17:45:12.345Z');
const lasted = lifted.getTime() - banned.getTime();

test('a mistaken ban gives back exactly the time it lasted: trial and Premium', () => {
  for (const plan of ['TRIAL', 'PREMIUM'] as const) {
    const ends = new Date(banned.getTime() + 20 * DAY);
    const until = extendedAfterMistake({ plan, planExpiresAt: ends }, banned, lifted);
    assert.equal(until?.getTime(), ends.getTime() + lasted, plan);
    // what was left at the moment of the ban is left again after the lift
    assert.equal(until!.getTime() - lifted.getTime(), ends.getTime() - banned.getTime(), plan);
  }
});

test('a plan that ran out during the ban gets back what was left when it started', () => {
  const ends = new Date(banned.getTime() + 2 * DAY);
  const until = extendedAfterMistake({ plan: 'PREMIUM', planExpiresAt: ends }, banned, lifted);
  assert.equal(until!.getTime() - lifted.getTime(), 2 * DAY);
});

test('nothing to extend: Lifetime, a period not started, a period over before the ban', () => {
  const ends = new Date(banned.getTime() + 20 * DAY);
  assert.equal(
    extendedAfterMistake({ plan: 'LIFETIME', planExpiresAt: null }, banned, lifted),
    null,
  );
  assert.equal(
    extendedAfterMistake({ plan: 'LIFETIME', planExpiresAt: ends }, banned, lifted),
    null,
  );
  assert.equal(extendedAfterMistake({ plan: 'TRIAL', planExpiresAt: null }, banned, lifted), null);
  for (const over of [banned, new Date(banned.getTime() - DAY)])
    assert.equal(
      extendedAfterMistake({ plan: 'PREMIUM', planExpiresAt: over }, banned, lifted),
      null,
    );
  assert.equal(
    extendedAfterMistake({ plan: 'PREMIUM', planExpiresAt: ends }, banned, banned),
    null,
  );
});

test('the audit reads a lifted ban: the mark and the extension as words', () => {
  const fmt = viewHelpers('bg');
  const format = {
    t: translatorFor('bg'),
    date: (d: Date) => fmt.date(d),
    projectName: () => null,
  };
  assert.deepEqual(
    auditDetail(
      'admin.account.unbanned',
      { mistake: true, from: '2026-10-21T09:30:00.000Z', until: '2026-10-31T17:45:12.345Z' },
      format,
    ),
    ['блокирането е било грешка', 'планът е удължен: 21 октомври 2026 г. → 31 октомври 2026 г.'],
  );
  assert.deepEqual(auditDetail('admin.account.unbanned', { mistake: false }, format), []);
});

test('the audit reads a ban that owes the unused part of an order under the old terms', () => {
  const fmt = viewHelpers('bg');
  const format = {
    t: translatorFor('bg'),
    date: (d: Date) => fmt.date(d),
    projectName: () => null,
  };
  assert.deepEqual(auditDetail('admin.account.banned', { reason: 'R', refundOld: true }, format), [
    'причина: „R“',
    'поръчка отпреди правилото за невръщане — дължи се неизползваната част от цената',
  ]);
  assert.deepEqual(auditDetail('admin.account.banned', { reason: 'R' }, format), ['причина: „R“']);
});

test('the no-refund rule came on 10 October 2026 and reaches older orders on 9 November 2026', () => {
  // the oracle is written out: 10 October 2026 + 30 days = 9 November 2026
  const { since, oldOrders } = banRuleDays();
  assert.equal(new Date(since).toISOString(), '2026-10-10T00:00:00.000Z');
  assert.equal(new Date(oldOrders).toISOString(), '2026-11-09T00:00:00.000Z');
});

const premiumUntil = new Date('2027-01-10T21:59:59.999Z');
const premium = { plan: 'PREMIUM', planExpiresAt: premiumUntil } as const;
const oldOrder = {
  toPlan: 'PREMIUM',
  toExpiresAt: premiumUntil,
  createdAt: new Date('2026-10-05T09:00:00Z'),
  termsVersion: '2026-10-09',
} as const;
const inTransition = new Date('2026-10-20T10:00:00Z');

test('an order under the old terms, blocked before the rule reaches it: the unused part is refunded', () => {
  assert.equal(refundsUnderOldTerms(premium, [oldOrder], inTransition), true);
  // a request from before the orders (no version) is older still
  assert.equal(
    refundsUnderOldTerms(premium, [{ ...oldOrder, termsVersion: null }], inTransition),
    true,
  );
  // 8 November ends at 22:00 UTC in Sofia (winter time): the last moment is still before, midnight is not
  assert.equal(refundsUnderOldTerms(premium, [oldOrder], new Date('2026-11-08T21:59:59Z')), true);
  assert.equal(refundsUnderOldTerms(premium, [oldOrder], new Date('2026-11-08T22:00:00Z')), false);
});

test('nothing is owed: new terms, a used-up order, no running paid plan, a plan without an order', () => {
  const newTerms = { ...oldOrder, termsVersion: '2026-10-10' };
  assert.equal(refundsUnderOldTerms(premium, [newTerms], inTransition), false);
  // the old order's months ran out; what runs now came with an order under the new terms
  const usedUp = { ...oldOrder, toExpiresAt: new Date('2026-10-15T21:59:59.999Z') };
  assert.equal(refundsUnderOldTerms(premium, [usedUp, newTerms], inTransition), false);
  const ended = { plan: 'PREMIUM', planExpiresAt: new Date('2026-10-19T21:59:59.999Z') } as const;
  assert.equal(refundsUnderOldTerms(ended, [oldOrder], inTransition), false);
  const trial = { plan: 'TRIAL', planExpiresAt: premiumUntil } as const;
  assert.equal(refundsUnderOldTerms(trial, [oldOrder], inTransition), false);
  assert.equal(refundsUnderOldTerms(premium, [], inTransition), false);
});

test('Lifetime under the old terms is refunded within its first 30 months, not after', () => {
  const lifetime = { plan: 'LIFETIME', planExpiresAt: null } as const;
  const bought = {
    toPlan: 'LIFETIME',
    toExpiresAt: null,
    createdAt: new Date('2026-09-01T09:00:00Z'),
    termsVersion: '2026-09-01',
  } as const;
  assert.equal(refundsUnderOldTerms(lifetime, [bought], inTransition), true);
  // bought on 1 April 2024: its 30 months ended on 1 October 2026, before the block
  const usedUp = { ...bought, createdAt: new Date('2024-04-01T09:00:00Z') };
  assert.equal(refundsUnderOldTerms(lifetime, [usedUp], inTransition), false);
});
