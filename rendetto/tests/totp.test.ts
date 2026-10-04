import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  isTotpCode,
  otpauthUrl,
  totpCode,
  totpStep,
  verifyTotp,
} from '../src/auth/totp.js';

// RFC 6238, appendix B (SHA-1, secret "12345678901234567890"); six digits are the last six of the eight.
const SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
  [20000000000, '353130'],
];

test('codes match the RFC 6238 test vectors', () => {
  assert.equal(SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  for (const [time, code] of VECTORS) assert.equal(totpCode(SECRET, time), code, `T=${time}`);
});

test('base32 round-trips and secrets are 160 bits', () => {
  const secret = generateTotpSecret();
  assert.equal(base32Decode(secret).length, 20);
  assert.equal(base32Encode(base32Decode(secret)), secret);
});

test('one step of clock drift is accepted, two are not', () => {
  const t = 1234567890;
  const step = totpStep(t);
  assert.equal(verifyTotp(SECRET, totpCode(SECRET, t - 30), null, t), step - 1);
  assert.equal(verifyTotp(SECRET, totpCode(SECRET, t + 30), null, t), step + 1);
  assert.equal(verifyTotp(SECRET, totpCode(SECRET, t - 60), null, t), null);
  assert.equal(verifyTotp(SECRET, 'abcdef', null, t), null);
  assert.equal(verifyTotp(SECRET, '12345', null, t), null);
  assert.equal(verifyTotp(SECRET, totpCode(SECRET, t).replace(/^(\d{3})/, '$1 '), null, t), step);
});

test('an app code is told apart from a recovery code by its digits', () => {
  assert.equal(isTotpCode('123456'), true);
  assert.equal(isTotpCode(' 123 456 '), true);
  assert.equal(isTotpCode('12345'), false);
  assert.equal(isTotpCode('abcde-fghjk'), false);
});

test('a used code cannot be replayed', () => {
  const t = 2000000000;
  const accepted = verifyTotp(SECRET, totpCode(SECRET, t), null, t);
  assert.equal(accepted, totpStep(t));
  assert.equal(verifyTotp(SECRET, totpCode(SECRET, t), accepted, t), null);
  assert.equal(verifyTotp(SECRET, totpCode(SECRET, t - 30), accepted, t), null);
});

test('the enrolment link carries issuer, digits and period', () => {
  const url = new URL(otpauthUrl('Rendetto', 'a@b.eu', SECRET));
  assert.equal(url.protocol, 'otpauth:');
  assert.equal(url.searchParams.get('issuer'), 'Rendetto');
  assert.equal(url.searchParams.get('digits'), '6');
  assert.equal(url.searchParams.get('period'), '30');
});
