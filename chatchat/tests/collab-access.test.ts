import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Role } from '@prisma/client';
import {
  canAccessConversation,
  canSelfJoin,
  companyKey,
  defaultChannelVisibility,
  memberEligible,
  type Candidate,
  type ConversationScope,
  type Viewer,
} from '../src/services/collab/access.js';
import { can } from '../src/auth/rbac.js';

/**
 * Правилата за достъп до работното пространство (§12.3, AC-18) като чиста логика: една таблица
 * за REST и за филтъра на потоците. Кръстосаният достъп срещу живата база е в
 * tests/integration/collab-access.test.ts.
 */

const T = 'tenant-a';
const staff = (role: Role, id = role): Viewer => ({
  id,
  tenantId: T,
  companyId: null,
  role,
  kind: 'INTERNAL',
});
const portal = (id: string, companyId: string | null): Viewer => ({
  id,
  tenantId: T,
  companyId,
  role: 'PORTAL_TECHNICIAN',
  kind: 'PORTAL',
});
const conv = (over: Partial<ConversationScope> = {}): ConversationScope => ({
  tenantId: T,
  type: 'GROUP',
  visibility: 'PRIVATE',
  portal: false,
  ...over,
});
const candidate = (v: Viewer, active = true): Candidate => ({ ...v, active });

describe('canAccessConversation', () => {
  test('член вижда своя разговор; нечлен не вижда DIRECT/GROUP/PRIVATE канал', () => {
    const support = staff('SUPPORT');
    for (const type of ['DIRECT', 'GROUP', 'CHANNEL'] as const) {
      assert.equal(canAccessConversation(support, conv({ type }), true), true, type);
      assert.equal(canAccessConversation(support, conv({ type }), false), false, type);
    }
  });

  test('PUBLIC канал се вижда от вътрешните на клиента, без членство', () => {
    const c = conv({ type: 'CHANNEL', visibility: 'PUBLIC' });
    for (const role of ['INTERNAL_TECHNICIAN', 'SUPPORT', 'ENGINEERING', 'TENANT_ADMIN'] as const) {
      assert.equal(canAccessConversation(staff(role), c, false), true, role);
    }
  });

  test('порталът НИКОГА не вижда канали — дори PUBLIC и дори като „член“', () => {
    const p = portal('p1', 'alfa');
    for (const visibility of ['PUBLIC', 'PRIVATE'] as const) {
      assert.equal(canAccessConversation(p, conv({ type: 'CHANNEL', visibility }), true), false);
      assert.equal(canAccessConversation(p, conv({ type: 'CHANNEL', visibility }), false), false);
    }
  });

  test('порталът вижда само портален DIRECT/GROUP, в който е член', () => {
    const p = portal('p1', 'alfa');
    assert.equal(canAccessConversation(p, conv({ portal: true }), true), true);
    assert.equal(canAccessConversation(p, conv({ type: 'DIRECT', portal: true }), true), true);
    assert.equal(canAccessConversation(p, conv({ portal: true }), false), false);
    // Вътрешна група, в която порталът по грешка е член — пак не.
    assert.equal(canAccessConversation(p, conv({ portal: false }), true), false);
  });

  test('CASE дискусията — само персонал с case:readAll; порталът и техникът — никога', () => {
    const c = conv({ type: 'CASE' });
    assert.equal(canAccessConversation(staff('SUPPORT'), c, false), true);
    assert.equal(canAccessConversation(staff('TENANT_ADMIN'), c, false), true);
    assert.equal(canAccessConversation(staff('INTERNAL_TECHNICIAN'), c, true), false);
    assert.equal(canAccessConversation(portal('p1', 'alfa'), c, true), false);
  });

  test('друг клиент — никога, каквото и да е членството', () => {
    const other = { ...staff('SUPPORT'), tenantId: 'tenant-b' };
    assert.equal(
      canAccessConversation(other, conv({ type: 'CHANNEL', visibility: 'PUBLIC' }), true),
      false,
    );
    assert.equal(canAccessConversation(other, conv(), true), false);
  });

  test('операторът на платформата не е част от работното пространство', () => {
    assert.equal(can('PLATFORM_ADMIN', 'conversation:use'), false);
    assert.equal(canAccessConversation(staff('PLATFORM_ADMIN'), conv(), true), false);
  });
});

