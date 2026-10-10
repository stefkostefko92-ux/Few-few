import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { revokeUserSessions } from '../../src/auth/sessions.js';
import { FakeIdp } from '../sso-fake-idp.js';
import { Client, db, makeUser, PASSWORD, resetDb, totpNow } from './helpers.js';
import {
  makeSsoConfig,
  seedSsoTenant,
  ssoLogin,
  startSsoApp,
  type SsoHarness,
} from './sso-world.js';

/**
 * Политиката около единния вход: задължително SSO отказва паролата (само на вътрешните, без
 * платформения администратор), MFA от доставчика (`amr`) по доверие на клиента, настройка на TOTP
 * без парола само в свеж SSO вход, revokeUserSessions, изход (+ при доставчика), откриване по
 * домейна без издаване на акаунти, Origin/CSRF и лимит на опитите.
 */

let idp: FakeIdp;
let h: SsoHarness;

before(async () => {
  idp = await FakeIdp.create();
  await idp.listen();
  h = await startSsoApp(idp);
});
after(async () => {
  await h.close();
  await idp.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  idp.tamper = {};
});

let oidSeq = 0;
const claimsFor = (email: string, over: Record<string, unknown> = {}) => ({
  oid: `aaaaaaaa-bbbb-4ccc-8ddd-${String((oidSeq += 1)).padStart(12, '0')}`,
  preferred_username: email,
  ...over,
});

const passwordLogin = (email: string, origin?: string) =>
  new Client(h.base).post(
    '/api/v1/auth/login',
    { email, password: PASSWORD },
    origin ? { origin } : {},
  );

describe('SSO задължително (REQUIRED)', () => {
  test('вътрешен: паролата е отказана (403 sso_required); портален и платформен — не', async () => {
    const { tenant, company } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'], mode: 'REQUIRED' });
    const internal = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'i@alfa.example',
    });
    const portal = await makeUser({
      tenantId: tenant.id,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      companyId: company.id,
      email: 'p@alfa.example',
    });
    const platform = await makeUser({
      tenantId: tenant.id,
      role: 'PLATFORM_ADMIN',
      email: 'ops@alfa.example',
    });
    const refused = await passwordLogin(internal.email);
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, 'sso_required');
    assert.equal(await db.session.count({ where: { userId: internal.id } }), 0);
    // Грешна парола → същото като преди (не се издава, че акаунтът е със SSO).
    const wrong = await new Client(h.base).post('/api/v1/auth/login', {
      email: internal.email,
      password: 'wrong password!!',
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.code, 'invalid_credentials');
    assert.equal((await passwordLogin(portal.email)).status, 200);
    assert.equal((await passwordLogin(platform.email)).status, 200);
    // През доставчика вътрешният влиза.
    const r = await ssoLogin(h, idp, internal.email, claimsFor(internal.email));
    assert.equal(r.location, '/');
  });

  test('изключен доставчик в REQUIRED не отказва паролата', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, {
      tenantId: tenant.id,
      domains: ['alfa.example'],
      mode: 'REQUIRED',
      enabled: false,
    });
    const u = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'i@alfa.example',
    });
    assert.equal((await passwordLogin(u.email)).status, 200);
  });
});

describe('MFA от доставчика (amr) по политика на клиента', () => {
  test('доверие + amr ∋ mfa → персоналът без TOTP стига до данните (mfa.idp)', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'], trustIdpMfa: true });
    const staff = await makeUser({
      tenantId: tenant.id,
      role: 'SUPPORT',
      email: 's@alfa.example',
      mfa: false,
    });
    const r = await ssoLogin(h, idp, staff.email, claimsFor(staff.email, { amr: ['pwd', 'mfa'] }));
    assert.ok(r.client);
    const me = await r.client.get('/api/v1/auth/me');
    assert.deepEqual(me.body.mfa, { enabled: false, passed: true, required: true, idp: true });
    assert.equal((await r.client.get('/api/v1/cases')).status, 200);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'auth.login', actorId: staff.id },
    });
    assert.equal((audit.detail as { idpMfa: boolean }).idpMfa, true);
  });

  test('без mfa в amr → локалният TOTP: настройка без парола само в свеж SSO вход', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'], trustIdpMfa: true });
    const staff = await makeUser({
      tenantId: tenant.id,
      role: 'SUPPORT',
      email: 's@alfa.example',
      mfa: false,
    });
    const r = await ssoLogin(h, idp, staff.email, claimsFor(staff.email, { amr: ['pwd'] }));
    assert.ok(r.client);
    const blocked = await r.client.get('/api/v1/cases');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'mfa_setup_required');
    const setup = await r.client.post('/api/v1/auth/mfa/setup', {});
    assert.equal(setup.status, 200);
    assert.ok(setup.body.secret);
    // Стара SSO сесия (над 10 мин.) → нов вход; сесия с парола без парола → отказ, както досега.
    await db.user.update({ where: { id: staff.id }, data: { totpSecretEnc: null } });
    await db.session.updateMany({
      where: { userId: staff.id },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const stale = await r.client.post('/api/v1/auth/mfa/setup', {});
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'sso_reauth_required');
  });

  test('без доверие (trustIdpMfa = false) amr ∋ mfa не стига: включен TOTP → 401 mfa_required', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'] });
    const staff = await makeUser({ tenantId: tenant.id, role: 'SUPPORT', email: 's@alfa.example' });
    const r = await ssoLogin(h, idp, staff.email, claimsFor(staff.email, { amr: ['mfa'] }));
    assert.ok(r.client);
    const res = await r.client.get('/api/v1/cases');
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'mfa_required');
    const ok = await r.client.post('/api/v1/auth/mfa/verify', { code: totpNow() });
    assert.equal(ok.status, 200);
    assert.equal((await r.client.get('/api/v1/cases')).status, 200);
  });
});

