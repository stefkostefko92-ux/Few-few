import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { eraseSubject } from '../../src/services/subject.js';
import { ENTRA_TID, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FakeIdp } from '../sso-fake-idp.js';
import { Client, db, makeUser, PASSWORD, resetDb } from './helpers.js';
import {
  cookieFrom,
  finishCallback,
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
 * Конзолата за единния вход (`sso:manage`): създаване/промяна без изтичане на секрета, достъп
 * (роля, чужд клиент = 404, CSRF), домейни, издател (SSRF), проверка на метаданните, интерактивен
 * тест, включване и REQUIRED само след тест (REQUIRED — и от човек, влязъл през доставчика, +
 * отнемане на сесиите с парола), развързване, изтриване на връзката при GDPR изтриване. Доказването
 * на домейни — sso-domains.test.ts; смяната на доставчика и свързването — sso-trust.test.ts.
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
});

async function admins() {
  const a = await seedSsoTenant('sso-alfa');
  const b = await seedSsoTenant('sso-beta');
  const adminA = await makeUser({
    tenantId: a.tenant.id,
    role: 'TENANT_ADMIN',
    email: 'admin@alfa.example',
  });
  const adminB = await makeUser({
    tenantId: b.tenant.id,
    role: 'TENANT_ADMIN',
    email: 'admin@beta.example',
  });
  const support = await makeUser({
    tenantId: a.tenant.id,
    role: 'SUPPORT',
    email: 'sup@alfa.example',
  });
  return {
    a,
    b,
    adminA,
    clientA: await signInPassword(h, adminA),
    clientB: await signInPassword(h, adminB),
    support: await signInPassword(h, support),
  };
}

const entraInput = (over: Record<string, unknown> = {}) => ({
  provider: 'ENTRA',
  entraTenantId: ENTRA_TID,
  clientId: FAKE_CLIENT_ID,
  clientSecret: FAKE_CLIENT_SECRET,
  domains: ['Alfa.example'],
  ...over,
});

describe('Доставчик: създаване, достъп, секрет', () => {
  test('TENANT_ADMIN създава Entra доставчик; секретът никъде навън', async () => {
    const { clientA, a } = await admins();
    const res = await clientA.post('/api/v1/admin/sso/configs', entraInput());
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const raw = JSON.stringify(res.body);
    assert.doesNotMatch(raw, new RegExp(FAKE_CLIENT_SECRET));
    assert.equal(res.body.config.hasSecret, true);
    assert.equal(res.body.config.issuer, idp.entraIssuer());
    assert.deepEqual(res.body.config.domains, ['alfa.example']);
    // Нов доставчик е изключен; домейнът — заявен, с DNS записа за доказване.
    assert.equal(res.body.config.enabled, false);
    const [dom] = res.body.config.domainStatus;
    assert.equal(dom.verifiedAt, null);
    assert.equal(dom.txt.host, '_chatchat.alfa.example');
    assert.match(dom.txt.value, /^chatchat-verify=[A-Za-z0-9_-]{43}$/);
    // Включен при създаване (без тест) → 409.
    const early = await clientA.post(
      '/api/v1/admin/sso/configs',
      entraInput({ enabled: true, companyId: a.company.id, domains: ['x.example'] }),
    );
    assert.equal(early.status, 409);
    assert.equal(early.body.code, 'sso_test_required');
    const row = await db.ssoConfig.findFirstOrThrow({ where: { tenantId: a.tenant.id } });
    assert.doesNotMatch(row.clientSecretEnc, new RegExp(FAKE_CLIENT_SECRET));
    const list = await clientA.get('/api/v1/admin/sso');
    assert.equal(list.body.available, true);
    assert.equal(list.body.redirectUri, `${h.origin}/api/v1/auth/sso/callback`);
    assert.doesNotMatch(JSON.stringify(list.body), new RegExp(FAKE_CLIENT_SECRET));
    const audits = await db.auditEvent.findMany({ where: { action: { startsWith: 'sso.' } } });
    assert.ok(audits.length >= 1);
    assert.doesNotMatch(JSON.stringify(audits), new RegExp(FAKE_CLIENT_SECRET));
  });

  test('без право → 403; без CSRF → 403; чужд клиент → 404', async () => {
    const { clientA, clientB, support } = await admins();
    assert.equal((await support.get('/api/v1/admin/sso')).status, 403);
    assert.equal((await support.post('/api/v1/admin/sso/configs', entraInput())).status, 403);
    const noCsrf = await clientA.post('/api/v1/admin/sso/configs', entraInput(), { csrf: null });
    assert.equal(noCsrf.status, 403);
    const created = await clientA.post('/api/v1/admin/sso/configs', entraInput());
    const id = created.body.config.id as string;
    for (const r of [
      await clientB.patch(`/api/v1/admin/sso/configs/${id}`, { enabled: false }),
      await clientB.del(`/api/v1/admin/sso/configs/${id}`),
      await clientB.post(`/api/v1/admin/sso/configs/${id}/check`),
      await clientB.post(`/api/v1/admin/sso/configs/${id}/test`),
      await clientB.get(`/api/v1/admin/sso/configs/${id}/identities`),
    ]) {
      assert.equal(r.status, 404);
    }
    assert.deepEqual((await clientB.get('/api/v1/admin/sso')).body.configs, []);
  });

  test('ДОКАЗАН домейн на друг клиент → 409; невалиден издател (http, IP, вътрешно име) → 400', async () => {
    const { clientA, clientB } = await admins();
    const created = await clientA.post('/api/v1/admin/sso/configs', entraInput());
    assert.equal(created.status, 201);
    const proof = await verifyDomainViaDns(idp, clientA, created.body.config.id, 'alfa.example');
    assert.equal(proof.status, 200, JSON.stringify(proof.body));
    const taken = await clientB.post('/api/v1/admin/sso/configs', entraInput());
    assert.equal(taken.status, 409);
    assert.equal(taken.body.code, 'sso_domain_taken');
    // Тестовият сървър пуска http (фалшивият доставчик), но не и IP/вътрешни без схема.
    for (const issuer of ['ftp://idp.example', 'not a url', 'https://idp.example/?q=1']) {
      const r = await clientB.post('/api/v1/admin/sso/configs', {
        provider: 'OIDC',
        issuer,
        clientId: 'x',
        clientSecret: 'y',
        domains: ['beta.example'],
      });
      assert.equal(r.status, 400, issuer);
    }
    const scope = await clientA.post(
      '/api/v1/admin/sso/configs',
      entraInput({ domains: ['z.example'] }),
    );
    assert.equal(scope.status, 409);
    assert.equal(scope.body.code, 'sso_scope_exists');
  });
});

