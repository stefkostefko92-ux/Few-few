// Seven strictly ordered roles, rights by capability; nobody manages an equal or higher role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, assignableRoles, can, isRole, outranks } from '../rbac';

test('ordine dei ruoli e capacità', () => {
  assert.deepEqual(ROLES, ['VIEWER', 'TECHNICIAN', 'ENGINEER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPERADMIN']);
  assert.ok(can('VIEWER', 'report:download') && !can('VIEWER', 'calc:create'));
  assert.ok(can('TECHNICIAN', 'calc:create') && !can('TECHNICIAN', 'calc:review'));
  assert.ok(can('ENGINEER', 'calc:review') && !can('ENGINEER', 'projects:archive'));
  assert.ok(can('ADMIN', 'users:manage') && !can('ADMIN', 'company:edit'));
  assert.ok(can('SUPERADMIN', 'platform:admin') && !can('OWNER', 'platform:admin'));
});

test('gestione solo dei ruoli inferiori, mai SUPERADMIN dall\'interfaccia', () => {
  assert.ok(outranks('ADMIN', 'TECHNICIAN') && !outranks('ADMIN', 'ADMIN') && !outranks('TECHNICIAN', 'ADMIN'));
  assert.deepEqual(assignableRoles('ADMIN'), ['VIEWER', 'TECHNICIAN', 'ENGINEER', 'MANAGER']);
  assert.deepEqual(assignableRoles('SUPERADMIN'), ['VIEWER', 'TECHNICIAN', 'ENGINEER', 'MANAGER', 'ADMIN', 'OWNER']);
  assert.deepEqual(assignableRoles('VIEWER'), []);
  assert.ok(isRole('OWNER') && !isRole('ROOT') && !isRole(7));
});
