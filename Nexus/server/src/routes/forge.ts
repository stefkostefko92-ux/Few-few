import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import type { Character } from '../types/domain';
import { logFromRequest } from '../lib/logger';
import { trackBattlePass } from './battlepass';
import { RARITY_WEIGHTS, enchantCost, performEnchant, ForgeError } from '../lib/forgeExec';

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

function getChar(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
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
      `SELECT inv.id AS inv_id, inv.listed, inv.vaulted_guild_id, items.id AS item_id, items.tier, items.rarity, items.name, items.category,
              COALESCE(e.enchant_count, 0) AS enchant_count,
              COALESCE(e.bonuses_json, '{}') AS bonuses_json
       FROM inventory inv
       JOIN items ON items.id = inv.item_id
       LEFT JOIN inventory_enchants e ON e.inventory_id = inv.id
       WHERE inv.id = ? AND inv.character_id = ?`,
    )
    .get(parse.data.inventoryId, char.id) as any;
  if (!row) { res.status(404).json({ error: 'Item not in your bag' }); return; }
  if (row.vaulted_guild_id) { res.status(400).json({ error: 'Withdraw the item from the guild vault first.' }); return; }
  if (row.listed) { res.status(400).json({ error: 'Cancel the market listing first.' }); return; }
  if (row.category === 'potion') { res.status(400).json({ error: 'Potions cannot be enchanted.' }); return; }
  if (row.enchant_count >= 5) { res.status(400).json({ error: 'This item is fully enchanted.' }); return; }

  // Audit (backend round): the gold debit, the guarantee consumption and the
  // final inventory_enchants write used to be three separate statements
  // outside any transaction, each reading `row.enchant_count` captured
  // BEFORE the request even started. Two concurrent /enchant calls on the
  // SAME item both passed the pre-checks, both debited gold (each CAS check
  // on gold alone succeeds independently), and both then wrote
  // `enchant_count = row.enchant_count + 1` via the same value — a lost
  // update: the player paid for two enchants but only one stat roll ever
  // stuck (whichever UPDATE ran last silently discarded the other's bonus).
  // performEnchant() (lib/forgeExec.ts) now runs the whole
  // read→charge→roll→write sequence inside one IMMEDIATE transaction that
  // re-reads the enchant ledger fresh, so the second concurrent call sees
  // the already-advanced count and pays for its own, distinct enchant
  // instead of clobbering the first.
  let result: ReturnType<typeof performEnchant>;
  try {
    result = performEnchant(db, char.id, { inv_id: row.inv_id, item_id: row.item_id, tier: row.tier, rarity: row.rarity });
  } catch (e: any) {
    if (e instanceof ForgeError) { res.status(400).json({ error: e.message }); return; }
    throw e;
  }

  if (result.outcome === 'shatter') {
    logFromRequest(req, {
      category: 'inventory', action: 'forge_shatter', level: 'warn',
      character_id: char.id, target_id: row.item_id, target_type: 'item',
      message: `${char.name}'s ${row.name} shattered in the Forge`,
      meta: { cost: result.cost, enchants_before: result.enchantsBefore, rarity: row.rarity },
    });
    res.json({ ok: true, outcome: 'shatter', message: `${row.name} shattered.`, cost: result.cost });
    return;
  }

  trackBattlePass(char.id, 'forge_enchant', 1);
  trackBattlePass(char.id, 'forge_high_enchant', result.newEnchants!);

  logFromRequest(req, {
    category: 'inventory', action: 'forge_enchant',
    character_id: char.id, target_id: row.item_id, target_type: 'item',
    message: `${char.name} enchanted ${row.name}: +${result.amount} ${result.stat}${result.guaranteeUsed ? ' (Ward used)' : ''}`,
    meta: { cost: result.cost, bucket: result.bucket, stat: result.stat, amount: result.amount, enchants: result.newEnchants, rarity: row.rarity, guarantee_used: result.guaranteeUsed },
  });

  res.json({
    ok: true,
    outcome: result.bucket,
    message: `+${result.amount} ${result.stat!.replace('_bonus', '').replace('atk_max', 'attack')}`,
    stat: result.stat,
    amount: result.amount,
    cost: result.cost,
    new_enchants: result.newEnchants,
    new_bonuses: result.newBonuses,
    guarantee_used: result.guaranteeUsed,
    guarantees_remaining: Math.max(0, ((char as any).forge_guarantees || 0) - (result.guaranteeUsed ? 1 : 0)),
  });
});

export default router;
