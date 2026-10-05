import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Plan } from '@prisma/client';
import { ALL_ROLES } from '../src/auth/rbac.js';
import { TRIAL_DAYS } from '../src/plans/plan.js';
import { roleSchema } from '../src/services/admin-actions.js';
import { createSchema } from '../src/services/admin-create.js';

test('the panel accepts exactly the roles and plans of the database schema', () => {
  for (const role of ALL_ROLES) assert.equal(roleSchema.safeParse(role).success, true, role);
  assert.equal(roleSchema.safeParse('ROOT').success, false);
  const base = { email: 'new.account@example.test', name: 'Нов акаунт', role: 'CUSTOMER' };
  for (const plan of Object.values(Plan))
    assert.equal(createSchema.safeParse({ ...base, plan }).success, true, plan);
  assert.equal(createSchema.safeParse({ ...base, plan: 'GOLD' }).success, false);
});

test('an empty trial-days field on a new account falls back to the trial period of the code', () => {
  const parsed = createSchema.parse({
    email: 'new.account@example.test',
    name: 'Нов акаунт',
    role: 'CUSTOMER',
    plan: 'TRIAL',
    trialDays: undefined,
    months: undefined,
    locale: undefined,
  });
  assert.equal(parsed.trialDays, TRIAL_DAYS);
  assert.equal(parsed.months, 1);
  assert.equal(parsed.locale, 'bg');
});
