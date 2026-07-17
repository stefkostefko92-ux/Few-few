import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { loadEquipped } from '../game/equipment';
import { applyGuildMultipliers } from '../game/rewards';
import { assertReady, setCooldown, loadCooldowns } from '../game/cooldowns';
import { trackBattlePass } from './battlepass';
import { trackGuildMission } from '../game/guildMissions';
import { addSeasonPoints } from '../game/seasons';
import { grantDrop, DROP_RATES } from '../game/drops';
import type { Character, Item, InventoryEntry } from '../types/domain';
import { logFromRequest } from '../lib/logger';

const router = Router();
router.use(authRequired);

/* =========================================================================
 * Tower of Trials — endless scaling boss rush.
 *
 * Each floor pits the hero against a procedurally-scaled foe whose stats
 * grow with `floor`. Winning advances the run to floor+1. Losing ends the
 * run, banks your best floor, and lets you start again from 1.
 *
 * Pacing: action cooldown (стълбицата в game/cooldowns.ts), НЕ енергия.
 * Climbing is server-authoritative —
 * we never trust the client's "I'm on floor X" claim.
 *
 * Rewards (only on win):
 *   gold = 8 + floor × 4
 *   xp   = 14 + floor × 6
 * Plus, every 5 floors, a "Vault" bonus of double rewards is rolled.
 *
 * Leaderboard is just the characters table sorted by tower_best_floor.
 * ======================================================================= */

const ARCHETYPES = ['Wraith', 'Golem', 'Drake', 'Phantom', 'Devourer', 'Sentinel', 'Reaver', 'Hydraform'];

function getChar(uid: number): Character | undefined {
  return getDb().prepare('SELECT * FROM characters WHERE user_id = ?').get(uid) as Character | undefined;
}

