import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';
import { ACHIEVEMENTS, findAchievement } from '../game/achievements';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const ch = db.prepare('SELECT id, current_title FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number; current_title: string } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const owned = db.prepare('SELECT slug, unlocked_at FROM achievements WHERE character_id = ?').all(ch.id) as { slug: string; unlocked_at: number }[];
  const ownedMap = new Map(owned.map((o) => [o.slug, o.unlocked_at]));
  const list = ACHIEVEMENTS.map((a) => ({
    slug: a.slug,
    name: a.name,
    description: a.description,
    icon: a.icon,
    title: a.title || null,
    goldReward: a.goldReward || 0,
    xpReward: a.xpReward || 0,
    unlocked: ownedMap.has(a.slug),
    unlocked_at: ownedMap.get(a.slug) || null,
  }));
  res.json({
    achievements: list,
    total: ACHIEVEMENTS.length,
    earned: owned.length,
    current_title: ch.current_title || '',
    available_titles: list.filter((a) => a.unlocked && a.title).map((a) => a.title!),
  });
});

const titleSchema = z.object({ title: z.string().max(40) });

router.post('/title', (req, res) => {
  const parse = titleSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const ch = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!ch) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const wanted = parse.data.title;
  if (wanted !== '') {
    // Verify they own an achievement that grants this title
    const owned = db.prepare('SELECT slug FROM achievements WHERE character_id = ?').all(ch.id) as { slug: string }[];
    const allowed = owned.map((o) => findAchievement(o.slug)?.title).filter(Boolean) as string[];
    if (!allowed.includes(wanted)) {
      res.status(403).json({ error: 'You have not earned that title.' });
      return;
    }
  }
  db.prepare('UPDATE characters SET current_title = ? WHERE id = ?').run(wanted, ch.id);
  res.json({ ok: true, title: wanted });
});

export default router;
