import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';
import { MOUNT_ADDONS } from '../game/mountAddons';
import type { Character } from '../types/domain';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Mount shop — premium-currency only.
 *
 * Mounts are inventory items (category='misc', sub_type='mount'). They carry:
 *   - cooldown_reduction_pct  (mechanical property on items table — NOT a
 *                              "bonus", lives on a dedicated column)
 *   - two combat-stat bonuses chosen from:
 *       phys_dmg_bonus / phys_def_bonus / mag_dmg_bonus / mag_def_bonus
 *
 * The combat stats flow through deriveStats like any other equipped gear.
 * The cooldown reduction is read by game/cooldowns.ts whenever a new
 * cooldown is rolled.
 * ======================================================================= */

interface MountDef {
  slug: string;
  name: string;
  description: string;
  gem_cost: number;
  rarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
  tier: number;
  cooldown_reduction_pct: number;
  phys_dmg_bonus: number;
  phys_def_bonus: number;
  mag_dmg_bonus: number;
  mag_def_bonus: number;
}

const MOUNTS: MountDef[] = [
  {
    slug: 'mount_riding_horse',
    name: 'Riding Horse',
    description: 'A sturdy plains-bred mare. Common kit for a roving sellsword.',
    gem_cost: 50,
    rarity: 'uncommon', tier: 1,
    cooldown_reduction_pct: 15,
    phys_dmg_bonus: 4, phys_def_bonus: 4, mag_dmg_bonus: 0, mag_def_bonus: 0,
  },
  {
    slug: 'mount_warhound',
    name: 'War Hound',
    description: 'Trained in Mistmoor arenas. Bred to draw blood beside its rider.',
    gem_cost: 120,
    rarity: 'rare', tier: 2,
    cooldown_reduction_pct: 25,
    phys_dmg_bonus: 10, phys_def_bonus: 8, mag_dmg_bonus: 0, mag_def_bonus: 0,
  },
  {
    slug: 'mount_arcwing_drake',
    name: 'Arcwing Drake',
    description: 'A lesser drake bred in the Conclave roosts. Conducts ambient ley-line surge.',
    gem_cost: 250,
    rarity: 'rare', tier: 3,
    cooldown_reduction_pct: 35,
    phys_dmg_bonus: 0, phys_def_bonus: 0, mag_dmg_bonus: 14, mag_def_bonus: 12,
  },
  {
    slug: 'mount_solar_courser',
    name: 'Solar Courser',
    description: 'Hooves like polished brass; mane of midday light. Standard of the realm guard.',
    gem_cost: 500,
    rarity: 'epic', tier: 4,
    cooldown_reduction_pct: 50,
    phys_dmg_bonus: 22, phys_def_bonus: 18, mag_dmg_bonus: 8, mag_def_bonus: 6,
  },
  // ───── Higher tiers ─────────────────────────────────────────────────
  {
    slug: 'mount_voidstrider',
    name: 'Voidstrider',
    description: 'A spectral beast pulled from the Shadowfell\'s edge. Its hoofprints darken the sky.',
    gem_cost: 900,
    rarity: 'epic', tier: 5,
    cooldown_reduction_pct: 65,
    phys_dmg_bonus: 18, phys_def_bonus: 14, mag_dmg_bonus: 26, mag_def_bonus: 22,
  },
  {
    slug: 'mount_crowned_griffin',
    name: 'Crowned Griffin',
    description: 'Once the mount of the lost regents. Wings of beaten gold; eyes of pure judgement.',
    gem_cost: 1500,
    rarity: 'legendary', tier: 6,
    cooldown_reduction_pct: 75,
    phys_dmg_bonus: 38, phys_def_bonus: 28, mag_dmg_bonus: 22, mag_def_bonus: 22,
  },
  {
    // The best mount ships as a cheap base — its 90% cooldown reduction is
    // the whole package at 1000 gems. Its combat-stat lines are bought
    // separately as à-la-carte add-ons (see ADDONS), 500 gems each.
    slug: 'mount_world_serpent',
    name: 'World Serpent',
    description: 'A bound fragment of the snake that once swallowed the sky. The realm bends to its rider.',
    gem_cost: 1000,
    rarity: 'legendary', tier: 7,
    cooldown_reduction_pct: 90,
    phys_dmg_bonus: 0, phys_def_bonus: 0, mag_dmg_bonus: 0, mag_def_bonus: 0,
  },
];


