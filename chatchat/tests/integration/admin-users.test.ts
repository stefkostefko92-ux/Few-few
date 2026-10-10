import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { verifyPassword } from '../../src/auth/password.js';
import { onSessionsRevoked, type SessionRevocation } from '../../src/auth/sessions.js';
import {
  Client,
  db,
  makeUser,
  ORIGIN,
  PASSWORD,
  resetDb,
  signIn,
  startApp,
  type Harness,
  type Res,
} from './helpers.js';
import { seedWorld, type World } from './world.js';

/**
 * Директорията на потребителите (FR-22, AC-16): филтри и курсор, кръстосан клиент, създаване с
 * линк за парола, промени от администратора с причина и отнемане на сесиите. Действията (нулиране,
 * масови, филтри) — в admin-user-actions.test.ts.
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

describe('Директория: GET /admin/users', () => {
  test('само своя клиент, само полетата на директорията, без тайни', async () => {
    const res = await w.tenantAdmin.get('/api/v1/admin/users');
    assert.equal(res.status, 200);
    const ids = res.body.users.map((u: { id: string }) => u.id).sort();
    const expected = (await db.user.findMany({ where: { tenantId: w.tenantA.id } }))
      .map((u) => u.id)
      .sort();
    assert.deepEqual(ids, expected);
    const portal = res.body.users.find((u: { id: string }) => u.id === w.users.portalAlfa.id);
    assert.deepEqual(Object.keys(portal).sort(), [
      'active',
      'company',
      'email',
      'erased',
      'expiresAt',
      'id',
      'kind',
      'lastLoginAt',
      'mfaEnabled',
      'name',
      'role',
    ]);
    assert.deepEqual(portal.company, { id: w.alfa.id, name: 'Alfa Srl' });
    const dump = JSON.stringify(res.body);
    for (const secret of ['passwordHash', 'totpSecretEnc', 'tokenHash', w.users.ownerB.email]) {
      assert.equal(dump.includes(secret), false, secret);
    }
  });

  test('сървърни филтри: q (име/имейл/фирма), роля, вид, активен, mfa, изтичащи', async () => {
    const soon = await makeUser({
      tenantId: w.tenantA.id,
      role: 'INTERNAL_TECHNICIAN',
      name: 'Marco Scadenza',
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    });
    await makeUser({
      tenantId: w.tenantA.id,
      role: 'INTERNAL_TECHNICIAN',
      name: 'Luca Lontano',
      expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
    });
    const off = await makeUser({ tenantId: w.tenantA.id, role: 'SUPPORT', active: false });
    const names = async (query: string) =>
      (await w.tenantAdmin.get(`/api/v1/admin/users?${query}`)).body.users.map(
        (u: { name: string }) => u.name,
      );
    assert.deepEqual(await names('q=beta%20srl'), ['Tecnico Beta'], 'по фирма');
    assert.deepEqual(await names('q=SCADENZA'), ['Marco Scadenza'], 'по име, без регистър');
    assert.deepEqual(await names('role=KNOWLEDGE_OWNER'), ['Owner Due', 'Owner Uno']);
    assert.deepEqual(await names('kind=PORTAL'), ['Tecnico Alfa', 'Tecnico Beta']);
    assert.deepEqual(await names('active=false'), [off.name]);
    assert.deepEqual(await names('expiringWithinDays=7'), [soon.name]);
    const mfaOff = await names('mfa=off');
    assert.ok(mfaOff.includes('Interno') && !mfaOff.includes('Supporto'));
    const byEmail = await w.tenantAdmin.get(
      `/api/v1/admin/users?q=${encodeURIComponent(w.users.support.email)}`,
    );
    assert.deepEqual(
      byEmail.body.users.map((u: { id: string }) => u.id),
      [w.users.support.id],
    );
  });

  test('непознат параметър или стойност → 400 (филтър само по позволени полета)', async () => {
    for (const q of ['email=x', 'passwordHash=a', 'role=ROOT', 'mfa=maybe', 'limit=5000']) {
      const r = await w.tenantAdmin.get(`/api/v1/admin/users?${q}`);
      assert.equal(r.status, 400, q);
    }
  });

  test('курсорна пагинация: всички без повторения; чужд курсор → 400', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: Res<{ users: Array<{ id: string }>; next: string | null }> = await w.tenantAdmin.get(
        `/api/v1/admin/users?limit=3${cursor ? `&cursor=${cursor}` : ''}`,
      );
      assert.equal(r.status, 200);
      assert.ok(r.body.users.length <= 3);
      seen.push(...r.body.users.map((u) => u.id));
      cursor = r.body.next;
      pages += 1;
    } while (cursor && pages < 10);
    assert.equal(seen.length, await db.user.count({ where: { tenantId: w.tenantA.id } }));
    assert.equal(new Set(seen).size, seen.length);
    const foreign = await w.tenantAdmin.get(`/api/v1/admin/users?cursor=${w.users.ownerB.id}`);
    assert.equal(foreign.status, 400);
    assert.equal(foreign.body.code, 'invalid_cursor');
  });

  test('само users:manage: поддръжка, знание, техници → 403', async () => {
    for (const c of [w.support, w.ownerA1, w.internal, w.portalAlfa]) {
      const r = await c.get('/api/v1/admin/users');
      assert.equal(r.status, 403);
      assert.equal(r.body.code, 'forbidden');
    }
  });
});

describe('Създаване на акаунт с линк за паролата', () => {
  test('201 + еднократен линк; в базата само HMAC; паролата се задава по линка', async () => {
    const res = await w.tenantAdmin.post('/api/v1/admin/users', {
      email: ' Nuova.Persona@Example.test ',
      name: 'Nuova Persona',
      role: 'INTERNAL_TECHNICIAN',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.user.email, 'nuova.persona@example.test');
    assert.equal(res.body.user.kind, 'INTERNAL');
    assert.match(res.body.setPasswordUrl, new RegExp(`^${ORIGIN}/reset#[A-Za-z0-9_-]{43}$`));
    const token = linkToken(res.body.setPasswordUrl);
    const row = await db.passwordReset.findFirstOrThrow({ where: { userId: res.body.user.id } });
    assert.notEqual(row.tokenHash, token);
    assert.equal(row.createdById, w.users.tenantAdmin.id);
    const user = await db.user.findUniqueOrThrow({ where: { id: res.body.user.id } });
    assert.equal(await verifyPassword(PASSWORD, user.passwordHash), false);

    const anon = new Client(h.base);
    const set = await anon.post('/api/v1/auth/reset-password', {
      token,
      newPassword: 'una password lunga e nuova',
    });
    assert.equal(set.status, 204);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(await verifyPassword('una password lunga e nuova', after.passwordHash), true);
    assert.ok(after.passwordChangedAt);
    const audit = JSON.stringify(await db.auditEvent.findMany());
    assert.equal(audit.includes(token), false, 'токенът не е в одита');
    assert.ok(audit.includes('user.create') && audit.includes('user.password_reset'));
  });

  test('проверки: по-висока роля, портал без фирма, чужда фирма, зает имейл', async () => {
    const otherCompany = await db.company.create({
      data: { tenantId: w.tenantB.id, name: 'Straniera' },
    });
    const cases: Array<[object, number, string]> = [
      [{ role: 'PLATFORM_ADMIN' }, 403, 'role_not_allowed'],
      [{ role: 'PORTAL_TECHNICIAN' }, 422, 'company_required'],
      [{ role: 'PORTAL_TECHNICIAN', companyId: otherCompany.id }, 422, 'unknown_company'],
      [{ role: 'SUPPORT', email: w.users.ownerB.email }, 409, 'email_taken'],
      [{ role: 'SUPPORT', extra: 1 }, 400, 'invalid_input'],
    ];
    for (const [over, status, code] of cases) {
      const r = await w.tenantAdmin.post('/api/v1/admin/users', {
        email: 'x@example.test',
        name: 'Persona X',
        role: 'SUPPORT',
        ...over,
      });
      assert.deepEqual([r.status, r.body.code], [status, code], JSON.stringify(over));
    }
    const portal = await w.tenantAdmin.post('/api/v1/admin/users', {
      email: 'p@example.test',
      name: 'Portale',
      role: 'PORTAL_TECHNICIAN',
      companyId: w.alfa.id,
    });
    assert.equal(portal.status, 201);
    assert.equal(portal.body.user.kind, 'PORTAL');
  });
});

describe('PATCH /users/:id/admin — промени с причина (AC-16)', () => {
  test('деактивиране → всички сесии са мъртви веднага; одит с причината; кука', async () => {
    const second = await signIn(h, w.users.support);
    const r = await w.tenantAdmin.patch(`/api/v1/users/${w.users.support.id}/admin`, {
      active: false,
      reason: REASON,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.active, false);
    assert.equal(r.body.revokedSessions, 2);
    for (const c of [w.support, second]) {
      assert.equal((await c.get('/api/v1/auth/me')).status, 401);
    }
    assert.equal(
      await db.session.count({ where: { userId: w.users.support.id, revokedAt: null } }),
      0,
    );
    assert.ok(
      (await db.user.findUniqueOrThrow({ where: { id: w.users.support.id } })).deactivatedAt,
    );
    assert.deepEqual(events.at(-1), {
      userIds: [w.users.support.id],
      reason: 'deactivated',
      count: 2,
    });
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'user.admin_update' } });
    assert.equal(audit.actorId, w.users.tenantAdmin.id);
    assert.equal((audit.detail as { reason: string }).reason, REASON);
  });

  test('смяна на роля, фирма и изтекъл срок отнемат сесиите; бъдещ срок — не', async () => {
    const patch = (id: string, body: object) =>
      w.tenantAdmin.patch(`/api/v1/users/${id}/admin`, { ...body, reason: REASON });
    assert.equal((await patch(w.users.internal.id, { role: 'SUPPORT' })).body.revokedSessions, 1);
    assert.equal((await w.internal.get('/api/v1/auth/me')).status, 401);
    assert.equal(
      (await patch(w.users.portalAlfa.id, { companyId: w.beta.id })).body.revokedSessions,
      1,
    );
    assert.equal((await w.portalAlfa.get('/api/v1/cases')).status, 401);
    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    assert.equal((await patch(w.users.ownerA2.id, { expiresAt: future })).body.revokedSessions, 0);
    assert.equal((await w.ownerA2.get('/api/v1/auth/me')).status, 200);
    const past = new Date(Date.now() - 1000).toISOString();
    assert.equal((await patch(w.users.ownerA2.id, { expiresAt: past })).body.revokedSessions, 1);
    assert.equal((await w.ownerA2.get('/api/v1/auth/me')).status, 401);
    assert.deepEqual(
      events.map((e) => e.reason),
      ['role_changed', 'scope_changed', 'expired'],
    );
  });

  test('без причина → 400; себе си → 409; по-висока роля/цел → 403; чужд клиент → 404', async () => {
    const id = w.users.support.id;
    assert.equal(
      (await w.tenantAdmin.patch(`/api/v1/users/${id}/admin`, { active: false })).status,
      400,
    );
    const self = await w.tenantAdmin.patch(`/api/v1/users/${w.users.tenantAdmin.id}/admin`, {
      role: 'PLATFORM_ADMIN',
      reason: REASON,
    });
    assert.deepEqual([self.status, self.body.code], [409, 'cannot_modify_self']);
    const deactivateSelf = await w.tenantAdmin.patch(
      `/api/v1/users/${w.users.tenantAdmin.id}/admin`,
      { active: false, reason: REASON },
    );
    assert.equal(deactivateSelf.status, 409);
    const up = await w.tenantAdmin.patch(`/api/v1/users/${id}/admin`, {
      role: 'PLATFORM_ADMIN',
      reason: REASON,
    });
    assert.deepEqual([up.status, up.body.code], [403, 'role_not_allowed']);
    const platform = await makeUser({ tenantId: w.tenantA.id, role: 'PLATFORM_ADMIN' });
    const higher = await w.tenantAdmin.patch(`/api/v1/users/${platform.id}/admin`, {
      active: false,
      reason: REASON,
    });
    assert.deepEqual([higher.status, higher.body.code], [403, 'forbidden']);
    const adminB = await signIn(
      h,
      await makeUser({ tenantId: w.tenantB.id, role: 'TENANT_ADMIN' }),
    );
    const cross = await adminB.patch(`/api/v1/users/${id}/admin`, {
      active: false,
      reason: REASON,
    });
    assert.equal(cross.status, 404);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).active, true);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: platform.id } })).active, true);
  });

  test('портална роля иска фирма; повторно активиране чисти deactivatedAt', async () => {
    const r = await w.tenantAdmin.patch(`/api/v1/users/${w.users.support.id}/admin`, {
      role: 'PORTAL_TECHNICIAN',
      reason: REASON,
    });
    assert.deepEqual([r.status, r.body.code], [422, 'company_required']);
    const id = w.users.support.id;
    await w.tenantAdmin.patch(`/api/v1/users/${id}/admin`, { active: false, reason: REASON });
    const back = await w.tenantAdmin.patch(`/api/v1/users/${id}/admin`, {
      active: true,
      reason: REASON,
    });
    assert.equal(back.body.user.active, true);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).deactivatedAt, null);
  });
});
