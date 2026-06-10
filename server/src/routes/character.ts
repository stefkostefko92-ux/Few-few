import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { classBaseStats, regenerateEnergy } from '../game/progression';
import { deriveStats } from '../game/stats';
import { loadEquipped } from '../game/equipment';
import { STAT_KEYS, parseCounts, nextUpgradeCost, batchCost, type StatKey } from '../game/upgrade';
import type { Character, CharacterClass, InventoryEntry, Item } from '../types/domain';
import { logFromRequest } from '../lib/logger';

const router = Router();
router.use(authRequired);

const createSchema = z.object({
  name: z.string().min(3).max(20).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/),
  class: z.enum(['warrior', 'ranger', 'mage', 'rogue']),
  gender: z.enum(['male', 'female']).default('male'),
  portrait: z.string().max(50).default('default'),
});

router.post('/create', (req, res) => {
  const parse = createSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const { name, class: cls, gender, portrait } = parse.data;
  const db = getDb();
  // Enforce one character per account.
  const owned = db.prepare('SELECT id, name FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number; name: string } | undefined;
  if (owned) {
    res.status(409).json({ error: `You already have a character (${owned.name}). Only one hero may be active per account — delete the existing one from Settings before creating a new one.` });
    return;
  }
  const taken = db.prepare('SELECT id FROM characters WHERE name = ?').get(name);
  if (taken) {
    res.status(409).json({ error: `The name "${name}" is already taken. Try another.` });
    return;
  }
  const base = classBaseStats(cls as CharacterClass);
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO characters (
      user_id, name, class, gender, portrait, level, xp, gold, stat_points, skill_points,
      hp, hp_max, mp, mp_max,
      strength, dexterity, constitution, intelligence, charisma, wisdom,
      skill_sword, skill_axe, skill_bow, skill_staff, skill_magic, skill_stealth,
      energy, energy_max, energy_updated_at, arena_rating, wins, losses, created_at
    ) VALUES (?, ?, ?, ?, ?, 1, 0, 50, 0, 0, 80, 80, 20, 20, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 100, 100, ?, 1000, 0, 0, ?)
  `);
  const result = stmt.run(
    req.auth!.uid,
    name,
    cls,
    gender,
    portrait,
    base.strength,
    base.dexterity,
    base.constitution,
    base.intelligence,
    base.charisma,
    base.wisdom,
    base.skill_sword ?? 0,
    base.skill_axe ?? 0,
    base.skill_bow ?? 0,
    base.skill_staff ?? 0,
    base.skill_magic ?? 0,
    base.skill_stealth ?? 0,
    now,
    now,
  );
  // Grant starter equipment
  const charId = result.lastInsertRowid as number;
  const starterMap: Record<CharacterClass, string[]> = {
    warrior: ['iron_sword', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots', 'wooden_shield'],
    ranger: ['short_bow', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
    mage: ['novice_staff', 'cloth_hood', 'cloth_robe', 'cloth_gloves', 'cloth_shoes'],
    rogue: ['rusty_dagger', 'leather_helm', 'leather_armor', 'leather_gloves', 'leather_boots'],
  };
  const slotMap: Record<string, string> = {
    weapon: 'weapon',
    helm: 'helm',
    armor: 'armor',
    gloves: 'gloves',
    boots: 'boots',
    shield: 'offhand',
  };
  const slugs = starterMap[cls as CharacterClass];
  const itemStmt = db.prepare('SELECT * FROM items WHERE slug = ?');
  const invStmt = db.prepare(
    'INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 1, ?)',
  );
  for (const slug of slugs) {
    const item = itemStmt.get(slug) as Item | undefined;
    if (!item) continue;
    invStmt.run(charId, item.id, slotMap[item.category] || '');
  }
  // 3 health potions
  const potion = itemStmt.get('lesser_health_potion') as Item | undefined;
  if (potion) {
    db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 3, 0, '')").run(
      charId,
      potion.id,
    );
  }
  // Welcome mail
  db.prepare(
    'INSERT INTO mail (character_id, from_name, subject, body, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    charId,
    'King Aldovar',
    'Welcome to Nexus Dominion',
    `Brave ${name}, your deeds are awaited across the realm. Begin in the Whispering Woods — slay beasts, complete quests, and grow strong. The realm of Nexus depends on heroes like you.`,
    now,
  );

  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId) as Character;
  logFromRequest(req, {
    category: 'character',
    action: 'created',
    character_id: charId,
    message: `New ${cls} ${name} stepped into the realm`,
    meta: { name, class: cls, gender, portrait },
  });
  res.status(201).json({ character: char });
});

router.get('/me', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character. Create one first.' });
    return;
  }
  regenerateEnergy(char);
  // HP rework: out of combat, the hero is always at full health. HP only
  // matters during combat (the combat scene drives its own in-fight HP via
  // rounds_json). Persisting full HP here means players never need potions
  // or rests just to survive.
  char.hp = char.hp_max;
  char.mp = char.mp_max;
  db.prepare('UPDATE characters SET energy = ?, energy_updated_at = ?, hp = hp_max, mp = mp_max WHERE id = ?').run(
    char.energy,
    char.energy_updated_at,
    char.id,
  );
  // Pull equipment & derived stats
  const derived = deriveStats(char, loadEquipped(char.id));
  // Out of combat: hp / mp are ALWAYS at the derived max.
  char.hp_max = derived.hp_max;
  char.mp_max = derived.mp_max;
  char.hp = char.hp_max;
  char.mp = char.mp_max;
  db.prepare('UPDATE characters SET hp_max = ?, mp_max = ?, hp = hp_max, mp = mp_max WHERE id = ?')
    .run(char.hp_max, char.mp_max, char.id);
  // Action cooldowns are exposed here so the global timer in the app shell
  // can render without a separate request per page mount.
  const cooldownRows = db
    .prepare('SELECT action_kind, next_available_at FROM character_cooldowns WHERE character_id = ?')
    .all(char.id) as { action_kind: string; next_available_at: number }[];
  const cooldowns = Object.fromEntries(cooldownRows.map((r) => [r.action_kind, r.next_available_at]));
  res.json({ character: char, derived, cooldowns });
});

const spendStatSchema = z.object({
  strength: z.number().int().min(0).default(0),
  dexterity: z.number().int().min(0).default(0),
  constitution: z.number().int().min(0).default(0),
  intelligence: z.number().int().min(0).default(0),
  charisma: z.number().int().min(0).default(0),
  wisdom: z.number().int().min(0).default(0),
});

/* =========================================================
   Gold-driven stat & skill upgrades.
   Each stat scales independently with a 5-10-15-20-25... curve.
   ========================================================= */

router.get('/upgrade-costs', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const counts = parseCounts((char as any).stat_upgrades);
  const costs: Record<string, { current_value: number; upgrades: number; next_cost: number }> = {};
  for (const key of STAT_KEYS) {
    const upgrades = counts[key] || 0;
    costs[key] = {
      current_value: (char as any)[key],
      upgrades,
      next_cost: nextUpgradeCost(upgrades),
    };
  }
  res.json({ costs, gold: char.gold });
});

const upgradeStatSchema = z.object({
  stat: z.enum([
    'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
    'skill_sword', 'skill_axe', 'skill_bow', 'skill_staff', 'skill_magic', 'skill_stealth',
  ]),
  count: z.number().int().min(1).max(50).default(1),
});

router.post('/upgrade-stat', (req, res) => {
  const parse = upgradeStatSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const counts = parseCounts((char as any).stat_upgrades);
  const stat = parse.data.stat as StatKey;
  const want = parse.data.count;
  const currentCount = counts[stat] || 0;
  const totalCost = batchCost(currentCount, want);
  if (char.gold < totalCost) {
    res.status(400).json({ error: `Not enough gold. Need ${totalCost}g.` });
    return;
  }
  counts[stat] = currentCount + want;
  // Atomic — same race protection as the shop. The `stat` column name is from a
  // Zod enum (allowlist), so template-interpolating it is safe by construction,
  // but we still gate the spend on `gold >= ?` so two concurrent requests can't
  // both win.
  const updated = db
    .prepare(
      `UPDATE characters SET ${stat} = ${stat} + ?, gold = gold - ?, stat_upgrades = ?
       WHERE id = ? AND gold >= ?`,
    )
    .run(want, totalCost, JSON.stringify(counts), char.id, totalCost);
  if (updated.changes !== 1) {
    res.status(400).json({ error: 'Gold balance changed — please retry.' });
    return;
  }
  logFromRequest(req, {
    category: 'character',
    action: 'upgrade_stat',
    character_id: char.id,
    message: `${char.name} +${want} ${stat} for ${totalCost}g`,
    meta: { stat, count: want, gold_spent: totalCost, new_value: (char as any)[stat] + want, new_upgrades: currentCount + want },
  });
  res.json({
    ok: true,
    stat,
    gained: want,
    gold_spent: totalCost,
    new_value: (char as any)[stat] + want,
    new_upgrades: currentCount + want,
    next_cost: nextUpgradeCost(currentCount + want),
    gold_remaining: char.gold - totalCost,
  });
});

router.post('/rest', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  // Audit (backend round): the prior JS-side energy check + separate
  // UPDATE let two parallel /rest calls both spend 10 energy from the
  // same starting value, sometimes going negative. The CAS UPDATE-
  // WHERE energy >= 10 makes it impossible for two parallel calls to
  // both succeed regardless of how the JS scheduler interleaves them.
  const upd = db.prepare(
    'UPDATE characters SET hp = hp_max, mp = mp_max, energy = energy - 10 WHERE id = ? AND energy >= 10',
  ).run(ch.id);
  if (upd.changes !== 1) {
    res.status(400).json({ error: 'Not enough energy to rest (need 10).' });
    return;
  }
  res.json({ ok: true });
});

/* Spend gems to clear every active action cooldown immediately. */
router.post('/skip-cooldowns', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  // Audit (balance landmine #3): used to charge 1 flat gem to wipe
  // every cooldown, so the daily 3-50 gem trickle bought 60+ free
  // skips a month and trivialised the cooldown pacing entirely. Now
  // priced per minute of total cooldown waited, capped at 50 gems —
  // mass skips of a 20-minute hunt + dungeon + arena stack cost ~10
  // gems, a single 30 s skip stays 1 gem.
  const now = Date.now();
  const cooldowns = db
    .prepare('SELECT action_kind, next_available_at FROM character_cooldowns WHERE character_id = ? AND next_available_at > ?')
    .all(char.id, now) as { action_kind: string; next_available_at: number }[];
  if (cooldowns.length === 0) { res.status(400).json({ error: 'No active cooldowns to skip.' }); return; }
  const totalMs = cooldowns.reduce((s, c) => s + (c.next_available_at - now), 0);
  const gemCost = Math.min(50, Math.max(1, Math.ceil(totalMs / 60_000)));
  const debit = db
    .prepare('UPDATE characters SET gems = gems - ?, total_gems_spent = total_gems_spent + ? WHERE id = ? AND gems >= ?')
    .run(gemCost, gemCost, char.id, gemCost);
  if (debit.changes !== 1) { res.status(400).json({ error: `Need ${gemCost} gems to skip these cooldowns.` }); return; }
  const cleared = db.prepare('DELETE FROM character_cooldowns WHERE character_id = ?').run(char.id);
  logFromRequest(req, {
    category: 'character', action: 'skip_cooldowns',
    character_id: char.id,
    message: `${char.name} spent ${gemCost} gems to clear ${cleared.changes} cooldowns`,
    meta: { cleared: cleared.changes, gem_cost: gemCost, total_ms: totalMs },
  });
  res.json({ ok: true, cleared: cleared.changes, gem_cost: gemCost, gems: (char as any).gems - gemCost });
});

export default router;
