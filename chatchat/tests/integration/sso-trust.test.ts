import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createSession } from '../../src/auth/sessions.js';
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FakeIdp, OTHER_TID } from '../sso-fake-idp.js';
import { Client, db, makeUser, resetDb } from './helpers.js';
import {
  makeSsoConfig,
  runProviderTest,
  seedSsoTenant,
  selfLink,
  signInPassword,
  ssoLogin,
  startSsoApp,
  verifyDomainViaDns,
  type SsoHarness,
} from './sso-world.js';

/**
 * Находка 1 от ревюто (ескалация към PLATFORM_ADMIN / превземане на колега без TOTP): платформеният
 * администратор никога през доставчик; администраторът на клиента и хората с локален TOTP — само
 * собствена връзка („Свържи“ от сесия с парола + TOTP); MFA от доставчика не прескача TOTP през
 * връзка по имейл. REQUIRED и смяната на доставчика — sso-provider-change.test.ts.
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
  idp.txt.clear();
});

const oid = (n: number) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(n).padStart(12, '0')}`;
const member = (email: string, n: number, over: Record<string, unknown> = {}) => ({
  oid: oid(n),
  preferred_username: email,
  ...over,
});

async function world(opts: { trustIdpMfa?: boolean } = {}) {
  const { tenant, company } = await seedSsoTenant();
  const cfg = await makeSsoConfig(idp, {
    tenantId: tenant.id,
    domains: ['alfa.example'],
    trustIdpMfa: opts.trustIdpMfa ?? true,
  });
  const admin = await makeUser({
    tenantId: tenant.id,
    role: 'TENANT_ADMIN',
    email: 'boss@alfa.example',
  });
  return { tenant, company, cfg, admin };
}

describe('Атаката от ревюто: доставчик под контрола на администратора на клиента', () => {
  test('издател на нападателя + доверие в MFA + домейна на оператора → нито PLATFORM_ADMIN, нито колега', async () => {
    const { tenant } = await seedSsoTenant();
    const attacker = await makeUser({
      tenantId: tenant.id,
      role: 'TENANT_ADMIN',
      email: 'evil@ops.example',
    });
    const ops = await makeUser({
      tenantId: tenant.id,
      role: 'PLATFORM_ADMIN',
      email: 'ops@ops.example',
    });
    const colleague = await makeUser({
      tenantId: tenant.id,
      role: 'TENANT_ADMIN',
      email: 'boss@ops.example',
    });
    const evil = await signInPassword(h, attacker);
    const created = await evil.post('/api/v1/admin/sso/configs', {
      provider: 'OIDC',
      issuer: idp.genericIssuer(),
      clientId: FAKE_CLIENT_ID,
      clientSecret: FAKE_CLIENT_SECRET,
      domains: ['ops.example'],
      trustIdpMfa: true,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.config.id as string;
    // Най-лошият случай: нападателят дори доказва домейна (контролира DNS).
    assert.equal((await verifyDomainViaDns(idp, evil, id, 'ops.example')).status, 200);
    const forged = (email: string, sub: string) => ({
      sub,
      email,
      email_verified: true,
      amr: ['pwd', 'mfa'],
    });
    assert.equal(
      await runProviderTest(h, idp, evil, id, forged('x@ops.example', 'evil-test')),
      '/admin.html#sso?test=ok',
    );
    assert.equal(
      (await evil.patch(`/api/v1/admin/sso/configs/${id}`, { enabled: true })).status,
      200,
    );

    const asOps = await ssoLogin(h, idp, ops.email, forged(ops.email, 'evil-1'));
    assert.equal(asOps.location, '/?sso_error=sso_denied');
    assert.equal(asOps.client, null);
    const asColleague = await ssoLogin(h, idp, colleague.email, forged(colleague.email, 'evil-2'));
    assert.equal(asColleague.location, '/?sso_error=sso_link_required');
    assert.equal(asColleague.client, null);
    assert.equal(await db.externalIdentity.count(), 0);
    assert.equal(await db.session.count({ where: { userId: { in: [ops.id, colleague.id] } } }), 0);
    const reasons = (await db.auditEvent.findMany({ where: { action: 'auth.login_failed' } })).map(
      (e) => (e.detail as { reason: string }).reason,
    );
    assert.deepEqual(reasons.sort(), ['owner_link_required', 'platform_admin']);
  });
});

describe('Платформеният администратор — никога през доставчик', () => {
  test('вече свързана идентичност (дори собствена) → отказ, връзката се изтрива', async () => {
    const { tenant, cfg } = await world();
    const ops = await makeUser({
      tenantId: tenant.id,
      role: 'PLATFORM_ADMIN',
      email: 'ops@alfa.example',
    });
    await db.externalIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: ops.id,
        configId: cfg.id,
        issuer: cfg.issuer,
        externalSubject: oid(1),
        linkMethod: 'SELF',
      },
    });
    const r = await ssoLogin(h, idp, ops.email, member(ops.email, 1, { amr: ['mfa'] }));
    assert.equal(r.location, '/?sso_error=sso_denied');
    assert.equal(r.client, null);
    assert.equal(await db.externalIdentity.count(), 0);
    const dropped = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.identity_unlinked' },
    });
    assert.deepEqual(dropped.detail, { configId: cfg.id, reason: 'platform_admin' });
  });

  test('SSO сесия на платформен администратор не важи; не се свързва сам', async () => {
    const { tenant, cfg } = await world();
    const ops = await makeUser({
      tenantId: tenant.id,
      role: 'PLATFORM_ADMIN',
      email: 'ops@alfa.example',
    });
    const s = await createSession(h.sessions, ops.id, {
      authMethod: 'SSO',
      ssoConfigId: cfg.id,
      mfaViaIdp: true,
    });
    assert.equal(
      (await new Client(h.base, s.token, s.csrfToken).get('/api/v1/auth/me')).status,
      401,
    );
    const link = await selfLink(h, idp, await signInPassword(h, ops), member(ops.email, 2));
    assert.equal(link.start, 403);
    assert.equal(link.code, 'sso_platform_admin');
  });
});

describe('Администраторът на клиента: само собствена връзка', () => {
  test('по имейл → sso_link_required; „Свържи“ от собствената сесия → SELF; после вход с MFA от доставчика', async () => {
    const { admin, cfg } = await world();
    const claims = member(admin.email, 3, { amr: ['pwd', 'mfa'] });
    assert.equal(
      (await ssoLogin(h, idp, admin.email, claims)).location,
      '/?sso_error=sso_link_required',
    );
    assert.equal(await db.externalIdentity.count(), 0);

    const own = await signInPassword(h, admin);
    const status = await own.get('/api/v1/auth/sso/link');
    assert.equal(status.body.available, true);
    assert.equal(status.body.linked, false);
    assert.equal(status.body.ownerLinkRequired, true);
    assert.equal((await selfLink(h, idp, own, claims)).location, '/?sso_link=ok');
    assert.equal(idp.lastAuthorize?.get('prompt'), 'login');
    assert.equal(idp.lastAuthorize?.get('login_hint'), admin.email);
    const link = await db.externalIdentity.findUniqueOrThrow({ where: { userId: admin.id } });
    assert.equal(link.linkMethod, 'SELF');
    assert.equal(link.configId, cfg.id);
    assert.equal((await own.get('/api/v1/auth/me')).status, 200); // първа връзка — сесията остава
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.identity_linked' },
    });
    assert.deepEqual(audit.detail, { configId: cfg.id, method: 'self', replaced: false });

    const r = await ssoLogin(h, idp, admin.email, claims);
    assert.equal(r.location, '/');
    const me = await r.client?.get('/api/v1/auth/me');
    assert.equal(me?.body.mfa.idp, true);
    assert.equal((await r.client?.get('/api/v1/admin/sso'))?.status, 200);
  });

  test('стара връзка по имейл (отпреди поправката) → изтрива се, отказ', async () => {
    const { tenant, admin, cfg } = await world();
    await db.externalIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: admin.id,
        configId: cfg.id,
        issuer: cfg.issuer,
        externalSubject: oid(4),
      },
    });
    const r = await ssoLogin(h, idp, admin.email, member(admin.email, 4, { amr: ['mfa'] }));
    assert.equal(r.location, '/?sso_error=sso_link_required');
    assert.equal(await db.externalIdentity.count(), 0);
    const dropped = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.identity_unlinked' },
    });
    assert.equal(dropped.actorId, null);
    assert.deepEqual(dropped.detail, { configId: cfg.id, reason: 'owner_link_required' });
  });
});

describe('Хората с локален TOTP и техниците', () => {
  test('персонал с TOTP: по имейл → отказ; техник без TOTP → по имейл (в одита за администратора)', async () => {
    const { tenant, cfg } = await world();
    const staff = await makeUser({ tenantId: tenant.id, role: 'SUPPORT', email: 's@alfa.example' });
    const tech = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 't@alfa.example',
    });
    const denied = await ssoLogin(h, idp, staff.email, member(staff.email, 5, { amr: ['mfa'] }));
    assert.equal(denied.location, '/?sso_error=sso_link_required');
    const ok = await ssoLogin(h, idp, tech.email, member(tech.email, 6));
    assert.equal(ok.location, '/');
    const link = await db.externalIdentity.findUniqueOrThrow({ where: { userId: tech.id } });
    assert.equal(link.linkMethod, 'EMAIL');
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.identity_linked' },
    });
    assert.deepEqual(audit.detail, { configId: cfg.id, method: 'email' });
    assert.equal(audit.objectId, tech.id);
  });

  test('по-стара връзка по имейл + включен TOTP → входът минава, но TOTP се иска (не се прескача)', async () => {
    const { tenant, cfg } = await world({ trustIdpMfa: true });
    const staff = await makeUser({ tenantId: tenant.id, role: 'SUPPORT', email: 's@alfa.example' });
    await db.externalIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: staff.id,
        configId: cfg.id,
        issuer: cfg.issuer,
        externalSubject: oid(7),
      },
    });
    const r = await ssoLogin(h, idp, staff.email, member(staff.email, 7, { amr: ['pwd', 'mfa'] }));
    assert.equal(r.location, '/');
    assert.ok(r.client);
    assert.equal((await r.client.get('/api/v1/auth/me')).body.mfa.idp, undefined);
    const blocked = await r.client.get('/api/v1/cases');
    assert.equal(blocked.status, 401);
    assert.equal(blocked.body.code, 'mfa_required');
  });
});

describe('„Свържи“ — защитите', () => {
  test('началото: без минат TOTP, стара сесия, SSO сесия, без TOTP, без CSRF, без доставчик', async () => {
    const { tenant, company, admin, cfg } = await world();
    const fresh = await createSession(h.sessions, admin.id); // TOTP още не е минат
    const noMfa = new Client(h.base, fresh.token, fresh.csrfToken);
    const r1 = await noMfa.post('/api/v1/auth/sso/link/start');
    assert.deepEqual([r1.status, r1.body.code], [401, 'mfa_required']);

    const own = await signInPassword(h, admin);
    assert.equal((await own.post('/api/v1/auth/sso/link/start', {}, { csrf: null })).status, 403);
    await db.session.updateMany({
      where: { userId: admin.id },
      data: { createdAt: new Date(Date.now() - 11 * 60 * 1000) },
    });
    const stale = await own.post('/api/v1/auth/sso/link/start');
    assert.deepEqual([stale.status, stale.body.code], [409, 'sso_link_reauth']);

    const tech = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 't@alfa.example',
    });
    const noTotp = await (await signInPassword(h, tech)).post('/api/v1/auth/sso/link/start');
    assert.deepEqual([noTotp.status, noTotp.body.code], [409, 'sso_link_mfa_required']);

    const sso = await createSession(h.sessions, admin.id, {
      authMethod: 'SSO',
      ssoConfigId: cfg.id,
      mfaViaIdp: true,
    });
    const viaSso = await new Client(h.base, sso.token, sso.csrfToken).post(
      '/api/v1/auth/sso/link/start',
    );
    assert.deepEqual([viaSso.status, viaSso.body.code], [409, 'sso_link_password_required']);

    const portal = await makeUser({
      tenantId: tenant.id,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      companyId: company.id,
      email: 'p@alfa.example',
      mfa: true,
    });
    const none = await (await signInPassword(h, portal)).post('/api/v1/auth/sso/link/start');
    assert.deepEqual([none.status, none.body.code], [404, 'sso_not_configured']);
    assert.equal((await new Client(h.base).post('/api/v1/auth/sso/link/start')).status, 401);
    assert.equal(await db.ssoLoginState.count({ where: { purpose: 'link' } }), 0);
  });

  test('връщането: друг имейл, друга директория, чужда идентичност, излязла сесия, чужд браузър → без връзка', async () => {
    const { tenant, admin } = await world();
    const tech = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 't@alfa.example',
    });
    await ssoLogin(h, idp, tech.email, member(tech.email, 8)); // oid 8 → техника
    const own = await signInPassword(h, admin);
    const cases: Array<[Record<string, unknown>, string]> = [
      [member('other@alfa.example', 9), 'email_mismatch'],
      [member(admin.email, 9, { tid: OTHER_TID }), 'claims'],
      [member(admin.email, 8), 'link_conflict'],
    ];
    for (const [claims, reason] of cases) {
      assert.equal((await selfLink(h, idp, own, claims)).location, '/?sso_link=denied', reason);
    }
    const foreign = await selfLink(h, idp, own, member(admin.email, 9), { binding: null });
    // Без бисквитката на потока записът не се намира — общият отказ на връщането.
    assert.equal(foreign.location, '/?sso_error=sso_failed');
    const loggedOut = await selfLink(h, idp, own, member(admin.email, 9), {
      beforeCallback: async () => {
        assert.equal((await own.post('/api/v1/auth/logout')).status, 204);
      },
    });
    assert.equal(loggedOut.location, '/?sso_link=denied');
    assert.equal(await db.externalIdentity.count({ where: { userId: admin.id } }), 0);
    const reasons = (await db.auditEvent.findMany({ where: { action: 'sso.link_failed' } })).map(
      (e) => (e.detail as { reason: string }).reason,
    );
    assert.deepEqual(reasons, ['email_mismatch', 'claims', 'link_conflict', 'session']);
  });

  test('недоказан домейн → свързването не минава', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'], verified: false });
    const admin = await makeUser({
      tenantId: tenant.id,
      role: 'TENANT_ADMIN',
      email: 'b@alfa.example',
    });
    const r = await selfLink(h, idp, await signInPassword(h, admin), member(admin.email, 10));
    assert.equal(r.location, '/?sso_link=denied');
    assert.equal(await db.externalIdentity.count(), 0);
  });

  test('собственикът заменя връзка по имейл с друга идентичност → всичките му сесии падат', async () => {
    const { tenant, cfg } = await world();
    const staff = await makeUser({ tenantId: tenant.id, role: 'SUPPORT', email: 's@alfa.example' });
    await db.externalIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: staff.id,
        configId: cfg.id,
        issuer: cfg.issuer,
        externalSubject: oid(11),
      },
    });
    const old = await ssoLogin(h, idp, staff.email, member(staff.email, 11));
    assert.ok(old.client);
    const own = await signInPassword(h, staff);
    assert.equal((await selfLink(h, idp, own, member(staff.email, 12))).location, '/?sso_link=ok');
    const link = await db.externalIdentity.findUniqueOrThrow({ where: { userId: staff.id } });
    assert.deepEqual([link.externalSubject, link.linkMethod], [oid(12), 'SELF']);
    assert.equal((await old.client.get('/api/v1/auth/me')).status, 401);
    assert.equal((await own.get('/api/v1/auth/me')).status, 401);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.identity_linked' },
    });
    assert.equal((audit.detail as { replaced: boolean }).replaced, true);
  });
});
