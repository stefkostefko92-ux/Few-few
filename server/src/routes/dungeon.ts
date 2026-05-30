import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { regenerateEnergy, applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { applyCombatEvent, evaluateAchievements } from '../game/events';
import { DUNGEONS, findDungeon } from '../seed/dungeons';
import type { Character, Item, InventoryEntry, Monster } from '../types/domain';
import { logFromRequest } from '../lib/logger';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id, level FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number; level: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const active = db.prepare('SELECT * FROM dungeon_run WHERE character_id = ?').get(ch.id) as any;
  res.json({
    dungeons: DUNGEONS.map((d) => ({
      slug: d.slug,
      name: d.name,
      region: d.region,
      level_req: d.level_req,
      energy_cost: d.energy_cost,
      stages: d.stages.length,
      xp_bonus: d.xp_bonus,
      gold_bonus: d.gold_bonus,
      intro: d.intro,
      cooldown_hours: d.cooldown_hours,
      unlocked: ch.level >= d.level_req,
    })),
    active: active
      ? { slug: active.slug, stage: active.stage, hp: active.hp, hp_max: active.hp_max, gold_pile: active.gold_pile, xp_pile: active.xp_pile, items: JSON.parse(active.items_json || '[]') }
      : null,
  });
});

const enterSchema = z.object({ slug: z.string() });

router.post('/enter', (req, res) => {
  const parse = enterSchema.safeParse(req.body);
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
  const dungeon = findDungeon(parse.data.slug);
  if (!dungeon) {
    res.status(404).json({ error: 'Dungeon not found' });
    return;
  }
  if (char.level < dungeon.level_req) {
    res.status(400).json({ error: `Requires level ${dungeon.level_req}` });
    return;
  }
  if (char.energy < dungeon.energy_cost) {
    res.status(400).json({ error: 'Not enough energy to enter' });
    return;
  }
  if (char.hp < Math.floor(char.hp_max * 0.5)) {
    res.status(400).json({ error: 'Enter the dungeon at half health or more.' });
    return;
  }
  // Clear any prior dungeon
  db.prepare('DELETE FROM dungeon_run WHERE character_id = ?').run(char.id);
  db.prepare(
    `INSERT INTO dungeon_run (character_id, slug, stage, hp, hp_max, gold_pile, xp_pile, items_json, started_at)
     VALUES (?, ?, 0, ?, ?, 0, 0, '[]', ?)`,
  ).run(char.id, dungeon.slug, char.hp, char.hp_max, Date.now());
  char.energy -= dungeon.energy_cost;
  db.prepare('UPDATE characters SET energy = ? WHERE id = ?').run(char.energy, char.id);
  res.json({ ok: true, dungeon: dungeon.slug, totalStages: dungeon.stages.length, intro: dungeon.intro });
});

