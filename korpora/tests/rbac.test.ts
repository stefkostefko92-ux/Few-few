import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Role } from '@prisma/client';
import {
  ALL_ROLES,
  assignableRoles,
  can,
  type Capability,
  isRole,
  isStaff,
  outranks,
} from '../src/auth/rbac.js';

// The privilege boundary, written out by hand: lowering any requirement in rbac.ts (say staff:manage
// from ADMIN to MANAGER) must turn this red, so the table is not read from the module under test.
const RANKED: readonly Role[] = [
  'CUSTOMER',
  'VIEWER',
  'ANALYST',
  'SUPPORT',
  'MANAGER',
  'ADMIN',
  'OWNER',
];
const MINIMUM: Record<Capability, Role> = {
  'admin:access': 'VIEWER',
  'accounts:view': 'VIEWER',
  'logins:view': 'ANALYST',
  'audit:view': 'ANALYST',
  'accounts:ban': 'SUPPORT',
  'accounts:security': 'SUPPORT',
  'requests:handle': 'MANAGER',
  'accounts:plan': 'MANAGER',
  'accounts:edit': 'MANAGER',
  'accounts:create': 'ADMIN',
  'accounts:delete': 'ADMIN',
  'staff:manage': 'ADMIN',
};
const rank = (role: Role) => RANKED.indexOf(role);

test('seven levels, highest first', () => {
  assert.deepEqual(ALL_ROLES, [...RANKED].reverse());
});

test('only the customer is outside the team', () => {
  for (const role of RANKED) assert.equal(isStaff(role), role !== 'CUSTOMER', role);
});

test('every capability is granted from its minimum role up and refused below it', () => {
  for (const [capability, minimum] of Object.entries(MINIMUM) as Array<[Capability, Role]>) {
    for (const role of RANKED)
      assert.equal(
        can(role, capability),
        rank(role) >= rank(minimum),
        `${role} ${capability} (from ${minimum})`,
      );
  }
  // the role just below each minimum is the boundary a downgrade would cross
  for (const [capability, minimum] of Object.entries(MINIMUM) as Array<[Capability, Role]>)
    assert.equal(can(RANKED[rank(minimum) - 1]!, capability), false, capability);
});

test('nobody acts on an equal or higher role', () => {
  for (const actor of RANKED)
    for (const target of RANKED)
      assert.equal(outranks(actor, target), rank(actor) > rank(target), `${actor} → ${target}`);
});

test('roles are handed out only below one’s own, highest first', () => {
  for (const actor of RANKED)
    assert.deepEqual(
      assignableRoles(actor),
      RANKED.slice(0, rank(actor)).reverse(),
      `${actor} hands out`,
    );
  assert.deepEqual(assignableRoles('CUSTOMER'), []);
  assert.deepEqual(assignableRoles('VIEWER'), ['CUSTOMER']);
  assert.deepEqual(assignableRoles('OWNER'), [
    'ADMIN',
    'MANAGER',
    'SUPPORT',
    'ANALYST',
    'VIEWER',
    'CUSTOMER',
  ]);
});

test('a role read from outside is one of the seven, never an inherited name', () => {
  for (const role of RANKED) assert.equal(isRole(role), true, role);
  for (const bad of ['ROOT', 'owner', '', 7, null, undefined])
    assert.equal(isRole(bad), false, String(bad));
  for (const inherited of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
    assert.equal(isRole(inherited), false, inherited);
});
