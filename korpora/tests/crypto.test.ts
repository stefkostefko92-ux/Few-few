import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRecoveryCode } from '../src/auth/recovery.js';
import { decryptSecret, encryptSecret, hmacHex, safeEqual } from '../src/crypto.js';

const KEY = '0123456789abcdef'.repeat(4);
const OTHER_KEY = 'fedcba9876543210'.repeat(4);
const SECRET = 'JBSWY3DPEHPK3PXP';
// Node's GCM error ("Unsupported state or unable to authenticate data"): a tampered record is never read
const AUTH_FAILED = /unable to authenticate data/;

function flipByte(payload: string, index: number): string {
  const raw = Buffer.from(payload, 'base64');
  raw[index] = raw[index]! ^ 0x01;
  return raw.toString('base64');
}

test('a TOTP secret survives the round trip and is stored as iv | tag | ciphertext', () => {
  const stored = encryptSecret(SECRET, KEY);
  assert.equal(decryptSecret(stored, KEY), SECRET);
  assert.equal(Buffer.from(stored, 'base64').length, 12 + 16 + SECRET.length);
  assert.ok(!stored.includes(SECRET));
  assert.equal(decryptSecret(encryptSecret('тайна ✓', KEY.toUpperCase()), KEY), 'тайна ✓');
});

test('the same secret encrypts differently every time (a fresh IV)', () => {
  const a = encryptSecret(SECRET, KEY);
  const b = encryptSecret(SECRET, KEY);
  assert.notEqual(a, b);
  assert.notEqual(a.slice(0, 16), b.slice(0, 16), 'the IV prefix differs');
  assert.equal(decryptSecret(b, KEY), SECRET);
});

test('a changed byte anywhere — IV, tag or ciphertext — is refused, not decrypted', () => {
  const stored = encryptSecret(SECRET, KEY);
  for (const [part, index] of [
    ['iv', 0],
    ['tag', 12],
    ['tag end', 27],
    ['ciphertext', 28],
    ['last byte', 12 + 16 + SECRET.length - 1],
  ] as const)
    assert.throws(() => decryptSecret(flipByte(stored, index), KEY), AUTH_FAILED, part);
});

test('the wrong key cannot read the secret, and only a 32-byte key is accepted', () => {
  const stored = encryptSecret(SECRET, KEY);
  assert.throws(() => decryptSecret(stored, OTHER_KEY), AUTH_FAILED);
  for (const bad of ['', 'ab'.repeat(31), 'ab'.repeat(33), 'zz'.repeat(32)]) {
    assert.throws(() => encryptSecret(SECRET, bad), /32 байта/, `encrypt with ${bad.length}`);
    assert.throws(() => decryptSecret(stored, bad), /32 байта/, `decrypt with ${bad.length}`);
    assert.throws(() => hmacHex(bad, 'x'), /32 байта/, `hmac with ${bad.length}`);
  }
});

test('a truncated record is reported as damaged before any decryption', () => {
  const head = Buffer.from(encryptSecret(SECRET, KEY), 'base64').subarray(0, 28);
  assert.throws(() => decryptSecret(head.toString('base64'), KEY), /Повреден шифрован запис/);
  assert.throws(() => decryptSecret('', KEY), /Повреден шифрован запис/);
});

test('the HMAC is stable for one key and different for another', () => {
  const mac = hmacHex(KEY, 'recovery:abcde-fghjk');
  assert.match(mac, /^[0-9a-f]{64}$/);
  assert.equal(hmacHex(KEY.toUpperCase(), 'recovery:abcde-fghjk'), mac);
  assert.notEqual(hmacHex(OTHER_KEY, 'recovery:abcde-fghjk'), mac);
  assert.notEqual(hmacHex(KEY, 'recovery:abcde-fghjm'), mac);
});

test('the constant-time comparison is false for any difference, including the length', () => {
  assert.equal(safeEqual('abcdef', 'abcdef'), true);
  assert.equal(safeEqual('', ''), true);
  assert.equal(safeEqual('abcdef', 'abcdeg'), false);
  assert.equal(safeEqual('abcdef', 'abcde'), false);
  assert.equal(safeEqual('abc', 'abcdef'), false);
  // one letter each, but a different UTF-8 byte length: compared as bytes, no throw
  assert.equal(safeEqual('é', 'e'), false);
  assert.equal(safeEqual('ж', 'ж'), true);
});

test('a recovery code is normalised to „xxxxx-xxxxx“ or rejected as empty', () => {
  const cases: Array<[string, string]> = [
    ['abcde-fghjk', 'abcde-fghjk'],
    ['ABCDE fghjk', 'abcde-fghjk'],
    [' abcdefghjk ', 'abcde-fghjk'],
    ['ab-cd_ef.gh jk', 'abcde-fghjk'],
    ['abcde-fghj', ''],
    ['abcde-fghjkm', ''],
    ['', ''],
    ['абвгд-ежзий', ''],
  ];
  for (const [input, expected] of cases)
    assert.equal(normalizeRecoveryCode(input), expected, JSON.stringify(input));
});
