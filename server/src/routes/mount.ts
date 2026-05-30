import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';
import type { Character } from '../types/domain';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Mount shop — premium-currency only.
 *
 * Each mount is an inventory item (category='misc', sub_type='mount').
 * It has two skills repurposed onto existing columns to skip a migration:
 *   wis_bonus → cooldown_reduction_pct (1..80)
 *   cha_bonus → bonus_gold_pct         (0..40)
 * The mount slot lives on characters.mount_inventory_id (0 = none).
 *
 * The mount is consulted by game/cooldowns.ts when rolling new cooldowns
 * (any time a route calls setCooldown) and by mountGoldBonusPct() for
 * extra gold on rewards. Players can swap mounts freely.
 * ======================================================================= */

interface MountDef {
  slug: string;
  name: string;
  description: string;
  gem_cost: number;
  cooldown_reduction_pct: number;
  bonus_gold_pct: number;
}

const MOUNTS: MountDef[] = [
  {
    slug: 'mount_riding_horse',
    name: 'Riding Horse',
    description: 'A sturdy plains-bred mare. Fast enough for road-work, modest gold haul.',
    gem_cost: 200,
    cooldown_reduction_pct: 15,
    bonus_gold_pct: 5,
  },
  {
    slug: 'mount_warhound',
    name: 'War Hound',
    description: 'Trained in the arenas of Mistmoor. Cuts down recovery and sniffs out coin.',
    gem_cost: 500,
    cooldown_reduction_pct: 30,
    bonus_gold_pct: 12,
  },
  {
    slug: 'mount_arcwing_drake',
    name: 'Arcwing Drake',
    description: 'A lesser drake bred in the Conclave roosts. The Adept\'s favoured mount.',
    gem_cost: 1200,
    cooldown_reduction_pct: 50,
    bonus_gold_pct: 22,
  },
  {
    slug: 'mount_solar_courser',
    name: 'Solar Courser',
    description: 'Hooves like polished brass; mane of midday light. The realm\'s fastest mount.',
    gem_cost: 2800,
    cooldown_reduction_pct: 70,
    bonus_gold_pct: 35,
  },
];

function ensureMountItems(): void {
  const db = getDb();
  for (const m of MOUNTS) {
    const exists = db.prepare('SELECT id FROM items WHERE slug = ?').get(m.slug) as any;
    if (exists) continue;
    db.prepare(
      `INSERT INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req,
         atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus,
         int_bonus, cha_bonus, wis_bonus, heal_hp, heal_mp, buy_price, sell_price, icon, description, set_slug)
       VALUES (?, ?, 'misc', 'mount', 1, 'epic', 1, '',
               0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, 0, 0, 0, 0, 'icon-portal', ?, '')`,
    ).run(m.slug, m.name, m.bonus_gold_pct, m.cooldown_reduction_pct, m.description);
  }
}

router.get('/', (req, res) => {
  ensureMountItems();
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const owned = db
    .prepare(
      `SELECT inv.id AS inv_id, items.slug, items.name
       FROM inventory inv JOIN items ON items.id = inv.item_id
       WHERE inv.character_id = ? AND items.sub_type = 'mount'`,
    )
    .all(char.id) as { inv_id: number; slug: string; name: string }[];
  const ownedSlugs = new Set(owned.map((o) => o.slug));
  res.json({
    gems: (char as any).gems || 0,
    active_mount_inventory_id: (char as any).mount_inventory_id || 0,
    owned,
    catalog: MOUNTS.map((m) => ({ ...m, owned: ownedSlugs.has(m.slug) })),
  });
});

const buySchema = z.object({ slug: z.string() });
router.post('/buy', (req, res) => {
  ensureMountItems();
  const parse = buySchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const mount = MOUNTS.find((m) => m.slug === parse.data.slug);
  if (!mount) { res.status(404).json({ error: 'Unknown mount' }); return; }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  // Already owned?
  const already = db
    .prepare(`SELECT inv.id FROM inventory inv JOIN items ON items.id = inv.item_id WHERE inv.character_id = ? AND items.slug = ?`)
    .get(char.id, mount.slug) as any;
  if (already) { res.status(400).json({ error: `You already own ${mount.name}.` }); return; }

  // Atomic gem debit.
  const debit = db
    .prepare('UPDATE characters SET gems = gems - ?, total_gems_spent = total_gems_spent + ? WHERE id = ? AND gems >= ?')
    .run(mount.gem_cost, mount.gem_cost, char.id, mount.gem_cost);
  if (debit.changes !== 1) { res.status(400).json({ error: `Need ${mount.gem_cost} gems.` }); return; }

  const item = db.prepare('SELECT id FROM items WHERE slug = ?').get(mount.slug) as any;
  const ins = db.prepare(
    `INSERT INTO inventory (character_id, item_id, quantity, equipped, slot, soul_bound) VALUES (?, ?, 1, 0, '', 1)`,
  ).run(char.id, item.id);

  logFromRequest(req, {
    category: 'payment', action: 'mount_buy',
    character_id: char.id,
    target_type: 'item',
    message: `${char.name} bought ${mount.name} for ${mount.gem_cost} gems`,
    meta: { slug: mount.slug, gem_cost: mount.gem_cost },
  });
  res.json({ ok: true, mount_inv_id: ins.lastInsertRowid });
});

router.post('/equip', (req, res) => {
  const invId = Number(req.body?.inventoryId);
  if (!invId && invId !== 0) { res.status(400).json({ error: 'inventoryId required (0 to unequip)' }); return; }
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  if (invId === 0) {
    db.prepare('UPDATE characters SET mount_inventory_id = 0 WHERE id = ?').run(char.id);
    res.json({ ok: true });
    return;
  }
  // Validate the inventory belongs to this hero and is a mount.
  const row = db
    .prepare(
      `SELECT inv.id FROM inventory inv JOIN items ON items.id = inv.item_id
       WHERE inv.id = ? AND inv.character_id = ? AND items.sub_type = 'mount'`,
    )
    .get(invId, char.id) as any;
  if (!row) { res.status(404).json({ error: 'Mount not in your bag' }); return; }
  db.prepare('UPDATE characters SET mount_inventory_id = ? WHERE id = ?').run(invId, char.id);
  res.json({ ok: true });
});

export default router;
