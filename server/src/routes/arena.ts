import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import type { Character, Item, InventoryEntry, CombatActor } from '../types/domain';

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

function loadActor(char: Character, db = getDb()): CombatActor {
  const equipped = db
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot, items.* FROM inventory inv
       JOIN items ON inv.item_id = items.id WHERE inv.character_id = ? AND inv.equipped = 1`,
    )
    .all(char.id) as any[];
  const eqList = equipped.map((row) => ({
    item: row as Item,
    entry: {
      id: row.inv_id,
      character_id: char.id,
      item_id: row.id,
      quantity: row.quantity,
      equipped: row.equipped,
      slot: row.slot,
    } as InventoryEntry,
  }));
  const derived = deriveStats(char, eqList);
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

  res.json({
    success: result.winner === 'hero',
    hero: result.hero,
    foe: result.foe,
    rounds: result.rounds,
    ratingDelta: delta,
    newRating: newCharRating,
    xp: xpGain,
    levelUp: lvlRes && lvlRes.leveled ? lvlRes : null,
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
