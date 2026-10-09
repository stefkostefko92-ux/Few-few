import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCK_MS, MAX_FAILED_LOGINS } from '../src/auth/lock.js';
import { phantomFailure } from '../src/auth/phantom-lock.js';

test('an email without an account locks like a real one: on the fifth wrong try, for the lock time', () => {
  const t0 = Date.UTC(2026, 9, 9, 12);
  const seen: boolean[] = [];
  for (let i = 0; i < MAX_FAILED_LOGINS + 2; i++)
    seen.push(phantomFailure('Nobody@Example.test ', t0 + i).locked);
  assert.deepEqual(seen, [false, false, false, false, true, true, true]);
  // the same address in another case is the same address
  assert.equal(phantomFailure('nobody@example.test', t0 + 10).locked, true);
  // after the lock the count starts again from zero, as for an account
  const after = t0 + 4 + LOCK_MS + 1;
  assert.equal(phantomFailure('nobody@example.test', after).locked, false);
  assert.equal(phantomFailure('someone-else@example.test', t0).locked, false);
});
