import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { SESSION_COOKIE } from '../../src/auth/sessions.js';
import { SecretBox } from '../../src/services/sso/secret.js';
import { FakeIdp, OTHER_TID } from '../sso-fake-idp.js';
import { Client, db, makeUser, PASSWORD, resetDb, totpNow } from './helpers.js';
import {
  cookieFrom,
  finishCallback,
  makeSsoConfig,
  seedSsoTenant,
  selfLink,
  signInPassword,
  SSO_KEY,
  ssoLogin,
  startSsoApp,
  type SsoHarness,
} from './sso-world.js';

/**
 * REQUIRED без заключване (сесия с парола САМО за свързване, когато човекът още не може да влезе
 * през доставчика) и находки 1(в)/3: смяна на издател/директория/клиент = нов доставчик — нов секрет
 * в същата заявка, изключен до нов тест, изтрити връзки, домейните — наново, започнатите входове —
 * обезсилени, SSO сесиите — отнети.
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
const member = (email: string, n: number) => ({ oid: oid(n), preferred_username: email });

/** Вход с парола през формата (бисквитката + CSRF от отговора). */
async function passwordLogin(email: string) {
  const res = await new Client(h.base).post('/api/v1/auth/login', { email, password: PASSWORD });
  const token = cookieFrom(res, SESSION_COOKIE);
  const client = token ? new Client(h.base, token, res.body.csrfToken as string) : null;
  return { res, client };
}

describe('REQUIRED: сесия само за свързване', () => {
  test('администратор без собствена връзка: само свързване → после само през доставчика', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'], mode: 'REQUIRED' });
    const admin = await makeUser({
      tenantId: tenant.id,
      role: 'TENANT_ADMIN',
      email: 'b@alfa.example',
    });
    const { res, client } = await passwordLogin(admin.email);
    assert.equal(res.status, 200);
    assert.equal(res.body.ssoLinkRequired, true);
    assert.ok(client);
    // Първо TOTP, после — само свързването; до данни — никога.
    assert.equal((await client.get('/api/v1/admin/users')).body.code, 'mfa_required');
    assert.equal((await client.post('/api/v1/auth/mfa/verify', { code: totpNow() })).status, 200);
    const blocked = await client.get('/api/v1/admin/users');
    assert.deepEqual([blocked.status, blocked.body.code], [403, 'sso_link_required']);
    const me = await client.get('/api/v1/auth/me');
    assert.equal(me.body.ssoLinkRequired, true);
    assert.equal((await client.get('/api/v1/auth/sso/link')).body.linkOnly, true);

    assert.equal(
      (await selfLink(h, idp, client, member(admin.email, 1))).location,
      '/?sso_link=ok',
    );
    assert.equal((await client.get('/api/v1/auth/me')).status, 401); // сесията за свързване пада
    const sso = await ssoLogin(h, idp, admin.email, member(admin.email, 1));
    assert.equal(sso.location, '/');
    const again = await passwordLogin(admin.email);
    assert.deepEqual([again.res.status, again.res.body.code], [403, 'sso_required']);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'auth.login', actorId: admin.id },
      orderBy: { id: 'asc' },
    });
    assert.deepEqual(audit.detail, { method: 'password', linkOnly: true });
  });

  test('техник: с TOTP без връзка → само свързване; с TOTP и връзка → отказ; без TOTP → отказ', async () => {
    const { tenant } = await seedSsoTenant();
    const cfg = await makeSsoConfig(idp, {
      tenantId: tenant.id,
      domains: ['alfa.example'],
      mode: 'REQUIRED',
    });
    const spec = { tenantId: tenant.id, role: 'INTERNAL_TECHNICIAN' as const, mfa: true };
    const withTotp = await makeUser({ ...spec, email: 'a@alfa.example' });
    const linked = await makeUser({ ...spec, email: 'b@alfa.example' });
    const plain = await makeUser({ ...spec, mfa: false, email: 'c@alfa.example' });
    await db.externalIdentity.create({
      data: {
        tenantId: tenant.id,
        userId: linked.id,
        configId: cfg.id,
        issuer: cfg.issuer,
        externalSubject: oid(2),
      },
    });
    assert.equal((await passwordLogin(withTotp.email)).res.body.ssoLinkRequired, true);
    assert.equal((await passwordLogin(linked.email)).res.body.code, 'sso_required');
    assert.equal((await passwordLogin(plain.email)).res.body.code, 'sso_required');
  });
});

/** Включен, тестван доставчик с две връзки (техник по имейл, администратор сам) и започнат вход. */
async function linkedWorld() {
  const { tenant } = await seedSsoTenant();
  const cfg = await makeSsoConfig(idp, {
    tenantId: tenant.id,
    domains: ['alfa.example'],
    lastTestOk: true,
  });
  const admin = await makeUser({
    tenantId: tenant.id,
    role: 'TENANT_ADMIN',
    email: 'b@alfa.example',
  });
  const tech = await makeUser({
    tenantId: tenant.id,
    role: 'INTERNAL_TECHNICIAN',
    email: 't@alfa.example',
  });
  const adminClient = await signInPassword(h, admin);
  assert.equal(
    (await selfLink(h, idp, adminClient, member(admin.email, 3))).location,
    '/?sso_link=ok',
  );
  const techSso = await ssoLogin(h, idp, tech.email, member(tech.email, 4));
  assert.ok(techSso.client);
  return { tenant, cfg, admin, adminClient, tech, techSso: techSso.client };
}

