import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { FakeIdp } from '../sso-fake-idp.js';
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
 * Единният вход: проверката на токена и на връщането през целия HTTP поток — подправен id_token
 * (подпис, nonce, aud, срок), грешка от доставчика, изтекъл опит, общ OIDC (email_verified, sub).
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

const EMAIL = 'mario.rossi@alfa.example';
const member = () => ({ oid: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001', preferred_username: EMAIL });

async function world() {
  const { tenant } = await seedSsoTenant();
  await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'] });
  return makeUser({ tenantId: tenant.id, role: 'INTERNAL_TECHNICIAN', email: EMAIL });
}

/** Началото на потока без връщане: адресът към доставчика и бисквитката. */
async function begin(): Promise<{ url: URL; binding: string | null }> {
  const res = await fetch(`${h.base}/api/v1/auth/sso/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: h.origin },
    body: JSON.stringify({ email: EMAIL }),
  });
  const { url } = (await res.json()) as { url: string };
  return { url: new URL(url), binding: cookieFrom(res, 'cc_sso') };
}

describe('Токенът и връщането', () => {
  test('id_token с грешен подпис/nonce/aud/срок → sso_failed, без сесия', async () => {
    await world();
    for (const tamper of [
      { foreignKey: true },
      { nonce: 'x' },
      { aud: 'other' },
      { expired: true },
    ]) {
      idp.tamper = tamper;
      const r = await ssoLogin(h, idp, EMAIL, member());
      assert.equal(r.location, '/?sso_error=sso_failed', JSON.stringify(tamper));
      assert.equal(r.client, null);
    }
    idp.tamper = {};
    assert.equal(await db.session.count(), 0);
    assert.equal(await db.externalIdentity.count(), 0);
  });

  test('грешка от доставчика (access_denied) → sso_failed, в одита само кодът', async () => {
    await world();
    const { url, binding } = await begin();
    const state = url.searchParams.get('state') ?? '';
    const back = `/api/v1/auth/sso/callback?error=access_denied&state=${encodeURIComponent(state)}`;
    const r = await finishCallback(h, back, binding);
    assert.equal(r.location, '/?sso_error=sso_failed');
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: 'auth.login_failed' } });
    assert.deepEqual(audit.detail, { method: 'sso', reason: 'idp_error' });
  });

  test('изтекъл опит (над 10 минути) → sso_failed', async () => {
    await world();
    const { url, binding } = await begin();
    idp.next = member();
    const to = new URL((await fetch(url, { redirect: 'manual' })).headers.get('location') ?? '');
    await db.ssoLoginState.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await finishCallback(h, `${to.pathname}${to.search}`, binding);
    assert.equal(r.location, '/?sso_error=sso_failed');
    assert.equal(await db.session.count(), 0);
  });

  test('общ OIDC: имейл само с email_verified; sub е връзката', async () => {
    const { tenant } = await seedSsoTenant('sso-gen');
    await makeSsoConfig(idp, { tenantId: tenant.id, provider: 'OIDC', domains: ['gamma.example'] });
    const u = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 'ada@gamma.example',
    });
    const no = await ssoLogin(h, idp, u.email, { sub: 'kc-1', email: u.email });
    assert.equal(no.location, '/?sso_error=sso_denied');
    const yes = await ssoLogin(h, idp, u.email, {
      sub: 'kc-1',
      email: u.email,
      email_verified: true,
    });
    assert.equal(yes.location, '/');
    const link = await db.externalIdentity.findUniqueOrThrow({ where: { userId: u.id } });
    assert.equal(link.externalSubject, 'kc-1');
  });
});
