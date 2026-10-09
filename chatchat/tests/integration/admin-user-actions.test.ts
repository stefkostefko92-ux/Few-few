import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { verifyPassword } from '../../src/auth/password.js';
import { onSessionsRevoked, type SessionRevocation } from '../../src/auth/sessions.js';
import { Client, db, ORIGIN, resetDb, signIn, startApp, type Harness } from './helpers.js';
import { seedWorld, type World } from './world.js';

/**
 * Действия на администратора върху акаунти (FR-23/25, AC-16): еднократен линк за нова парола,
 * отнемане на сесиите, нулиране на MFA, масови действия с преглед на броя, запазени филтри.
 */

let h: Harness;
let w: World;
const events: SessionRevocation[] = [];
let unsubscribe: () => void;

before(async () => {
  h = await startApp();
  unsubscribe = onSessionsRevoked((e) => {
    events.push(e);
  });
});
after(async () => {
  unsubscribe();
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  events.length = 0;
  w = await seedWorld(h);
});

const REASON = 'Richiesta del responsabile';
const linkToken = (url: string) => url.split('#')[1] ?? '';

describe('Нулиране на парола (FR-25)', () => {
  test('линкът е еднократен; нов линк обезсилва стария; сесиите падат', async () => {
    const id = w.users.internal.id;
    const first = await w.tenantAdmin.post(`/api/v1/admin/users/${id}/reset-password`, {});
    assert.equal(first.status, 200);
    assert.match(first.body.url, new RegExp(`^${ORIGIN}/reset#`));
    const hours = (new Date(first.body.expiresAt).getTime() - Date.now()) / 3600_000;
    assert.ok(hours > 23.9 && hours <= 24, `${hours}`);
    const second = await w.tenantAdmin.post(`/api/v1/admin/users/${id}/reset-password`, {
      reason: 'Password dimenticata',
    });
    const anon = new Client(h.base);
    const old = await anon.post('/api/v1/auth/reset-password', {
      token: linkToken(first.body.url),
      newPassword: 'nuova password lunga 1',
    });
    assert.deepEqual([old.status, old.body.code], [400, 'invalid_token']);
    const ok = await anon.post('/api/v1/auth/reset-password', {
      token: linkToken(second.body.url),
      newPassword: 'nuova password lunga 2',
    });
    assert.equal(ok.status, 204);
    assert.equal((await w.internal.get('/api/v1/auth/me')).status, 401, 'сесиите са отнети');
    const again = await anon.post('/api/v1/auth/reset-password', {
      token: linkToken(second.body.url),
      newPassword: 'nuova password lunga 3',
    });
    assert.equal(again.status, 400, 'втори път със същия линк');
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    assert.equal(await verifyPassword('nuova password lunga 2', user.passwordHash), true);
    assert.equal(events.at(-1)?.reason, 'password_reset');
  });

  test('изтекъл линк, деактивиран акаунт, къса парола, лош формат', async () => {
    const id = w.users.internal.id;
    const link = await w.tenantAdmin.post(`/api/v1/admin/users/${id}/reset-password`, {});
    const token = linkToken(link.body.url);
    const anon = new Client(h.base);
    const weak = await anon.post('/api/v1/auth/reset-password', { token, newPassword: 'corta' });
    assert.deepEqual([weak.status, weak.body.code], [422, 'weak_password']);
    await db.passwordReset.updateMany({
      where: { userId: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await anon.post('/api/v1/auth/reset-password', {
      token,
      newPassword: 'abbastanza lunga davvero',
    });
    assert.deepEqual([expired.status, expired.body.code], [400, 'invalid_token']);

    const fresh = await w.tenantAdmin.post(`/api/v1/admin/users/${id}/reset-password`, {});
    await db.user.update({ where: { id }, data: { active: false } });
    const inactive = await anon.post('/api/v1/auth/reset-password', {
      token: linkToken(fresh.body.url),
      newPassword: 'abbastanza lunga davvero',
    });
    assert.equal(inactive.status, 400);
    assert.equal(
      (await anon.post('/api/v1/auth/reset-password', { token: 'x', newPassword: 'y' })).status,
      400,
    );
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    assert.equal(user.passwordChangedAt, null);
  });

  test('чужд Origin → 403; за чужд клиент → 404', async () => {
    const anon = new Client(h.base);
    const r = await anon.post(
      '/api/v1/auth/reset-password',
      { token: 'a'.repeat(43), newPassword: 'abbastanza lunga davvero' },
      { origin: 'https://evil.example' },
    );
    assert.equal(r.status, 403);
    const cross = await w.tenantAdmin.post(
      `/api/v1/admin/users/${w.users.ownerB.id}/reset-password`,
      {},
    );
    assert.equal(cross.status, 404);
  });
});

describe('Отнемане на сесиите и нулиране на MFA', () => {
  test('revoke-sessions: всички сесии на човека, другите не са засегнати', async () => {
    const r = await w.tenantAdmin.post(
      `/api/v1/admin/users/${w.users.ownerA1.id}/revoke-sessions`,
      {
        reason: REASON,
      },
    );
    assert.deepEqual(r.body, { revoked: 1 });
    assert.equal((await w.ownerA1.get('/api/v1/auth/me')).status, 401);
    assert.equal((await w.ownerA2.get('/api/v1/auth/me')).status, 200);
    assert.equal(
      (await w.tenantAdmin.post(`/api/v1/admin/users/${w.users.ownerA1.id}/revoke-sessions`, {}))
        .status,
      400,
      'без причина',
    );
  });

  test('reset-mfa: тайната е изтрита, сесиите падат, при нов вход — задължителна настройка', async () => {
    const r = await w.tenantAdmin.post(`/api/v1/admin/users/${w.users.support.id}/reset-mfa`, {
      reason: 'Telefono perso',
    });
    assert.equal(r.status, 200);
    const user = await db.user.findUniqueOrThrow({ where: { id: w.users.support.id } });
    assert.deepEqual([user.totpSecretEnc, user.totpEnabledAt], [null, null]);
    assert.equal((await w.support.get('/api/v1/cases')).status, 401);
    const fresh = await signIn(h, user);
    assert.equal((await fresh.get('/api/v1/cases')).body.code, 'mfa_setup_required');
  });
});

describe('Масови действия (§12.4 „anteprima del numero“)', () => {
  test('dryRun по подразбиране: брой без промяна; после изпълнение', async () => {
    const ids = [
      w.users.support.id,
      w.users.internal.id,
      w.users.tenantAdmin.id, // себе си — пропуска се
      w.users.ownerB.id, // чужд клиент — пропуска се
      'nema-takav',
    ];
    const preview = await w.tenantAdmin.post('/api/v1/admin/users/bulk', {
      ids,
      action: 'deactivate',
      reason: REASON,
    });
    assert.deepEqual(preview.body, {
      dryRun: true,
      action: 'deactivate',
      requested: 5,
      affected: 2,
      skipped: 3,
    });
    assert.equal(await db.user.count({ where: { tenantId: w.tenantA.id, active: false } }), 0);
    assert.equal(await db.auditEvent.count({ where: { action: 'user.bulk.deactivate' } }), 0);

    const done = await w.tenantAdmin.post('/api/v1/admin/users/bulk', {
      ids,
      action: 'deactivate',
      reason: REASON,
      dryRun: false,
    });
    assert.equal(done.body.affected, 2);
    assert.equal(done.body.revokedSessions, 2);
    assert.equal((await w.support.get('/api/v1/auth/me')).status, 401);
    assert.equal((await w.internal.get('/api/v1/auth/me')).status, 401);
    assert.equal((await w.tenantAdmin.get('/api/v1/auth/me')).status, 200);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: w.users.ownerB.id } })).active,
      true,
    );
    assert.equal(await db.auditEvent.count({ where: { action: 'user.bulk.deactivate' } }), 2);

    const again = await w.tenantAdmin.post('/api/v1/admin/users/bulk', {
      ids,
      action: 'deactivate',
      reason: REASON,
    });
    assert.equal(again.body.affected, 0, 'вече деактивираните не се броят');
  });

  test('set_expiry иска срок; без причина → 400', async () => {
    const base = { ids: [w.users.support.id], reason: REASON };
    assert.equal(
      (await w.tenantAdmin.post('/api/v1/admin/users/bulk', { ...base, action: 'set_expiry' }))
        .status,
      400,
    );
    assert.equal(
      (
        await w.tenantAdmin.post('/api/v1/admin/users/bulk', {
          ids: base.ids,
          action: 'revoke_sessions',
        })
      ).status,
      400,
    );
    const until = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    const r = await w.tenantAdmin.post('/api/v1/admin/users/bulk', {
      ...base,
      action: 'set_expiry',
      expiresAt: until,
      dryRun: false,
    });
    assert.equal(r.body.affected, 1);
    assert.equal(r.body.revokedSessions, 0, 'бъдещ срок не отнема сесиите');
    const u = await db.user.findUniqueOrThrow({ where: { id: w.users.support.id } });
    assert.equal(u.expiresAt?.toISOString(), until);
  });
});

