import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { canSeal, keyRingFrom, needsReseal, open, seal, sealContext } from '../secret-box';
import { base32Decode, base32Encode, hotp, newTotpSecret, otpauthUri, totpStep, verifyTotp } from '../totp';
import { hashBackupCode, matchBackupCode, newBackupCodes } from '../backup-codes';

// Примитивите за 2FA и шифрованите настройки (docs/security-2fa-settings-spec.md).

const k1 = randomBytes(32).toString('base64');
const k2 = randomBytes(32).toString('base64');

test('secret-box: шифрира/дешифрира; AAD (контекстът) е вързан', () => {
  const ring = keyRingFrom({ SETTINGS_KEY: k1 });
  const sealed = seal('sk_live_тайна', 'setting:revolut.secretKey', ring);
  assert.ok(!sealed.includes('sk_live'));
  assert.equal(open(sealed, 'setting:revolut.secretKey', ring), 'sk_live_тайна');
  assert.equal(open(sealed, 'setting:brevo.apiKey', ring), null); // друго поле
  assert.notEqual(seal('x', 'c', ring), seal('x', 'c', ring)); // нов IV всеки път
});

test('secret-box: грешен ключ, подменен запис, без ключ → null/отказ (fail-closed)', () => {
  const ring = keyRingFrom({ SETTINGS_KEY: k1 });
  const sealed = seal('тайна', 'ctx', ring);
  assert.equal(open(sealed, 'ctx', keyRingFrom({ SETTINGS_KEY: k2 })), null);
  const parts = sealed.split('.');
  parts[4] = Buffer.from('боклук').toString('base64url');
  assert.equal(open(parts.join('.'), 'ctx', ring), null);
  assert.equal(open('не е запис', 'ctx', ring), null);
  assert.equal(canSeal(keyRingFrom({})), false);
  assert.equal(canSeal(keyRingFrom({ SETTINGS_KEY: 'къс' })), false);
  assert.throws(() => seal('x', 'ctx', keyRingFrom({})));
});

test('secret-box: ротация — старият ключ още чете, новият пише', () => {
  const old = keyRingFrom({ SETTINGS_KEY: k1 });
  const sealed = seal('тайна', 'ctx', old);
  const rotated = keyRingFrom({ SETTINGS_KEY: k2, SETTINGS_KEY_OLD: k1 });
  assert.equal(open(sealed, 'ctx', rotated), 'тайна');
  assert.equal(needsReseal(sealed, rotated), true);
  assert.equal(needsReseal(seal('тайна', 'ctx', rotated), rotated), false);
});

test('totp: векторите от RFC 6238 (SHA-1, 8→6 цифри)', () => {
  const secret = Buffer.from('12345678901234567890');
  // RFC 6238 Приложение B: T=59 → 94287082; T=1111111109 → 07081804 (последните 6 цифри).
  assert.equal(hotp(secret, totpStep(59_000)), '287082');
  assert.equal(hotp(secret, totpStep(1_111_111_109_000)), '081804');
  assert.equal(hotp(secret, totpStep(2_000_000_000_000)), '279037');
});

test('totp: base32 е обратим; новият секрет е 160 бита', () => {
  const buf = randomBytes(20);
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
  assert.equal(base32Decode(newTotpSecret())?.length, 20);
  assert.equal(base32Decode('не е base32!'), null);
});

test('totp: прозорец ±1 стъпка, защита от повторна употреба, грешен формат', () => {
  const secret = newTotpSecret();
  const raw = base32Decode(secret)!;
  const now = 1_800_000_000_000;
  const step = totpStep(now);
  assert.equal(verifyTotp(secret, hotp(raw, step), { nowMs: now }), step);
  assert.equal(verifyTotp(secret, hotp(raw, step - 1), { nowMs: now }), step - 1);
  assert.equal(verifyTotp(secret, hotp(raw, step - 2), { nowMs: now }), null);
  // Същият код втори път (lastStep = step) → отказ.
  assert.equal(verifyTotp(secret, hotp(raw, step), { nowMs: now, lastStep: step }), null);
  assert.equal(verifyTotp(secret, '12345', { nowMs: now }), null);
  assert.equal(verifyTotp(secret, 'abcdef', { nowMs: now }), null);
});

test('totp: otpauth адресът кодира етикета', () => {
  const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'a+b@example.com');
  assert.ok(uri.startsWith('otpauth://totp/Linketto:a%2Bb%40example.com?'));
  assert.ok(uri.includes('secret=JBSWY3DPEHPK3PXP') && uri.includes('issuer=Linketto'));
});

test('резервни кодове: 10 уникални, еднократни, нечувствителни към формата', () => {
  const codes = newBackupCodes();
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0]!, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  const hashes = codes.map(hashBackupCode);
  assert.equal(matchBackupCode(codes[3]!.toLowerCase().replace('-', ' '), hashes), 3);
  assert.equal(matchBackupCode('AAAAA-AAAAA', hashes), -1);
  assert.equal(matchBackupCode('', hashes), -1);
});

test('sealContext: същите низове като вече шифрованите данни (смяна = изгубена 2FA/ключове)', () => {
  assert.equal(sealContext.totp('u1'), 'totp:u1');
  assert.equal(sealContext.totpPending('u1'), 'totp-pending:u1');
  assert.equal(sealContext.setting('revolut.secretKey'), 'setting:revolut.secretKey');
});

test('open: къс таг на GCM → null (тагът е точно 16 байта)', () => {
  const ring = keyRingFrom({ SETTINGS_KEY: randomBytes(32).toString('base64') });
  const sealed = seal('тайна', 'ctx', ring);
  const parts = sealed.split('.');
  parts[3] = Buffer.from(parts[3]!, 'base64url').subarray(0, 8).toString('base64url');
  assert.equal(open(parts.join('.'), 'ctx', ring), null);
  assert.equal(open(sealed, 'ctx', ring), 'тайна');
});
