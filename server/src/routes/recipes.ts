import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';
import { trackBattlePass } from './battlepass';
import type { Character } from '../types/domain';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Forge Recipe Board — combine items from other loops into socketable gems
 * that buff weapons. The chain is:
 *
 *   Bounties → Monster Trophy
 *                    │
 *                    ▼
 *   Trial Cache → Mythic Elixir of {stat}
 *                    │
 *                    ▼
 *              Recipe Board (here)
 *                    │
 *                    ▼
 *         Socketed Gem (Inventory item)
 *                    │
 *                    ▼
 *   Forge → "socket" applies the gem permanently to a weapon's bonus.
 *
 * Gems are NEW inventory items minted on demand:
 *   gem_might (+strength)         from monster_trophy + mythic_strength
 *   gem_swiftness (+dexterity)    from monster_trophy + mythic_dexterity
 *   gem_mind (+intelligence)      from monster_trophy + mythic_intelligence
 *
 * Each recipe also costs gold (the forge bill). A successful brew destroys
 * the input items and adds the gem to your bag. Sockets are applied via a
 * separate POST /recipes/socket call that consumes a gem + an equipped or
 * bagged weapon, increasing its bonus stat permanently.
 *
 * Connects every loop touched so far: bounties (trophies), trial cache
 * (elixirs), forge (existing enchant system), inventory.
 * ======================================================================= */

interface Recipe {
  slug: string;
  name: string;
  description: string;
  gem_slug: string;          // output gem
  gem_name: string;
  socket_stat: 'str_bonus' | 'dex_bonus' | 'int_bonus';
  socket_amount: number;     // amount the gem adds when socketed
  inputs: { slug: string; quantity: number }[]; // items required
  gold_cost: number;
}

const RECIPES: Recipe[] = [
  {
    slug: 'gem_might',
    name: 'Brew · Gem of Might',
    description: 'Combine a Monster Trophy with a Mythic Elixir of Iron at the anvil. Output: a socketable gem (+4 STR on weapon).',
    gem_slug: 'gem_might',
    gem_name: 'Gem of Might',
    socket_stat: 'str_bonus',
    socket_amount: 4,
    inputs: [
      { slug: 'monster_trophy', quantity: 1 },
      // No item slug for elixirs because Trial Cache elixirs are buffs, not
      // items. The route checks the character's active_buffs for a recent
      // strength elixir instead (see ensureBuffRecentlyActive).
    ],
    gold_cost: 500,
  },
  {
    slug: 'gem_swiftness',
    name: 'Brew · Gem of Swiftness',
    description: 'Bind a Monster Trophy under a Mythic Elixir of Wind. Output: a socketable gem (+4 DEX on weapon).',
    gem_slug: 'gem_swiftness',
    gem_name: 'Gem of Swiftness',
    socket_stat: 'dex_bonus',
    socket_amount: 4,
    inputs: [{ slug: 'monster_trophy', quantity: 1 }],
    gold_cost: 500,
  },
  {
    slug: 'gem_mind',
    name: 'Brew · Gem of Mind',
    description: 'Distill a Monster Trophy with a Mythic Elixir of Mind. Output: a socketable gem (+4 INT on weapon).',
    gem_slug: 'gem_mind',
    gem_name: 'Gem of Mind',
    socket_stat: 'int_bonus',
    socket_amount: 4,
    inputs: [{ slug: 'monster_trophy', quantity: 1 }],
    gold_cost: 500,
  },
];

const RECIPE_ELIXIR_STAT: Record<string, 'strength' | 'dexterity' | 'intelligence'> = {
  gem_might: 'strength',
  gem_swiftness: 'dexterity',
  gem_mind: 'intelligence',
};

function ensureRecipeItems(): void {
  const db = getDb();
  const exists = (slug: string) => !!db.prepare('SELECT 1 FROM items WHERE slug = ?').get(slug);
  const inserts: { slug: string; name: string; description: string }[] = [
    { slug: 'gem_might',     name: 'Gem of Might',     description: 'A blood-warm garnet. Socket into a weapon for +4 STR.' },
    { slug: 'gem_swiftness', name: 'Gem of Swiftness', description: 'A wind-laced peridot. Socket into a weapon for +4 DEX.' },
    { slug: 'gem_mind',      name: 'Gem of Mind',      description: 'A still sapphire. Socket into a weapon for +4 INT.' },
  ];
  for (const it of inserts) {
    if (exists(it.slug)) continue;
    db.prepare(
      `INSERT INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req,
         atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus,
         int_bonus, cha_bonus, wis_bonus, heal_hp, heal_mp, buy_price, sell_price, icon, description, set_slug)
       VALUES (?, ?, 'misc', 'gem', 4, 'rare', 1, '',
               0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 250, 'gem', ?, '')`,
    ).run(it.slug, it.name, it.description);
  }
}

function getChar(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
}

