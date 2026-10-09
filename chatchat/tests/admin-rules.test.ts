import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mfaBlock } from '../src/auth/guards.js';
import { can, kindForRole, mfaRequired, ROLES, roleRank } from '../src/auth/rbac.js';
import type { Principal } from '../src/auth/sessions.js';
import { firmwareOutsideRevision } from '../src/domain/versions.js';
import { authorFor } from '../src/services/case-views.js';
import {
  parseFilter,
  UserFilterSchema,
  UserListQuerySchema,
  userWhere,
} from '../src/services/filters.js';
import { bulkPlan, erasedEmail, isErased, targetProblem } from '../src/services/users.js';

/**
 * Правилата на администрирането без база: филтри само по позволени полета, политиката за MFA,
 * кой кого управлява, масовите действия, фърмуерът извън ревизията и кой автор вижда порталът.
 */

describe('Филтри (FR-22/23)', () => {
  test('директория: позволените полета минават; непознато поле → отказ (strict)', () => {
    assert.ok(
      UserFilterSchema.safeParse({
        q: 'rossi',
        role: 'SUPPORT',
        kind: 'INTERNAL',
        active: true,
        mfa: 'off',
        expiringWithinDays: 30,
      }).success,
    );
    for (const bad of [
      { passwordHash: 'x' },
      { email: 'a@b.it' },
      { role: 'ROOT' },
      { mfa: 'yes' },
      { expiringWithinDays: 0 },
      { expiringWithinDays: 1000 },
      { q: '' },
    ]) {
      assert.equal(UserFilterSchema.safeParse(bad).success, false, JSON.stringify(bad));
    }
  });

  test('заявката от адреса: низове → типове, курсор и лимит; чужд параметър → отказ', () => {
    const q = UserListQuerySchema.parse({ active: 'false', expiringWithinDays: '7', limit: '10' });
    assert.deepEqual(q, { active: false, expiringWithinDays: 7, limit: 10 });
    assert.equal(UserListQuerySchema.parse({}).limit, 50);
    assert.equal(UserListQuerySchema.safeParse({ active: 'yes' }).success, false);
    assert.equal(UserListQuerySchema.safeParse({ orderBy: 'email' }).success, false);
    assert.equal(UserListQuerySchema.safeParse({ limit: '1000' }).success, false);
  });

  test('запазен филтър: валидира се срещу обхвата, не срещу друг', () => {
    assert.deepEqual(parseFilter('USERS', { role: 'SUPPORT' }), {
      ok: true,
      filter: { role: 'SUPPORT' },
    });
    assert.equal(parseFilter('USERS', { status: ['OPEN'] }).ok, false, 'поле на CASES');
    assert.equal(parseFilter('CASES', { status: ['OPEN', 'RESOLVED'] }).ok, true);
    assert.equal(parseFilter('CASES', { status: ['NOPE'] }).ok, false);
    assert.equal(parseFilter('CASES', { role: 'SUPPORT' }).ok, false, 'поле на USERS');
    assert.equal(parseFilter('CONVERSATIONS', { type: ['CHANNEL'], unread: true }).ok, true);
    assert.equal(parseFilter('CONVERSATIONS', { senderId: 'u1' }).ok, false);
    assert.equal(parseFilter('CASES', {}).ok, true, 'празен филтър е позволен');
  });

  test('условието винаги е в клиента; „изтичащи“ = в бъдещето и до N дни', () => {
    const now = new Date('2026-10-09T00:00:00Z');
    const where = userWhere('t1', { mfa: 'on', expiringWithinDays: 10, active: true }, now);
    assert.deepEqual(where.AND, [
      { tenantId: 't1' },
      { active: true },
      { totpEnabledAt: { not: null } },
      { expiresAt: { gt: now, lte: new Date('2026-10-19T00:00:00Z') } },
    ]);
    assert.deepEqual(userWhere('t1', { mfa: 'off' }).AND, [
      { tenantId: 't1' },
      { totpEnabledAt: null },
    ]);
  });
});

function principal(role: Principal['user']['role'], mfa: Principal['mfa']): Principal {
  return {
    user: {
      id: 'u',
      tenantId: 't',
      companyId: null,
      name: 'N',
      role,
      kind: kindForRole(role),
      locale: 'it',
    },
    session: { id: 's', csrfToken: 'c' },
    mfa,
  };
}

describe('Политика за втори фактор', () => {
  test('персоналът е задължен; техниците — не', () => {
    assert.deepEqual(
      ROLES.filter((r) => mfaRequired(r)),
      ['SUPPORT', 'ENGINEERING', 'KNOWLEDGE_OWNER', 'TENANT_ADMIN', 'PLATFORM_ADMIN'],
    );
  });

  test('включен и неминат → 401 mfa_required (и за техник по желание)', () => {
    for (const role of ['SUPPORT', 'PORTAL_TECHNICIAN'] as const) {
      assert.deepEqual(
        mfaBlock(principal(role, { enabled: true, passed: false, required: mfaRequired(role) })),
        { status: 401, code: 'mfa_required' },
      );
    }
  });

  test('персонал без TOTP → 403 mfa_setup_required; минат / техник без TOTP → пропуск', () => {
    assert.deepEqual(
      mfaBlock(principal('TENANT_ADMIN', { enabled: false, passed: false, required: true })),
      { status: 403, code: 'mfa_setup_required' },
    );
    assert.equal(
      mfaBlock(principal('TENANT_ADMIN', { enabled: true, passed: true, required: true })),
      null,
    );
    assert.equal(
      mfaBlock(principal('PORTAL_TECHNICIAN', { enabled: false, passed: false, required: false })),
      null,
    );
  });
});