describe('Запазени филтри (FR-23)', () => {
  test('лични и споделени; порталът не вижда споделените; USERS само за администратора', async () => {
    const mine = await w.support.post('/api/v1/saved-filters', {
      scope: 'CASES',
      name: 'Aperti',
      filter: { status: ['OPEN', 'WAITING_TECHNICIAN'] },
    });
    assert.equal(mine.status, 201);
    assert.deepEqual(mine.body.filter.filter, { status: ['OPEN', 'WAITING_TECHNICIAN'] });
    const shared = await w.ownerA1.post('/api/v1/saved-filters', {
      scope: 'CASES',
      name: 'Escalati',
      filter: { outcome: 'ESCALATED' },
      shared: true,
    });
    assert.equal(shared.status, 201);

    const names = async (c: Client, scope = 'CASES') =>
      (await c.get(`/api/v1/saved-filters?scope=${scope}`)).body.filters.map(
        (f: { name: string }) => f.name,
      );
    assert.deepEqual(await names(w.support), ['Aperti', 'Escalati']);
    assert.deepEqual(await names(w.internal), ['Escalati']);
    assert.deepEqual(await names(w.portalAlfa), []);
    assert.deepEqual(await names(w.ownerB), [], 'друг клиент');
    assert.equal(
      (
        await w.portalAlfa.post('/api/v1/saved-filters', {
          scope: 'CASES',
          name: 'Condiviso',
          filter: {},
          shared: true,
        })
      ).status,
      403,
    );

    assert.equal((await w.support.get('/api/v1/saved-filters?scope=USERS')).status, 403);
    const users = await w.tenantAdmin.post('/api/v1/saved-filters', {
      scope: 'USERS',
      name: 'Senza MFA',
      filter: { mfa: 'off', active: true },
    });
    assert.equal(users.status, 201);
    assert.deepEqual(await names(w.tenantAdmin, 'USERS'), ['Senza MFA']);
  });

  test('филтър извън позволените полета → 400 invalid_filter; нищо не е записано', async () => {
    for (const filter of [{ passwordHash: 'x' }, { role: 'SUPPORT' }, { status: 'OPEN' }]) {
      const r = await w.support.post('/api/v1/saved-filters', {
        scope: 'CASES',
        name: 'X',
        filter,
      });
      assert.deepEqual([r.status, r.body.code], [400, 'invalid_filter'], JSON.stringify(filter));
    }
    assert.equal(await db.savedFilter.count(), 0);
  });

  test('трие само собственикът (споделен — и администраторът); чужд личен → 404', async () => {
    const own = await w.support.post('/api/v1/saved-filters', {
      scope: 'CASES',
      name: 'Mio',
      filter: {},
    });
    const shared = await w.ownerA1.post('/api/v1/saved-filters', {
      scope: 'CASES',
      name: 'Team',
      filter: {},
      shared: true,
    });
    assert.equal((await w.internal.del(`/api/v1/saved-filters/${own.body.filter.id}`)).status, 404);
    assert.equal(
      (await w.support.del(`/api/v1/saved-filters/${shared.body.filter.id}`)).status,
      404,
    );
    assert.equal(
      (await w.tenantAdmin.del(`/api/v1/saved-filters/${shared.body.filter.id}`)).status,
      204,
    );
    assert.equal((await w.support.del(`/api/v1/saved-filters/${own.body.filter.id}`)).status, 204);
    assert.equal(await db.savedFilter.count(), 0);
  });
});
