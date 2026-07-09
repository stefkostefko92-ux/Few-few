import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { applyXp } from '../game/progression';
import { deriveStats, buildHeroActor } from '../game/stats';
import { simulateCombat } from '../game/combat';
import { applyCombatEvent } from '../game/events';
import { loadEquipped } from '../game/equipment';
import { applyGuildMultipliers } from '../game/rewards';
import { assertReady, setCooldown } from '../game/cooldowns';
import { trackBattlePass } from './battlepass';
import { grantDrop, DROP_RATES } from '../game/drops';
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
  try { assertReady(char.id, 'arena'); }
  catch (e: any) { res.status(429).json({ error: e.message, cooldown_ms: e.cooldownMs, action: 'arena' }); return; }
  // Wounded guard — entering a duel at 1 HP is a guaranteed rating
  // loss plus a burned cooldown.
  if (char.hp <= Math.floor(char.hp_max * 0.1)) {
    res.status(400).json({ error: 'Too wounded to duel. Rest first.' });
    return;
  }
  const opp = db.prepare('SELECT * FROM characters WHERE id = ?').get(parse.data.opponentId) as Character | undefined;
  if (!opp || opp.id === char.id) {
    res.status(404).json({ error: 'Opponent not found' });
    return;
  }
  // Enforce the same ±3 level bracket the /opponents list is filtered to,
  // so a client can't hand-pick a far weaker (or a specific) target to
  // farm easy wins or grief a chosen player's rating.
  if (opp.level < char.level - 3 || opp.level > char.level + 3) {
    res.status(400).json({ error: 'That opponent is outside your challenge bracket.' });
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
  let goldGain = 0;
  let lvlRes = null as ReturnType<typeof applyXp> | null;
  let itemDropSlug: string | null = null;
  if (result.winner === 'hero') {
    const r = applyGuildMultipliers(char.id, 10 + opp.level * 2, 25 + opp.level * 5);
    xpGain = r.xp;
    goldGain = r.gold;
    lvlRes = applyXp(char, xpGain);
    char.gold += goldGain;
    // Arena drops — 6% on win, tier mapped from opponent level (same
    // scale as hunting so the drop matches the difficulty band).
    if (Math.random() < DROP_RATES.arena) {
      const drop = grantDrop(char.id, char.level, char.class || '', opp.level);
      if (drop.slug) itemDropSlug = drop.slug;
      if (drop.refundGold > 0) { goldGain += drop.refundGold; char.gold += drop.refundGold; }
    }
  }
  char.hp = Math.max(1, result.hero.hp);
  const cooldownMs = setCooldown(char.id, 'arena');
  db.prepare(
    `UPDATE characters SET xp = ?, level = ?, stat_points = ?, skill_points = ?, hp_max = ?, mp_max = ?, hp = ?, mp = ?, gold = ?, arena_rating = ?, wins = wins + ?, losses = losses + ? WHERE id = ?`,
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
    goldGain,
    Date.now(),
  );

  const unlocked = applyCombatEvent(db, {
    characterId: char.id,
    victory: result.winner === 'hero',
    kind: 'pvp',
    xpGained: xpGain,
    goldGained: goldGain,
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
      xp: xpGain, gold: goldGain, rating_delta: delta, new_rating: newCharRating,
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
    gold: goldGain,
    levelUp: lvlRes && lvlRes.leveled ? lvlRes : null,
    unlocked,
    itemReward: itemDropSlug,
    itemDrop: itemDropSlug
      ? (db.prepare('SELECT slug, name, category, sub_type, tier, rarity, level_req, icon, atk_min, atk_max, defense, hp_bonus, mp_bonus, str_bonus, dex_bonus, con_bonus, int_bonus, cha_bonus, wis_bonus, description FROM items WHERE slug=?').get(itemDropSlug.replace(/_dup$/, '')) as any)
      : null,
  });
});

router.get('/leaderboard', (req, res) => {
  const db = getDb();
  // Audit balance #8: a global ORDER BY arena_rating let a Lv 5 NPC
  // grinding ELO outrank a Lv 350 hero. Tier the board into 7 level
  // bands so each band has its own top-10 — the caller can pick the
  // band or get all.
  const BANDS = [
    { name: 'Apprentice', min: 1,   max: 24  },
    { name: 'Veteran',    min: 25,  max: 70  },
    { name: 'Champion',   min: 71,  max: 130 },
    { name: 'Ascendant',  min: 131, max: 200 },
    { name: 'Cosmic',     min: 201, max: 270 },
    { name: 'Eldritch',   min: 271, max: 320 },
    { name: 'Divine',     min: 321, max: 999 },
  ];
  const allRows = db
    .prepare(
      `SELECT id, name, class, level, arena_rating, wins, losses, is_npc FROM characters
       WHERE arena_rating > 0
       ORDER BY arena_rating DESC LIMIT 500`,
    )
    .all() as { id: number; name: string; class: string; level: number; arena_rating: number; wins: number; losses: number; is_npc: number }[];
  const tiered = BANDS.map((b) => ({
    band: b.name,
    min_level: b.min,
    max_level: b.max,
    entries: allRows
      .filter((r) => r.level >= b.min && r.level <= b.max)
      .slice(0, 10),
  }));
  res.json({ leaderboard: allRows.slice(0, 50), tiered });
});

export default router;
