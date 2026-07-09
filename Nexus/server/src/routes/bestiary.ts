import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const all = db.prepare('SELECT * FROM monsters ORDER BY level').all() as any[];
  const found = db
    .prepare('SELECT monster_slug, kills, first_killed_at, last_killed_at FROM bestiary WHERE character_id = ?')
    .all(ch.id) as { monster_slug: string; kills: number; first_killed_at: number; last_killed_at: number }[];
  const foundMap = new Map(found.map((f) => [f.monster_slug, f]));
  const list = all.map((m) => {
    const entry = foundMap.get(m.slug);
    if (!entry) {
      return {
        slug: m.slug,
        name: '???',
        level: m.level,
        family: m.family,
        region: m.region,
        sprite: m.sprite,
        discovered: false,
        kills: 0,
      };
    }
    return {
      slug: m.slug,
      name: m.name,
      level: m.level,
      family: m.family,
      region: m.region,
      sprite: m.sprite,
      hp: m.hp,
      atk_min: m.atk_min,
      atk_max: m.atk_max,
      defense: m.defense,
      xp_reward: m.xp_reward,
      discovered: true,
      kills: entry.kills,
      first_killed_at: entry.first_killed_at,
      last_killed_at: entry.last_killed_at,
    };
  });
  res.json({
    bestiary: list,
    total: all.length,
    discovered: found.length,
  });
});

export default router;
