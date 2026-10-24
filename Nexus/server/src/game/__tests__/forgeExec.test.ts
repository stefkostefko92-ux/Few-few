// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import { performEnchant, enchantCost, ForgeError } from '../../lib/forgeExec';

getDb().prepare('INSERT INTO items (id, slug, name, category, tier, rarity) VALUES (1, ?, ?, ?, ?, ?)')
  .run('test_sword', 'Test Sword', 'weapon', 1, 'common');

let seq = 0;
function makeChar(gold: number, opts: Partial<{ forge_guarantees: number }> = {}): number {
  const now = Date.now();
  const info = getDb().prepare(
    'INSERT INTO characters (name, class, gold, forge_guarantees, energy_updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(`hero_${++seq}`, 'warrior', gold, opts.forge_guarantees ?? 0, now, now);
  return info.lastInsertRowid as number;
}

function giveItem(charId: number): number {
  const info = getDb().prepare(
    'INSERT INTO inventory (character_id, item_id, quantity, equipped, soul_bound, listed, vaulted_guild_id) VALUES (?, 1, 1, 0, 0, 0, 0)',
  ).run(charId);
  return info.lastInsertRowid as number;
}

function gold(charId: number): number {
  return (getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(charId) as { gold: number }).gold;
}

function ledger(invId: number): { enchant_count: number; bonuses_json: string } | undefined {
  return getDb().prepare('SELECT enchant_count, bonuses_json FROM inventory_enchants WHERE inventory_id = ?').get(invId) as any;
}

test('forge: два последователни enchant-а на един и същ предмет НЕ се презаписват (без lost update)', () => {
  // Симулира надпревара: и двете „заявки" тръгват от enchant_count=0
  // (както при две паралелни HTTP заявки, четящи един и същ ред ПРЕДИ
  // първата да завърши), но performEnchant() препрочита свежо вътре в
  // транзакцията, така че втората вижда count=1, не count=0.
  const A = makeChar(100_000);
  const inv = giveItem(A);
  const target = { inv_id: inv, item_id: 1, tier: 1, rarity: 'common' };

  const r1 = performEnchant(getDb(), A, target, () => 0); // rand=0 → 'small' bucket, stat index 0
  assert.equal(r1.outcome, 'small');
  assert.equal(r1.newEnchants, 1);

  const r2 = performEnchant(getDb(), A, target, () => 0);
  assert.equal(r2.outcome, 'small');
  assert.equal(r2.newEnchants, 2, 'вторият enchant трябва да продължи от 1, не да презапише с 1 отново');

  const row = ledger(inv);
  assert.equal(row?.enchant_count, 2, 'ledger-ът пази ДВАТА enchant-а, не последния презаписал първия');
  const bonuses = JSON.parse(row!.bonuses_json);
  assert.equal(bonuses.str_bonus, 2, 'двата +1 бонуса се натрупват (не се губи единият)');

  // Играчът плати за двата отделни enchant-а на нарастваща цена.
  const cost1 = enchantCost(1, 0);
  const cost2 = enchantCost(1, 1);
  assert.equal(gold(A), 100_000 - cost1 - cost2, 'платено точно за двата enchant-а, не двойно за един');
});

test('forge: недостатъчно злато хвърля и НЕ пипа ledger-а', () => {
  const A = makeChar(1); // enchantCost(1,0) = 100 > 1
  const inv = giveItem(A);
  assert.throws(() => performEnchant(getDb(), A, { inv_id: inv, item_id: 1, tier: 1, rarity: 'common' }, () => 0), ForgeError);
  assert.equal(gold(A), 1, 'златото не е пипнато при провал');
  assert.equal(ledger(inv), undefined, 'няма ledger запис при провалена транзакция');
});

test('forge: 5 enchant-а е таван — шести опит хвърля без да таксува', () => {
  const A = makeChar(1_000_000);
  const inv = giveItem(A);
  const target = { inv_id: inv, item_id: 1, tier: 1, rarity: 'common' };
  for (let i = 0; i < 5; i++) performEnchant(getDb(), A, target, () => 0);
  const before = gold(A);
  assert.throws(() => performEnchant(getDb(), A, target, () => 0), ForgeError);
  assert.equal(gold(A), before, 'таксата не се удържа, когато таванът вече е достигнат');
});

test('forge: Anvil Ward превръща shatter в гарантиран small и НЕ таксува двойно guarantee-то', () => {
  const A = makeChar(100_000, { forge_guarantees: 1 });
  const inv = giveItem(A);
  const target = { inv_id: inv, item_id: 1, tier: 1, rarity: 'common' };
  // rand близо до 1 → shatter bucket (weights.shatter=10 за common, r=99 > 90 threshold).
  const r = performEnchant(getDb(), A, target, () => 0.999);
  assert.equal(r.outcome, 'small', 'Ward конвертира shatter в small');
  assert.equal(r.guaranteeUsed, true);
  const guarantees = (getDb().prepare('SELECT forge_guarantees FROM characters WHERE id = ?').get(A) as any).forge_guarantees;
  assert.equal(guarantees, 0, 'guarantee-то е изразходвано само веднъж');
});