describe('Тест, REQUIRED, отнемане', () => {
  test('проверка на метаданните: discovery + крайни точки + JWKS', async () => {
    const { clientA } = await admins();
    const id = (await clientA.post('/api/v1/admin/sso/configs', entraInput())).body.config.id;
    const res = await clientA.post(`/api/v1/admin/sso/configs/${id}/check`);
    assert.equal(res.status, 200);
    assert.equal(res.body.check.ok, true);
    assert.equal(res.body.check.jwks, true);
    assert.equal(res.body.check.endSession, true);
  });

  test('включване и REQUIRED: без тест → 409; тестът записва флагове; REQUIRED — само от SSO сесия', async () => {
    const { clientA, adminA, a } = await admins();
    const id = (await clientA.post('/api/v1/admin/sso/configs', entraInput())).body.config
      .id as string;
    const early = await clientA.patch(`/api/v1/admin/sso/configs/${id}`, { enabled: true });
    assert.equal(early.status, 409);
    assert.equal(early.body.code, 'sso_test_required');
    const adminClaims = {
      oid: 'aaaaaaaa-bbbb-4ccc-8ddd-0000000000a1',
      preferred_username: adminA.email,
      amr: ['mfa'],
    };
    // Недоказан домейн → тестът не минава (първото свързване не би било възможно).
    assert.equal(
      await runProviderTest(h, idp, clientA, id, adminClaims),
      '/admin.html#sso?test=failed',
    );
    const failedCfg = await db.ssoConfig.findUniqueOrThrow({ where: { id } });
    assert.equal(failedCfg.lastTestOk, false);
    assert.equal((failedCfg.lastTestReport as { failure: string }).failure, 'domain_not_allowed');
    assert.equal((await verifyDomainViaDns(idp, clientA, id, 'alfa.example')).status, 200);

    // Интерактивният тест (като браузъра): POST → доставчикът → callback → обратно в конзолата.
    const t = await clientA.post(`/api/v1/admin/sso/configs/${id}/test`);
    assert.equal(t.status, 200);
    const binding = cookieFrom(t, 'cc_sso');
    idp.next = adminClaims;
    const back = new URL(
      (await fetch(t.body.url, { redirect: 'manual' })).headers.get('location') ?? '',
    );
    assert.equal(idp.lastAuthorize?.get('prompt'), 'login');
    const done = await finishCallback(h, `${back.pathname}${back.search}`, binding);
    assert.equal(done.location, '/admin.html#sso?test=ok');
    assert.equal(done.client, null); // тестът не създава сесия и не свързва
    assert.equal(await db.externalIdentity.count(), 0);
    const cfg = await db.ssoConfig.findUniqueOrThrow({ where: { id } });
    assert.equal(cfg.lastTestOk, true);
    assert.deepEqual(cfg.lastTestReport, {
      ok: true,
      failure: null,
      emailVerified: true,
      domainAllowed: true,
      amrPresent: true,
      mfa: true,
    });

    // След успешния тест — включва се.
    const on = await clientA.patch(`/api/v1/admin/sso/configs/${id}`, { enabled: true });
    assert.equal(on.status, 200, JSON.stringify(on.body));
    assert.equal(on.body.config.enabled, true);

    // Администраторът е в сесия с парола → не може да заключи себе си.
    const self = await clientA.patch(`/api/v1/admin/sso/configs/${id}`, { mode: 'REQUIRED' });
    assert.equal(self.status, 409);
    assert.equal(self.body.code, 'sso_actor_not_sso');

    // Влязъл през доставчика → REQUIRED минава и отнема сесиите с парола на вътрешните.
    const tech = await makeUser({
      tenantId: a.tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 't@alfa.example',
    });
    const techClient = await signInPassword(h, tech);
    const plain = { oid: 'aaaaaaaa-bbbb-4ccc-8ddd-0000000000a1', preferred_username: adminA.email };
    // Администраторът не се свързва по имейл — само сам, от сесия с парола + TOTP.
    const byEmail = await ssoLogin(h, idp, adminA.email, plain);
    assert.equal(byEmail.location, '/?sso_error=sso_link_required');
    assert.equal((await selfLink(h, idp, clientA, plain)).location, '/?sso_link=ok');
    const sso = await ssoLogin(h, idp, adminA.email, plain);
    assert.ok(sso.client);
    // Персоналът без TOTP в SSO сесия без MFA от доставчика → първо TOTP (тук фикстурата го има).
    await db.session.updateMany({
      where: { userId: adminA.id, authMethod: 'SSO' },
      data: { mfaPassed: true },
    });
    const ok = await sso.client.patch(`/api/v1/admin/sso/configs/${id}`, { mode: 'REQUIRED' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await techClient.get('/api/v1/auth/me')).status, 401);
    // Самият администратор не губи сесиите си (току-що е доказал входа през доставчика).
    assert.equal((await sso.client.get('/api/v1/auth/me')).status, 200);
    assert.equal((await clientA.get('/api/v1/auth/me')).status, 200);
    // Отсега паролата му е отказана.
    const pw = await new Client(h.base).post('/api/v1/auth/login', {
      email: adminA.email,
      password: PASSWORD,
    });
    assert.equal(pw.body.code, 'sso_required');

    // Нов секрет → тестът се нулира; изключване → SSO сесиите на доставчика се отнемат.
    const rotated = await sso.client.patch(`/api/v1/admin/sso/configs/${id}`, {
      clientSecret: 'new-secret',
    });
    assert.equal(rotated.body.config.lastTestOk, null);
    const off = await sso.client.patch(`/api/v1/admin/sso/configs/${id}`, { enabled: false });
    assert.equal(off.status, 200);
    assert.equal((await sso.client.get('/api/v1/auth/me')).status, 401);
  });

  test('развързване: връзката изчезва, сесиите се отнемат, одит; не на себе си', async () => {
    const { clientA, a, adminA } = await admins();
    await makeSsoConfig(idp, { tenantId: a.tenant.id, domains: ['alfa.example'] });
    const u = await makeUser({
      tenantId: a.tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'u@alfa.example',
    });
    const r = await ssoLogin(h, idp, u.email, {
      oid: 'aaaaaaaa-bbbb-4ccc-8ddd-0000000000b1',
      preferred_username: u.email,
    });
    assert.ok(r.client);
    const cfgId = (await db.ssoConfig.findFirstOrThrow({ where: { tenantId: a.tenant.id } })).id;
    const ids = await clientA.get(`/api/v1/admin/sso/configs/${cfgId}/identities`);
    assert.equal(ids.body.identities.length, 1);
    assert.equal(ids.body.identities[0].id, u.id);
    const self = await clientA.del(`/api/v1/admin/sso/identities/${adminA.id}`);
    assert.equal(self.status, 404);
    const un = await clientA.del(`/api/v1/admin/sso/identities/${u.id}`);
    assert.equal(un.status, 200);
    assert.equal(await db.externalIdentity.count(), 0);
    assert.equal((await r.client.get('/api/v1/auth/me')).status, 401);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.identity_unlinked' },
    });
    assert.equal(audit.objectId, u.id);
  });

  test('GDPR изтриване на субекта трие и връзката с доставчика', async () => {
    const { a, adminA } = await admins();
    await makeSsoConfig(idp, { tenantId: a.tenant.id, domains: ['alfa.example'] });
    const u = await makeUser({
      tenantId: a.tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'g@alfa.example',
    });
    await ssoLogin(h, idp, u.email, {
      oid: 'aaaaaaaa-bbbb-4ccc-8ddd-0000000000c1',
      preferred_username: u.email,
    });
    assert.equal(await db.externalIdentity.count(), 1);
    await eraseSubject(db, { id: adminA.id, tenantId: a.tenant.id }, u, 'richiesta art. 17');
    assert.equal(await db.externalIdentity.count(), 0);
  });

  test('без SSO_KEK конзолата казва „изключено“, промените → 503', async () => {
    const off = await startSsoApp(idp, { sso: false });
    try {
      const { adminA } = await admins();
      const c = (await signInPassword(h, adminA)).withBase(off.base);
      const view = await c.get('/api/v1/admin/sso');
      assert.equal(view.body.available, false);
      assert.equal((await c.post('/api/v1/admin/sso/configs', entraInput())).status, 503);
    } finally {
      await off.close();
    }
  });
});