describe('Сесия, изход, откриване', () => {
  test('revokeUserSessions важи и за SSO сесия', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'] });
    const u = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'i@alfa.example',
    });
    const r = await ssoLogin(h, idp, u.email, claimsFor(u.email));
    assert.ok(r.client);
    await revokeUserSessions(db, [u.id], 'deactivated');
    assert.equal((await r.client.get('/api/v1/auth/me')).status, 401);
  });

  test('изход: локален + адрес за изход при доставчика (с idpLogout); CSRF се иска', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'], idpLogout: true });
    const u = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'i@alfa.example',
    });
    const r = await ssoLogin(h, idp, u.email, claimsFor(u.email));
    assert.ok(r.client);
    const noCsrf = await r.client.post('/api/v1/auth/sso/logout', {}, { csrf: null });
    assert.equal(noCsrf.status, 403);
    const out = await r.client.post('/api/v1/auth/sso/logout');
    assert.equal(out.status, 200);
    const end = new URL(out.body.endSessionUrl as string);
    assert.equal(end.pathname.endsWith('/logout'), true);
    assert.equal(end.searchParams.get('post_logout_redirect_uri'), `${h.origin}/`);
    assert.ok(end.searchParams.get('client_id'));
    assert.equal((await r.client.get('/api/v1/auth/me')).status, 401);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'auth.logout', actorId: u.id },
    });
    assert.deepEqual(audit.detail, { method: 'sso' });
  });

  test('откриване: само по домейна, без разлика за съществуващ акаунт; чужд Origin → 403', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'] });
    await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'real@alfa.example',
    });
    const c = new Client(h.base);
    const known = await c.post('/api/v1/auth/sso/discover', { email: 'real@alfa.example' });
    const ghost = await c.post('/api/v1/auth/sso/discover', { email: 'ghost@alfa.example' });
    assert.deepEqual(known.body, { sso: { provider: 'ENTRA', label: null } });
    assert.deepEqual(ghost.body, known.body);
    assert.deepEqual(
      (await c.post('/api/v1/auth/sso/discover', { email: 'x@nope.example' })).body,
      {
        sso: null,
      },
    );
    const foreign = await c.post(
      '/api/v1/auth/sso/discover',
      { email: 'real@alfa.example' },
      { origin: 'https://evil.example' },
    );
    assert.equal(foreign.status, 403);
    const start = await c.post(
      '/api/v1/auth/sso/start',
      { email: 'real@alfa.example' },
      { origin: 'https://evil.example' },
    );
    assert.equal(start.status, 403);
    const none = await c.post('/api/v1/auth/sso/start', { email: 'x@nope.example' });
    assert.equal(none.status, 404);
    assert.equal(none.body.code, 'sso_not_configured');
  });

  test('без SSO_KEK: откриването е празно, началото — 503', async () => {
    const off = await startSsoApp(idp, { sso: false });
    try {
      const { tenant } = await seedSsoTenant();
      await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'] });
      const c = new Client(off.base);
      assert.deepEqual(
        (await c.post('/api/v1/auth/sso/discover', { email: 'a@alfa.example' })).body,
        {
          sso: null,
        },
      );
      assert.equal(
        (await c.post('/api/v1/auth/sso/start', { email: 'a@alfa.example' })).status,
        503,
      );
    } finally {
      await off.close();
    }
  });

  test('лимит на опитите по IP (/auth/sso/discover → 429)', async () => {
    const own = await startSsoApp(idp);
    try {
      const c = new Client(own.base);
      let last = 0;
      for (let i = 0; i < 301; i += 1) {
        last = (await c.post('/api/v1/auth/sso/discover', { email: `x${i}@nope.example` })).status;
      }
      assert.equal(last, 429);
    } finally {
      await own.close();
    }
  });
});
