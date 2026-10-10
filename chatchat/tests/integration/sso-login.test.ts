import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { FakeIdp, OTHER_TID } from '../sso-fake-idp.js';
import { db, makeUser, resetDb } from './helpers.js';
import {
  cookieFrom,
  finishCallback,
  makeSsoConfig,
  seedSsoTenant,
  ssoLogin,
  startSsoApp,
  type SsoHarness,
} from './sso-world.js';

/**
 * Единният вход през ЛОКАЛЕН фалшив OIDC доставчик (discovery + JWKS + token, подписан с jose
 * ключ): успешен вход и свързване по oid, повторен state, непознат/неактивен/чужд клиент,
 * друга директория (tid), обхват (портал срещу вътрешни), конфликт на връзката. Токенът и общ OIDC —
 * sso-tokens.test.ts.
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

const OID = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';
const member = (upn: string, over: Record<string, unknown> = {}) => ({
  oid: OID,
  sub: 'pairwise-1',
  preferred_username: upn,
  name: 'Mario Rossi',
  ...over,
});

async function world() {
  const { tenant, company } = await seedSsoTenant();
  const cfg = await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'] });
  const user = await makeUser({
    tenantId: tenant.id,
    role: 'INTERNAL_TECHNICIAN',
    email: 'mario.rossi@alfa.example',
  });
  return { tenant, company, cfg, user };
}

describe('Entra ID: първи вход, свързване, после само по oid', () => {
  test('проверен UPN → сесия (authMethod sso), записан oid, одит без токени', async () => {
    const { cfg, user } = await world();
    const r = await ssoLogin(
      h,
      idp,
      'mario.rossi@alfa.example',
      member('Mario.Rossi@alfa.example'),
    );
    assert.equal(r.location, '/');
    assert.ok(r.client);
    const me = await r.client.get('/api/v1/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.id, user.id);
    assert.equal(me.body.authMethod, 'sso');
    assert.equal(idp.lastAuthorize?.get('login_hint'), 'mario.rossi@alfa.example');
    assert.equal(idp.lastAuthorize?.get('code_challenge_method'), 'S256');

    const link = await db.externalIdentity.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(link.externalSubject, OID);
    assert.equal(link.issuer, cfg.issuer);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'auth.login', actorId: user.id },
    });
    assert.deepEqual(audit.detail, {
      method: 'sso',
      provider: 'ENTRA',
      firstLink: true,
      idpMfa: false,
    });
    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    assert.equal(session.authMethod, 'SSO');
    assert.equal(session.ssoConfigId, cfg.id);
  });

  test('после: друг UPN при доставчика, същият oid → същият акаунт', async () => {
    const { user } = await world();
    await ssoLogin(h, idp, 'mario.rossi@alfa.example', member('mario.rossi@alfa.example'));
    const r = await ssoLogin(
      h,
      idp,
      'mario.rossi@alfa.example',
      member('m.rossi.new@alfa.example'),
    );
    assert.equal(r.location, '/');
    const me = await r.client?.get('/api/v1/auth/me');
    assert.equal(me?.body.user.id, user.id);
  });

  test('повторен state/код → отказ', async () => {
    await world();
    const r = await ssoLogin(
      h,
      idp,
      'mario.rossi@alfa.example',
      member('mario.rossi@alfa.example'),
    );
    assert.equal(r.location, '/');
    const again = await finishCallback(h, r.callback, r.binding);
    assert.equal(again.location, '/?sso_error=sso_failed');
    assert.equal(again.client, null);
  });

  test('чужд браузър (без/с друга бисквитка на потока) не довършва потока (login CSRF)', async () => {
    await world();
    const start = await fetch(`${h.base}/api/v1/auth/sso/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: h.origin },
      body: JSON.stringify({ email: 'mario.rossi@alfa.example' }),
    });
    const { url } = (await start.json()) as { url: string };
    const binding = cookieFrom(start, 'cc_sso');
    assert.match(binding ?? '', /^[A-Za-z0-9_-]{43}$/);
    assert.match(start.headers.getSetCookie().join(';'), /HttpOnly/i);
    idp.next = member('mario.rossi@alfa.example');
    const back = new URL((await fetch(url, { redirect: 'manual' })).headers.get('location') ?? '');
    const path = `${back.pathname}${back.search}`;
    assert.equal((await finishCallback(h, path, null)).location, '/?sso_error=sso_failed');
    assert.equal(
      (await finishCallback(h, path, 'B'.repeat(43))).location,
      '/?sso_error=sso_failed',
    );
    assert.equal(await db.session.count(), 0);
    // Браузърът, който е започнал потока, го довършва.
    assert.equal((await finishCallback(h, path, binding)).location, '/');
  });

  test('непознат потребител, неактивен, изтекъл → еднакъв отказ (sso_denied), без връзка', async () => {
    const { tenant } = await world();
    const unknown = await ssoLogin(h, idp, 'nobody@alfa.example', member('nobody@alfa.example'));
    assert.equal(unknown.location, '/?sso_error=sso_denied');
    const inactive = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'off@alfa.example',
      active: false,
    });
    const expired = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'old@alfa.example',
      expiresAt: new Date(Date.now() - 1000),
    });
    for (const [u, oid] of [
      [inactive, 'aaaaaaaa-bbbb-4ccc-8ddd-000000000002'],
      [expired, 'aaaaaaaa-bbbb-4ccc-8ddd-000000000003'],
    ] as const) {
      const r = await ssoLogin(h, idp, u.email, member(u.email, { oid }));
      assert.equal(r.location, '/?sso_error=sso_denied');
      assert.equal(r.client, null);
    }
    assert.equal(await db.externalIdentity.count(), 0);
    const failed = await db.auditEvent.findMany({ where: { action: 'auth.login_failed' } });
    assert.ok(failed.length >= 3);
    for (const e of failed) assert.doesNotMatch(JSON.stringify(e.detail), /@|eyJ/);
  });

  test('акаунт в ДРУГ клиент с позволения домейн → отказ (чужд клиент не се издава)', async () => {
    await world();
    const other = await seedSsoTenant('sso-beta');
    await makeUser({
      tenantId: other.tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'luigi@alfa.example',
    });
    const r = await ssoLogin(h, idp, 'luigi@alfa.example', member('luigi@alfa.example'));
    assert.equal(r.location, '/?sso_error=sso_denied');
  });

  test('друга директория (tid ≠ конфигурирания) → отказ', async () => {
    await world();
    const r = await ssoLogin(
      h,
      idp,
      'mario.rossi@alfa.example',
      member('mario.rossi@alfa.example', { tid: OTHER_TID }),
    );
    assert.equal(r.location, '/?sso_error=sso_denied');
    assert.equal(await db.externalIdentity.count(), 0);
  });

  test('гост от друга организация → отказ; email без xms_edov не се вярва', async () => {
    await world();
    const guest = await ssoLogin(
      h,
      idp,
      'mario.rossi@alfa.example',
      member('mario.rossi@alfa.example', { idp: 'https://sts.windows.net/other/' }),
    );
    assert.equal(guest.location, '/?sso_error=sso_denied');
    // UPN в чужд домейн + непроверен email в позволения → отказ (не се свързва по email).
    const r = await ssoLogin(
      h,
      idp,
      'mario.rossi@alfa.example',
      member('mario@other.example', { email: 'mario.rossi@alfa.example' }),
    );
    assert.equal(r.location, '/?sso_error=sso_denied');
  });

  test('портален потребител и доставчик на клиента → отказ; доставчик на фирмата му → вход', async () => {
    const { tenant, company } = await world();
    const portal = await makeUser({
      tenantId: tenant.id,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      companyId: company.id,
      email: 'tecnico@alfa.example',
    });
    const oid = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000009';
    const denied = await ssoLogin(h, idp, portal.email, member(portal.email, { oid }));
    assert.equal(denied.location, '/?sso_error=sso_denied');
    const fTid = '22222222-3333-4444-8555-666666666666';
    await makeSsoConfig(idp, {
      tenantId: tenant.id,
      companyId: company.id,
      domains: ['installatori.example'],
      entraTenantId: fTid,
    });
    const fUser = await makeUser({
      tenantId: tenant.id,
      role: 'PORTAL_TECHNICIAN',
      kind: 'PORTAL',
      companyId: company.id,
      email: 'anna@installatori.example',
    });
    const ok = await ssoLogin(h, idp, fUser.email, member(fUser.email, { oid, tid: fTid }));
    assert.equal(ok.location, '/');
    assert.equal((await ok.client?.get('/api/v1/auth/me'))?.body.user.id, fUser.id);
  });

  test('акаунт, свързан с друга идентичност → отказ (без тихо пренасочване)', async () => {
    await world();
    await ssoLogin(h, idp, 'mario.rossi@alfa.example', member('mario.rossi@alfa.example'));
    const other = await ssoLogin(
      h,
      idp,
      'mario.rossi@alfa.example',
      member('mario.rossi@alfa.example', { oid: 'aaaaaaaa-bbbb-4ccc-8ddd-0000000000ff' }),
    );
    assert.equal(other.location, '/?sso_error=sso_denied');
  });
});
