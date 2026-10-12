import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadSsoConfig } from '../src/config-sso.js';
import { normalizeDomains, validIssuer } from '../src/services/sso/admin-input.js';
import { covers, emailDomain, normalizeDomain } from '../src/services/sso/policy.js';
import { SecretBox } from '../src/services/sso/secret.js';
import { entraIssuer } from '../src/services/sso/types.js';

/**
 * Правилата на единния вход без мрежа и без база: шифроването на client secret (AAD, ротация),
 * средата (SSO_KEK), адресът на издателя (само публичен HTTPS — SSRF), домейните, покритието.
 */

const K1 = Buffer.alloc(32, 1);
const K2 = Buffer.alloc(32, 2);
const b64 = (b: Buffer) => b.toString('base64');

describe('client secret в покой (SSO_KEK)', () => {
  test('отваря се само за същия клиент и запис (AAD)', () => {
    const box = new SecretBox(K1);
    const sealed = box.seal('s3cr3t', 'tenantA', 'cfg1');
    assert.doesNotMatch(sealed, /s3cr3t/);
    assert.deepEqual(box.open(sealed, 'tenantA', 'cfg1'), { secret: 's3cr3t', stale: false });
    assert.throws(() => box.open(sealed, 'tenantB', 'cfg1'));
    assert.throws(() => box.open(sealed, 'tenantA', 'cfg2'));
  });

  test('ротация: старият ключ чете (stale), непознат ключ → грешка', () => {
    const sealed = new SecretBox(K1).seal('x', 't', 'c');
    assert.deepEqual(new SecretBox(K2, [K1]).open(sealed, 't', 'c'), { secret: 'x', stale: true });
    assert.throws(() => new SecretBox(K2).open(sealed, 't', 'c'), /sso_secret_unknown_key/);
  });

  test('подправен шифротекст → грешка', () => {
    const sealed = new SecretBox(K1).seal('x', 't', 'c');
    const [v, id, body] = sealed.split('.');
    const raw = Buffer.from(body ?? '', 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    assert.throws(() => new SecretBox(K1).open(`${v}.${id}.${raw.toString('base64')}`, 't', 'c'));
  });
});

describe('средата: SSO_KEK', () => {
  test('празно → единният вход е изключен', () => {
    assert.equal(loadSsoConfig({}).keys, null);
    assert.equal(loadSsoConfig({ SSO_KEK: '' }).keys, null);
  });
  test('валиден ключ + предишни', () => {
    const c = loadSsoConfig({ SSO_KEK: b64(K1), SSO_KEK_PREVIOUS: `${b64(K2)}` });
    assert.ok(c.keys?.current.equals(K1));
    assert.equal(c.keys?.previous.length, 1);
  });
  test('невалиден или същият като MFA_ENC_KEY/FILES_KEK → процесът не тръгва', () => {
    assert.throws(() => loadSsoConfig({ SSO_KEK: 'short' }), /SSO_KEK/);
    assert.throws(() => loadSsoConfig({ SSO_KEK: b64(K1), MFA_ENC_KEY: b64(K1) }), /MFA_ENC_KEY/);
    assert.throws(() => loadSsoConfig({ SSO_KEK: b64(K1), FILES_KEK: b64(K1) }), /FILES_KEK/);
    assert.throws(() => loadSsoConfig({ SSO_KEK: b64(K1), SSO_KEK_PREVIOUS: 'bad' }));
  });
});

describe('издателят на общ OIDC (SSRF)', () => {
  test('само публичен HTTPS без потребител, заявка и фрагмент', () => {
    assert.equal(
      validIssuer('https://idp.example.com/realms/x', false),
      'https://idp.example.com/realms/x',
    );
    for (const bad of [
      'http://idp.example.com',
      'https://127.0.0.1',
      'https://[::1]/',
      'https://169.254.169.254/latest',
      'https://localhost/realms/x',
      'https://keycloak/realms/x',
      'https://idp.internal/',
      'https://idp.example.com:8443/',
      'https://user:pw@idp.example.com/',
      'https://idp.example.com/?a=1',
      'https://idp.example.com/#x',
      'ftp://idp.example.com',
      'not a url',
    ]) {
      assert.equal(validIssuer(bad, false), null, bad);
    }
  });
  test('в тестовете (allowInsecure) — и http към локалния фалшив доставчик', () => {
    assert.equal(
      validIssuer('http://127.0.0.1:5555/generic', true),
      'http://127.0.0.1:5555/generic',
    );
  });
  test('Entra: издателят се извежда от GUID-а (малки букви)', () => {
    assert.equal(
      entraIssuer('https://login.microsoftonline.com/', 'AAAAAAAA-1111-4222-8333-444444444444'),
      'https://login.microsoftonline.com/aaaaaaaa-1111-4222-8333-444444444444/v2.0',
    );
  });
});

describe('домейни и покритие', () => {
  test('нормализация на домейни', () => {
    assert.equal(normalizeDomain('Alfa.Example.'), 'alfa.example');
    assert.equal(normalizeDomain('xn--bcher-kva.example'), 'xn--bcher-kva.example');
    for (const bad of ['', 'localhost', '-a.example', 'a..example', 'a.example/x', 'a.1']) {
      assert.equal(normalizeDomain(bad), null, bad);
    }
    assert.deepEqual(normalizeDomains(['@Alfa.example', 'alfa.example', 'beta.example']), [
      'alfa.example',
      'beta.example',
    ]);
    assert.equal(normalizeDomains(['ok.example', 'bad domain']), null);
    assert.equal(emailDomain('Mario@Alfa.Example'), 'alfa.example');
    assert.equal(emailDomain('no-at-sign'), null);
  });

  test('доставчикът на клиента покрива вътрешните; на фирмата — само нейните портални', () => {
    const internal = { companyId: null };
    const company = { companyId: 'c1' };
    assert.equal(covers(internal, { kind: 'INTERNAL', companyId: null }), true);
    assert.equal(covers(internal, { kind: 'PORTAL', companyId: 'c1' }), false);
    assert.equal(covers(company, { kind: 'PORTAL', companyId: 'c1' }), true);
    assert.equal(covers(company, { kind: 'PORTAL', companyId: 'c2' }), false);
    assert.equal(covers(company, { kind: 'INTERNAL', companyId: null }), false);
  });
});
