// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import { executeTrade, type TradeRow } from '../../lib/tradeExec';

// Един базов item (inventory.item_id → items.id FK).
getDb().prepare('INSERT INTO items (id, slug, name, category) VALUES (1, ?, ?, ?)').run('test_sword', 'Test Sword', 'weapon');

let seq = 0;
function makeChar(gold: number): number {
  const now = Date.now();
  const info = getDb().prepare(
    'INSERT INTO characters (name, class, gold, energy_updated_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(`hero_${++seq}`, 'warrior', gold, now, now);
  return info.lastInsertRowid as number;
}

function giveItem(charId: number, opts: Partial<{ soul_bound: number; listed: number; vaulted_guild_id: number; equipped: number }> = {}): number {
  const info = getDb().prepare(
    'INSERT INTO inventory (character_id, item_id, quantity, equipped, soul_bound, listed, vaulted_guild_id) VALUES (?, 1, 1, ?, ?, ?, ?)',
  ).run(charId, opts.equipped ?? 0, opts.soul_bound ?? 0, opts.listed ?? 0, opts.vaulted_guild_id ?? 0);
  return info.lastInsertRowid as number;
}

function makeOffer(row: Omit<TradeRow, 'from_items' | 'to_items'> & { from_items: number[]; to_items: number[] }): TradeRow {
  const now = Date.now();
  getDb().prepare(
    `INSERT INTO trade_offers (id, from_id, to_id, from_items, to_items, from_gold, to_gold, from_ready, to_ready, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'pending', ?, ?)`,
  ).run(row.id, row.from_id, row.to_id, JSON.stringify(row.from_items), JSON.stringify(row.to_items), row.from_gold, row.to_gold, now, now);
  return { ...row, from_items: JSON.stringify(row.from_items), to_items: JSON.stringify(row.to_items) };
}

function inv(charId: number): number {
  return (getDb().prepare('SELECT COUNT(*) AS n FROM inventory WHERE character_id = ?').get(charId) as { n: number }).n;
}
function gold(charId: number): number {
  return (getDb().prepare('SELECT gold FROM characters WHERE id = ?').get(charId) as { gold: number }).gold;
}
function owner(invId: number): number {
  return (getDb().prepare('SELECT character_id FROM inventory WHERE id = ?').get(invId) as { character_id: number }).character_id;
}

test('размяна: точен суап без дупликация + вярно злато', () => {
  const A = makeChar(1000);
  const B = makeChar(500);
  const itemA = giveItem(A);
  const itemB = giveItem(B);
  const totalItemsBefore = inv(A) + inv(B);

  const offer = makeOffer({ id: 1, from_id: A, to_id: B, from_items: [itemA], to_items: [itemB], from_gold: 100, to_gold: 0 });
  executeTrade(getDb(), offer);

  // Предметите са разменени, НЕ дублирани (общият брой е константен).
  assert.equal(inv(A) + inv(B), totalItemsBefore, 'общ брой предмети непроменен → без дупликация');
  assert.equal(owner(itemA), B, 'itemA отиде при B');
  assert.equal(owner(itemB), A, 'itemB отиде при A');
  // Злато: A -100, B +100.
  assert.equal(gold(A), 900);
  assert.equal(gold(B), 600);
  const st = getDb().prepare('SELECT status FROM trade_offers WHERE id = 1').get() as { status: string };
  assert.equal(st.status, 'completed');
});

test('размяна: soul-bound предмет блокира цялата транзакция (rollback)', () => {
  const A = makeChar(1000);
  const B = makeChar(1000);
  const bound = giveItem(A, { soul_bound: 1 });
  const offer = makeOffer({ id: 2, from_id: A, to_id: B, from_items: [bound], to_items: [], from_gold: 50, to_gold: 0 });

  assert.throws(() => executeTrade(getDb(), offer), /no longer tradable/i);
  // Пълен rollback: предметът остава при A, златото непокътнато, размяната pending.
  assert.equal(owner(bound), A, 'soul-bound остава при подателя');
  assert.equal(gold(A), 1000, 'златото не е мръднало');
  const st = getDb().prepare('SELECT status FROM trade_offers WHERE id = 2').get() as { status: string };
  assert.equal(st.status, 'pending', 'размяната НЕ е маркирана completed');
});

test('размяна: недостатъчно злато → rollback, предметите не мърдат', () => {
  const A = makeChar(30); // иска да плати 100, но има 30
  const B = makeChar(0);
  const itemA = giveItem(A);
  const offer = makeOffer({ id: 3, from_id: A, to_id: B, from_items: [itemA], to_items: [], from_gold: 100, to_gold: 0 });

  assert.throws(() => executeTrade(getDb(), offer), /not enough gold/i);
  assert.equal(owner(itemA), A, 'предметът се връща при A след rollback');
  assert.equal(gold(A), 30, 'златото на A е непокътнато');
  assert.equal(gold(B), 0, 'B не е получил нищо');
});

test('размяна: двойно изпълнение не дублира (anti double-spend)', () => {
  const A = makeChar(1000);
  const B = makeChar(1000);
  const itemA = giveItem(A);
  const offer = makeOffer({ id: 4, from_id: A, to_id: B, from_items: [itemA], to_items: [], from_gold: 200, to_gold: 0 });

  executeTrade(getDb(), offer); // първо изпълнение — успех
  // Второто изпълнение трябва да се провали на claim guard-а (вече completed).
  assert.throws(() => executeTrade(getDb(), offer), /state changed/i);

  assert.equal(owner(itemA), B, 'предметът е при B, само веднъж');
  assert.equal(gold(A), 800, 'A e платил само веднъж (‑200)');
  assert.equal(gold(B), 1200, 'B e получил само веднъж (+200)');
});