router.post('/advance', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const run = db.prepare('SELECT * FROM dungeon_run WHERE character_id = ?').get(char.id) as any;
  if (!run) {
    res.status(400).json({ error: 'You are not in a dungeon.' });
    return;
  }
  const dungeon = findDungeon(run.slug);
  if (!dungeon) {
    db.prepare('DELETE FROM dungeon_run WHERE character_id = ?').run(char.id);
    res.status(404).json({ error: 'Dungeon vanished' });
    return;
  }
  if (run.stage >= dungeon.stages.length) {
    res.status(400).json({ error: 'Dungeon already cleared. Claim rewards.' });
    return;
  }
  const stage = dungeon.stages[run.stage];
  const monster = db.prepare('SELECT * FROM monsters WHERE slug = ?').get(stage.monster_slug) as Monster | undefined;
  if (!monster) {
    res.status(500).json({ error: 'Monster missing for dungeon stage' });
    return;
  }

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
  const hero = buildHeroActor(char, derived, run.hp);

  const foe = {
    name: monster.name, side: 'foe' as const, level: monster.level, hp: monster.hp, hp_max: monster.hp,
    atk_min: monster.atk_min, atk_max: monster.atk_max, defense: monster.defense, speed: monster.speed,
    crit_chance: 0.08, dodge_chance: 0.04, sprite: monster.sprite,
  };
  const result = simulateCombat(hero, foe);
  const replayHero = { ...result.hero, hp: hero.hp };
  const replayFoe = { ...result.foe, hp: foe.hp };

  // Update dungeon run with surviving HP
  const newHp = result.winner === 'hero' ? Math.max(1, result.hero.hp) : 0;
  if (result.winner === 'hero') {
    const stageXp = Math.floor(monster.xp_reward * 1.5);
    const stageGold = Math.floor((monster.gold_min + monster.gold_max) / 2);
    const newStage = run.stage + 1;
    const items = JSON.parse(run.items_json || '[]') as string[];
    // 25% chance for a random shop-style item from the loot pool mid-run
    if (Math.random() < 0.25 && dungeon.loot_pool.length) {
      const slug = dungeon.loot_pool[Math.floor(Math.random() * dungeon.loot_pool.length)];
      items.push(slug);
    }
    db.prepare(
      'UPDATE dungeon_run SET stage = ?, hp = ?, gold_pile = gold_pile + ?, xp_pile = xp_pile + ?, items_json = ? WHERE character_id = ?',
    ).run(newStage, newHp, stageGold, stageXp, JSON.stringify(items), char.id);
  } else {
    // Failure: end run, hero leaves with 1 HP, partial XP only
    db.prepare('DELETE FROM dungeon_run WHERE character_id = ?').run(char.id);
    db.prepare('UPDATE characters SET hp = 1 WHERE id = ?').run(char.id);
  }
  // Log the fight
  db.prepare(
    'INSERT INTO combat_log (character_id, opponent, kind, result, rounds_json, xp_gained, gold_gained, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    char.id, monster.name, 'dungeon', result.winner === 'hero' ? 'win' : 'loss',
    JSON.stringify({ hero: replayHero, foe: replayFoe, rounds: result.rounds, victory: result.winner === 'hero' }),
    0, 0, Date.now(),
  );

  const unlocked = applyCombatEvent(db, {
    characterId: char.id,
    victory: result.winner === 'hero',
    kind: 'dungeon',
    xpGained: 0,
    goldGained: 0,
    monsterSlug: monster.slug,
  });

  logFromRequest(req, {
    category: 'combat',
    action: result.winner === 'hero' ? 'dungeon_stage_clear' : 'dungeon_wipe',
    character_id: char.id,
    target_type: 'dungeon',
    message: `${char.name} ${result.winner === 'hero' ? 'cleared' : 'fell on'} ${dungeon.name} stage ${run.stage + 1}`,
    meta: { dungeon: dungeon.slug, stage: run.stage + 1, total_stages: dungeon.stages.length, monster: monster.slug, rounds: result.rounds.length },
  });

  const updatedRun = db.prepare('SELECT * FROM dungeon_run WHERE character_id = ?').get(char.id) as any;
  res.json({
    success: result.winner === 'hero',
    stage: run.stage + 1,
    totalStages: dungeon.stages.length,
    narration: stage.narration,
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
    unlocked,
    finished: !updatedRun,
    cleared: result.winner === 'hero' && (updatedRun?.stage ?? 0) >= dungeon.stages.length,
    pile: updatedRun ? { gold: updatedRun.gold_pile, xp: updatedRun.xp_pile, items: JSON.parse(updatedRun.items_json || '[]') } : null,
  });
});

router.post('/claim', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const run = db.prepare('SELECT * FROM dungeon_run WHERE character_id = ?').get(char.id) as any;
  if (!run) {
    res.status(400).json({ error: 'You are not in a dungeon.' });
    return;
  }
  const dungeon = findDungeon(run.slug);
  if (!dungeon) {
    db.prepare('DELETE FROM dungeon_run WHERE character_id = ?').run(char.id);
    res.status(404).json({ error: 'Dungeon vanished' });
    return;
  }
  if (run.stage < dungeon.stages.length) {
    res.status(400).json({ error: 'Dungeon not yet cleared.' });
    return;
  }
  const items: string[] = JSON.parse(run.items_json || '[]');
  // Guaranteed extra item from loot pool at clear
  if (dungeon.loot_pool.length) {
    items.push(dungeon.loot_pool[Math.floor(Math.random() * dungeon.loot_pool.length)]);
  }
  const xp = run.xp_pile + dungeon.xp_bonus;
  const gold = run.gold_pile + dungeon.gold_bonus;
  char.gold += gold;
  const lvlRes = applyXp(char, xp);
  char.hp = run.hp; // exit with current HP
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, dungeons_cleared = dungeons_cleared + 1, total_xp_earned = total_xp_earned + ?, total_gold_earned = total_gold_earned + ? WHERE id = ?`,
  ).run(
    char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.hp, char.mp, char.gold,
    xp, gold, char.id,
  );
  // Add items to inventory
  for (const slug of items) {
    const item = db.prepare('SELECT id, category FROM items WHERE slug = ?').get(slug) as { id: number; category: string } | undefined;
    if (!item) continue;
    if (item.category === 'potion') {
      const existing = db.prepare('SELECT id FROM inventory WHERE character_id = ? AND item_id = ? AND equipped = 0').get(char.id, item.id) as { id: number } | undefined;
      if (existing) db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
      else db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
    } else {
      db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, item.id);
    }
  }
  db.prepare('DELETE FROM dungeon_run WHERE character_id = ?').run(char.id);
  const unlocked = evaluateAchievements(db, char.id);
  res.json({
    ok: true,
    xp,
    gold,
    items,
    clearText: dungeon.clear_text,
    levelUp: lvlRes.leveled ? lvlRes : null,
    unlocked,
  });
});

router.post('/abandon', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  db.prepare('DELETE FROM dungeon_run WHERE character_id = ?').run(ch.id);
  res.json({ ok: true });
});

export default router;