function ensureMountItems(): void {
  const db = getDb();
  for (const m of MOUNTS) {
    const exists = db.prepare('SELECT id, cooldown_reduction_pct, phys_dmg_bonus FROM items WHERE slug = ?').get(m.slug) as any;
    if (exists) {
      // Keep the catalog as the source of truth — refresh on boot so
      // tuning changes propagate without a reseed.
      db.prepare(
        `UPDATE items SET
           cooldown_reduction_pct = ?, phys_dmg_bonus = ?, phys_def_bonus = ?,
           mag_dmg_bonus = ?, mag_def_bonus = ?, rarity = ?, tier = ?,
           description = ?, name = ?
         WHERE id = ?`,
      ).run(
        m.cooldown_reduction_pct, m.phys_dmg_bonus, m.phys_def_bonus,
        m.mag_dmg_bonus, m.mag_def_bonus, m.rarity, m.tier,
        m.description, m.name, exists.id,
      );
      continue;
    }
    db.prepare(
      `INSERT INTO items (slug, name, category, sub_type, tier, rarity, level_req, class_req,
         atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus,
         int_bonus, cha_bonus, wis_bonus, heal_hp, heal_mp, buy_price, sell_price, icon, description, set_slug,
         phys_dmg_bonus, phys_def_bonus, mag_dmg_bonus, mag_def_bonus, cooldown_reduction_pct)
       VALUES (?, ?, 'misc', 'mount', ?, ?, 1, '',
               0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'icon-portal', ?, '',
               ?, ?, ?, ?, ?)`,
    ).run(
      m.slug, m.name, m.tier, m.rarity, m.description,
      m.phys_dmg_bonus, m.phys_def_bonus, m.mag_dmg_bonus, m.mag_def_bonus, m.cooldown_reduction_pct,
    );
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
  const purchasedAddons = db
    .prepare('SELECT mount_slug, addon_key FROM mount_addons WHERE character_id = ?')
    .all(char.id) as { mount_slug: string; addon_key: string }[];
  const addonSet = new Set(purchasedAddons.map((a) => `${a.mount_slug}:${a.addon_key}`));
  res.json({
    gems: (char as any).gems || 0,
    active_mount_inventory_id: (char as any).mount_inventory_id || 0,
    owned,
    catalog: MOUNTS.map((m) => ({
      ...m,
      owned: ownedSlugs.has(m.slug),
      addons: (MOUNT_ADDONS[m.slug] || []).map((a) => ({
        ...a,
        purchased: addonSet.has(`${m.slug}:${a.key}`),
      })),
    })),
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
  const already = db
    .prepare(`SELECT inv.id FROM inventory inv JOIN items ON items.id = inv.item_id WHERE inv.character_id = ? AND items.slug = ?`)
    .get(char.id, mount.slug) as any;
  if (already) { res.status(400).json({ error: `You already own ${mount.name}.` }); return; }

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
    meta: { slug: mount.slug, gem_cost: mount.gem_cost, tier: mount.tier, rarity: mount.rarity },
  });
  res.json({ ok: true, mount_inv_id: ins.lastInsertRowid });
});

const addonSchema = z.object({ slug: z.string(), addonKey: z.string() });
router.post('/addon/buy', (req, res) => {
  const parse = addonSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const addons = MOUNT_ADDONS[parse.data.slug] || [];
  const addon = addons.find((a) => a.key === parse.data.addonKey);
  if (!addon) { res.status(404).json({ error: 'Unknown add-on' }); return; }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  // Must own the mount the add-on belongs to.
  const ownsMount = db
    .prepare(`SELECT inv.id FROM inventory inv JOIN items ON items.id = inv.item_id WHERE inv.character_id = ? AND items.slug = ?`)
    .get(char.id, parse.data.slug) as any;
  if (!ownsMount) { res.status(400).json({ error: 'You must own the mount first.' }); return; }
  // Already bought?
  const have = db
    .prepare('SELECT 1 FROM mount_addons WHERE character_id = ? AND mount_slug = ? AND addon_key = ?')
    .get(char.id, parse.data.slug, addon.key);
  if (have) { res.status(400).json({ error: 'You already own that add-on.' }); return; }

  const debit = db
    .prepare('UPDATE characters SET gems = gems - ?, total_gems_spent = total_gems_spent + ? WHERE id = ? AND gems >= ?')
    .run(addon.gem_cost, addon.gem_cost, char.id, addon.gem_cost);
  if (debit.changes !== 1) { res.status(400).json({ error: `Need ${addon.gem_cost} gems.` }); return; }

  db.prepare('INSERT INTO mount_addons (character_id, mount_slug, addon_key, bought_at) VALUES (?, ?, ?, ?)')
    .run(char.id, parse.data.slug, addon.key, Date.now());

  logFromRequest(req, {
    category: 'payment', action: 'mount_addon_buy',
    character_id: char.id,
    target_type: 'item',
    message: `${char.name} bought ${addon.label} add-on for ${parse.data.slug}`,
    meta: { slug: parse.data.slug, addon: addon.key, amount: addon.amount, gem_cost: addon.gem_cost },
  });
  res.json({ ok: true });
});

router.post('/equip', (req, res) => {
  const invId = Number(req.body?.inventoryId);
  if (invId === undefined || invId === null) { res.status(400).json({ error: 'inventoryId required (0 to unequip)' }); return; }
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  if (invId === 0) {
    db.prepare('UPDATE characters SET mount_inventory_id = 0 WHERE id = ?').run(char.id);
    res.json({ ok: true });
    return;
  }
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
