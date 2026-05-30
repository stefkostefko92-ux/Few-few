import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
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

const ENERGY_COST = 5;
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

router.get('/status', (req, res) => {
  const char = getChar(req.auth!.uid);
  if (!char) { res.status(404).json({ error: 'No character' }); return; }
  const next = (char as any).tower_current_floor + 1;
  res.json({
    current_floor: (char as any).tower_current_floor,
    next_floor: next,
    best_floor: (char as any).tower_best_floor,
    energy: char.energy,
    energy_cost: ENERGY_COST,
    next_reward: { gold: 8 + next * 4, xp: 14 + next * 6, vault: next % 5 === 0 },
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
  if (char.energy < ENERGY_COST) {
    res.status(400).json({ error: `Need ${ENERGY_COST} energy to attempt the next floor.` });
    return;
  }

  // Lazy-init the run seed so each run is a different gauntlet.
  let seed = (char as any).tower_run_seed;
  if (seed === 0) seed = Math.floor(Math.random() * 1_000_000);

  const targetFloor = (char as any).tower_current_floor + 1;
  const foe = buildFoe(targetFloor, seed);

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
  const result = simulateCombat(hero, foe);

  let xpGain = 0;
  let goldGain = 0;
  let lvlRes = null as ReturnType<typeof applyXp> | null;
  let newFloor = (char as any).tower_current_floor;
  let newBest = (char as any).tower_best_floor;
  let runSeed = seed;
  let runEnded = false;

  if (result.winner === 'hero') {
    const baseGold = 8 + targetFloor * 4;
    const baseXp = 14 + targetFloor * 6;
    const vault = targetFloor % 5 === 0;
    goldGain = vault ? baseGold * 2 : baseGold;
    xpGain = vault ? baseXp * 2 : baseXp;
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
  char.energy -= ENERGY_COST;
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?,
       hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, energy = ?,
       tower_current_floor = ?, tower_best_floor = ?, tower_run_seed = ?
     WHERE id = ?`,
  ).run(
    char.xp, char.level, char.stat_points, char.skill_points,
    char.hp_max, char.mp_max, char.hp, char.mp, char.gold, char.energy,
    newFloor, newBest, runSeed, char.id,
  );

  logFromRequest(req, {
    category: 'combat',
    action: result.winner === 'hero' ? 'tower_clear' : 'tower_wipe',
    character_id: char.id,
    target_type: 'tower',
    message: `${char.name} ${result.winner === 'hero' ? 'cleared' : 'fell on'} Tower floor ${targetFloor}`,
    meta: { floor: targetFloor, gold: goldGain, xp: xpGain, rounds: result.rounds.length, new_best: newBest, run_ended: runEnded },
  });

  res.json({
    success: result.winner === 'hero',
    floor: targetFloor,
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
    gold: goldGain,
    xp: xpGain,
    levelUp: lvlRes && lvlRes.leveled ? lvlRes : null,
    current_floor: newFloor,
    best_floor: newBest,
    run_ended: runEnded,
    vault: targetFloor % 5 === 0 && result.winner === 'hero',
  });
});

export default router;
