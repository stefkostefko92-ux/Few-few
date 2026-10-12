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
  for (const c of ['users:manage', 'billing:manage', 'prices:edit', 'prices:view', 'company:edit', 'company:export', 'audit:view'] as const) assert.ok(can('OWNER', c), c);
  assert.ok(can('SUPERADMIN', 'platform:admin') && !can('OWNER', 'platform:admin'));
  for (const r of MEMBER_ROLES) assert.ok(!can(r, 'users:manage') && !can(r, 'billing:manage') && !can(r, 'audit:view') && !can(r, 'company:export'), r);
});

test('senza abbonamento dopo la prova: si legge, si scarica e si paga, non si scrive', () => {
  const ro = (role: 'OWNER' | 'TECHNICIAN') => ({ role, readOnly: true });
  assert.ok(can(ro('OWNER'), 'projects:view') && can(ro('OWNER'), 'report:download') && can(ro('OWNER'), 'billing:manage'));
  assert.ok(can(ro('OWNER'), 'users:manage') && can(ro('OWNER'), 'prices:view'));
  // the company's data leave it also read-only (terms of use, «exit»), the logo does not change
  assert.ok(can(ro('OWNER'), 'company:export') && !can(ro('OWNER'), 'company:edit'));
  for (const c of ['projects:edit', 'calc:create', 'calc:review', 'projects:archive', 'prices:edit'] as const) {
    assert.ok(!can(ro('OWNER'), c) && !can(ro('TECHNICIAN'), c), c);
  }
  assert.ok(can({ role: 'TECHNICIAN', readOnly: false }, 'calc:create'));
  // a record the engines no longer reproduce is made again from what was entered, so its documents are downloaded also
  // read-only (terms art. 10); the Commerciale, who makes no records, does not
  assert.ok(can(ro('OWNER'), 'records:refresh') && can(ro('TECHNICIAN'), 'records:refresh') && !can('SALES', 'records:refresh'));
});

test('solo il titolare gestisce i colleghi, con i tre ruoli; mai titolare o piattaforma dalla squadra', () => {
  assert.ok(outranks('OWNER', 'TECHNICIAN') && outranks('OWNER', 'SALES') && !outranks('OWNER', 'OWNER'));
  assert.ok(!outranks('ENGINEER', 'TECHNICIAN') && !outranks('TECHNICIAN', 'SALES'));
  assert.deepEqual(assignableRoles('OWNER'), ['ENGINEER', 'SALES', 'TECHNICIAN']);
  assert.deepEqual(assignableRoles('SUPERADMIN'), ['ENGINEER', 'SALES', 'TECHNICIAN']);
  assert.deepEqual(assignableRoles('ENGINEER'), []);
  assert.ok(isRole('OWNER') && isRole('SALES') && !isRole('VIEWER') && !isRole('ADMIN') && !isRole(7));
});

test('Rilievi: tutti leggono e compilano le schede; cestino al Progettista e al titolare, gestione del cestino al titolare', () => {
  // rilievi: every role but the client writes (the supplier modules included) — LiftPilot has no client role
  for (const r of ['ENGINEER', 'SALES', 'TECHNICIAN', 'OWNER', 'SUPERADMIN'] as const) assert.ok(can(r, 'rilievi:view') && can(r, 'rilievi:edit'), r);
  // rilievi: RESPONSABILE and above move a sheet to the trash
  assert.ok(can('ENGINEER', 'rilievi:trash') && can('OWNER', 'rilievi:trash') && can('SUPERADMIN', 'rilievi:trash'));
  assert.ok(!can('SALES', 'rilievi:trash') && !can('TECHNICIAN', 'rilievi:trash'));
  // rilievi: ADMIN and above see the trash, open a trashed sheet, restore it or delete it for good
  assert.ok(can('OWNER', 'rilievi:trash-manage') && can('SUPERADMIN', 'rilievi:trash-manage'));
  for (const r of MEMBER_ROLES) assert.ok(!can(r, 'rilievi:trash-manage'), r);
  // read-only: view only
  for (const r of ['OWNER', 'ENGINEER', 'TECHNICIAN'] as const) {
    const ro = { role: r, readOnly: true };
    assert.ok(can(ro, 'rilievi:view'), r);
    assert.ok(!can(ro, 'rilievi:edit') && !can(ro, 'rilievi:trash') && !can(ro, 'rilievi:trash-manage'), r);
  }
});
