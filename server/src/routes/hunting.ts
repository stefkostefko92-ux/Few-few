import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { regenerateEnergy, applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { applyCombatEvent } from '../game/events';
import { loadEquipped } from '../game/equipment';
import { applyGuildMultipliers } from '../game/rewards';
import { assertReady, setCooldown } from '../game/cooldowns';
import { applyBountyKill } from './bounties';
import { trackBattlePass } from './battlepass';
import { trackWeeklyKill } from './weekly';
import { REGION_BANDS } from '../seed/monsters';
import type { Character, Monster, Item, InventoryEntry } from '../types/domain';
import { logFromRequest } from '../lib/logger';

const router = Router();
router.use(authRequired);

const BASE_REGIONS = ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'];
// Base regions plus the endless high-level bands (lv 26 → 350), in order.
const REGION_ORDER = [...BASE_REGIONS, ...REGION_BANDS.map((b) => b.region)];

const REGION_GATES: Record<string, number> = {
  whispering_woods: 1,
  mistmoor_hills: 6,
  crystal_caverns: 10,
  ashen_wastes: 15,
  shadowfell: 24,
  ...Object.fromEntries(REGION_BANDS.map((b) => [b.region, b.gate])),
};

// Pretty names for the high-level regions so the UI can label them.
export const REGION_NAMES: Record<string, string> = Object.fromEntries(REGION_BANDS.map((b) => [b.region, b.name]));

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
  try { assertReady(char.id, 'hunt'); }
  catch (e: any) { res.status(429).json({ error: e.message, cooldown_ms: e.cooldownMs, action: 'hunt' }); return; }
  if (char.hp <= Math.floor(char.hp_max * 0.1)) {
    res.status(400).json({ error: 'Too wounded to hunt. Rest first.' });
    return;
  }
  const gate = REGION_GATES[parse.data.region] ?? 1;
  if (char.level < gate) {
    res.status(400).json({ error: `Region requires level ${gate}` });
    return;
  }
  // Pick a monster in the region within ±3 of player's level. If empty,
  // widen the window step-by-step instead of returning ANY region monster —
  // that fallback was letting a lv200 hero draw lv26 foes from the same
  // high-band region, breaking balance.
  let pool: Monster[] = [];
  for (const window of [3, 8, 16, 999]) {
    pool = db
      .prepare(`SELECT * FROM monsters WHERE region = ? AND level BETWEEN ? AND ?`)
      .all(
        parse.data.region,
        Math.max(1, char.level - window),
        // Audit RISK #8: the previous Math.min(window, 5) capped the
        // upper bound, so a Lv 350 hero in a band clustered at 360-380
        // produced an empty pool forever. Symmetric window now.
        char.level + window,
      ) as Monster[];
    if (pool.length > 0) break;
  }
  if (pool.length === 0) {
    res.status(404).json({ error: 'No prey in this region' });
    return;
  }
  const monster = pool[Math.floor(Math.random() * pool.length)];

  // Derive hero
  const derived = deriveStats(char, loadEquipped(char.id));
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
  let itemRewardSlug = '';
  let lvlRes = null as ReturnType<typeof applyXp> | null;
  if (result.winner === 'hero') {
    const baseXp = monster.xp_reward;
    const baseGold = Math.floor(monster.gold_min + Math.random() * (monster.gold_max - monster.gold_min + 1));
    const r = applyGuildMultipliers(char.id, baseGold, baseXp);
    xpGain = r.xp;
    goldGain = r.gold;
    char.gold += goldGain;
    lvlRes = applyXp(char, xpGain);

    // Item drop. 22% chance per kill. Tier mapped from the monster's
    // *item-tier* band (not just /35), so the lvl_req of items in each
    // tier lines up with the player's actual level. Audit balance #11.
    if (Math.random() < 0.22) {
      // Mapping: monster level → drop tier (matches the seeded
      // level_req of the equipment tiers).
      const mlvl = monster.level;
      const tier =
        mlvl >= 320 ? 10 :
        mlvl >= 280 ? 9  :
        mlvl >= 230 ? 8  :
        mlvl >= 180 ? 7  :
        mlvl >= 130 ? 6  :
        mlvl >= 95  ? 5  :
        mlvl >= 60  ? 4  :
        mlvl >= 25  ? 3  :
        mlvl >= 12  ? 2  : 1;
      // Audit BUG #1: previously the SQL ignored level_req and class_req,
      // so a Lv 1 hero hunting tier-1 mobs could roll a Lv 25 legendary
      // dragonbane. Now we filter by player level + class, with a
      // graceful fallback if nothing matches.
      const cls = char.class || '';
      const pickFor = (whereExtra: string) => db.prepare(
        `SELECT * FROM items
         WHERE tier = ?
           AND category IN ('weapon','armor','helm','shield','gloves','boots','amulet','ring','cloak')
           AND level_req <= ?
           AND (class_req = '' OR class_req = ?)
           ${whereExtra}
         ORDER BY RANDOM() LIMIT 1`,
      ).get(tier, char.level, cls) as any;
      const candidates = pickFor('') || pickFor("AND class_req = ''");
      if (candidates) {
        // Audit balance #7: don't flood the bag with duplicates. If the
        // player already owns an unequipped copy (or has it equipped),
        // auto-vendor the drop for half its sell price instead of
        // inserting a second row. That keeps drops feeling rewarding
        // without bloating the inventory grid.
        const owned = db.prepare(
          `SELECT id FROM inventory
           WHERE character_id=? AND item_id=? AND listed=0 LIMIT 1`,
        ).get(char.id, candidates.id) as { id: number } | undefined;
        if (owned) {
          const refund = Math.max(1, Math.floor((candidates.sell_price || 0) * 0.5));
          char.gold += refund;
          goldGain += refund;
          itemRewardSlug = candidates.slug + '_dup';
        } else {
          itemRewardSlug = candidates.slug;
          db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(
            char.id,
            candidates.id,
          );
        }
      }
    }
  }
  char.hp = Math.max(1, result.hero.hp > 0 ? result.hero.hp : 1);
  const cooldownMs = setCooldown(char.id, 'hunt');
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ? WHERE id = ?`,
  ).run(
    char.xp, char.level, char.stat_points, char.skill_points, char.hp_max, char.mp_max, char.hp, char.mp, char.gold, char.id,
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

  // Forward the kill to the daily bounty board. Completed bounties surface
  // in the response so the client can pop a "Bounty ready to claim" toast.
  const completedBounties = result.winner === 'hero'
    ? applyBountyKill(char, monster.slug)
    : [];
  if (result.winner === 'hero') {
    trackBattlePass(char.id, 'hunt_kill', 1);
    trackWeeklyKill(char.id);
  }

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
    completedBounties,
    itemReward: itemRewardSlug || null,
    itemDrop: itemRewardSlug
      ? (db.prepare('SELECT slug, name, category, sub_type, tier, rarity, level_req, icon, atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus, int_bonus, cha_bonus, wis_bonus, description FROM items WHERE slug=?').get(itemRewardSlug) as any)
      : null,
    cooldown_ms: cooldownMs,
  });
});

export default router;
