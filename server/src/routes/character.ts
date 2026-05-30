import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { classBaseStats, regenerateEnergy } from '../game/progression';
import { deriveStats } from '../game/stats';
import type { Character, CharacterClass, InventoryEntry, Item } from '../types/domain';

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
  const existing = db.prepare('SELECT id FROM characters WHERE user_id = ? OR name = ?').get(req.auth!.uid, name);
  if (existing) {
    res.status(409).json({ error: 'A character already exists or that name is taken' });
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
  db.prepare('UPDATE characters SET energy = ?, energy_updated_at = ? WHERE id = ?').run(
    char.energy,
    char.energy_updated_at,
    char.id,
  );
  // Pull equipment & derived stats
  const equipped = db
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id WHERE inv.character_id = ? AND inv.equipped = 1`,
    )
    .all(char.id) as (Item & InventoryEntry)[];
  const eqList = equipped.map((row) => ({
    item: row as unknown as Item,
    entry: { id: (row as any).inv_id, character_id: char.id, item_id: row.id, quantity: row.quantity, equipped: row.equipped, slot: row.slot } as InventoryEntry,
  }));
  const derived = deriveStats(char, eqList);
  // Sync hp_max
  if (char.hp_max !== derived.hp_max) {
    char.hp_max = derived.hp_max;
    if (char.hp > char.hp_max) char.hp = char.hp_max;
    db.prepare('UPDATE characters SET hp_max = ?, hp = ? WHERE id = ?').run(char.hp_max, char.hp, char.id);
  }
  if (char.mp_max !== derived.mp_max) {
    char.mp_max = derived.mp_max;
    if (char.mp > char.mp_max) char.mp = char.mp_max;
    db.prepare('UPDATE characters SET mp_max = ?, mp = ? WHERE id = ?').run(char.mp_max, char.mp, char.id);
  }
  res.json({ character: char, derived });
});

const spendStatSchema = z.object({
  strength: z.number().int().min(0).default(0),
  dexterity: z.number().int().min(0).default(0),
  constitution: z.number().int().min(0).default(0),
  intelligence: z.number().int().min(0).default(0),
  charisma: z.number().int().min(0).default(0),
  wisdom: z.number().int().min(0).default(0),
});

router.post('/stats/spend', (req, res) => {
  const parse = spendStatSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const total =
    parse.data.strength +
    parse.data.dexterity +
    parse.data.constitution +
    parse.data.intelligence +
    parse.data.charisma +
    parse.data.wisdom;
  if (total <= 0) {
    res.status(400).json({ error: 'No points spent' });
    return;
  }
  if (total > char.stat_points) {
    res.status(400).json({ error: 'Not enough stat points' });
    return;
  }
  db.prepare(
    `UPDATE characters SET
      strength = strength + ?,
      dexterity = dexterity + ?,
      constitution = constitution + ?,
      intelligence = intelligence + ?,
      charisma = charisma + ?,
      wisdom = wisdom + ?,
      stat_points = stat_points - ?
     WHERE id = ?`,
  ).run(
    parse.data.strength,
    parse.data.dexterity,
    parse.data.constitution,
    parse.data.intelligence,
    parse.data.charisma,
    parse.data.wisdom,
    total,
    char.id,
  );
  res.json({ ok: true });
});

const spendSkillSchema = z.object({
  sword: z.number().int().min(0).default(0),
  axe: z.number().int().min(0).default(0),
  bow: z.number().int().min(0).default(0),
  staff: z.number().int().min(0).default(0),
  magic: z.number().int().min(0).default(0),
  stealth: z.number().int().min(0).default(0),
});

router.post('/skills/spend', (req, res) => {
  const parse = spendSkillSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const total =
    parse.data.sword + parse.data.axe + parse.data.bow + parse.data.staff + parse.data.magic + parse.data.stealth;
  if (total <= 0) {
    res.status(400).json({ error: 'No points spent' });
    return;
  }
  if (total > char.skill_points) {
    res.status(400).json({ error: 'Not enough skill points' });
    return;
  }
  db.prepare(
    `UPDATE characters SET
      skill_sword = skill_sword + ?,
      skill_axe = skill_axe + ?,
      skill_bow = skill_bow + ?,
      skill_staff = skill_staff + ?,
      skill_magic = skill_magic + ?,
      skill_stealth = skill_stealth + ?,
      skill_points = skill_points - ?
     WHERE id = ?`,
  ).run(
    parse.data.sword,
    parse.data.axe,
    parse.data.bow,
    parse.data.staff,
    parse.data.magic,
    parse.data.stealth,
    total,
    char.id,
  );
  res.json({ ok: true });
});

router.post('/rest', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  // Resting consumes 10 energy and fully restores HP/MP
  if (char.energy < 10) {
    res.status(400).json({ error: 'Not enough energy to rest (need 10).' });
    return;
  }
  db.prepare('UPDATE characters SET hp = hp_max, mp = mp_max, energy = energy - 10 WHERE id = ?').run(char.id);
  res.json({ ok: true });
});

export default router;