describe('Кой кого управлява', () => {
  test('users:manage — администраторите; другите — не', () => {
    assert.deepEqual(
      ROLES.filter((r) => can(r, 'users:manage')),
      ['TENANT_ADMIN', 'PLATFORM_ADMIN'],
    );
  });

  test('рангът: платформа > клиент > останалите (равни)', () => {
    assert.ok(roleRank('PLATFORM_ADMIN') > roleRank('TENANT_ADMIN'));
    assert.ok(roleRank('TENANT_ADMIN') > roleRank('ENGINEERING'));
    assert.equal(roleRank('SUPPORT'), roleRank('PORTAL_TECHNICIAN'));
  });

  test('себе си не; по-висок ранг не; равен и по-нисък — да', () => {
    const admin = { id: 'a', role: 'TENANT_ADMIN' as const };
    assert.equal(targetProblem(admin, { id: 'a', role: 'TENANT_ADMIN' }), 'cannot_modify_self');
    assert.equal(
      targetProblem(admin, { id: 'a', role: 'TENANT_ADMIN' }, { allowSelf: true }),
      null,
    );
    assert.equal(targetProblem(admin, { id: 'p', role: 'PLATFORM_ADMIN' }), 'forbidden');
    assert.equal(targetProblem(admin, { id: 'b', role: 'TENANT_ADMIN' }), null);
    assert.equal(targetProblem(admin, { id: 'c', role: 'SUPPORT' }), null);
  });

  test('масово действие: брои само реално засегнатите', () => {
    const actor = { id: 'a', role: 'TENANT_ADMIN' as const };
    const t = (
      id: string,
      over: Partial<{ role: string; active: boolean; email: string }> = {},
    ) => ({
      id,
      email: over.email ?? `${id}@x.it`,
      role: (over.role ?? 'SUPPORT') as 'SUPPORT',
      active: over.active ?? true,
      expiresAt: null,
    });
    const targets = [
      t('a', { role: 'TENANT_ADMIN' }), // себе си
      t('p', { role: 'PLATFORM_ADMIN' }), // по-висок ранг
      t('e', { email: erasedEmail('e'), active: false }), // изтрит
      t('off', { active: false }), // вече деактивиран
      t('s1'),
      t('s2'),
    ];
    assert.deepEqual(bulkPlan(actor, targets, 'deactivate'), {
      affected: ['s1', 's2'],
      skipped: 4,
    });
    assert.deepEqual(bulkPlan(actor, targets, 'activate'), { affected: ['off'], skipped: 5 });
    assert.deepEqual(bulkPlan(actor, targets, 'revoke_sessions').affected, ['off', 's1', 's2']);
    assert.deepEqual(bulkPlan(actor, targets, 'set_expiry', null).affected, [], 'вече без срок');
    assert.ok(isErased(targets[2] ?? t('x')));
  });
});

describe('Фърмуер извън обхвата на ревизията', () => {
  const rev = { fwMin: '4.0', fwMax: '4.9' };
  test('под, над → да; в обхвата и по границите → не', () => {
    assert.equal(firmwareOutsideRevision(rev, '3.9'), true);
    assert.equal(firmwareOutsideRevision(rev, '4.10'), true, '4.10 > 4.9 (числово)');
    assert.equal(firmwareOutsideRevision(rev, '5.1'), true);
    for (const fw of ['4.0', '4.2', '4.9', '4.9.0']) {
      assert.equal(firmwareOutsideRevision(rev, fw), false, fw);
    }
  });

  test('без горна граница; непознат или невалиден фърмуер → не твърдим нищо', () => {
    assert.equal(firmwareOutsideRevision({ fwMin: '5.0', fwMax: null }, '9.9'), false);
    assert.equal(firmwareOutsideRevision({ fwMin: '5.0', fwMax: null }, '4.2'), true);
    assert.equal(firmwareOutsideRevision(rev, null), false);
    assert.equal(firmwareOutsideRevision(rev, 'beta-7'), false);
  });
});

describe('Автор на съобщение за портала (правният одит, т. 12)', () => {
  const portal = { id: 'p1', kind: 'PORTAL' as const };
  const internal = { id: 'i1', kind: 'INTERNAL' as const };
  const staff = {
    id: 's1',
    name: 'Sara Supporto',
    role: 'SUPPORT' as const,
    kind: 'INTERNAL' as const,
  };
  const tech = {
    id: 'p2',
    name: 'Tecnico Beta',
    role: 'PORTAL_TECHNICIAN' as const,
    kind: 'PORTAL' as const,
  };

  test('порталът вижда ролята на служителя, не името', () => {
    assert.deepEqual(authorFor(portal, staff), { authorName: null, authorRole: 'SUPPORT' });
  });

  test('собственото съобщение: име, без роля; AI/без автор: нищо', () => {
    assert.deepEqual(authorFor(portal, { ...tech, id: 'p1', name: 'Io' }), {
      authorName: 'Io',
      authorRole: null,
    });
    assert.deepEqual(authorFor(portal, undefined), { authorName: null, authorRole: null });
  });

  test('вътрешен читател вижда името и ролята', () => {
    assert.deepEqual(authorFor(internal, staff), {
      authorName: 'Sara Supporto',
      authorRole: 'SUPPORT',
    });
    assert.deepEqual(authorFor(internal, tech), {
      authorName: 'Tecnico Beta',
      authorRole: 'PORTAL_TECHNICIAN',
    });
  });
});