describe('Смяна на доставчика = нов доставчик', () => {
  test('без нов секрет → 400; заедно с включване → 409; само с нов секрет — всичко наново', async () => {
    const { cfg, adminClient, techSso, tech } = await linkedWorld();
    const url = `/api/v1/admin/sso/configs/${cfg.id}`;
    const before = (await adminClient.get('/api/v1/admin/sso')).body.configs[0];
    assert.equal(before.domainStatus[0].verifiedAt !== null, true);
    for (const body of [{ entraTenantId: OTHER_TID }, { clientId: 'altro-client' }]) {
      const r = await adminClient.patch(url, body);
      assert.deepEqual([r.status, r.body.code], [400, 'sso_secret_required'], JSON.stringify(body));
    }
    const withEnable = await adminClient.patch(url, {
      entraTenantId: OTHER_TID,
      clientSecret: 'nuovo-segreto',
      enabled: true,
    });
    assert.deepEqual([withEnable.status, withEnable.body.code], [409, 'sso_test_required']);

    // Започнат вход преди смяната — обезсилва се.
    const pending = await fetch(`${h.base}/api/v1/auth/sso/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: h.origin },
      body: JSON.stringify({ email: tech.email }),
    });
    const pendingUrl = new URL(((await pending.json()) as { url: string }).url);
    const binding = cookieFrom(pending, 'cc_sso');

    const changed = await adminClient.patch(url, {
      entraTenantId: OTHER_TID,
      clientSecret: 'nuovo-segreto',
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const view = changed.body.config;
    assert.equal(view.enabled, false);
    assert.equal(view.lastTestOk, null);
    assert.equal(view.linkedUsers, 0);
    assert.equal(view.issuer, idp.entraIssuer(OTHER_TID));
    assert.equal(view.domainStatus[0].verifiedAt, null);
    assert.notEqual(view.domainStatus[0].txt.value, before.domainStatus[0].txt?.value);
    assert.equal(await db.externalIdentity.count(), 0);
    assert.equal(await db.ssoLoginState.count({ where: { usedAt: null } }), 0);
    // Старият секрет не остава: записът се отваря само до новия.
    const row = await db.ssoConfig.findUniqueOrThrow({ where: { id: cfg.id } });
    assert.equal(
      new SecretBox(SSO_KEY).open(row.clientSecretEnc, row.tenantId, row.id).secret,
      'nuovo-segreto',
    );
    // SSO сесиите на доставчика — отнети; сесията с парола на администратора — не.
    assert.equal((await techSso.get('/api/v1/auth/me')).status, 401);
    assert.equal((await adminClient.get('/api/v1/auth/me')).status, 200);
    // Връщането на стария вход — отказ.
    idp.next = member(tech.email, 4);
    const back = await fetch(pendingUrl, { redirect: 'manual' });
    const to = new URL(back.headers.get('location') ?? `${h.origin}/`);
    assert.equal(
      (await finishCallback(h, `${to.pathname}${to.search}`, binding)).location,
      '/?sso_error=sso_failed',
    );
    const enable = await adminClient.patch(url, { enabled: true });
    assert.deepEqual([enable.status, enable.body.code], [409, 'sso_test_required']);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.config_updated' },
      orderBy: { id: 'desc' },
    });
    const detail = audit.detail as Record<string, unknown>;
    assert.deepEqual([detail.identitiesReset, detail.domainsReset], [2, 1]);
    assert.deepEqual(detail.changed, ['enabled', 'entraTenantId', 'issuer']);
    assert.doesNotMatch(JSON.stringify(detail), /nuovo-segreto/);
  });

  test('смяна на client ID → същото нулиране', async () => {
    const { cfg, adminClient } = await linkedWorld();
    const r = await adminClient.patch(`/api/v1/admin/sso/configs/${cfg.id}`, {
      clientId: 'altro-client',
      clientSecret: 'nuovo-segreto',
    });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.config.enabled, r.body.config.linkedUsers], [false, 0]);
    assert.equal(r.body.config.domainStatus[0].verifiedAt, null);
  });

  test('само нов секрет (ротация): връзките, домейните и включването остават, тестът — наново', async () => {
    const { cfg, adminClient, techSso } = await linkedWorld();
    const r = await adminClient.patch(`/api/v1/admin/sso/configs/${cfg.id}`, {
      clientSecret: 'ruotato',
    });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.config.enabled, r.body.config.linkedUsers], [true, 2]);
    assert.equal(r.body.config.lastTestOk, null);
    assert.notEqual(r.body.config.domainStatus[0].verifiedAt, null);
    assert.equal((await techSso.get('/api/v1/auth/me')).status, 200);
  });
});
