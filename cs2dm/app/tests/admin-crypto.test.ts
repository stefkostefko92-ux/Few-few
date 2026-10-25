import './env.js';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
  hmacHex,
  safeEqual,
  sha256Hex,
} from '../src/admin/crypto.js';
import { adminKeys } from '../src/admin/keys.js';
import { envelope, newPayload, signPayload } from '../src/admin/signing.js';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  otpauthUrl,
  totpAt,
  totpStep,
  verifyTotp,
} from '../src/admin/totp.js';

test('подписът на моста: общият тестов вектор с C# (UTF-8 байтовете на p)', () => {
  assert.equal(
    signPayload('k', '{"a":"б"}'),
    'cbe3d618023a5e002fabbf60787c7c3eace0fed4d426c56cca26641d6ab481d7',
  );
  assert.equal(hmacHex('k', '{"a":"б"}'), signPayload('k', '{"a":"б"}'));
});

test('пликът: p е точно подписаният низ, payload-ът е по договора', () => {
  const key = 'x'.repeat(40);
  const payload = newPayload('kick', { steamId: '76561198000000001', reason: 'тест' }, '7656', 5);
  const message = JSON.parse(envelope(key, payload)) as { p: string; sig: string };
  assert.deepEqual(Object.keys(message), ['p', 'sig']);
  assert.equal(message.sig, signPayload(key, message.p));
  const inner = JSON.parse(message.p) as Record<string, unknown>;
  assert.deepEqual(Object.keys(inner), ['id', 'ts', 'actor', 'action', 'args']);
  assert.match(String(inner.id), /^[0-9a-f-]{36}$/);
  assert.equal(inner.ts, 5);
  assert.notEqual(newPayload('kick', {}, 'a', 1).id, newPayload('kick', {}, 'a', 1).id);
});

test('AES-256-GCM: обратимо, с контекст (AAD); друг контекст или ключ не отваря', () => {
  const master = randomBytes(32);
  const key = deriveKey(master, 'totp-secret');
  assert.notDeepEqual(key, deriveKey(master, 'recovery-code'), 'всяка цел — свой ключ');
  const sealed = encryptSecret('JBSWY3DPEHPK3PXP', key, 'totp:76561198000000001');
  assert.notEqual(sealed, encryptSecret('JBSWY3DPEHPK3PXP', key, 'totp:76561198000000001'));
  assert.equal(decryptSecret(sealed, key, 'totp:76561198000000001'), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => decryptSecret(sealed, key, 'totp:76561198000000002'));
  assert.throws(() => decryptSecret(sealed, deriveKey(master, 'other'), 'totp:76561198000000001'));
  assert.throws(() => encryptSecret('x', randomBytes(16), 'c'));
});

test('хешове и сравнение с постоянно време', () => {
  assert.equal(sha256Hex('abc').length, 64);
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abd'));
  assert.ok(!safeEqual('abc', 'abcd'));
});

test('TOTP по RFC 6238 (приложение B, SHA-1)', () => {
  const secret = Buffer.from('12345678901234567890', 'ascii');
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [time, code] of vectors) assert.equal(totpAt(secret, totpStep(time), 8), code);
  assert.equal(totpAt(secret, totpStep(59)), '287082', '6 цифри = последните 6');
});

test('TOTP: ±1 стъпка се приема, повторен код — не', () => {
  const secret = base32Encode(randomBytes(20));
  const now = 1_792_828_391;
  const step = totpStep(now);
  const code = totpAt(base32Decode(secret), step);
  assert.equal(verifyTotp(secret, code, null, now), step);
  assert.equal(verifyTotp(secret, code, step, now), null, 'вече приета стъпка');
  assert.equal(
    verifyTotp(secret, code.split('').join(' '), null, now),
    step,
    'интервалите не пречат',
  );
  assert.equal(verifyTotp(secret, totpAt(base32Decode(secret), step - 1), null, now), step - 1);
  assert.equal(verifyTotp(secret, totpAt(base32Decode(secret), step - 2), null, now), null);
  assert.equal(verifyTotp(secret, 'abcdef', null, now), null);
  assert.match(otpauthUrl('76561198000000001', secret), /^otpauth:\/\/totp\/.+secret=[A-Z2-7]+/);
});

test('base32: обратимо', () => {
  const bytes = randomBytes(20);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
});

test('резервни кодове: формат, нормализиране, HMAC с ключ', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/);
  const code = codes[0]!;
  assert.equal(normalizeRecoveryCode(code.toUpperCase().replace('-', ' ')), code);
  assert.equal(normalizeRecoveryCode('123456'), '');
  assert.equal(normalizeRecoveryCode('iiiiiiiiii'), '', 'двусмислените знаци ги няма в азбуката');
  const key = randomBytes(32);
  const hash = hashRecoveryCode(key, '76561198000000001', code);
  assert.equal(hash.length, 64);
  assert.notEqual(hash, hashRecoveryCode(randomBytes(32), '76561198000000001', code));
  assert.notEqual(hash, hashRecoveryCode(key, '76561198000000002', code));
});

test('ключовете на панела: липсващ или невалиден изключва само своята част', () => {
  const hex = randomBytes(32).toString('hex');
  const long = 'k'.repeat(32);
  const ok = adminKeys({ APP_ENC_KEY: hex, CS2DM_BRIDGE_KEY: long, CS2DM_AGENT_KEY: long });
  assert.equal(ok.encKey?.length, 32);
  assert.equal(ok.bridgeKey, long);
  assert.deepEqual(ok.invalid, []);
  const none = adminKeys({
    APP_ENC_KEY: undefined,
    CS2DM_BRIDGE_KEY: undefined,
    CS2DM_AGENT_KEY: undefined,
  });
  assert.deepEqual(
    [none.encKey, none.bridgeKey, none.agentKey, none.invalid],
    [null, null, null, []],
  );
  const bad = adminKeys({ APP_ENC_KEY: 'abc', CS2DM_BRIDGE_KEY: 'short', CS2DM_AGENT_KEY: long });
  assert.equal(bad.encKey, null);
  assert.equal(bad.bridgeKey, null);
  assert.equal(bad.agentKey, long);
  assert.deepEqual(bad.invalid, ['APP_ENC_KEY', 'CS2DM_BRIDGE_KEY']);
});
