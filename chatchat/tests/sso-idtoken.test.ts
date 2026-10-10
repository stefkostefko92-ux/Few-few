import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';
import * as oidc from 'openid-client';
import { readExternalLogin } from '../src/services/sso/claims.js';
import { exchangeCode } from '../src/services/sso/flow.js';
import { ProviderCache } from '../src/services/sso/provider.js';
import { SecretBox } from '../src/services/sso/secret.js';
import type { SsoDeps } from '../src/services/sso/types.js';
import {
  ENTRA_TID,
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FakeIdp,
  OTHER_TID,
  type Tamper,
} from './sso-fake-idp.js';

/**
 * Проверката на id_token (unit, без мрежа: openid-client говори с фалшивия доставчик през
 * customFetch, по HTTPS адреси): подпис, iss, aud, nonce, exp/nbf с толеранс, state, PKCE,
 * еднократен код — и правилата на Entra върху claims (tid, гост, oid, проверен имейл, amr).
 */

const REDIRECT = 'https://chatchat.test/api/v1/auth/sso/callback';
let idp: FakeIdp;
let cache: ProviderCache;

before(async () => {
  idp = await FakeIdp.create();
  idp.base = 'https://login.idp.test';
});

beforeEach(() => {
  const sso: SsoDeps = {
    box: new SecretBox(Buffer.alloc(32, 3)),
    timeoutSeconds: 5,
    entraAuthority: idp.base,
    allowInsecureHttp: false,
    fetch: (url, options) => idp.handle(new Request(url, options as RequestInit)),
    resolveTxt: (host) => idp.resolveTxt(host),
  };
  cache = new ProviderCache(sso);
  idp.tamper = {};
  idp.jwksCalls = 0;
});

const entraUser = (over: Record<string, unknown> = {}) => ({
  oid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  sub: 'pairwise-sub-1',
  preferred_username: 'Mario.Rossi@Alfa.example',
  name: 'Mario Rossi',
  ...over,
});

async function signInAt(
  issuer: string,
  claims: Record<string, unknown>,
  tamper: Tamper = {},
  mutate: { state?: string; verifier?: string } = {},
) {
  idp.next = claims;
  idp.tamper = tamper;
  const client = await cache.get(
    { id: issuer, issuer, clientId: FAKE_CLIENT_ID, secretUpdatedAt: new Date(0) },
    FAKE_CLIENT_SECRET,
  );
  const verifier = oidc.randomPKCECodeVerifier();
  const nonce = oidc.randomNonce();
  const state = oidc.randomState();
  const url = oidc.buildAuthorizationUrl(client, {
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
  });
  const res = await idp.handle(new Request(url));
  const back = new URL(res.headers.get('location') ?? 'https://invalid.test/');
  const checks = { verifier: mutate.verifier ?? verifier, nonce, state: mutate.state ?? state };
  return { back, client, checks, run: () => exchangeCode(client, back, checks) };
}

const entraCfg = () => ({
  provider: 'ENTRA' as const,
  issuer: idp.entraIssuer(),
  entraTenantId: ENTRA_TID,
});

describe('id_token: протоколът (openid-client + подписът е включен)', () => {
  test('валиден вход → claims; подпис, iss, aud, nonce минават', async () => {
    const { run } = await signInAt(idp.entraIssuer(), entraUser({ amr: ['pwd', 'mfa'] }));
    const claims = await run();
    assert.ok(claims);
    assert.equal(claims.iss, idp.entraIssuer());
    assert.equal(claims.aud, FAKE_CLIENT_ID);
  });

  const rejects: Array<[string, Tamper]> = [
    ['грешен iss', { iss: 'https://evil.example/v2.0' }],
    ['грешен aud', { aud: 'some-other-app' }],
    ['грешен nonce', { nonce: 'not-the-nonce' }],
    ['чужд подпис (същият kid)', { foreignKey: true }],
    ['изтекъл (над толеранса)', { expired: true }],
    ['nbf в бъдещето (над толеранса)', { future: true }],
    ['без id_token', { noIdToken: true }],
  ];
  for (const [name, tamper] of rejects) {
    test(`отказ: ${name}`, async () => {
      const { run } = await signInAt(idp.entraIssuer(), entraUser(), tamper);
      await assert.rejects(run());
    });
  }

  test('отказ: чужд state (CSRF) и грешен code_verifier (PKCE)', async () => {
    const a = await signInAt(idp.entraIssuer(), entraUser(), {}, { state: 'x'.repeat(43) });
    await assert.rejects(a.run());
    const b = await signInAt(idp.entraIssuer(), entraUser(), {}, { verifier: 'y'.repeat(43) });
    await assert.rejects(b.run());
  });

  test('кодът е еднократен: повторена обмяна → отказ', async () => {
    const { run } = await signInAt(idp.entraIssuer(), entraUser());
    assert.ok(await run());
    await assert.rejects(run());
  });

  test('JWKS се кешира между входовете', async () => {
    await (await signInAt(idp.entraIssuer(), entraUser())).run();
    await (await signInAt(idp.entraIssuer(), entraUser())).run();
    assert.equal(idp.jwksCalls, 1);
  });
});

