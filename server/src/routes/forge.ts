import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import type { Character } from '../types/domain';
import { logFromRequest } from '../lib/logger';
import { trackBattlePass } from './battlepass';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Forge — enchant equipment with random stat bonuses.
 *
 * Cost: base = 100g × (item tier) × (1.6 ^ existing enchants).
 * Outcomes are weighted by item rarity so legendary gear is meaningfully
 * harder to brick:
 *   common       — 55% small / 25% medium / 10% greater / 10% shatter
 *   uncommon     — 50 / 28 / 12 / 10
 *   rare         — 45 / 30 / 18 /  7
 *   epic         — 40 / 32 / 24 /  4
 *   legendary    — 35 / 35 / 28 /  2
 * Shatter destroys the item (the inventory row is deleted).
 * Max enchants per item: 5.
 *
 * Bonus stats are added cumulatively in inventory_enchants.bonuses_json:
 *   { strength: 4, defense: 2, hp_bonus: 12, ... }
 *
 * The derived-stats engine still reads from items table; the forge bonuses
 * are surfaced on the inventory tooltip & added when equipped via a join
 * in derived-stats. (Hooked in stats.ts derivation in a follow-up.)
 * ======================================================================= */

const RARITY_WEIGHTS: Record<string, { small: number; medium: number; greater: number; shatter: number }> = {
  common:    { small: 55, medium: 25, greater: 10, shatter: 10 },
  uncommon:  { small: 50, medium: 28, greater: 12, shatter: 10 },
  rare:      { small: 45, medium: 30, greater: 18, shatter: 7 },
  epic:      { small: 40, medium: 32, greater: 24, shatter: 4 },
  legendary: { small: 35, medium: 35, greater: 28, shatter: 2 },
};

const BONUS_STATS = ['str_bonus', 'dex_bonus', 'con_bonus', 'int_bonus', 'cha_bonus', 'wis_bonus', 'hp_bonus', 'mp_bonus', 'defense', 'atk_max'] as const;

function getChar(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
}

function enchantCost(tier: number, count: number): number {
  return Math.floor(100 * Math.max(1, tier) * Math.pow(1.6, count));
}

function rollBucket(weights: { small: number; medium: number; greater: number; shatter: number }): 'small' | 'medium' | 'greater' | 'shatter' {
  const r = Math.random() * 100;
  if (r < weights.small) return 'small';
  if (r < weights.small + weights.medium) return 'medium';
  if (r < weights.small + weights.medium + weights.greater) return 'greater';
  return 'shatter';
}

router.get('/status/:inventoryId', (req, res) => {
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT inv.id AS inv_id, items.tier, items.rarity, items.name,
              COALESCE(e.enchant_count, 0) AS enchant_count,
              COALESCE(e.bonuses_json, '{}') AS bonuses_json
       FROM inventory inv
       JOIN items ON items.id = inv.item_id
       LEFT JOIN inventory_enchants e ON e.inventory_id = inv.id
       WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(Number(req.params.inventoryId), char.id) as any;
  if (!row) { res.status(404).json({ error: 'Item not in your bag' }); return; }
  const cost = enchantCost(row.tier, row.enchant_count);
  res.json({
    item: { name: row.name, rarity: row.rarity, tier: row.tier },
    enchants: row.enchant_count,
    max_enchants: 5,
    cost,
    can_afford: char.gold >= cost,
    weights: RARITY_WEIGHTS[row.rarity] || RARITY_WEIGHTS.common,
    bonuses: JSON.parse(row.bonuses_json || '{}'),
  });
});

const enchantSchema = z.object({ inventoryId: z.number().int() });

