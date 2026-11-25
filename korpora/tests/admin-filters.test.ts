import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Plan } from '@prisma/client';
import { TRIAL_DAYS } from '../src/plans/plan.js';
import { filterWhere, PLAN_FILTERS } from '../src/services/admin-accounts.js';
import { createSchema } from '../src/services/admin-create.js';

const NOW = new Date('2026-10-04T12:00:00Z');

test('the plan filter offers every plan of the schema, and only those', () => {
  assert.deepEqual(
    PLAN_FILTERS.filter((p) => p !== 'all'),
    Object.values(Plan),
  );
});

test('the dashboard cards count by the same rule as the list they link to', () => {
  // "all" adds no condition; Lifetime does not ask for the role, so an owner on Lifetime is counted and listed
  assert.deepEqual(filterWhere('all', 'all', NOW), { AND: [{}, {}] });
  assert.deepEqual(filterWhere('LIFETIME', 'all', NOW), { AND: [{ plan: 'LIFETIME' }, {}] });
  // active = confirmed and not blocked, exactly as the list filters it
  assert.deepEqual(filterWhere('TRIAL', 'active', NOW), {
    AND: [
      { plan: 'TRIAL' },
      {
        bannedAt: null,
        emailVerifiedAt: { not: null },
        OR: [{ plan: 'LIFETIME' }, { planExpiresAt: { gt: NOW } }],
      },
    ],
  });
});

test('an account created by the team without a trial length gets the same trial as a sign-up', () => {
  const parsed = createSchema.parse({
    email: 'new@example.test',
    name: 'New Person',
    role: 'CUSTOMER',
    plan: 'TRIAL',
  });
  assert.equal(parsed.trialDays, TRIAL_DAYS);
});
