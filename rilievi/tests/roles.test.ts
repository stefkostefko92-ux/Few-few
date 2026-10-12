import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ALL_ROLES,
  assignableRoles,
  can,
  isPrivileged,
  isRole,
  outranks,
} from '../src/auth/roles.js';

describe('the seven levels', () => {
  it('orders the roles as in ERP Ascensori, MASTER first', () => {
    assert.deepEqual(ALL_ROLES, [
      'MASTER',
      'ADMIN',
      'DIREZIONE',
      'RESPONSABILE',
      'TECNICO',
      'OPERATORE',
      'CLIENTE',
    ]);
  });

  it('lets everyone read, everyone but the client write, and keeps the bin and the log for admins', () => {
    for (const role of ALL_ROLES) assert.equal(can(role, 'schede:read'), true);
    assert.equal(can('OPERATORE', 'schede:write'), true);
    assert.equal(can('CLIENTE', 'schede:write'), false);
    assert.equal(can('TECNICO', 'schede:delete'), false);
    assert.equal(can('RESPONSABILE', 'schede:delete'), true);
    assert.equal(can('DIREZIONE', 'schede:trash'), false);
    assert.equal(can('ADMIN', 'schede:trash'), true);
    assert.equal(can('ADMIN', 'audit:view'), true);
    assert.equal(can('DIREZIONE', 'audit:view'), false);
  });

  it('lets only the company ADMIN and the MASTER invite, and only below their own rank', () => {
    assert.equal(can('ADMIN', 'users:manage'), true);
    assert.equal(can('DIREZIONE', 'users:manage'), false);
    assert.equal(can('RESPONSABILE', 'users:manage'), false);
    assert.deepEqual(assignableRoles('ADMIN'), [
      'DIREZIONE',
      'RESPONSABILE',
      'TECNICO',
      'OPERATORE',
      'CLIENTE',
    ]);
    assert.deepEqual(assignableRoles('MASTER'), ALL_ROLES.slice(1));
    assert.deepEqual(assignableRoles('CLIENTE'), []);
    assert.equal(outranks('ADMIN', 'ADMIN'), false);
    assert.equal(outranks('ADMIN', 'MASTER'), false);
  });

  it('keeps the companies to the MASTER, the owner of the portal', () => {
    assert.deepEqual(
      ALL_ROLES.filter((role) => can(role, 'aziende:manage')),
      ['MASTER'],
    );
  });

  it('treats only MASTER and ADMIN as privileged (shorter sessions)', () => {
    assert.deepEqual(ALL_ROLES.filter(isPrivileged), ['MASTER', 'ADMIN']);
  });

  it('recognises only real role names', () => {
    assert.equal(isRole('TECNICO'), true);
    assert.equal(isRole('toString'), false);
    assert.equal(isRole('tecnico'), false);
  });
});
