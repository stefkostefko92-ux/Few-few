import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { applyCombatEvent } from '../game/events';
import { loadEquipped } from '../game/equipment';
import { trackBattlePass } from './battlepass';
import type { Character, Item, InventoryEntry, CombatActor } from '../types/domain';
import { logFromRequest } from '../lib/logger';

const router = Router();
router.use(authRequired);

router.get('/opponents', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as Character | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const list = db
    .prepare(
      `SELECT id, name, class, level, arena_rating, wins, losses, is_npc
       FROM characters
       WHERE id != ? AND level BETWEEN ? AND ?
       ORDER BY ABS(arena_rating - ?) ASC LIMIT 8`,
    )
    .all(char.id, Math.max(1, char.level - 3), char.level + 3, char.arena_rating);
  res.json({ opponents: list });
});

function loadActor(char: Character): CombatActor {
  const derived = deriveStats(char, loadEquipped(char.id));
  return buildHeroActor(char, derived, derived.hp_max);
}

const challengeSchema = z.object({ opponentId: z.number().int() });

router.post('/challenge', (req, res) => {
  const parse = challengeSchema.safeParse(req.body);
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
  if (char.energy < 5) {
    res.status(400).json({ error: 'Need 5 energy to enter the arena' });
    return;
  }
  const opp = db.prepare('SELECT * FROM characters WHERE id = ?').get(parse.data.opponentId) as Character | undefined;
  if (!opp || opp.id === char.id) {
    res.status(404).json({ error: 'Opponent not found' });
    return;
  }
  const hero = loadActor(char);
  hero.hp = char.hp;
  const foe = loadActor(opp);
  foe.side = 'foe';
  foe.sprite = opp.class;

  const result = simulateCombat(hero, foe);

  // Rating change (simple ELO-ish)
  const expected = 1 / (1 + Math.pow(10, (opp.arena_rating - char.arena_rating) / 400));
  const score = result.winner === 'hero' ? 1 : 0;
  const delta = Math.round(32 * (score - expected));
  const newCharRating = Math.max(0, char.arena_rating + delta);
  const newOppRating = Math.max(0, opp.arena_rating - delta);

  // XP for hero
  let xpGain = 0;
  let lvlRes = null as ReturnType<typeof applyXp> | null;
  if (result.winner === 'hero') {
    xpGain = 25 + opp.level * 5;
    lvlRes = applyXp(char, xpGain);
    char.gold += 10 + opp.level * 2;
  }
  char.hp = Math.max(1, result.hero.hp);
  char.energy -= 5;
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, energy = ?, arena_rating = ?, wins = wins + ?, losses = losses + ? WHERE id = ?`,
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
    newCharRating,
    result.winner === 'hero' ? 1 : 0,
    result.winner === 'hero' ? 0 : 1,
    char.id,
  );
  if (!opp.is_npc) {
    db.prepare(
      `UPDATE characters SET arena_rating = ?, wins = wins + ?, losses = losses + ? WHERE id = ?`,
    ).run(newOppRating, result.winner === 'hero' ? 0 : 1, result.winner === 'hero' ? 1 : 0, opp.id);
  }

  const replayHero = { ...result.hero, hp: hero.hp };
  const replayFoe = { ...result.foe, hp: foe.hp };
  db.prepare(
    'INSERT INTO combat_log (character_id, opponent, kind, result, rounds_json, xp_gained, gold_gained, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    char.id,
    opp.name,
    'pvp',
    result.winner === 'hero' ? 'win' : 'loss',
    JSON.stringify({ hero: replayHero, foe: replayFoe, rounds: result.rounds, victory: result.winner === 'hero' }),
    xpGain,
    result.winner === 'hero' ? 10 + opp.level * 2 : 0,
    Date.now(),
  );

  const unlocked = applyCombatEvent(db, {
    characterId: char.id,
    victory: result.winner === 'hero',
    kind: 'pvp',
    xpGained: xpGain,
    goldGained: result.winner === 'hero' ? 10 + opp.level * 2 : 0,
  });

  if (result.winner === 'hero') trackBattlePass(char.id, 'arena_win', 1);

  logFromRequest(req, {
    category: 'combat',
    action: result.winner === 'hero' ? 'arena_win' : 'arena_loss',
    character_id: char.id,
    target_id: opp.id,
    target_type: 'character',
    message: `${char.name} ${result.winner === 'hero' ? 'defeated' : 'lost to'} ${opp.name}`,
    meta: {
      kind: 'pvp', opponent: opp.name, opponent_level: opp.level, rounds: result.rounds.length,
      xp: xpGain, gold: result.winner === 'hero' ? 10 + opp.level * 2 : 0, rating_delta: delta, new_rating: newCharRating,
    },
  });

  res.json({
    success: result.winner === 'hero',
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
    ratingDelta: delta,
    newRating: newCharRating,
    xp: xpGain,
    levelUp: lvlRes && lvlRes.leveled ? lvlRes : null,
    unlocked,
  });
});

router.get('/leaderboard', (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, class, level, arena_rating, wins, losses, is_npc FROM characters
       ORDER BY arena_rating DESC LIMIT 50`,
    )
    .all();
  res.json({ leaderboard: rows });
});

export default router;