router.post('/enchant', (req, res) => {
  const parse = enchantSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT inv.id AS inv_id, items.id AS item_id, items.tier, items.rarity, items.name, items.category,
              COALESCE(e.enchant_count, 0) AS enchant_count,
              COALESCE(e.bonuses_json, '{}') AS bonuses_json
       FROM inventory inv
       JOIN items ON items.id = inv.item_id
       LEFT JOIN inventory_enchants e ON e.inventory_id = inv.id
       WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(parse.data.inventoryId, char.id) as any;
  if (!row) { res.status(404).json({ error: 'Item not in your bag' }); return; }
  if (row.category === 'potion') { res.status(400).json({ error: 'Potions cannot be enchanted.' }); return; }
  if (row.enchant_count >= 5) { res.status(400).json({ error: 'This item is fully enchanted.' }); return; }
  const cost = enchantCost(row.tier, row.enchant_count);

  // Atomic gold debit — fails if the balance moved.
  const spent = db
    .prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?')
    .run(cost, char.id, cost);
  if (spent.changes !== 1) {
    res.status(400).json({ error: `Not enough gold (${cost}g required).` });
    return;
  }

  const weights = RARITY_WEIGHTS[row.rarity] || RARITY_WEIGHTS.common;
  let bucket = rollBucket(weights);

  // Anvil Ward (from the Trial Cache) consumes one stack and converts a
  // would-be shatter into a guaranteed small enchant. This closes the
  // Tower → Trial Cache → Forge loop.
  //
  // Audit security #7: the previous version read `forge_guarantees` from
  // the in-memory `char` row, converted the bucket optimistically, then
  // tried to debit with a guarded UPDATE. Two concurrent enchants could
  // both see `guarantees > 0`, both convert the shatter, but only one
  // debit ran — letting a player double-spend a single Ward. Now we
  // debit FIRST inside a single statement and only convert the bucket
  // if changes===1.
  let guaranteeUsed = false;
  if (bucket === 'shatter') {
    const info = db
      .prepare('UPDATE characters SET forge_guarantees = forge_guarantees - 1 WHERE id = ? AND forge_guarantees > 0')
      .run(char.id);
    if (info.changes === 1) {
      bucket = 'small';
      guaranteeUsed = true;
      // Sync the in-memory char row so the response carries the right
      // remaining count.
      (char as any).forge_guarantees = ((char as any).forge_guarantees || 1) - 1;
    }
  }

  if (bucket === 'shatter') {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(row.inv_id);
    logFromRequest(req, {
      category: 'inventory', action: 'forge_shatter', level: 'warn',
      character_id: char.id, target_id: row.item_id, target_type: 'item',
      message: `${char.name}'s ${row.name} shattered in the Forge`,
      meta: { cost, enchants_before: row.enchant_count, rarity: row.rarity },
    });
    res.json({ ok: true, outcome: 'shatter', message: `${row.name} shattered.`, cost });
    return;
  }

  const amount = bucket === 'small' ? 1 : bucket === 'medium' ? 2 : 3;
  const stat = BONUS_STATS[Math.floor(Math.random() * BONUS_STATS.length)];
  const bonuses = JSON.parse(row.bonuses_json || '{}') as Record<string, number>;
  bonuses[stat] = (bonuses[stat] || 0) + amount;

  db.prepare(
    `INSERT INTO inventory_enchants (inventory_id, enchant_count, bonuses_json)
     VALUES (?, ?, ?)
     ON CONFLICT(inventory_id) DO UPDATE SET enchant_count = excluded.enchant_count, bonuses_json = excluded.bonuses_json`,
  ).run(row.inv_id, row.enchant_count + 1, JSON.stringify(bonuses));

  trackBattlePass(char.id, 'forge_enchant', 1);
  trackBattlePass(char.id, 'forge_high_enchant', row.enchant_count + 1);

  logFromRequest(req, {
    category: 'inventory', action: 'forge_enchant',
    character_id: char.id, target_id: row.item_id, target_type: 'item',
    message: `${char.name} enchanted ${row.name}: +${amount} ${stat}${guaranteeUsed ? ' (Ward used)' : ''}`,
    meta: { cost, bucket, stat, amount, enchants: row.enchant_count + 1, rarity: row.rarity, guarantee_used: guaranteeUsed },
  });

  res.json({
    ok: true,
    outcome: bucket,
    message: `+${amount} ${stat.replace('_bonus', '').replace('atk_max', 'attack')}`,
    stat,
    amount,
    cost,
    new_enchants: row.enchant_count + 1,
    new_bonuses: bonuses,
    guarantee_used: guaranteeUsed,
    guarantees_remaining: Math.max(0, ((char as any).forge_guarantees || 0) - (guaranteeUsed ? 1 : 0)),
  });
});

export default router;
