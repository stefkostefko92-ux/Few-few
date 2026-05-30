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
 * Stamina cost: 5 energy per attempt. Climbing is server-authoritative —
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
  const arch = ARCHETYPES[(seed + floor) % ARCHETYPES.length];
  const lvlScale = Math.max(1, Math.floor(floor * 1.2));
  return {
    name: `${arch} of the ${floor}${ordinal(floor)} Vault`,
    side: 'foe' as const,
    level: lvlScale,
    hp: 60 + floor * 22,
    hp_max: 60 + floor * 22,
    atk_min: 8 + Math.floor(floor * 1.4),
    atk_max: 14 + Math.floor(floor * 1.8),
    defense: 3 + Math.floor(floor * 0.6),
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
function towerGold(floor: number): number { return 6 + floor * 2; }
function towerXp(floor: number): number   { return 10 + floor * 3; }

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

  if (result.winner === 'hero') {
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
  } else {
    newFloor = 0;
    runSeed = 0;
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
  });
});

export default router;
