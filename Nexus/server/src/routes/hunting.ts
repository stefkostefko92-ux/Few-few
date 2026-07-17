import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp, paceXpForKill } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { applyCombatEvent } from '../game/events';
import { loadEquipped } from '../game/equipment';
import { applyGuildMultipliers } from '../game/rewards';
import { assertReady, setCooldown } from '../game/cooldowns';
import { applyBountyKill } from './bounties';
import { trackBattlePass } from './battlepass';
import { trackWeeklyKill } from './weekly';
import { applyFactionRepFromHunt } from './faction';
import { awardSeasonPointsFromHunt } from './events';
import { grantDrop, DROP_RATES } from '../game/drops';
import { REGION_BANDS } from '../seed/monsters';
import type { Character, Monster, Item, InventoryEntry } from '../types/domain';
import { logFromRequest } from '../lib/logger';

// APEX boss → signature legendary (само оттук). Модулна константа — ползва
// се и от XP клампа (APEX е изключен от него: премийната XP награда е
// умишлена, виж по-долу).
const APEX_DROPS: Record<string, string> = {
  // Mid-tier (lv 50-200)
  'emberreach_apex_khalad':     'khalad_fang',
  'hammerhand_apex_gorvak':     'gorvak_mace',
  'conclave_apex_vex':          'vex_staff',
  'saltmarsh_apex_sunken_king': 'sunken_king_trident',
  'frostvale_apex_snowtooth':   'snowtooth_axe',
  'blackspire_apex_azhtek':     'azhtek_armor',
  // Endgame divine bands (lv 230-350)
  'stormpeaks_apex_karna':      'karna_blade',
  'voidshade_apex_caethra':     'caethra_crown',
  'mooncradle_apex_selan':      'selan_mantle',
  'worldspine_apex_vhastar':    'vhastar_ring',
  'throne_apex_unname':         'unname_blade',
  // „Отвъд Края" bands (lv 351-500)
  'veil_apex_morvaen':          'morvaen_shroud',
  'starfall_apex_ylthar':       'ylthar_eye',
  'forge_apex_kalyndra':        'kalyndra_hammer',
  'nightcrown_apex_sarghul':    'sarghul_crown',
  'firstlight_apex_aurelion':   'aurelion_dawnblade',
};

const router = Router();
router.use(authRequired);

// Five act-one regions plus six named mid-tier regions (lv 26-200)
// hand-built in the content expansion, then the procedural divine
// bands (lv 201-350). Keep all three lists ordered low-to-high so the
// region picker reads as a single progression chain.
const BASE_REGIONS = ['whispering_woods', 'mistmoor_hills', 'crystal_caverns', 'ashen_wastes', 'shadowfell'];
const NAMED_MID_REGIONS = ['emberreach', 'hammerhand_pass', 'conclave_aedric', 'saltmarsh', 'frostvale', 'black_spire'];
const REGION_ORDER = [...BASE_REGIONS, ...NAMED_MID_REGIONS, ...REGION_BANDS.map((b) => b.region)];

const REGION_GATES: Record<string, number> = {
  whispering_woods: 1,
  mistmoor_hills: 6,
  crystal_caverns: 10,
  ashen_wastes: 15,
  shadowfell: 24,
  emberreach: 26,
  hammerhand_pass: 50,
  conclave_aedric: 75,
  saltmarsh: 105,
  frostvale: 140,
  black_spire: 175,
  ...Object.fromEntries(REGION_BANDS.map((b) => [b.region, b.gate])),
};

const NAMED_MID_REGION_LABELS: Record<string, string> = {
  emberreach: 'Emberreach',
  hammerhand_pass: 'Hammerhand Pass',
  conclave_aedric: 'Conclave of Aedric',
  saltmarsh: 'Saltmarsh',
  frostvale: 'Frostvale',
  black_spire: 'Black Spire',
};