function hasActiveElixir(char: Character, stat: 'strength' | 'dexterity' | 'intelligence'): boolean {
  // The Mythic Elixirs from Trial Cache are pushed into characters.active_buffs
  // with { stat, percent, expires_at }. As long as one is still ticking on
  // the matching stat, the recipe accepts it (the elixir is the "catalyst").
  try {
    const buffs = JSON.parse((char as any).active_buffs || '[]') as Array<{ stat: string; expires_at: number }>;
    return buffs.some((b) => b.stat === stat && b.expires_at > Date.now());
  } catch { return false; }
}

router.get('/', (req, res) => {
  ensureRecipeItems();
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const db = getDb();
  // Build a small inventory tally for the inputs.
  const trophyRows = db
    .prepare(
      `SELECT items.slug, SUM(inv.quantity) AS qty
       FROM inventory inv JOIN items ON items.id = inv.item_id
       WHERE inv.character_id = ? AND items.slug IN ('monster_trophy', 'gem_might', 'gem_swiftness', 'gem_mind')
       GROUP BY items.slug`,
    )
    .all(char.id) as { slug: string; qty: number }[];
  const tallies: Record<string, number> = {};
  for (const r of trophyRows) tallies[r.slug] = r.qty;

  res.json({
    gold: char.gold,
    tallies,
    recipes: RECIPES.map((r) => {
      const needTrophies = r.inputs.find((i) => i.slug === 'monster_trophy')?.quantity || 0;
      const stat = RECIPE_ELIXIR_STAT[r.slug];
      const elixirReady = hasActiveElixir(char, stat);
      const trophiesReady = (tallies['monster_trophy'] || 0) >= needTrophies;
      return {
        ...r,
        elixir_stat: stat,
        elixir_active: elixirReady,
        trophies_owned: tallies['monster_trophy'] || 0,
        trophies_required: needTrophies,
        can_brew: trophiesReady && elixirReady && char.gold >= r.gold_cost,
      };
    }),
  });
});

