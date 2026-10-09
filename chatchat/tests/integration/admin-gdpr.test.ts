import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { appendAudit, verifyAuditChain } from '../../src/audit.js';
import { db, makeUser, resetDb, signIn, startApp, type Harness } from './helpers.js';
import { answerOf, ask, newCase, seedWorld, type World } from './world.js';

/**
 * Права на субекта (GDPR чл. 15/17/20 — правният одит, т. 8) и одитът за администратора на
 * клиента без събитията по входа на хората (т. 7, чл. 4 Statuto dei Lavoratori).
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

const REASON = 'Richiesta dell’interessato (art. 17)';

/** Порталният техник с история: случай, AI отговор, бележка, тикет, обратна връзка и др. */
async function withHistory() {
  const caseId = await newCase(w.portalAlfa, { deviceSerial: 'SN-ALFA-1' });
  const answer = await ask(w.portalAlfa, caseId, 'Errore E37 dopo il riavvio');
  answerOf(answer);
  await ask(w.portalAlfa, caseId, 'Nota del tecnico sul cablaggio', { askAi: false });
  await w.portalAlfa.post('/api/v1/feedback', {
    messageId: answer.body.answer.id,
    rating: 'USEFUL',
    comment: 'Utile davvero',
  });
  await w.portalAlfa.post('/api/v1/tickets', { caseId, reason: 'Serve un tecnico in sede' });
  await w.portalAlfa.post('/api/v1/saved-filters', {
    scope: 'CASES',
    name: 'Miei aperti',
    filter: { status: ['OPEN'] },
  });
  const id = w.users.portalAlfa.id;
  await db.notification.create({
    data: {
      tenantId: w.tenantA.id,
      userId: id,
      eventType: 'case.assigned',
      objectType: 'case',
      objectId: caseId,
    },
  });
  await db.userPresence.create({ data: { userId: id, status: 'ONLINE' } });
  return caseId;
}

describe('Експорт (чл. 15/20)', () => {
  test('профил, метаданни на сесиите и написаното от човека — без тайни', async () => {
    await withHistory();
    const id = w.users.portalAlfa.id;
    const res = await w.tenantAdmin.get(`/api/v1/admin/users/${id}/export`);
    assert.equal(res.status, 200);
    assert.match(
      res.headers.get('content-disposition') ?? '',
      new RegExp(`attachment; filename="chatchat-export-${id}.json"`),
    );
    const data = res.body;
    assert.equal(data.format, 'chatchat.subject-export.v1');
    assert.equal(data.profile.email, w.users.portalAlfa.email);
    assert.equal(data.profile.company.name, 'Alfa Srl');
    assert.equal(data.sessions.length, 1);
    assert.deepEqual(Object.keys(data.sessions[0]).sort(), [
      'createdAt',
      'expiresAt',
      'id',
      'lastSeenAt',
      'mfaPassed',
      'revokedAt',
    ]);
    assert.deepEqual(
      data.caseMessages.map((m: { body: string }) => m.body),
      ['Errore E37 dopo il riavvio', 'Nota del tecnico sul cablaggio'],
      'само човешките съобщения на човека, не AI отговорите',
    );
    assert.ok(data.caseMessages.every((m: { caseNumber: string }) => /^CASE-/.test(m.caseNumber)));
    assert.equal(data.casesCreated.length, 1);
    assert.equal(data.tickets[0].reason, 'Serve un tecnico in sede');
    assert.equal(data.feedback[0].comment, 'Utile davvero');
    assert.equal(data.savedFilters[0].name, 'Miei aperti');
    assert.equal(data.notifications.length, 1);
    assert.equal(data.presence.status, 'ONLINE');
    const dump = JSON.stringify(data);
    for (const secret of ['passwordHash', 'tokenHash', 'csrfToken', 'totpSecretEnc']) {
      assert.equal(dump.includes(secret), false, secret);
    }
    assert.equal(dump.includes(w.portalAlfa.csrfToken ?? 'x'), false);
    assert.equal(await db.auditEvent.count({ where: { action: 'user.export', objectId: id } }), 1);
  });

  test('чужд клиент → 404; без users:manage → 403; по-висок ранг → 403', async () => {
    assert.equal(
      (await w.tenantAdmin.get(`/api/v1/admin/users/${w.users.portalB.id}/export`)).status,
      404,
    );
    assert.equal(
      (await w.support.get(`/api/v1/admin/users/${w.users.portalAlfa.id}/export`)).status,
      403,
    );
    const platform = await makeUser({ tenantId: w.tenantA.id, role: 'PLATFORM_ADMIN' });
    assert.equal(
      (await w.tenantAdmin.get(`/api/v1/admin/users/${platform.id}/export`)).status,
      403,
    );
  });
});

