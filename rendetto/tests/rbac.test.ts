import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ROLES, assignableRoles, can, isRole, isStaff, outranks } from '../src/auth/rbac.js';

test('seven levels, highest first', () => {
  assert.deepEqual(ALL_ROLES, [
    'OWNER',
    'ADMIN',
    'MANAGER',
    'SUPPORT',
    'ANALYST',
    'VIEWER',
    'CUSTOMER',
  ]);
  assert.equal(isStaff('CUSTOMER'), false);
  assert.equal(isStaff('VIEWER'), true);
});

test('capabilities grow with the role', () => {
  assert.equal(can('CUSTOMER', 'admin:access'), false);
  assert.equal(can('VIEWER', 'accounts:view'), true);
  assert.equal(can('VIEWER', 'logins:view'), false);
  assert.equal(can('ANALYST', 'logins:view'), true);
  assert.equal(can('ANALYST', 'accounts:ban'), false);
  assert.equal(can('SUPPORT', 'accounts:ban'), true);
  assert.equal(can('SUPPORT', 'accounts:plan'), false);
  assert.equal(can('MANAGER', 'accounts:plan'), true);
  assert.equal(can('MANAGER', 'accounts:delete'), false);
  assert.equal(can('ADMIN', 'accounts:delete'), true);
  assert.equal(can('OWNER', 'staff:manage'), true);
});

test('nobody acts on an equal or higher role, and nobody hands out a role above their own', () => {
  assert.equal(outranks('ADMIN', 'MANAGER'), true);
  assert.equal(outranks('ADMIN', 'ADMIN'), false);
  assert.equal(outranks('MANAGER', 'OWNER'), false);
  assert.ok(!assignableRoles('ADMIN').includes('OWNER'));
  assert.ok(!assignableRoles('ADMIN').includes('ADMIN'));
  assert.ok(assignableRoles('OWNER').includes('ADMIN'));
  assert.ok(isRole('OWNER') && !isRole('ROOT') && !isRole(7));
  for (const inherited of ['toString', 'constructor', '__proto__', 'hasOwnProperty'])
    assert.equal(isRole(inherited), false, inherited);
});
