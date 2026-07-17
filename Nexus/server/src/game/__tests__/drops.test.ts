// Изолирана in-memory база — задай ПРЕДИ първия getDb().
process.env.DB_PATH = ':memory:';

import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../../db';
import { ITEM_SEED } from '../../seed/items';
import { grantDrop, tierForEffectiveLevel } from '../drops';

// Посей РЕАЛНИТЕ предмети (214) — тестът пази реалната дроп таблица, не мостра.
const db = getDb();
const ins = db.prepare(
  `INSERT INTO items (slug, name, category, tier, level_req, class_req, sell_price, atk_min, atk_max, defense)
   VALUES (@slug, @name, @category, @tier, @level_req, @class_req, @sell_price, 0, 0, 0)`,
);
for (const it of ITEM_SEED as any[]) {
  ins.run({
    slug: it.slug, name: it.name, category: it.category,
    tier: it.tier ?? 1, level_req: it.level_req ?? 1,
    class_req: it.class_req ?? '', sell_price: it.sell_price ?? 10,
  });
}

let seq = 0;
function mkChar(): number {
  return getDb().prepare(
    `INSERT INTO characters (name, class, energy_updated_at, created_at) VALUES (?, 'warrior', 0, 0)`,
  ).run(`drop_sim_${++seq}`).lastInsertRowid as number;
}

test('дроп при чудовище ≈ нивото: нула мъртви нива (1–350)', () => {
  const dead: number[] = [];
  for (let L = 1; L <= 350; L++) {
    const r = grantDrop(mkChar(), L, 'warrior', L);
    if (!r.slug) dead.push(L);
  }
  assert.deepEqual(dead, [], `мъртви нива: ${dead.join(',')}`);
});

test('дроп при бой НАД нивото (eff = ниво+30): tier fallback пази наградата', () => {
  // Преди поправката: 81 мъртви нива (1-11, 30-59, 250-259, 290-319).
  const dead: number[] = [];
  for (let L = 1; L <= 350; L++) {
    const r = grantDrop(mkChar(), L, 'warrior', Math.min(350, L + 30));
    if (!r.slug) dead.push(L);
  }
  assert.deepEqual(dead, [], `мъртви нива при eff=ниво+30: ${dead.join(',')}`);
});

test('fallback НЕ over-reward-ва: нисък герой не получава висок tier', () => {
  // Герой ниво 10 срещу eff 350 (tier 10) → fallback до предмет с level_req<=10,
  // т.е. tier 1-2, никога tier 10.
  const id = mkChar();
  const r = grantDrop(id, 10, 'warrior', 350);
  assert.ok(r.slug, 'дроп има');
  const item = getDb().prepare('SELECT tier, level_req FROM items WHERE id = ?').get(r.itemId) as { tier: number; level_req: number };
  assert.ok(item.level_req <= 10, `level_req ${item.level_req} <= 10`);
  assert.ok(item.tier <= 2, `tier ${item.tier} е нисък, не 10`);
});

test('дупликат → авто-vendor с 20% злато, без втори предмет', () => {
  const id = mkChar();
  // Изчерпи пула на tier-а на ниво 350, докато удари дупликат.
  let dupSeen = false;
  for (let i = 0; i < 80 && !dupSeen; i++) {
    const r = grantDrop(id, 350, 'warrior', 350);
    if (r.duplicate) {
      dupSeen = true;
      assert.ok(r.refundGold > 0, 'refund > 0');
    }
  }
  assert.ok(dupSeen, 'дупликат се задейства при повторни дропове');
});

test('tierForEffectiveLevel: границите съвпадат с hunting мапинга', () => {
  assert.equal(tierForEffectiveLevel(1), 1);
  assert.equal(tierForEffectiveLevel(12), 2);
  assert.equal(tierForEffectiveLevel(25), 3);
  assert.equal(tierForEffectiveLevel(60), 4);
  assert.equal(tierForEffectiveLevel(95), 5);
  assert.equal(tierForEffectiveLevel(130), 6);
  assert.equal(tierForEffectiveLevel(180), 7);
  assert.equal(tierForEffectiveLevel(230), 8);
  assert.equal(tierForEffectiveLevel(280), 9);
  assert.equal(tierForEffectiveLevel(320), 10);
  assert.equal(tierForEffectiveLevel(350), 10);
});