function buildFoe(floor: number, seed: number) {
  // Light deterministic seeding so the same floor on the same run feels
  // consistent if the player retries within the run.
  // Tower difficulty curve, second pass. The first fix (`60+floor*60`
  // linear) hit the audit's floor-100 target but made floor 1 a
  // guaranteed wipe for a fresh lv 1 hero (120 HP foe vs ~80 HP hero) —
  // caught by the launch smoke test. Quadratic ramp instead: gentle
  // through the first ~15 floors (matches a lv 1-12 player), then
  // steepens so floor 100 still lands at ~12k HP, in line with hunting
  // lv 100 mobs (~10.5k).
  const arch = ARCHETYPES[(seed + floor) % ARCHETYPES.length];
  const lvlScale = Math.max(1, Math.floor(floor * 1.2));
  return {
    name: `${arch} of the ${floor}${ordinal(floor)} Vault`,
    side: 'foe' as const,
    level: lvlScale,
    hp: Math.round(60 + floor * 22 + floor * floor * 1.0),
    hp_max: Math.round(60 + floor * 22 + floor * floor * 1.0),
    atk_min: Math.round(8 + floor * 1.4 + floor * floor * 0.035),
    atk_max: Math.round(14 + floor * 1.8 + floor * floor * 0.045),
    defense: Math.round(3 + floor * 0.6 + floor * floor * 0.008),
    speed: 6 + Math.floor(floor * 0.2),
    crit_chance: 0.05 + Math.min(0.25, floor * 0.005),
    dodge_chance: 0.03 + Math.min(0.18, floor * 0.003),
    sprite: 'monster-dragon',
  };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/* ───── Reward curves ─────
 * Designed so the Tower is a satisfying climb but never out-paces the rest
 * of the game's economy. Camp (idle) caps at ~28g/h, hunting kills give
 * 8-40g, daily tribute hands out ~50g. We want the Tower to feel rewarding
 * to push but not be a money printer:
 *   gold = 6 + floor × 2 (linear, gentle)
 *   xp   = 10 + floor × 3 (linear, gentle)
 * Vault every 5th floor doubles both. */
// Reward formulas scaled up with the difficulty bump above so the
// effort-to-payout ratio stays sane. The Tower is still a slower
// faucet than open hunting at the same level but feels worth the
// climb past floor ~40.
function towerGold(floor: number): number { return 8 + floor * 5; }
function towerXp(floor: number): number   { return 12 + floor * 7; }

router.get('/status', (req, res) => {
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const next = (char as any).tower_current_floor + 1;
  const vault = next % 5 === 0;
  res.json({
    current_floor: (char as any).tower_current_floor,
    next_floor: next,
    best_floor: (char as any).tower_best_floor,
    cooldowns: loadCooldowns(char.id),
    next_reward: {
      gold: towerGold(next) * (vault ? 2 : 1),
      xp:   towerXp(next)   * (vault ? 2 : 1),
      vault,
    },
  });
});

router.get('/leaderboard', (_req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT name, class, level, tower_best_floor FROM characters
       WHERE is_npc = 0 AND tower_best_floor > 0
       ORDER BY tower_best_floor DESC, name ASC LIMIT 25`,
    )
    .all();
  res.json({ leaderboard: rows });
});

router.post('/climb', (req, res) => {
  const db = getDb();
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  try { assertReady(char.id, 'tower'); }
  catch (e: any) { res.status(429).json({ error: e.message, cooldown_ms: e.cooldownMs, action: 'tower' }); return; }
  // Same wounded guard hunting has — entering a fight at 1 HP is a
  // guaranteed wipe plus a burned cooldown, a pure UX trap.
  if (char.hp <= Math.floor(char.hp_max * 0.1)) {
    res.status(400).json({ error: 'Too wounded to climb. Rest first.' });
    return;
  }

  // Lazy-init the run seed so each run is a different gauntlet.
  let seed = (char as any).tower_run_seed;
  if (seed === 0) seed = Math.floor(Math.random() * 1_000_000);

  const targetFloor = (char as any).tower_current_floor + 1;
  const foe = buildFoe(targetFloor, seed);

  const derived = deriveStats(char, loadEquipped(char.id));
  const hero = buildHeroActor(char, derived, char.hp);
  const result = simulateCombat(hero, foe);

  let xpGain = 0;
  let goldGain = 0;
  let lvlRes = null as ReturnType<typeof applyXp> | null;
  let newFloor = (char as any).tower_current_floor;
  let newBest = (char as any).tower_best_floor;
  let runSeed = seed;
  let runEnded = false;
  let tokensGained = 0;

  let itemDropSlug: string | null = null;
  if (result.winner === 'hero') {
    // Гилдийна мисия + сезонни точки за изкачен етаж.
    trackGuildMission(db, char.id, 'tower_floors');
    addSeasonPoints(db, char.id, 5);
    const vault = targetFloor % 5 === 0;
    const baseGold = towerGold(targetFloor) * (vault ? 2 : 1);
    const baseXp   = towerXp(targetFloor)   * (vault ? 2 : 1);
    const r = applyGuildMultipliers(char.id, baseGold, baseXp);
    goldGain = r.gold;
    xpGain   = r.xp;
    tokensGained = vault ? 2 : 1;  // bridges Tower → Trial Cache → Forge guarantees
    char.gold += goldGain;
    lvlRes = applyXp(char, xpGain);
    newFloor = targetFloor;
    newBest = Math.max(newBest, targetFloor);
    // Tower drops — unified through game/drops.ts. 8% per regular
    // floor, 20% on every fifth (vault) floor, tier mapped from the
    // floor number using the same scale as hunting so the drop tier
    // tracks the hero's actual progression.
    const dropChance = vault ? DROP_RATES.tower_vault : DROP_RATES.tower;
    if (Math.random() < dropChance) {
      const eff = Math.min(350, Math.round(targetFloor * 1.2));
      const drop = grantDrop(char.id, char.level, char.class || '', eff);
      if (drop.slug) itemDropSlug = drop.slug;
      if (drop.refundGold > 0) { goldGain += drop.refundGold; char.gold += drop.refundGold; }
    }
  } else {
    // Баланс (по заявка на собственика): падането НЕ нулира кулата — оставаш
    // на етажа, на който падна, и опитваш пак; cooldown-ът е цената на
    // провала. Нов seed, за да не е повторният опит същият гарнитур.
    // (newFloor остава текущият етаж.)
    runSeed = Math.floor(Math.random() * 1_000_000);
    runEnded = true;
  }

  char.hp = Math.max(1, result.hero.hp > 0 ? result.hero.hp : 1);
  const cooldownMs = setCooldown(char.id, 'tower');
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?,
       hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?,
       tower_current_floor = ?, tower_best_floor = ?, tower_run_seed = ?,
       trial_tokens = trial_tokens + ?
     WHERE id = ?`,
  ).run(
    char.xp, char.level, char.stat_points, char.skill_points,
    char.hp_max, char.mp_max, char.hp, char.mp, char.gold,
    newFloor, newBest, runSeed, tokensGained, char.id,
  );

  logFromRequest(req, {
    category: 'combat',
    action: result.winner === 'hero' ? 'tower_clear' : 'tower_wipe',
    character_id: char.id,
    target_type: 'tower',
    message: `${char.name} ${result.winner === 'hero' ? 'cleared' : 'fell on'} Tower floor ${targetFloor}`,
    meta: { floor: targetFloor, gold: goldGain, xp: xpGain, tokens: tokensGained, rounds: result.rounds.length, new_best: newBest, run_ended: runEnded },
  });

  if (result.winner === 'hero') {
    trackBattlePass(char.id, 'tower_clear', targetFloor);
    if (targetFloor % 5 === 0) trackBattlePass(char.id, 'tower_vault', 1);
    if (tokensGained > 0) trackBattlePass(char.id, 'trial_token_earned', tokensGained);
  }

  res.json({
    success: result.winner === 'hero',
    floor: targetFloor,
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
    gold: goldGain,
    xp: xpGain,
    trial_tokens: tokensGained,
    levelUp: lvlRes && lvlRes.leveled ? lvlRes : null,
    current_floor: newFloor,
    best_floor: newBest,
    run_ended: runEnded,
    cooldown_ms: cooldownMs,
    vault: targetFloor % 5 === 0 && result.winner === 'hero',
    itemReward: itemDropSlug,
    itemDrop: itemDropSlug
      ? (db.prepare('SELECT slug, name, category, sub_type, tier, rarity, level_req, icon, atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus, int_bonus, cha_bonus, wis_bonus, description FROM items WHERE slug=?').get(itemDropSlug.replace(/_dup$/, '')) as any)
      : null,
  });
});

export default router;
