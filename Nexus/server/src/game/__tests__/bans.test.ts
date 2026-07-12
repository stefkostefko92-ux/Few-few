// Изолирана in-memory база за теста — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import {
  banUser, unbanUser, isUserBanned, isIpBanned, isHwidBanned,
  isBanEvasion, requestBanStatus,
} from '../../lib/bans';

function makeUser(username: string): number {
  const now = Date.now();
  const info = getDb()
    .prepare('INSERT INTO users (username, email, password_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .run(username, `${username}@example.com`, 'x', now, now);
  return info.lastInsertRowid as number;
}

test('banUser банва потребител + IP + устройство и бумва token_version', () => {
  const uid = makeUser('cheater');
  const before = getDb().prepare('SELECT token_version FROM users WHERE id = ?').get(uid) as { token_version: number };
  banUser({ userId: uid, ip: '1.2.3.4', hwid: 'dev-abc', reason: 'Chargeback (Stripe dispute)' });

  assert.equal(isUserBanned(uid).banned, true);
  assert.equal(isIpBanned('1.2.3.4').banned, true);
  assert.equal(isHwidBanned('dev-abc').banned, true);
  const after = getDb().prepare('SELECT token_version FROM users WHERE id = ?').get(uid) as { token_version: number };
  assert.equal(after.token_version, before.token_version + 1, 'token_version bumped → старите JWT падат');
});

test('isBanEvasion лови нов достъп от банато ip или устройство', () => {
  banUser({ userId: makeUser('evader'), ip: '9.9.9.9', hwid: 'dev-xyz', reason: 'ban' });
  assert.equal(isBanEvasion('9.9.9.9', '').banned, true, 'банато IP');
  assert.equal(isBanEvasion('', 'dev-xyz').banned, true, 'банато устройство');
  assert.equal(isBanEvasion('5.5.5.5', 'clean-device').banned, false, 'чисти → минава');
});

test('празни ip/hwid никога не са банати (без фалшиви положителни)', () => {
  assert.equal(isIpBanned('').banned, false);
  assert.equal(isHwidBanned('').banned, false);
  assert.equal(requestBanStatus(undefined, '', '').banned, false);
});

test('unbanUser чисти потребител + неговите ip/hwid', () => {
  const uid = makeUser('reformed');
  banUser({ userId: uid, ip: '7.7.7.7', hwid: 'dev-777', reason: 'ban' });
  unbanUser(uid);
  assert.equal(isUserBanned(uid).banned, false);
  assert.equal(isIpBanned('7.7.7.7').banned, false);
  assert.equal(isHwidBanned('dev-777').banned, false);
});
