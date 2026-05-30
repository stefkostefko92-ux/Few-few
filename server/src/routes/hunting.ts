import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { regenerateEnergy, applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { applyCombatEvent } from '../game/events';
import type { Character, Monster, Item, InventoryEntry } from '../types/domain';
import { logFromRequest } from '../lib/logger';

const router = Router();
router.use(authRequired);

const REGION_ORDER = ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'];

const REGION_GATES: Record<string, number> = {
  whispering_woods: 1,
  mistmoor_hills: 6,
  crystal_caverns: 10,
  ashen_wastes: 15,
  shadowfell: 24,
};

router.get('/regions', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT level FROM characters WHERE user_id = ?').get(req.auth!.uid) as { level: number } | undefined;
  const lvl = ch?.level ?? 1;
  const rows = db
    .prepare("SELECT region, COUNT(*) AS monster_count, MIN(level) AS min_level, MAX(level) AS max_level FROM monsters GROUP BY region")
    .all() as { region: string; monster_count: number; min_level: number; max_level: number }[];
  rows.sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region));
  res.json({
    regions: rows.map((r) => ({
      ...r,
      gate: REGION_GATES[r.region] ?? 1,
      unlocked: lvl >= (REGION_GATES[r.region] ?? 1),
    })),
  });
});

const huntSchema = z.object({ region: z.string() });

router.post('/hunt', (req, res) => {
  const parse = huntSchema.safeParse(req.body);
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
  regenerateEnergy(char);
  if (char.energy < 2) {
    res.status(400).json({ error: 'Hunting costs 2 energy' });
    return;
  }
  if (char.hp <= Math.floor(char.hp_max * 0.1)) {
    res.status(400).json({ error: 'Too wounded to hunt. Rest first.' });
    return;
  }
  const gate = REGION_GATES[parse.data.region] ?? 1;
  if (char.level < gate) {
    res.status(400).json({ error: `Region requires level ${gate}` });
    return;
  }
  // Pick a monster in the region within ±3 of player's level (or any monster of region if none in range)
  let pool = db
    .prepare(`SELECT * FROM monsters WHERE region = ? AND level BETWEEN ? AND ?`)
    .all(parse.data.region, Math.max(1, char.level - 3), char.level + 2) as Monster[];
  if (pool.length === 0) {
    pool = db.prepare(`SELECT * FROM monsters WHERE region = ?`).all(parse.data.region) as Monster[];
  }
  if (pool.length === 0) {
    res.status(404).json({ error: 'No prey in this region' });
    return;
  }
  const monster = pool[Math.floor(Math.random() * pool.length)];

  // Derive hero
  const equipped = db
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id WHERE inv.character_id = ? AND inv.equipped = 1`,
    )
    .all(char.id) as any[];
  const eqList = equipped.map((row) => ({
    item: row as Item,
    entry: { id: row.inv_id, character_id: char.id, item_id: row.id, quantity: row.quantity, equipped: row.equipped, slot: row.slot } as InventoryEntry,
  }));
  const derived = deriveStats(char, eqList);
  const hero = buildHeroActor(char, derived, char.hp);
  const foe = {
    name: monster.name,
    side: 'foe' as const,
    level: monster.level,
    hp: monster.hp,
    hp_max: monster.hp,
    atk_min: monster.atk_min,
    atk_max: monster.atk_max,
    defense: monster.defense,
    speed: monster.speed,
    crit_chance: 0.06,
    dodge_chance: 0.03,
    sprite: monster.sprite,
  };
  const result = simulateCombat(hero, foe);

  let xpGain = 0;
  let goldGain = 0;
  let lvlRes = null as ReturnType<typeof applyXp> | null;
  if (result.winner === 'hero') {
    xpGain = monster.xp_reward;
    goldGain = Math.floor(monster.gold_min + Math.random() * (monster.gold_max - monster.gold_min + 1));
    char.gold += goldGain;
    lvlRes = applyXp(char, xpGain);
  }
  char.hp = Math.max(1, result.hero.hp > 0 ? result.hero.hp : 1);
  char.energy -= 2;
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, energy = ? WHERE id = ?`,
  ).run(
    char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.hp, char.mp, char.gold, char.energy, char.id,
  );

  const replayHero = { ...result.hero, hp: hero.hp };
  const replayFoe = { ...result.foe, hp: foe.hp };
  db.prepare(
    'INSERT INTO combat_log (character_id, opponent, kind, result, rounds_json, xp_gained, gold_gained, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    char.id, monster.name, 'hunt', result.winner === 'hero' ? 'win' : 'loss',
    JSON.stringify({ hero: replayHero, foe: replayFoe, rounds: result.rounds, victory: result.winner === 'hero' }),
    xpGain, goldGain, Date.now(),
  );

  const unlocked = applyCombatEvent(db, {
    characterId: char.id,
    victory: result.winner === 'hero',
    kind: 'hunt',
    xpGained: xpGain,
    goldGained: goldGain,
    monsterSlug: monster.slug,
  });

  logFromRequest(req, {
    category: 'combat',
    action: result.winner === 'hero' ? 'hunt_kill' : 'hunt_loss',
    character_id: char.id,
    target_type: 'monster',
    message: `${char.name} ${result.winner === 'hero' ? 'slew' : 'fell to'} ${monster.name}`,
    meta: { kind: 'hunt', monster: monster.slug, monster_name: monster.name, monster_level: monster.level, rounds: result.rounds.length, xp: xpGain, gold: goldGain },
  });

  res.json({
    success: result.winner === 'hero',
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
    xp: xpGain,
    gold: goldGain,
    levelUp: lvlRes && lvlRes.leveled ? lvlRes : null,
    unlocked,
    monsterSlug: monster.slug,
  });
});

export default router;
