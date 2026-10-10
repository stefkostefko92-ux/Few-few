import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { Client, db, makeUser, resetDb, signIn, startApp, type Harness } from './helpers.js';
import { ask, newCase, seedWorld, type World } from './world.js';

/**
 * Езикът на човека (FR-14): сам го сменя (PATCH /me, само it/en/bg), администраторът също
 * (PATCH /users/:id/admin, с одит); следващият AI отговор е на новия език (моделът получава
 * „Answer language: …“). Чужд клиент — 404; нищо друго от профила не се сменя от /me.
 */

let h: Harness;
let w: World;

before(async () => {
  h = await startApp();
});
after(async () => {
  await h.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  h.model.reset();
  w = await seedWorld(h);
});

const lastLanguage = () => /Answer language: (\w+)/.exec(h.model.texts.at(-1) ?? '')?.[1];

describe('PATCH /me', () => {
  test('сменя само езика; следващият AI отговор е на новия език', async () => {
    const caseId = await newCase(w.portalAlfa);
    assert.equal((await ask(w.portalAlfa, caseId, 'Errore E37 sul quadro')).status, 201);
    assert.equal(lastLanguage(), 'Italian');

    const res = await w.portalAlfa.patch('/api/v1/me', { locale: 'en' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.user.locale, 'en');
    assert.equal((await w.portalAlfa.get('/api/v1/auth/me')).body.user.locale, 'en');
    assert.equal((await ask(w.portalAlfa, caseId, 'Still E37 after reset')).status, 201);
    assert.equal(lastLanguage(), 'English');

    await w.portalAlfa.patch('/api/v1/me', { locale: 'bg' });
    await ask(w.portalAlfa, caseId, 'Пак E37');
    assert.equal(lastLanguage(), 'Bulgarian');
  });

  test('само it/en/bg; нищо друго; без CSRF — 403; без вход — 401', async () => {
    for (const bad of [{ locale: 'fr' }, { locale: 'en', role: 'SUPPORT' }, {}, { name: 'X' }]) {
      assert.equal((await w.support.patch('/api/v1/me', bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal(
      (await w.support.patch('/api/v1/me', { locale: 'en' }, { csrf: null })).status,
      403,
    );
    assert.equal((await new Client(h.base).patch('/api/v1/me', { locale: 'en' })).status, 401);
    const u = await db.user.findUniqueOrThrow({ where: { id: w.users.support.id } });
    assert.deepEqual([u.locale, u.role], ['it', 'SUPPORT']);
  });
});

describe('администраторът сменя езика', () => {
  test('с причина и одит; директорията го показва; чужд клиент — 404', async () => {
    const target = w.users.portalAlfa.id;
    const res = await w.tenantAdmin.patch(`/api/v1/users/${target}/admin`, {
      locale: 'bg',
      reason: 'richiesta del tecnico',
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.user.locale, 'bg');
    assert.equal(res.body.revokedSessions, 0);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'user.admin_update' } });
    assert.deepEqual((audit.detail as { changes: unknown }).changes, {
      locale: { from: 'it', to: 'bg' },
    });
    assert.equal(
      (
        await w.tenantAdmin.patch(`/api/v1/users/${target}/admin`, {
          locale: 'de',
          reason: 'x y z',
        })
      ).status,
      400,
    );
    // Администратор на ДРУГ клиент — 404 (не издаваме, че акаунтът съществува).
    const adminB = await signIn(
      h,
      await makeUser({ tenantId: w.tenantB.id, role: 'TENANT_ADMIN', name: 'Admin B' }),
    );
    const foreign = await adminB.patch(`/api/v1/users/${target}/admin`, {
      locale: 'en',
      reason: 'altro cliente',
    });
    assert.equal(foreign.status, 404);
    // Сесията остава (езикът не е промяна на достъпа) — следващият въпрос е на български.
    const caseId = await newCase(w.portalAlfa);
    await ask(w.portalAlfa, caseId, 'E37');
    assert.equal(lastLanguage(), 'Bulgarian');
  });
});