describe('claims на Entra ID', () => {
  test('oid е стабилното свързване; UPN на член е имейлът за първото свързване; amr ∋ mfa', () => {
    const r = readExternalLogin(entraCfg(), {
      iss: idp.entraIssuer(),
      tid: ENTRA_TID,
      ...entraUser({ amr: ['pwd', 'mfa'] }),
    });
    assert.ok(r.ok);
    assert.equal(r.login.subject, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    assert.equal(r.login.email, 'mario.rossi@alfa.example');
    assert.equal(r.login.idpMfa, true);
    assert.equal(r.login.amrPresent, true);
  });

  test('друга директория (tid) → tenant_mismatch, дори iss да е „правилният“', () => {
    const r = readExternalLogin(entraCfg(), {
      iss: idp.entraIssuer(),
      tid: OTHER_TID,
      ...entraUser(),
    });
    assert.deepEqual(r, { ok: false, reason: 'tenant_mismatch' });
  });

  test('гост (idp ≠ iss или acct = 1) → guest_account', () => {
    const base = { iss: idp.entraIssuer(), tid: ENTRA_TID, ...entraUser() };
    assert.deepEqual(readExternalLogin(entraCfg(), { ...base, idp: 'https://sts.other/' }), {
      ok: false,
      reason: 'guest_account',
    });
    assert.deepEqual(readExternalLogin(entraCfg(), { ...base, acct: 1 }), {
      ok: false,
      reason: 'guest_account',
    });
  });

  test('без oid → no_subject; чужд издател → issuer_mismatch', () => {
    const noOid = { iss: idp.entraIssuer(), tid: ENTRA_TID, sub: 's' };
    assert.deepEqual(readExternalLogin(entraCfg(), noOid), { ok: false, reason: 'no_subject' });
    const otherIss = { iss: 'https://evil.example/', tid: ENTRA_TID, ...entraUser() };
    assert.deepEqual(readExternalLogin(entraCfg(), otherIss), {
      ok: false,
      reason: 'issuer_mismatch',
    });
  });

  test('email без xms_edov НЕ се вярва (UPN печели); с xms_edov = true — email', () => {
    const base = { iss: idp.entraIssuer(), tid: ENTRA_TID, ...entraUser() };
    const plain = readExternalLogin(entraCfg(), { ...base, email: 'ceo@alfa.example' });
    assert.ok(plain.ok);
    assert.equal(plain.login.email, 'mario.rossi@alfa.example');
    const verified = readExternalLogin(entraCfg(), {
      ...base,
      email: 'm.rossi@alfa.example',
      xms_edov: true,
    });
    assert.ok(verified.ok);
    assert.equal(verified.login.email, 'm.rossi@alfa.example');
  });

  test('без amr → idpMfa = false (опционален claim в Entra)', () => {
    const r = readExternalLogin(entraCfg(), {
      iss: idp.entraIssuer(),
      tid: ENTRA_TID,
      ...entraUser(),
    });
    assert.ok(r.ok);
    assert.equal(r.login.idpMfa, false);
    assert.equal(r.login.amrPresent, false);
  });
});

describe('claims на общ OIDC', () => {
  const cfg = () => ({
    provider: 'OIDC' as const,
    issuer: idp.genericIssuer(),
    entraTenantId: null,
  });

  test('sub е свързването; имейл само с email_verified = true', () => {
    const base = { iss: idp.genericIssuer(), sub: 'kc-123', email: 'Ana@Beta.example' };
    const unverified = readExternalLogin(cfg(), base);
    assert.ok(unverified.ok);
    assert.equal(unverified.login.subject, 'kc-123');
    assert.equal(unverified.login.email, null);
    const verified = readExternalLogin(cfg(), { ...base, email_verified: true });
    assert.ok(verified.ok);
    assert.equal(verified.login.email, 'ana@beta.example');
  });

  test('издателят се сравнява като URL (корен със и без „/“ — същото; друг път — не)', () => {
    const root = { provider: 'OIDC' as const, issuer: 'https://idp.example', entraTenantId: null };
    assert.ok(readExternalLogin(root, { iss: 'https://idp.example/', sub: 'x' }).ok);
    const r = readExternalLogin(cfg(), { iss: `${idp.genericIssuer()}/other`, sub: 'x' });
    assert.deepEqual(r, { ok: false, reason: 'issuer_mismatch' });
  });

  test('общ вход с истинския поток (client_secret_basic, S256)', async () => {
    const { run } = await signInAt(idp.genericIssuer(), { sub: 'kc-1', email_verified: true });
    const claims = await run();
    assert.equal(claims?.sub, 'kc-1');
  });
});