describe('членство', () => {
  test('сам влиза само в PUBLIC канал и в CASE дискусия (с case:readAll)', () => {
    const support = staff('SUPPORT');
    assert.equal(canSelfJoin(support, conv({ type: 'CHANNEL', visibility: 'PUBLIC' })), true);
    assert.equal(canSelfJoin(support, conv({ type: 'CHANNEL', visibility: 'PRIVATE' })), false);
    assert.equal(canSelfJoin(support, conv({ type: 'CASE' })), true);
    assert.equal(canSelfJoin(staff('INTERNAL_TECHNICIAN'), conv({ type: 'CASE' })), false);
    assert.equal(canSelfJoin(support, conv({ type: 'GROUP' })), false);
    assert.equal(
      canSelfJoin(portal('p', 'alfa'), conv({ type: 'CHANNEL', visibility: 'PUBLIC' })),
      false,
    );
  });

  test('портален потребител: само в портален DIRECT/GROUP и само от същата фирма', () => {
    const alfa = candidate(portal('p1', 'alfa'));
    const beta = candidate(portal('p2', 'beta'));
    const group = conv({ portal: true });
    assert.equal(memberEligible(alfa, group, new Set()), true);
    assert.equal(memberEligible(alfa, group, new Set(['alfa'])), true);
    assert.equal(memberEligible(beta, group, new Set(['alfa'])), false);
    assert.equal(memberEligible(alfa, conv({ portal: false }), new Set()), false);
    assert.equal(memberEligible(alfa, conv({ type: 'CHANNEL', portal: true }), new Set()), false);
    assert.equal(memberEligible(alfa, conv({ type: 'CASE' }), new Set()), false);
  });

  test('порталист без фирма е „фирма“ сам за себе си', () => {
    const lone = candidate(portal('p3', null));
    assert.equal(companyKey(lone), 'user:p3');
    assert.equal(memberEligible(lone, conv({ portal: true }), new Set(['alfa'])), false);
  });

  test('неактивен, чужд клиент или без conversation:use — не става член', () => {
    const g = conv();
    assert.equal(memberEligible(candidate(staff('SUPPORT'), false), g, new Set()), false);
    assert.equal(
      memberEligible({ ...candidate(staff('SUPPORT')), tenantId: 'tenant-b' }, g, new Set()),
      false,
    );
    assert.equal(memberEligible(candidate(staff('PLATFORM_ADMIN')), g, new Set()), false);
    assert.equal(
      memberEligible(candidate(staff('INTERNAL_TECHNICIAN')), conv({ type: 'CASE' }), new Set()),
      false,
    );
  });

  test('канали за инженеринг/спешни случаи са PRIVATE по подразбиране', () => {
    for (const name of ['Engineering', 'Urgenze', 'Emergenze notte', 'Спешни']) {
      assert.equal(defaultChannelVisibility(name), 'PRIVATE', name);
    }
    for (const name of ['Generale', 'LTX-500', 'Supporto tecnico']) {
      assert.equal(defaultChannelVisibility(name), 'PUBLIC', name);
    }
  });

  test('порталът не създава разговори и канали; техникът — DIRECT/GROUP, без канали', () => {
    assert.equal(can('PORTAL_TECHNICIAN', 'conversation:create'), false);
    assert.equal(can('PORTAL_TECHNICIAN', 'channel:create'), false);
    assert.equal(can('INTERNAL_TECHNICIAN', 'conversation:create'), true);
    assert.equal(can('INTERNAL_TECHNICIAN', 'channel:create'), false);
    assert.equal(can('SUPPORT', 'channel:create'), true);
  });
});
