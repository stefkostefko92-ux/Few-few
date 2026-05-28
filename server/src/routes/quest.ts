import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp, regenerateEnergy } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import type { Character, Monster, Quest, Item, InventoryEntry } from '../types/domain';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT level FROM characters WHERE user_id = ?').get(req.auth!.uid) as { level: number } | undefined;
  const lvl = char?.level ?? 1;
  const quests = db
    .prepare('SELECT * FROM quests WHERE level_req <= ? ORDER BY level_req ASC, region ASC')
    .all(lvl + 1);
  res.json({ quests });
});

const startSchema = z.object({ questSlug: z.string() });

router.post('/start', (req, res) => {
  const parse = startSchema.safeParse(req.body);
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

  const quest = db.prepare('SELECT * FROM quests WHERE slug = ?').get(parse.data.questSlug) as Quest | undefined;
  if (!quest) {
    res.status(404).json({ error: 'Quest not found' });
    return;
  }
  if (char.level < quest.level_req) {
    res.status(400).json({ error: `Requires level ${quest.level_req}` });
    return;
  }
  if (char.energy < quest.energy_cost) {
    res.status(400).json({ error: 'Not enough energy' });
    return;
  }
  if (char.hp <= Math.floor(char.hp_max * 0.1)) {
    res.status(400).json({ error: 'Too wounded to set out. Rest first.' });
    return;
  }

  // Get monster
  const monster = quest.monster_slug
    ? (db.prepare('SELECT * FROM monsters WHERE slug = ?').get(quest.monster_slug) as Monster | undefined)
    : undefined;

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

  // If no monster, this is a story/skill quest
  if (!monster) {
    const success = Math.random() < 0.8;
    const xpGain = success ? quest.xp_reward : Math.floor(quest.xp_reward * 0.3);
    const goldGain = success ? quest.gold_reward : 0;
    char.gold += goldGain;
    const lvlRes = applyXp(char, xpGain);
    char.energy -= quest.energy_cost;
    db.prepare(
      `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, energy = ? WHERE id = ?`,
    ).run(
      char.xp,
      char.level,
      char.stat_points,
      char.skill_points,
      char.hp_max,
      char.mp_max,
      char.hp,
      char.mp,
      char.gold,
      char.energy,
      char.id,
    );
    db.prepare('INSERT INTO quest_log (character_id, quest_id, result, completed_at) VALUES (?, ?, ?, ?)').run(
      char.id,
      quest.id,
      success ? 'success' : 'partial',
      Date.now(),
    );
    res.json({
      kind: 'story',
      success,
      narrative: quest.narrative,
      resultText: success ? quest.success_text : quest.failure_text,
      xp: xpGain,
      gold: goldGain,
      levelUp: lvlRes.leveled ? lvlRes : null,
    });
    return;
  }

  // Combat quest
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
    crit_chance: 0.08,
    dodge_chance: 0.04,
    sprite: monster.sprite,
  };
  const result = simulateCombat(hero, foe);
  result.hpAfter = result.hero.hp;

  let xpGain = 0;
  let goldGain = 0;
  let itemRewardSlug = '';
  let lvlRes = null as ReturnType<typeof applyXp> | null;
  if (result.winner === 'hero') {
    xpGain = quest.xp_reward + monster.xp_reward;
    goldGain = quest.gold_reward + Math.floor(monster.gold_min + Math.random() * (monster.gold_max - monster.gold_min + 1));
    char.gold += goldGain;
    lvlRes = applyXp(char, xpGain);
    // Item drop?
    if (quest.item_reward && Math.random() < 0.6) {
      itemRewardSlug = quest.item_reward;
      const item = db.prepare('SELECT * FROM items WHERE slug = ?').get(itemRewardSlug) as Item | undefined;
      if (item) {
        db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(
          char.id,
          item.id,
        );
      }
    }
  }
  char.hp = Math.max(1, result.hpAfter > 0 ? result.hpAfter : 1);
  // Loss penalty: -10% gold (min 0)
  if (result.winner === 'foe') {
    const penalty = Math.min(char.gold, Math.floor(char.gold * 0.1));
    char.gold -= penalty;
  }
  char.energy -= quest.energy_cost;
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, energy = ? WHERE id = ?`,
  ).run(
    char.xp,
    char.level,
    char.stat_points,
    char.skill_points,
    char.hp_max,
    char.mp_max,
    char.hp,
    char.mp,
    char.gold,
    char.energy,
    char.id,
  );
  // Reset the foe/hero actors to the start-of-fight HP so the replay shows the full duel.
  const replayHero = { ...result.hero, hp: result.hero.hp_max };
  const replayFoe = { ...result.foe, hp: result.foe.hp_max };
  // Hero was at currentHp at start; preserve that.
  replayHero.hp = hero.hp;
  db.prepare(
    'INSERT INTO combat_log (character_id, opponent, kind, result, rounds_json, xp_gained, gold_gained, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    char.id,
    monster.name,
    'quest',
    result.winner === 'hero' ? 'win' : 'loss',
    JSON.stringify({ hero: replayHero, foe: replayFoe, rounds: result.rounds, victory: result.winner === 'hero' }),
    xpGain,
    goldGain,
    Date.now(),
  );
  db.prepare('INSERT INTO quest_log (character_id, quest_id, result, completed_at) VALUES (?, ?, ?, ?)').run(
    char.id,
    quest.id,
    result.winner === 'hero' ? 'success' : 'failure',
    Date.now(),
  );

  res.json({
    kind: 'combat',
    intro: quest.intro,
    narrative: quest.narrative,
    resultText: result.winner === 'hero' ? quest.success_text : quest.failure_text,
    success: result.winner === 'hero',
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
    xp: xpGain,
    gold: goldGain,
    itemReward: itemRewardSlug || null,
    levelUp: lvlRes && lvlRes.leveled ? lvlRes : null,
  });
});

router.get('/log', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const rows = db
    .prepare(
      `SELECT ql.id, ql.result, ql.completed_at, q.title, q.region FROM quest_log ql
       JOIN quests q ON ql.quest_id = q.id WHERE ql.character_id = ?
       ORDER BY ql.completed_at DESC LIMIT 30`,
    )
    .all(char.id);
  res.json({ entries: rows });
});

export default router;