const brewSchema = z.object({ slug: z.string() });
router.post('/brew', (req, res) => {
  ensureRecipeItems();
  const parse = brewSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const recipe = RECIPES.find((r) => r.slug === parse.data.slug);
  if (!recipe) { res.status(404).json({ error: 'Unknown recipe' }); return; }
  const db = getDb();
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  // Audit (backend round): gold debit, trophy delete, and gem mint
  // were three separate statements. A crash between any two left a
  // half-consumed cost without the reward (or vice versa). Wrapping
  // in BEGIN IMMEDIATE makes the whole brew atomic — either every
  // step lands or none do.
  try {
    db.transaction(() => {
      const stat = RECIPE_ELIXIR_STAT[recipe.slug];
      if (!hasActiveElixir(char, stat)) { const e: any = new Error(`You need an active Mythic Elixir of ${stat} (from the Trial Cache).`); e.clientSafe = true; e.status = 400; throw e; }
      const trophyItem = db.prepare("SELECT id FROM items WHERE slug = 'monster_trophy'").get() as any;
      if (!trophyItem) { const e: any = new Error('Monster Trophies do not exist on this server yet.'); e.clientSafe = true; e.status = 400; throw e; }
      const have = db
        .prepare("SELECT SUM(quantity) AS qty FROM inventory WHERE character_id = ? AND item_id = ? AND equipped = 0")
        .get(char.id, trophyItem.id) as { qty: number } | undefined;
      const needTrophies = recipe.inputs.find((i) => i.slug === 'monster_trophy')?.quantity || 0;
      if ((have?.qty || 0) < needTrophies) { const e: any = new Error(`Need ${needTrophies} Monster Trophies (claim them from the Bounty Board).`); e.clientSafe = true; e.status = 400; throw e; }
      const debit = db
        .prepare('UPDATE characters SET gold = gold - ? WHERE id = ? AND gold >= ?')
        .run(recipe.gold_cost, char.id, recipe.gold_cost);
      if (debit.changes !== 1) { const e: any = new Error(`Need ${recipe.gold_cost}g for the forge bill.`); e.clientSafe = true; e.status = 400; throw e; }
      let remaining = needTrophies;
      const stacks = db
        .prepare('SELECT id, quantity FROM inventory WHERE character_id = ? AND item_id = ? AND equipped = 0 ORDER BY id ASC')
        .all(char.id, trophyItem.id) as { id: number; quantity: number }[];
      for (const s of stacks) {
        if (remaining <= 0) break;
        if (s.quantity <= remaining) {
          db.prepare('DELETE FROM inventory WHERE id = ?').run(s.id);
          remaining -= s.quantity;
        } else {
          db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(remaining, s.id);
          remaining = 0;
        }
      }
      const gemItem = db.prepare('SELECT id FROM items WHERE slug = ?').get(recipe.gem_slug) as any;
      db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, gemItem.id);
    }).immediate();
    logFromRequest(req, {
      category: 'inventory', action: 'recipe_brew',
      character_id: char.id,
      target_type: 'item',
      message: `${char.name} brewed ${recipe.gem_name}`,
      meta: { recipe: recipe.slug, gold_cost: recipe.gold_cost, elixir_stat: RECIPE_ELIXIR_STAT[recipe.slug] },
    });
    res.json({ ok: true, gem: recipe.gem_name, cost: recipe.gold_cost });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

const socketSchema = z.object({ gemInventoryId: z.number().int(), weaponInventoryId: z.number().int() });
router.post('/socket', (req, res) => {
  const parse = socketSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const db = getDb();
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }

  // Audit (backend round + security M1): two concurrent /socket calls
  // with the same gemInventoryId both passed the SELECT, both applied
  // the enchant bonus, and the decrement raced — quantity could go
  // negative AND the enchant could double-stack past the 5-cap. The
  // gem decrement is now the first write inside a transaction, gated
  // on quantity >= 1; the loser sees changes === 0 and bails. Also
  // enforces the 5-enchant cap that /forge/enchant uses.
  try {
    const result = db.transaction(() => {
      const gem = db
        .prepare(
          `SELECT inv.id AS inv_id, inv.quantity, inv.vaulted_guild_id, items.slug, items.name
           FROM inventory inv JOIN items ON items.id = inv.item_id
           WHERE inv.id = ? AND inv.character_id = ?`,
        )
        .get(parse.data.gemInventoryId, char.id) as any;
      if (!gem) { const e: any = new Error('Gem not in your bag'); e.clientSafe = true; e.status = 404; throw e; }
      if (gem.vaulted_guild_id) { const e: any = new Error('Withdraw the gem from the guild vault first'); e.clientSafe = true; e.status = 400; throw e; }
      const recipe = RECIPES.find((r) => r.gem_slug === gem.slug);
      if (!recipe) { const e: any = new Error('That item is not a gem.'); e.clientSafe = true; e.status = 400; throw e; }
      const weapon = db
        .prepare(
          `SELECT inv.id AS inv_id, inv.equipped, inv.listed, inv.vaulted_guild_id, items.id AS item_id, items.name, items.category
           FROM inventory inv JOIN items ON items.id = inv.item_id
           WHERE inv.id = ? AND inv.character_id = ?`,
        )
        .get(parse.data.weaponInventoryId, char.id) as any;
      if (!weapon) { const e: any = new Error('Weapon not in your bag'); e.clientSafe = true; e.status = 404; throw e; }
      if (weapon.vaulted_guild_id) { const e: any = new Error('Withdraw the weapon from the guild vault first'); e.clientSafe = true; e.status = 400; throw e; }
      if (weapon.listed) { const e: any = new Error('Cancel the market listing first'); e.clientSafe = true; e.status = 400; throw e; }
      if (weapon.category !== 'weapon') { const e: any = new Error('Only weapons accept gems.'); e.clientSafe = true; e.status = 400; throw e; }
      const existing = db
        .prepare('SELECT enchant_count, bonuses_json FROM inventory_enchants WHERE inventory_id = ?')
        .get(weapon.inv_id) as { enchant_count: number; bonuses_json: string } | undefined;
      const currentCount = existing?.enchant_count || 0;
      if (currentCount >= 5) { const e: any = new Error('This weapon already has 5 enchants (max).'); e.clientSafe = true; e.status = 400; throw e; }
      const dec = db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ? AND character_id = ? AND quantity >= 1').run(gem.inv_id, char.id);
      if (dec.changes !== 1) { const e: any = new Error('Gem not in your bag'); e.clientSafe = true; e.status = 404; throw e; }
      db.prepare('DELETE FROM inventory WHERE id = ? AND quantity <= 0').run(gem.inv_id);
      const bonuses: Record<string, number> = existing ? JSON.parse(existing.bonuses_json || '{}') : {};
      bonuses[recipe.socket_stat] = (bonuses[recipe.socket_stat] || 0) + recipe.socket_amount;
      const count = currentCount + 1;
      db.prepare(
        `INSERT INTO inventory_enchants (inventory_id, enchant_count, bonuses_json) VALUES (?, ?, ?)
         ON CONFLICT(inventory_id) DO UPDATE SET enchant_count = excluded.enchant_count, bonuses_json = excluded.bonuses_json`,
      ).run(weapon.inv_id, count, JSON.stringify(bonuses));
      return { recipe, weapon, bonuses, count };
    }).immediate();
    trackBattlePass(char.id, 'forge_enchant', 1);
    trackBattlePass(char.id, 'forge_high_enchant', result.count);
    logFromRequest(req, {
      category: 'inventory', action: 'recipe_socket',
      character_id: char.id,
      target_id: result.weapon.item_id,
      target_type: 'item',
      message: `${char.name} socketed ${result.recipe.gem_name} into ${result.weapon.name}`,
      meta: { gem: result.recipe.gem_slug, weapon: result.weapon.name, stat: result.recipe.socket_stat, amount: result.recipe.socket_amount, new_enchant_count: result.count },
    });
    res.json({
      ok: true,
      stat: result.recipe.socket_stat,
      amount: result.recipe.socket_amount,
      new_enchants: result.count,
      new_bonuses: result.bonuses,
    });
  } catch (e: any) {
    if (e?.clientSafe) { res.status(e.status || 400).json({ error: e.message }); return; }
    throw e;
  }
});

export default router;
