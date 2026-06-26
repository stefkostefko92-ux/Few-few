import { Router } from 'express';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';

const router = Router();
router.use(authRequired);

router.get('/history', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const rows = db
    .prepare(
      `SELECT id, opponent, kind, result, xp_gained, gold_gained, created_at
       FROM combat_log WHERE character_id = ?
       ORDER BY created_at DESC LIMIT 50`,
    )
    .all(char.id);
  res.json({ entries: rows });
});

router.get('/history/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const row = db
    .prepare(
      `SELECT id, opponent, kind, result, rounds_json, xp_gained, gold_gained, created_at
       FROM combat_log WHERE id = ? AND character_id = ?`,
    )
    .get(id, char.id) as any;
  if (!row) {
    res.status(404).json({ error: 'Battle not found' });
    return;
  }
  try {
    const parsed = JSON.parse(row.rounds_json);
    if (Array.isArray(parsed)) {
      row.rounds = parsed;
      row.hero = null;
      row.foe = null;
      row.victory = row.result === 'win';
    } else {
      row.hero = parsed.hero;
      row.foe = parsed.foe;
      row.rounds = parsed.rounds;
      row.victory = !!parsed.victory;
    }
    delete row.rounds_json;
  } catch {
    row.rounds = [];
  }
  res.json({ entry: row });
});

export default router;
