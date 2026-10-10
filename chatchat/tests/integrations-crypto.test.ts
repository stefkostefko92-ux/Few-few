import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, test } from 'node:test';
import { integrationKeys, loadIntegrationsConfig } from '../src/config-integrations.js';
import {
  openSecrets,
  sealSecrets,
  SecretError,
  SecretKeyring,
} from '../src/services/integrations/secrets.js';
import {
  CC_DELIVERY,
  CC_SIGNATURE,
  CC_TIMESTAMP,
  signChatChat,
  verifyChatChat,
  verifyJira,
  verifyZendesk,
} from '../src/services/integrations/signature.js';

/** Подписите на известията (HMAC-SHA256) и шифроването на тайните на конекторите. */

const SECRET = 'a'.repeat(40);
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const TS = Math.floor(NOW / 1000);
const BODY = '{"version":1,"ticket":{"number":"TS-2026-000001"},"action":"close"}';

describe('подписът на ChatChat (общият webhook)', () => {
  const headers = (sig: string, ts = String(TS), extra: Record<string, string> = {}) => ({
    [CC_SIGNATURE]: sig,
    [CC_TIMESTAMP]: ts,
    ...extra,
  });

  test('v1=hex(HMAC(тайна, "<timestamp>.<тяло>")) — независимо пресметнат', () => {
    const expected = createHmac('sha256', SECRET).update(`${TS}.${BODY}`).digest('hex');
    assert.equal(signChatChat(SECRET, TS, BODY), `v1=${expected}`);
  });

  test('верен подпис в прозореца → ok; nonce по id на доставката', () => {
    const sig = signChatChat(SECRET, TS, BODY);
    const a = verifyChatChat(
      SECRET,
      headers(sig, String(TS), { [CC_DELIVERY]: 'd1' }),
      BODY,
      NOW,
      300,
    );
    const b = verifyChatChat(
      SECRET,
      headers(sig, String(TS), { [CC_DELIVERY]: 'd2' }),
      BODY,
      NOW,
      300,
    );
    assert.ok(a.ok && b.ok);
    assert.notEqual(a.nonce, b.nonce);
    // Няколко подписа (смяна на тайната при получателя) — един верен стига.
    assert.equal(verifyChatChat(SECRET, headers(`v1=00, ${sig}`), BODY, NOW, 300).ok, true);
  });

  test('променено тяло, чужда тайна, липсващ печат → invalid_signature', () => {
    const sig = signChatChat(SECRET, TS, BODY);
    const bad = (r: ReturnType<typeof verifyChatChat>) => (r.ok ? 'ok' : r.code);
    assert.equal(
      bad(verifyChatChat(SECRET, headers(sig), BODY.replace('close', 'reopen'), NOW, 300)),
      'invalid_signature',
    );
    assert.equal(
      bad(verifyChatChat('b'.repeat(40), headers(sig), BODY, NOW, 300)),
      'invalid_signature',
    );
    assert.equal(
      bad(verifyChatChat(SECRET, headers(sig, ''), BODY, NOW, 300)),
      'invalid_signature',
    );
    assert.equal(
      bad(verifyChatChat(SECRET, { [CC_TIMESTAMP]: String(TS) }, BODY, NOW, 300)),
      'invalid_signature',
    );
  });

  test('печат извън прозореца (минал или бъдещ) → stale_request', () => {
    for (const ts of [TS - 301, TS + 301]) {
      const r = verifyChatChat(
        SECRET,
        headers(signChatChat(SECRET, ts, BODY), String(ts)),
        BODY,
        NOW,
        300,
      );
      assert.equal(r.ok ? 'ok' : r.code, 'stale_request');
    }
  });
});

describe('подписът на Zendesk (официалният: base64(HMAC(тайна, печат + тяло)))', () => {
  const ts = '2026-10-10T12:00:00Z';
  const body = '{"ticket_id":"35436","status":"solved"}';
  const sig = createHmac('sha256', SECRET)
    .update(ts + body)
    .digest('base64');
  const headers = (s: string, t = ts) => ({
    'x-zendesk-webhook-signature': s,
    'x-zendesk-webhook-signature-timestamp': t,
    'x-zendesk-webhook-invocation-id': '8350205582',
  });

  test('верен → ok; грешен/подправен → invalid; стар печат → stale', () => {
    assert.equal(verifyZendesk(SECRET, headers(sig), body, NOW, 300).ok, true);
    const r1 = verifyZendesk(SECRET, headers(sig), body.replace('solved', 'open'), NOW, 300);
    assert.equal(r1.ok ? 'ok' : r1.code, 'invalid_signature');
    const old = '2026-10-10T11:50:00Z';
    const oldSig = createHmac('sha256', SECRET)
      .update(old + body)
      .digest('base64');
    const r2 = verifyZendesk(SECRET, headers(oldSig, old), body, NOW, 300);
    assert.equal(r2.ok ? 'ok' : r2.code, 'stale_request');
  });
});

