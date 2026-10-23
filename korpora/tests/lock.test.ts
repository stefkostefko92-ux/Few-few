import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocked, LOCK_MINUTES, LOCK_MS } from '../src/auth/lock.js';

test('a lock holds only until lockedUntil', () => {
  const now = Date.UTC(2026, 9, 4, 12);
  assert.equal(isLocked({ lockedUntil: null }, now), false);
  assert.equal(isLocked({ lockedUntil: new Date(now + 1000) }, now), true);
  assert.equal(isLocked({ lockedUntil: new Date(now) }, now), false);
  assert.equal(isLocked({ lockedUntil: new Date(now - 1000) }, now), false);
});

test('the lock lasts 15 minutes — the figure the texts promise', () => {
  assert.equal(LOCK_MS, 15 * 60_000);
  assert.equal(LOCK_MINUTES, 15);
});
