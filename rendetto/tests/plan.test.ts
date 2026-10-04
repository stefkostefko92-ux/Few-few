import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  planView,
  premiumUntil,
  TRIAL_DAYS,
  trialEndsAt,
  trialStart,
  type PlanSubject,
} from '../src/plans/plan.js';
import { LABEL } from '../src/labels.js';

const NOW = new Date('2026-10-02T12:00:00Z');
const DAY = 86_400_000;
const subject = (over: Partial<PlanSubject>): PlanSubject => ({
  role: 'CUSTOMER',
  plan: 'TRIAL',
  planExpiresAt: null,
  emailVerifiedAt: NOW,
  ...over,
});

test('a new account gets a 30-day trial from the email confirmation', () => {
  assert.equal(TRIAL_DAYS, 30);
  assert.equal(trialEndsAt(NOW).getTime() - NOW.getTime(), 30 * DAY);
  const view = planView(subject({ planExpiresAt: trialEndsAt(NOW) }), NOW);
  assert.deepEqual(
    [view.state, view.daysLeft, view.canCreate, view.blockedBy],
    ['active', 30, true, null],
  );
});

test('the trial starts once, on confirmation, with a line in the plan history', () => {
  const system = { id: null, label: LABEL.system };
  const start = trialStart({ id: 'u1', plan: 'TRIAL', planExpiresAt: null }, NOW, system);
  assert.equal(start?.planExpiresAt.toISOString(), trialEndsAt(NOW).toISOString());
  assert.deepEqual(start?.change, {
    userId: 'u1',
    actorId: null,
    actorLabel: LABEL.system,
    fromPlan: 'TRIAL',
    toPlan: 'TRIAL',
    toExpiresAt: trialEndsAt(NOW),
    note: LABEL.trialStarted,
  });
  const staff = { id: 's1', label: 'Служител <s@example.test>' };
  const byStaff = trialStart({ id: 'u2', plan: 'TRIAL', planExpiresAt: null }, NOW, staff);
  assert.deepEqual([byStaff?.change.actorId, byStaff?.change.actorLabel], [staff.id, staff.label]);
  const running = { id: 'u3', plan: 'TRIAL' as const, planExpiresAt: trialEndsAt(NOW) };
  assert.equal(trialStart(running, NOW, system), null, 'a running trial is not restarted');
  assert.equal(trialStart({ id: 'u4', plan: 'PREMIUM', planExpiresAt: null }, NOW, system), null);
});

test('an unconfirmed email blocks creating, not the account', () => {
  const view = planView(subject({ emailVerifiedAt: null }), NOW);
  assert.deepEqual([view.state, view.canCreate, view.blockedBy], ['pending', false, 'unverified']);
});

test('after the end the account is read-only (download stays allowed elsewhere)', () => {
  const view = planView(
    subject({ plan: 'PREMIUM', planExpiresAt: new Date(NOW.getTime() - 1000) }),
    NOW,
  );
  assert.deepEqual(
    [view.state, view.daysLeft, view.canCreate, view.blockedBy],
    ['expired', 0, false, 'expired'],
  );
  const lastSecond = planView(subject({ planExpiresAt: new Date(NOW.getTime() + 1000) }), NOW);
  assert.deepEqual([lastSecond.daysLeft, lastSecond.canCreate], [1, true]);
});

test('lifetime never ends and the team is never blocked', () => {
  assert.equal(planView(subject({ plan: 'LIFETIME' }), NOW).canCreate, true);
  const staff = planView(
    subject({ role: 'SUPPORT', plan: 'TRIAL', planExpiresAt: new Date(0) }),
    NOW,
  );
  assert.deepEqual([staff.state, staff.canCreate], ['staff', true]);
});

test('calendar months clamp to the last day of the month', () => {
  assert.equal(
    addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString(),
    '2026-02-28T10:00:00.000Z',
  );
  assert.equal(
    addMonths(new Date('2028-01-31T10:00:00Z'), 1).toISOString(),
    '2028-02-29T10:00:00.000Z',
  );
  assert.equal(
    addMonths(new Date('2026-10-02T12:00:00Z'), 12).toISOString(),
    '2027-10-02T12:00:00.000Z',
  );
});

test('paid months start after the time that is still running', () => {
  const running = new Date(NOW.getTime() + 10 * DAY);
  assert.equal(premiumUntil(running, 1, NOW).toISOString(), addMonths(running, 1).toISOString());
  const ended = new Date(NOW.getTime() - 10 * DAY);
  assert.equal(premiumUntil(ended, 3, NOW).toISOString(), addMonths(NOW, 3).toISOString());
  assert.equal(premiumUntil(null, 6, NOW).toISOString(), addMonths(NOW, 6).toISOString());
});