describe('Изтриване = анонимизация (чл. 17)', () => {
  test('акаунтът е анонимен и мъртъв; случаите остават с псевдонимен автор; веригата е цяла', async () => {
    const caseId = await withHistory();
    const id = w.users.portalAlfa.id;
    await db.passwordReset.create({
      data: {
        userId: id,
        tokenHash: 'x'.repeat(64),
        expiresAt: new Date(Date.now() + 3600_000),
        createdById: w.users.tenantAdmin.id,
      },
    });
    const auditBefore = await db.auditEvent.count({ where: { actorId: id } });

    const res = await w.tenantAdmin.post(`/api/v1/admin/users/${id}/erase`, { reason: REASON });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(
      [res.body.user.name, res.body.user.email, res.body.user.active, res.body.user.erased],
      ['Utente rimosso', `erased-${id}@invalid`, false, true],
    );
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(
      [user.totpSecretEnc, user.totpEnabledAt, user.lastLoginAt],
      [null, null, null],
    );
    assert.ok(user.deactivatedAt);
    assert.equal((await w.portalAlfa.get('/api/v1/auth/me')).status, 401);
    for (const [name, count] of [
      ['sessions', await db.session.count({ where: { userId: id } })],
      ['resets', await db.passwordReset.count({ where: { userId: id } })],
      ['notifications', await db.notification.count({ where: { userId: id } })],
      ['presence', await db.userPresence.count({ where: { userId: id } })],
      ['filters', await db.savedFilter.count({ where: { userId: id } })],
    ] as const) {
      assert.equal(count, 0, name);
    }

    // Техническото съдържание остава; авторът е псевдонимният id без име и имейл.
    assert.equal(await db.caseMessage.count({ where: { caseId, authorId: id } }), 2);
    assert.equal(await db.ticket.count({ where: { caseId } }), 1);
    const seen = await w.support.get(`/api/v1/cases/${caseId}`);
    const human = seen.body.messages.find((m: { kind: string }) => m.kind === 'HUMAN');
    assert.equal(human.authorName, 'Utente rimosso');
    assert.equal(JSON.stringify(seen.body).includes(w.users.portalAlfa.name), false);

    // Одитната верига не се пипа: старите събития са там, веригата е цяла, причината е записана.
    assert.equal(await db.auditEvent.count({ where: { actorId: id } }), auditBefore);
    assert.equal(await verifyAuditChain(db), null);
    const erase = await db.auditEvent.findFirstOrThrow({ where: { action: 'user.erase' } });
    assert.equal((erase.detail as { reason: string }).reason, REASON);
    assert.equal(JSON.stringify(erase).includes(w.users.portalAlfa.email), false);
  });

  test('изтрит акаунт не се връща: повторно изтриване, активиране, нова парола → 409', async () => {
    const id = w.users.internal.id;
    assert.equal(
      (await w.tenantAdmin.post(`/api/v1/admin/users/${id}/erase`, { reason: REASON })).status,
      200,
    );
    const again = await w.tenantAdmin.post(`/api/v1/admin/users/${id}/erase`, { reason: REASON });
    assert.deepEqual([again.status, again.body.code], [409, 'user_erased']);
    const revive = await w.tenantAdmin.patch(`/api/v1/users/${id}/admin`, {
      active: true,
      reason: REASON,
    });
    assert.deepEqual([revive.status, revive.body.code], [409, 'user_erased']);
    const link = await w.tenantAdmin.post(`/api/v1/admin/users/${id}/reset-password`, {});
    assert.equal(link.status, 409);
    const bulk = await w.tenantAdmin.post('/api/v1/admin/users/bulk', {
      ids: [id],
      action: 'activate',
      reason: REASON,
    });
    assert.equal(bulk.body.affected, 0);
  });

  test('без причина → 400; себе си → 409; чужд клиент → 404', async () => {
    const id = w.users.support.id;
    assert.equal((await w.tenantAdmin.post(`/api/v1/admin/users/${id}/erase`, {})).status, 400);
    assert.equal(
      (
        await w.tenantAdmin.post(`/api/v1/admin/users/${w.users.tenantAdmin.id}/erase`, {
          reason: REASON,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await w.tenantAdmin.post(`/api/v1/admin/users/${w.users.portalB.id}/erase`, {
          reason: REASON,
        })
      ).status,
      404,
    );
    assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).active, true);
  });
});

describe('Одит за администратора на клиента (правният одит, т. 7)', () => {
  test('без вход/изход/неуспешен вход/MFA проверки; платформеният администратор ги вижда', async () => {
    for (const action of [
      'auth.login',
      'auth.logout',
      'auth.login_failed',
      'auth.mfa_verified',
      'auth.mfa_failed',
    ]) {
      await appendAudit(db, { tenantId: w.tenantA.id, actorId: w.users.support.id, action });
    }
    const tenant = await w.tenantAdmin.get('/api/v1/audit');
    assert.equal(tenant.status, 200);
    const seen = new Set(tenant.body.events.map((e: { action: string }) => e.action));
    for (const hidden of ['auth.login', 'auth.logout', 'auth.login_failed', 'auth.mfa_failed']) {
      assert.equal(seen.has(hidden), false, hidden);
    }
    assert.ok(seen.has('kb.document.publish'), 'останалият одит е видим');

    const platform = await signIn(
      h,
      await makeUser({ tenantId: w.tenantA.id, role: 'PLATFORM_ADMIN' }),
    );
    const all = await platform.get('/api/v1/audit');
    const actions = new Set(all.body.events.map((e: { action: string }) => e.action));
    for (const a of ['auth.login', 'auth.logout', 'auth.login_failed', 'auth.mfa_verified']) {
      assert.ok(actions.has(a), a);
    }
  });
});
