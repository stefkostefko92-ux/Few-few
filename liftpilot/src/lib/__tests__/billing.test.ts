import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingStarted, companyAccess, dayStart, daysLeft, packAmount, packOf, packPaid, seatFree, seatLimit, trialEnd, type CompanyBilling } from '../billing';
import { parseEnv } from '../env-schema';
import { MIN_TRIAL_DAYS } from '../legal';

const now = new Date('2026-10-02T10:00:00Z');
const company = (o: Partial<CompanyBilling> = {}): CompanyBilling => ({ billingExempt: false, subscriptionStatus: null, trialEndsAt: null, seatPack: 'NONE', ...o });

test('the packs cost their share of the monthly price, rounded to the cent', () => {
  assert.equal(packAmount(4999, 'NONE'), 0);
  assert.equal(packAmount(4999, 'FIVE'), 2500); // 2499.5
  assert.equal(packAmount(4999, 'TEN'), 3999); // 3999.2
  assert.equal(packAmount(4999, 'UNLIMITED'), 4999);
  assert.equal(packAmount(10000, 'FIVE'), 5000);
  assert.equal(packAmount(10000, 'TEN'), 8000);
});

test('access: billing off and the platform are free; the subscription, the retries, the trial, otherwise read-only', () => {
  assert.equal(companyAccess(company({ subscriptionStatus: 'canceled' }), now, false), 'free');
  assert.equal(companyAccess(company({ billingExempt: true }), now, true), 'free');
  assert.equal(companyAccess(company({ subscriptionStatus: 'active' }), now, true), 'active');
  assert.equal(companyAccess(company({ subscriptionStatus: 'trialing' }), now, true), 'active');
  assert.equal(companyAccess(company({ subscriptionStatus: 'past_due' }), now, true), 'grace');
  assert.equal(companyAccess(company({ trialEndsAt: trialEnd(now, 14) }), now, true), 'trial');
  assert.equal(companyAccess(company({ trialEndsAt: now }), now, true), 'readonly');
  for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
    assert.equal(companyAccess(company({ subscriptionStatus: s }), now, true), 'readonly', s);
  }
  // a subscription that ended does not bring the trial back, but a trial still running counts
  assert.equal(companyAccess(company({ subscriptionStatus: 'canceled', trialEndsAt: trialEnd(now, 3) }), now, true), 'trial');
});

test('slots: unlimited without billing, the pack while paid or retried, none in the trial or read-only', () => {
  assert.equal(seatLimit(company(), 'free'), Infinity);
  assert.equal(seatLimit(company({ seatPack: 'FIVE' }), 'active'), 5);
  assert.equal(seatLimit(company({ seatPack: 'TEN' }), 'grace'), 10);
  assert.equal(seatLimit(company({ seatPack: 'UNLIMITED' }), 'active'), Infinity);
  assert.equal(seatLimit(company({ seatPack: 'NONE' }), 'active'), 0);
  assert.equal(seatLimit(company({ seatPack: 'TEN' }), 'trial'), 0);
  assert.equal(seatLimit(company({ seatPack: 'TEN' }), 'readonly'), 0);
  assert.equal(seatFree(company({ seatPack: 'FIVE' }), 'active', 4), true);
  assert.equal(seatFree(company({ seatPack: 'FIVE' }), 'active', 5), false);
  assert.equal(seatFree(company({ seatPack: 'FIVE' }), 'grace', 0), false); // nobody new while a payment is retried
  assert.equal(seatFree(company(), 'free', 1000), true);
});

test('the pack follows what the subscription pays, the metadata only names it', () => {
  assert.equal(packOf('TEN'), 'TEN');
  assert.equal(packOf('ELEVEN'), 'NONE');
  assert.equal(packOf(undefined), 'NONE');
  assert.equal(packPaid(4999, 2500, 'FIVE'), 'FIVE');
  assert.equal(packPaid(4999, 3999, 'FIVE'), 'TEN'); // the metadata says five, the line costs ten
  assert.equal(packPaid(4999, 4999, 'NONE'), 'UNLIMITED');
  assert.equal(packPaid(4999, 1234, 'UNLIMITED'), 'NONE'); // no pack costs that
  assert.equal(packPaid(4999, null, 'UNLIMITED'), 'NONE'); // no line of slots
  assert.equal(packPaid(null, 2500, 'FIVE'), 'NONE');
});

test('days left of the trial', () => {
  assert.equal(daysLeft(trialEnd(now, 14), now), 14);
  assert.equal(daysLeft(new Date(now.getTime() + 1000), now), 1);
  assert.equal(daysLeft(new Date(now.getTime() - 1000), now), 0);
  assert.equal(daysLeft(null, now), 0);
});

test('the trial is never shorter than the terms promise; paid use begins only on the day set on the server', () => {
  const base = { DATABASE_URL: 'postgresql://db/liftpilot', AUTH_SECRET: 'x'.repeat(40) };
  assert.equal(parseEnv(base).BILLING_TRIAL_DAYS, MIN_TRIAL_DAYS);
  assert.throws(() => parseEnv({ ...base, BILLING_TRIAL_DAYS: String(MIN_TRIAL_DAYS - 1) }), /BILLING_TRIAL_DAYS/);
  // Docker Compose passes an unset variable as an empty string
  assert.equal(parseEnv({ ...base, BILLING_START: '' }).BILLING_START, undefined);
  assert.equal(parseEnv({ ...base, BILLING_START: ' 2027-03-01 ' }).BILLING_START, '2027-03-01');
  for (const bad of ['2027-02-29', '2027-3-1', '01/03/2027', 'domani']) assert.throws(() => parseEnv({ ...base, BILLING_START: bad }), /BILLING_START/, bad);
  assert.equal(dayStart('2028-02-29')?.toISOString(), '2028-02-29T00:00:00.000Z');
  // the beta ends at 00:00 UTC of that day, and never without one
  assert.equal(billingStarted(undefined, now), false);
  assert.equal(billingStarted('2026-10-03', now), false);
  assert.equal(billingStarted('2026-10-02', now), true);
  assert.equal(billingStarted('2026-10-03', new Date('2026-10-02T23:59:59.999Z')), false);
  assert.equal(billingStarted('2026-10-03', new Date('2026-10-03T00:00:00Z')), true);
});