describe('подписът на Jira (X-Hub-Signature: sha256=<hex>)', () => {
  test('верен → ok, nonce по X-Atlassian-Webhook-Identifier; грешен → invalid', () => {
    const body = '{"timestamp":1,"issue":{"id":"1"}}';
    const sig = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
    const ok = verifyJira(
      SECRET,
      { 'x-hub-signature': sig, 'x-atlassian-webhook-identifier': 'w-1' },
      body,
    );
    assert.equal(ok.ok, true);
    const bad = verifyJira(SECRET, { 'x-hub-signature': sig }, `${body} `);
    assert.equal(bad.ok ? 'ok' : bad.code, 'invalid_signature');
  });
});

describe('тайните на конекторите (AES-256-GCM с INTEGRATION_KEK)', () => {
  const k1 = Buffer.alloc(32, 1);
  const k2 = Buffer.alloc(32, 2);

  test('запис и четене; чужд клиент не отваря; подправка → corrupt', () => {
    const ring = new SecretKeyring(k1);
    const sealed = sealSecrets(ring, 'tenant-a', {
      apiToken: 'tok-123',
      email: 'svc@example.test',
    });
    assert.doesNotMatch(sealed, /tok-123|svc@example/);
    assert.deepEqual(openSecrets(ring, 'tenant-a', sealed), {
      apiToken: 'tok-123',
      email: 'svc@example.test',
    });
    assert.throws(
      () => openSecrets(ring, 'tenant-b', sealed),
      (e) => e instanceof SecretError && e.reason === 'corrupt',
    );
    const [v, kid, payload] = sealed.split('.');
    const flipped = Buffer.from(payload ?? '', 'base64');
    flipped[flipped.length - 1] = (flipped.at(-1) ?? 0) ^ 1;
    assert.throws(
      () => openSecrets(ring, 'tenant-a', `${v}.${kid}.${flipped.toString('base64')}`),
      SecretError,
    );
  });

  test('ротация: новият ключ пише, предишният чете; непознат ключ → unknown_key', () => {
    const old = sealSecrets(new SecretKeyring(k1), 't', { signingSecret: 'x'.repeat(32) });
    const rotated = new SecretKeyring(k2, [k1]);
    assert.equal(openSecrets(rotated, 't', old).signingSecret, 'x'.repeat(32));
    assert.throws(
      () => openSecrets(new SecretKeyring(k2), 't', old),
      (e) => e instanceof SecretError && e.reason === 'unknown_key',
    );
  });
});

describe('средата: INTEGRATION_KEK', () => {
  const key = (n: number) => Buffer.alloc(32, n).toString('base64');

  test('празно → интеграцията е изключена; валиден → ключодържател', () => {
    assert.equal(integrationKeys(loadIntegrationsConfig({ INTEGRATION_KEK: '' })), null);
    const cfg = loadIntegrationsConfig({
      INTEGRATION_KEK: key(3),
      INTEGRATION_KEK_PREVIOUS: key(4),
    });
    const keys = integrationKeys(cfg);
    assert.equal(keys?.previous.length, 1);
    assert.equal(cfg.INTEGRATION_MAX_ATTEMPTS, 10);
  });

  test('невалиден или същият като MFA_ENC_KEY/FILES_KEK → процесът не тръгва', () => {
    assert.throws(() => loadIntegrationsConfig({ INTEGRATION_KEK: 'кратък' }), /INTEGRATION_KEK/);
    assert.throws(
      () => loadIntegrationsConfig({ INTEGRATION_KEK: key(5), MFA_ENC_KEY: key(5) }),
      /MFA_ENC_KEY/,
    );
    assert.throws(
      () => loadIntegrationsConfig({ INTEGRATION_KEK: key(6), FILES_KEK: key(6) }),
      /FILES_KEK/,
    );
    assert.throws(
      () => loadIntegrationsConfig({ INTEGRATION_KEK: key(7), INTEGRATION_KEK_PREVIOUS: 'x' }),
      /PREVIOUS/,
    );
  });
});
