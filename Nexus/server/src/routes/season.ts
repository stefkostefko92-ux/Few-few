import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { seasonKeyFor, seasonEndsAt, prevSeasonKey, finalizePrevSeasonIfDue } from '../game/seasons';

const router = Router();
router.use(authRequired);

/**
 * Сезонна класация: текущите топ 50 + моят ранг + оставащо време + подиумът
 * от миналия сезон. Първата заявка в нов месец lazy-финализира стария сезон.
 */
router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) { res.status(404).json({ error: 'No character' }); return; }
  finalizePrevSeasonIfDue(db);
  const key = seasonKeyFor();
  const top = db.prepare(
    `SELECT s.character_id, s.points, c.name, c.class, c.level, c.avatar, c.frame_slug
     FROM season_scores s JOIN characters c ON c.id = s.character_id AND c.is_npc = 0
     WHERE s.season_key = ? ORDER BY s.points DESC, s.updated_at ASC LIMIT 50`,
  ).all(key);
  const mine = db.prepare('SELECT points FROM season_scores WHERE season_key = ? AND character_id = ?')
    .get(key, ch.id) as { points: number } | undefined;
  const myRank = mine
    ? (db.prepare(
        'SELECT COUNT(*) AS n FROM season_scores s JOIN characters c ON c.id = s.character_id AND c.is_npc = 0 WHERE s.season_key = ? AND s.points > ?',
      ).get(key, mine.points) as { n: number }).n + 1
    : null;
  const lastPodium = db.prepare(
    `SELECT r.rank, r.points, r.reward_gems, r.reward_gold, r.title, c.name, c.class, c.level
     FROM season_results r JOIN characters c ON c.id = r.character_id
     WHERE r.season_key = ? AND r.rank <= 3 ORDER BY r.rank`,
  ).all(prevSeasonKey());
  res.json({
    season_key: key,
    ends_at: seasonEndsAt(),
    top,
    my_points: mine?.points ?? 0,
    my_rank: myRank,
    last_season: { season_key: prevSeasonKey(), podium: lastPodium },
  });
});

export default router;
