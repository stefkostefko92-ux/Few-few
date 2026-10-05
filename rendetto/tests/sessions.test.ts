import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_ROLES } from '../src/auth/rbac.js';
import { MAX_SESSION_MS, sessionLimits } from '../src/auth/sessions.js';

test('the hourly purge never removes a session that its role still allows', () => {
  const caps = ALL_ROLES.map((role) => sessionLimits(role).absoluteMs);
  assert.equal(MAX_SESSION_MS, Math.max(...caps));
});
