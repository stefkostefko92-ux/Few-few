import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.auth!.uid) as any;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const ds = db.prepare('SELECT * FROM daily_state WHERE character_id = ?').get(ch.id) as any;
  const ach = (db.prepare('SELECT COUNT(*) AS c FROM achievements WHERE character_id = ?').get(ch.id) as { c: number }).c;
  const best = (db.prepare('SELECT COUNT(*) AS c, SUM(kills) AS k FROM bestiary WHERE character_id = ?').get(ch.id) as { c: number; k: number | null });
  const battles = (db.prepare('SELECT COUNT(*) AS c FROM combat_log WHERE character_id = ?').get(ch.id) as { c: number }).c;
  const quests = (db.prepare("SELECT COUNT(*) AS c FROM quest_log WHERE character_id = ? AND result = 'success'").get(ch.id) as { c: number }).c;
  const ageDays = Math.max(1, Math.floor((Date.now() - ch.created_at) / 86_400_000));

  res.json({
    character: {
      name: ch.name,
      class: ch.class,
      level: ch.level,
      xp: ch.xp,
      gold: ch.gold,
      arena_rating: ch.arena_rating,
      created_at: ch.created_at,
      current_title: ch.current_title || '',
    },
    lifetime: {
      battles: battles,
      battles_won: ch.battles_won,
      battles_lost: ch.battles_lost,
      monsters_slain: ch.monsters_slain,
      dungeons_cleared: ch.dungeons_cleared,
      quests_completed: quests,
      total_xp_earned: ch.total_xp_earned,
      total_gold_earned: ch.total_gold_earned,
      arena_wins: ch.wins,
      arena_losses: ch.losses,
    },
    journey: {
      days_played: ageDays,
      streak: ds?.streak ?? 0,
      longest_streak: ds?.longest_streak ?? 0,
      bestiary_unique: best.c,
      bestiary_kills_total: best.k ?? 0,
      achievements: ach,
    },
  });
});

export default router;
