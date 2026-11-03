import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canManageSeeds, canUseDashboard } from '../src/domain/access.js';

const ROLE = '222222222222222222';
const plain = { isOwner: false, isAdmin: false, roleIds: [] as string[] };

test('дашборд: само член на гилдията', () => {
  assert.equal(canUseDashboard(null, ROLE), false);
});

test('дашборд: собственик и администратор винаги влизат', () => {
  assert.equal(canUseDashboard({ ...plain, isOwner: true }, null), true);
  assert.equal(canUseDashboard({ ...plain, isAdmin: true }, ROLE), true);
});

test('дашборд: ролята от настройките', () => {
  assert.equal(canUseDashboard({ ...plain, roleIds: [ROLE] }, ROLE), true);
  assert.equal(canUseDashboard({ ...plain, roleIds: ['333333333333333333'] }, ROLE), false);
  assert.equal(canUseDashboard(plain, null), false);
});

test('команди: ролята за командите е отделна', () => {
  assert.equal(canManageSeeds({ ...plain, roleIds: [ROLE] }, ROLE), true);
  assert.equal(canManageSeeds({ ...plain, roleIds: [ROLE] }, '444444444444444444'), false);
  assert.equal(canManageSeeds({ ...plain, isAdmin: true }, null), true);
  assert.equal(canManageSeeds(plain, null), false);
  assert.equal(canManageSeeds(null, ROLE), false);
});
