// Изолирана in-memory база за теста — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import {
  banUser, unbanUser, isUserBanned, isIpBanned, isHwidBanned,
  isBanEvasion, requestBanStatus, pruneExpiredBans,
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

test('временен бан е активен преди изтичане, с until в бъдещето', () => {
  const uid = makeUser('temp');
  banUser({ userId: uid, ip: '3.3.3.3', reason: '24h', durationMs: 86_400_000 });
  const s = isUserBanned(uid);
  assert.equal(s.banned, true);
  assert.ok((s.until ?? 0) > Date.now(), 'until е в бъдещето');
  assert.equal(isIpBanned('3.3.3.3').banned, true);
});

test('ИЗТЕКЪЛ временен бан се третира като не-банат', () => {
  const uid = makeUser('expired');
  banUser({ userId: uid, ip: '4.4.4.4', hwid: 'dev-exp', reason: 'temp', durationMs: 60_000 });
  // Симулирай изтичане: премести expiry в миналото директно.
  const past = Date.now() - 1000;
  const db = getDb();
  db.prepare('UPDATE users SET banned_until = ? WHERE id = ?').run(past, uid);
  db.prepare('UPDATE banned_ips SET expires_at = ? WHERE ip = ?').run(past, '4.4.4.4');
  db.prepare('UPDATE banned_devices SET expires_at = ? WHERE hwid = ?').run(past, 'dev-exp');
  assert.equal(isUserBanned(uid).banned, false, 'изтекъл потребителски бан');
  assert.equal(isIpBanned('4.4.4.4').banned, false, 'изтекъл IP бан');
  assert.equal(isHwidBanned('dev-exp').banned, false, 'изтекъл device бан');
});

test('pruneExpiredBans чисти само изтеклите редове', () => {
  const db = getDb();
  const perm = makeUser('permkeep');
  banUser({ userId: perm, ip: '6.6.6.6', reason: 'perm' }); // постоянен → пази се
  const exp = makeUser('expprune');
  banUser({ userId: exp, ip: '8.8.8.8', reason: 'temp', durationMs: 60_000 });
  const past = Date.now() - 1000;
  db.prepare('UPDATE users SET banned_until = ? WHERE id = ?').run(past, exp);
  db.prepare('UPDATE banned_ips SET expires_at = ? WHERE ip = ?').run(past, '8.8.8.8');

  pruneExpiredBans();

  assert.equal(isIpBanned('6.6.6.6').banned, true, 'постоянният остава');
  assert.equal(isIpBanned('8.8.8.8').banned, false, 'изтеклият е изчистен');
  const expRow = db.prepare('SELECT banned FROM users WHERE id = ?').get(exp) as { banned: number };
  assert.equal(expRow.banned, 0, 'изтеклият потребителски флаг е нулиран');
  const permRow = db.prepare('SELECT banned FROM users WHERE id = ?').get(perm) as { banned: number };
  assert.equal(permRow.banned, 1, 'постоянният флаг остава');
});

test('unbanUser чисти потребител + неговите ip/hwid', () => {
  const uid = makeUser('reformed');
  banUser({ userId: uid, ip: '7.7.7.7', hwid: 'dev-777', reason: 'ban' });
  unbanUser(uid);
  assert.equal(isUserBanned(uid).banned, false);
  assert.equal(isIpBanned('7.7.7.7').banned, false);
  assert.equal(isHwidBanned('dev-777').banned, false);
});
