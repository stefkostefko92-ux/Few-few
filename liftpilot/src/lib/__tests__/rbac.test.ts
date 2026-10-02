// The owner and three roles for the colleagues (Progettista, Commerciale, Tecnico); rights by capability; only the owner
// manages the colleagues; a company without a subscription after its trial reads but does not write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEMBER_ROLES, ROLES, assignableRoles, can, isRole, outranks } from '../rbac';

test('ruoli e capacità', () => {
  assert.deepEqual(ROLES, ['ENGINEER', 'SALES', 'TECHNICIAN', 'OWNER', 'SUPERADMIN']);
  assert.deepEqual(MEMBER_ROLES, ['ENGINEER', 'SALES', 'TECHNICIAN']);
  // Commerciale: sees, downloads, sees the prices; edits nothing
  assert.ok(can('SALES', 'report:download') && can('SALES', 'prices:view'));
  assert.ok(!can('SALES', 'projects:edit') && !can('SALES', 'calc:create') && !can('SALES', 'prices:edit'));
  // Tecnico: edits and calculates, no prices, no review
  assert.ok(can('TECHNICIAN', 'calc:create') && can('TECHNICIAN', 'projects:edit'));
  assert.ok(!can('TECHNICIAN', 'calc:review') && !can('TECHNICIAN', 'prices:view'));
  // Progettista: also reviews and archives, no prices
  assert.ok(can('ENGINEER', 'calc:review') && can('ENGINEER', 'projects:archive') && !can('ENGINEER', 'prices:view'));
  // the owner: everything of the company; the platform above
  for (const c of ['users:manage', 'billing:manage', 'prices:edit', 'prices:view', 'company:edit', 'audit:view'] as const) assert.ok(can('OWNER', c), c);
  assert.ok(can('SUPERADMIN', 'platform:admin') && !can('OWNER', 'platform:admin'));
  for (const r of MEMBER_ROLES) assert.ok(!can(r, 'users:manage') && !can(r, 'billing:manage') && !can(r, 'audit:view'), r);
});

test('senza abbonamento dopo la prova: si legge, si scarica e si paga, non si scrive', () => {
  const ro = (role: 'OWNER' | 'TECHNICIAN') => ({ role, readOnly: true });
  assert.ok(can(ro('OWNER'), 'projects:view') && can(ro('OWNER'), 'report:download') && can(ro('OWNER'), 'billing:manage'));
  assert.ok(can(ro('OWNER'), 'users:manage') && can(ro('OWNER'), 'prices:view'));
  for (const c of ['projects:edit', 'calc:create', 'calc:review', 'projects:archive', 'prices:edit'] as const) {
    assert.ok(!can(ro('OWNER'), c) && !can(ro('TECHNICIAN'), c), c);
  }
  assert.ok(can({ role: 'TECHNICIAN', readOnly: false }, 'calc:create'));
});

test('solo il titolare gestisce i colleghi, con i tre ruoli; mai titolare o piattaforma dalla squadra', () => {
  assert.ok(outranks('OWNER', 'TECHNICIAN') && outranks('OWNER', 'SALES') && !outranks('OWNER', 'OWNER'));
  assert.ok(!outranks('ENGINEER', 'TECHNICIAN') && !outranks('TECHNICIAN', 'SALES'));
  assert.deepEqual(assignableRoles('OWNER'), ['ENGINEER', 'SALES', 'TECHNICIAN']);
  assert.deepEqual(assignableRoles('SUPERADMIN'), ['ENGINEER', 'SALES', 'TECHNICIAN']);
  assert.deepEqual(assignableRoles('ENGINEER'), []);
  assert.ok(isRole('OWNER') && isRole('SALES') && !isRole('VIEWER') && !isRole('ADMIN') && !isRole(7));
});
