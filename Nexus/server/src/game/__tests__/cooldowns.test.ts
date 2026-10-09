// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import { assertReady, setCooldown, claimCooldown } from '../cooldowns';

let seq = 0;
function makeChar(): number {
  const now = Date.now();
  const info = getDb().prepare(
    'INSERT INTO characters (name, class, energy_updated_at, created_at) VALUES (?, ?, ?, ?)',
  ).run(`hero_${++seq}`, 'warrior', now, now);
  return info.lastInsertRowid as number;
}

function nextAvailable(charId: number, kind: string): number | undefined {
  return (getDb().prepare('SELECT next_available_at FROM character_cooldowns WHERE character_id = ? AND action_kind = ?')
    .get(charId, kind) as { next_available_at: number } | undefined)?.next_available_at;
}

test('claimCooldown: първата заявка минава и слага бъдещ next_available_at', () => {
  const A = makeChar();
  const ms = claimCooldown(A, 'hunt');
  assert.ok(ms >= 60_000, 'дори с 50% mount reduction, hunt никога не пада под 1 мин');
  const next = nextAvailable(A, 'hunt');
  assert.ok(next! > Date.now(), 'cooldown-ът е в бъдещето');
});

test('claimCooldown: втора заявка ВЕДНАГА СЛЕД първата хвърля COOLDOWN грешка (анти double-submit)', () => {
  // Симулира точно бъга от одита: две „паралелни" /hunt заявки за същия
  // герой — първата claim трябва да спечели, ВТОРАТА (дори призована
  // веднага, преди никаква комбат логика) трябва да отпадне на claim-а,
  // НЕ да мине и да плати награда двойно.
  const A = makeChar();
  claimCooldown(A, 'hunt');
  assert.throws(
    () => claimCooldown(A, 'hunt'),
    (e: any) => e.code === 'COOLDOWN' && typeof e.cooldownMs === 'number' && e.cooldownMs > 0,
    'втория claim трябва да отпадне със същата COOLDOWN грешка assertReady() хвърляше',
  );
});

test('claimCooldown: различни герои/действия не се блокират един друг', () => {
  const A = makeChar();
  const B = makeChar();
  claimCooldown(A, 'hunt');
  // Друг герой, същото действие — не е блокиран.
  assert.doesNotThrow(() => claimCooldown(B, 'hunt'));
  // Същия герой, друго действие — не е блокиран.
  assert.doesNotThrow(() => claimCooldown(A, 'quest'));
});

test('claimCooldown: след изтичане на стария cooldown нов claim минава', () => {
  const A = makeChar();
  claimCooldown(A, 'hunt');
  // Симулирай изтичане, местейки прозореца в миналото.
  getDb().prepare('UPDATE character_cooldowns SET next_available_at = ? WHERE character_id = ? AND action_kind = ?')
    .run(Date.now() - 1000, A, 'hunt');
  assert.doesNotThrow(() => claimCooldown(A, 'hunt'));
});

test('legacy assertReady()/setCooldown() поведението е непроменено (dungeon/mythicPlus все още ги ползват)', () => {
  const A = makeChar();
  assert.doesNotThrow(() => assertReady(A, 'dungeon'));
  setCooldown(A, 'dungeon');
  assert.throws(() => assertReady(A, 'dungeon'), /dungeon cooldown/);
});
