import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSuccessfulLogin, SUCCESSFUL_LOGINS } from '../src/services/login-outcome.js';

test('a sign-in counts as successful with the app code or with a recovery code, nothing else', () => {
  assert.deepEqual([...SUCCESSFUL_LOGINS], ['SUCCESS', 'MFA_RECOVERY']);
  for (const outcome of SUCCESSFUL_LOGINS) assert.ok(isSuccessfulLogin(outcome));
  for (const outcome of [
    'BAD_PASSWORD',
    'UNKNOWN_EMAIL',
    'LOCKED',
    'THROTTLED',
    'BANNED',
    'UNVERIFIED',
    'MFA_FAILED',
    '',
  ])
    assert.ok(!isSuccessfulLogin(outcome), outcome);
});
