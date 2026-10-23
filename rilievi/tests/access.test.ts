import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Role } from '@prisma/client';
import {
  canAssignRole,
  canManageAccount,
  canManageMembership,
  canSetActive,
  type Actor,
  type Target,
} from '../src/auth/manage.js';
import {
  aziendaSql,
  aziendaWhere,
  canAnywhere,
  canIn,
  privilegedAccess,
  roleIn,
  scopeFor,
  spansAziende,
  topRole,
} from '../src/auth/scope.js';

const A = 'cmaziendaaaaaaaaaaaaaaaaa';
const B = 'cmaziendabbbbbbbbbbbbbbbb';
const C = 'cmaziendacccccccccccccccc';

const person = (id: string, roles: Record<string, Role>): Actor => ({
  id,
  master: false,
  memberships: Object.entries(roles).map(([aziendaId, role]) => ({
    aziendaId,
    aziendaName: aziendaId,
    role,
  })),
});
const target = (id: string, roles: Record<string, Role>): Target => ({
  id,
  master: false,
  memberships: Object.entries(roles).map(([aziendaId, role]) => ({ aziendaId, role })),
});
const master: Actor = { id: 'master', master: true, memberships: [] };

describe('the scope of a person with a different role in each company', () => {
  const both = person('p', { [A]: 'TECNICO', [B]: 'ADMIN' });

  it('holds, for each right, only the companies whose role has it', () => {
    assert.deepEqual(scopeFor(both, 'schede:read'), { all: false, aziendaIds: [A, B] });
    assert.deepEqual(scopeFor(both, 'schede:delete'), { all: false, aziendaIds: [B] });
    assert.deepEqual(scopeFor(both, 'users:manage'), { all: false, aziendaIds: [B] });
    assert.deepEqual(scopeFor(both, 'aziende:manage'), { all: false, aziendaIds: [] });
    assert.deepEqual(scopeFor(master, 'aziende:manage'), { all: true });
  });

  it('checks a right in the company of the record, and anywhere for the menu', () => {
    assert.equal(roleIn(both, A), 'TECNICO');
    assert.equal(roleIn(both, C), null);
    assert.equal(canIn(both, 'schede:write', A), true);
    assert.equal(canIn(both, 'schede:delete', A), false);
    assert.equal(canIn(both, 'schede:delete', B), true);
    assert.equal(canIn(both, 'schede:read', C), false);
    assert.equal(canAnywhere(both, 'audit:view'), true);
    assert.equal(canAnywhere(both, 'requests:manage'), false);
    assert.equal(roleIn(master, C), 'MASTER');
  });

  it('turns an empty or foreign filter into nothing, never into everything', () => {
    const scope = scopeFor(both, 'schede:read');
    assert.deepEqual(aziendaWhere(scope), { aziendaId: { in: [A, B] } });
    assert.deepEqual(aziendaWhere(scope, B), { aziendaId: { in: [B] } });
    assert.deepEqual(aziendaWhere(scope, C), { aziendaId: { in: [] } });
    assert.equal(aziendaSql(scopeFor(both, 'aziende:manage')), 'none');
    assert.equal(aziendaSql({ all: true }), null);
    assert.deepEqual(aziendaWhere({ all: true }, C), { aziendaId: C });
    assert.equal(spansAziende(scope), true);
    assert.equal(spansAziende(scopeFor(both, 'schede:delete')), false);
  });

  it('takes the strongest role for the session length', () => {
    assert.equal(topRole(both), 'ADMIN');
    assert.equal(privilegedAccess(both), true);
    assert.equal(privilegedAccess(person('t', { [A]: 'TECNICO' })), false);
    assert.equal(privilegedAccess(master), true);
  });
});

describe('who manages whom', () => {
  const admin = person('admin', { [A]: 'ADMIN' });

  it('lets the MASTER manage every account, its own too, but never switch itself off', () => {
    assert.equal(canManageAccount(master, { id: 'master', master: true, memberships: [] }), true);
    assert.equal(canSetActive(master, { id: 'master', master: true, memberships: [] }), false);
    assert.equal(canSetActive(master, target('x', { [A]: 'ADMIN' })), true);
    assert.equal(canManageMembership(master, target('x', { [A]: 'ADMIN' }), A), true);
    assert.equal(canAssignRole(master, A, 'ADMIN'), true);
    assert.equal(canAssignRole(master, A, 'MASTER'), false);
  });

  it('lets a company ADMIN manage only lower roles of their own company', () => {
    assert.equal(canManageAccount(admin, target('t', { [A]: 'TECNICO' })), true);
    assert.equal(canManageAccount(admin, target('t', { [B]: 'TECNICO' })), false);
    assert.equal(canManageAccount(admin, target('peer', { [A]: 'ADMIN' })), false);
    assert.equal(canManageAccount(admin, target('admin', { [A]: 'ADMIN' })), false, 'never self');
    assert.equal(canAssignRole(admin, A, 'DIREZIONE'), true);
    assert.equal(canAssignRole(admin, A, 'ADMIN'), false);
    assert.equal(canAssignRole(admin, B, 'CLIENTE'), false);
  });

  it('keeps an account shared with another company to the MASTER, the shared role to the ADMIN', () => {
    const shared = target('s', { [A]: 'TECNICO', [B]: 'TECNICO' });
    assert.equal(canManageMembership(admin, shared, A), true);
    assert.equal(canManageMembership(admin, shared, B), false);
    assert.equal(canManageAccount(admin, shared), false);
    assert.equal(canSetActive(admin, shared), false);
    // ADMIN in both companies: the whole account is theirs.
    assert.equal(canManageAccount(person('a2', { [A]: 'ADMIN', [B]: 'ADMIN' }), shared), true);
  });

  it('never lets anyone but the MASTER touch the MASTER', () => {
    const owner: Target = { id: 'master', master: true, memberships: [] };
    assert.equal(canManageAccount(admin, owner), false);
    assert.equal(canManageMembership(admin, owner, A), false);
  });
});