// Pretty names for every region beyond the BASE_REGIONS five so the
// client doesn't have to hard-code labels for each new band.
export const REGION_NAMES: Record<string, string> = {
  ...NAMED_MID_REGION_LABELS,
  ...Object.fromEntries(REGION_BANDS.map((b) => [b.region, b.name])),
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
    // Баланс: изглаждане на XP кривата при раздаване. Seed數ните на
    // act-1 (lv≤25) са ~10x над темпа, а на expansion (lv26+) — на темпа
    // → „XP стена" на 26 (левелването пада 10x за едно ниво). Клампваме
    // per-kill XP в лента около целта ~8 убийства/ниво, изведена от
    // реалната крива (xpForLevel), вместо да пренаписваме стотици seed реда.
    // APEX боссовете са ИЗКЛЮЧЕНИ от клампа — големият им xp_reward е
    // умишлена премия (веднъж на регион), не seed аномалия.
    const isApex = !!APEX_DROPS[monster.slug];
    const paceXp = paceXpForKill(monster.level);
    const baseXp = isApex
      ? monster.xp_reward
      : Math.max(Math.round(paceXp * 0.6), Math.min(Math.round(paceXp * 1.8), monster.xp_reward));
    const baseGold = Math.floor(monster.gold_min + Math.random() * (monster.gold_max - monster.gold_min + 1));
    const r = applyGuildMultipliers(char.id, baseGold, baseXp);
    xpGain = r.xp;
    goldGain = r.gold;
    char.gold += goldGain;
    lvlRes = applyXp(char, xpGain);

    // APEX boss kills — guaranteed unique legendary drop, regardless of
    // the regular 22% roll below. Each named-region APEX has exactly one
    // signature item that ONLY drops here. If the hero already owns the
    // piece (in bag or equipped), the drop falls back to the normal
    // random roll so the kill still feels rewarding.
    const apexSlug = APEX_DROPS[monster.slug];
    if (apexSlug) {
      const apexItem = db.prepare('SELECT id FROM items WHERE slug = ?').get(apexSlug) as { id: number } | undefined;
      if (apexItem) {
        const ownsApex = db.prepare(
          'SELECT id FROM inventory WHERE character_id = ? AND item_id = ? AND listed = 0 LIMIT 1',
        ).get(char.id, apexItem.id) as { id: number } | undefined;
        if (!ownsApex) {
          db.prepare("INSERT INTO inventory (character_id, item_id, quantity, equipped, slot) VALUES (?, ?, 1, 0, '')").run(char.id, apexItem.id);
          itemRewardSlug = apexSlug;
        }
      }
    }

    // Regular drop — fires whenever the APEX guarantee didn't claim
    // the slot. Routed through the unified game/drops.ts helper so the
    // tier mapping, player level/class gating, and duplicate auto-
    // vendor rate are identical to Tower / Arena / Quest drops.
    if (!itemRewardSlug && Math.random() < DROP_RATES.hunt) {
      const drop = grantDrop(char.id, char.level, char.class || '', monster.level);
      if (drop.slug) itemRewardSlug = drop.slug;
      if (drop.refundGold > 0) { goldGain += drop.refundGold; char.gold += drop.refundGold; }
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
  let factionRepGain: { faction_slug: string; rep: number } | null = null;
  let seasonPointsGain: { season_key: string; points: number } | null = null;
  if (result.winner === 'hero') {
    trackBattlePass(char.id, 'hunt_kill', 1);
    trackWeeklyKill(char.id);
    // Faction reputation — map monster family/slug to the matching
    // faction; APEX kills pay a 20x multiplier to the matching faction.
    factionRepGain = applyFactionRepFromHunt(char.id, {
      region: monster.region,
      family: (monster as any).family || '',
      level: monster.level,
      slug: monster.slug,
    });
    // Seasonal event — if a season is active AND this monster's family
    // matches the season's target list, pay event points scaled by lvl.
    seasonPointsGain = awardSeasonPointsFromHunt(char.id, (monster as any).family || '', monster.level);
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
    factionRep: factionRepGain,
    seasonPoints: seasonPointsGain,
    itemDrop: itemRewardSlug
      ? (db.prepare('SELECT slug, name, category, sub_type, tier, rarity, level_req, icon, atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus, int_bonus, cha_bonus, wis_bonus, description FROM items WHERE slug=?').get(itemRewardSlug) as any)
      : null,
    cooldown_ms: cooldownMs,
  });
});

export default router;
