import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { questBaseXp, questBaseGold, questCombatXp, questLossPenalty } from '../game/rewardFormulas';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { liveCombatTuning } from '../game/settings';
import { applyCombatEvent } from '../game/events';
import { loadEquipped } from '../game/equipment';
import { applyGuildMultipliers } from '../game/rewards';
import { grantDrop, grantUniqueItem, DROP_RATES } from '../game/drops';
import { claimCooldown } from '../game/cooldowns';
import { trackBattlePass } from './battlepass';
import type { Character, Monster, Quest, Item, InventoryEntry } from '../types/domain';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT level FROM characters WHERE user_id = ?').get(req.auth!.uid) as { level: number } | undefined;
  const lvl = char?.level ?? 1;
  const quests = db
    .prepare('SELECT * FROM quests WHERE level_req <= ? ORDER BY level_req ASC, region ASC')
    .all(lvl + 1) as Quest[];
  // Показваме ЕФЕКТИВНИТЕ награди (след пейс/злато клампа), за да съвпада
  // числото в клиента с това, което /start реално плаща. Същата JSON форма.
  const monStmt = db.prepare('SELECT level, xp_reward, gold_min, gold_max FROM monsters WHERE slug = ?');
  res.json({
    quests: quests.map((q) => {
      const m = q.monster_slug ? (monStmt.get(q.monster_slug) as Monster | undefined) : undefined;
      return { ...q, xp_reward: questBaseXp(q), gold_reward: questBaseGold(q, m) };
    }),
  });
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

  const quest = db.prepare('SELECT * FROM quests WHERE slug = ?').get(parse.data.questSlug) as Quest | undefined;
  if (!quest) {
    res.status(404).json({ error: 'Quest not found' });
    return;
  }
  if (char.level < quest.level_req) {
    res.status(400).json({ error: `Requires level ${quest.level_req}` });
    return;
  }
  if (char.hp <= Math.floor(char.hp_max * 0.1)) {
    res.status(400).json({ error: 'Too wounded to set out. Rest first.' });
    return;
  }
  // Claimed atomically after the invalid-attempt guards, before any
  // reward logic — two concurrent /quest/start calls must not both pay
  // out (see cooldowns.ts claimCooldown() doc comment).
  try { claimCooldown(char.id, 'quest'); }
  catch (e: any) { res.status(429).json({ error: e.message, cooldown_ms: e.cooldownMs, action: 'quest' }); return; }

  // Get monster
  const monster = quest.monster_slug
    ? (db.prepare('SELECT * FROM monsters WHERE slug = ?').get(quest.monster_slug) as Monster | undefined)
    : undefined;

  // Derive hero
  const derived = deriveStats(char, loadEquipped(char.id));
  const hero = buildHeroActor(char, derived, char.hp);

  // If no monster, this is a story/skill quest
  if (!monster) {
    const success = Math.random() < 0.8;
    const designXp = questBaseXp(quest);
    const baseXp = success ? designXp : Math.floor(designXp * 0.3);
    const baseGold = success ? questBaseGold(quest, null) : 0;
    const r = applyGuildMultipliers(char.id, baseGold, baseXp);
    const xpGain = r.xp;
    const goldGain = r.gold;
    char.gold += goldGain;
    const lvlRes = applyXp(char, xpGain);
    db.prepare(
      `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ? WHERE id = ?`,
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
      char.id,
    );
    db.prepare('INSERT INTO quest_log (character_id, quest_id, result, completed_at) VALUES (?, ?, ?, ?)').run(
      char.id,
      quest.id,
      success ? 'success' : 'partial',
      Date.now(),
    );
    if (success) trackBattlePass(char.id, 'quest_complete', 1);
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
  const result = simulateCombat(hero, foe, liveCombatTuning());
  result.hpAfter = result.hero.hp;

  let xpGain = 0;
  let goldGain = 0;
  let itemRewardSlug = '';
  let lvlRes = null as ReturnType<typeof applyXp> | null;
  if (result.winner === 'hero') {
    // Pace-clamp the monster's (act-1-inflated) raw xp_reward like hunting
    // does, so a repeatable combat quest can't out-earn the pacing target.
    // Куест-частта е клампната до 3× pace на входното ниво (game/rewardFormulas):
    // act-1 seed-ът (shadowfell 3000 XP = 30× pace) се фармеше на всяко ниво.
    const baseXp = questCombatXp(quest, monster);
    const baseGold = questBaseGold(quest, monster) + Math.floor(monster.gold_min + Math.random() * (monster.gold_max - monster.gold_min + 1));
    const r = applyGuildMultipliers(char.id, baseGold, baseXp);
    xpGain = r.xp;
    goldGain = r.gold;
    char.gold += goldGain;
    lvlRes = applyXp(char, xpGain);
    // Item drop. Explicit quest.item_reward gives a guaranteed grant
    // (legendary turn-in quests use this). Otherwise kill quests roll
    // the unified 35% Tower/Arena/Hunt drop path so the player who
    // turns in a region quest reliably leaves with a piece of gear.
    // Експлойт (одит): куестовете са повторяеми, а item_reward се даваше на
    // ВСЯКО повторение (60%) без проверка за притежание → легендарният
    // Dragonbane (sell 5000g) се печаташе на всеки ~6.5 мин. Сега наградата
    // е еднократна като APEX дропа: ако героят вече притежава предмета (в
    // чантата, екипиран, обявен или в гилдийния трезор), падаме на общия дроп.
    let rewardGranted = false;
    if (quest.item_reward && Math.random() < 0.6) {
      rewardGranted = grantUniqueItem(db, char.id, quest.item_reward);
      if (rewardGranted) itemRewardSlug = quest.item_reward;
    }
    if (!rewardGranted && quest.monster_slug && Math.random() < DROP_RATES.quest) {
      const drop = grantDrop(char.id, char.level, char.class || '', monster.level);
      if (drop.slug) itemRewardSlug = drop.slug;
      if (drop.refundGold > 0) { goldGain += drop.refundGold; char.gold += drop.refundGold; }
    }
  }
  char.hp = Math.max(1, result.hpAfter > 0 ? result.hpAfter : 1);
  // Loss penalty: -10% gold (min 0)
  // Загуба: −10% злато, но не повече от наградата на куеста — преди губеше
  // 10% от ЦЯЛОТО състояние (милиони на endgame) срещу залог от ~3k.
  if (result.winner === 'foe') {
    char.gold -= questLossPenalty(char.gold, quest);
  }
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ? WHERE id = ?`,
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
  if (result.winner === 'hero') trackBattlePass(char.id, 'quest_complete', 1);

  const unlocked = applyCombatEvent(db, {
    characterId: char.id,
    victory: result.winner === 'hero',
    kind: 'quest',
    xpGained: xpGain,
    goldGained: goldGain,
    monsterSlug: monster.slug,
    newItemSlug: itemRewardSlug || undefined,
  });

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
    unlocked,
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
