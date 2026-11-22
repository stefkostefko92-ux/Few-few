import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNewPassword, PASSWORD_MIN, RESET_TTL_MS } from '../password-policy';
import { resetPasswordMessage } from '../account-emails';

test('нова парола: дължина и повторение (R4, R6)', () => {
  assert.deepEqual(parseNewPassword('a'.repeat(PASSWORD_MIN), 'a'.repeat(PASSWORD_MIN)), { ok: true, password: 'a'.repeat(PASSWORD_MIN) });
  assert.deepEqual(parseNewPassword('a'.repeat(PASSWORD_MIN - 1), 'a'.repeat(PASSWORD_MIN - 1)), { ok: false, reason: 'weak' });
  assert.deepEqual(parseNewPassword('x'.repeat(201), 'x'.repeat(201)), { ok: false, reason: 'weak' });
  assert.deepEqual(parseNewPassword('correct horse 1', 'correct horse 2'), { ok: false, reason: 'mismatch' });
  assert.deepEqual(parseNewPassword(null, null), { ok: false, reason: 'weak' });
  assert.equal(RESET_TTL_MS, 60 * 60 * 1000);
});

test('писмото за нова парола: екранира адреса, на езика, резерв en (R2)', () => {
  const bg = resetPasswordMessage({ locale: 'bg', url: 'https://x.test/bg/reset?token=a"b<c' });
  assert.match(bg.subject, /парола/i);
  assert.match(bg.html, /token=a&quot;b&lt;c/);
  assert.doesNotMatch(bg.html, /a"b<c/);
  assert.match(bg.html, /60 минути/);
  const fi = resetPasswordMessage({ locale: 'fi', url: 'https://x.test/fi/reset?token=t' });
  assert.match(fi.subject, /password/i, 'непреведен език → английски');
});
