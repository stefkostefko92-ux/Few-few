import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  const rows = db
    .prepare('SELECT * FROM mail WHERE character_id = ? ORDER BY created_at DESC')
    .all(char.id);
  const unread = (rows as any[]).filter((m) => !m.read_at).length;
  res.json({ mails: rows, unread });
});

router.post('/:id/read', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  db.prepare('UPDATE mail SET read_at = ? WHERE id = ? AND character_id = ?').run(Date.now(), id, char.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const char = db.prepare('SELECT id FROM characters WHERE user_id = ?').get(req.auth!.uid) as { id: number } | undefined;
  if (!char) {
    res.status(404).json({ error: 'No character' });
    return;
  }
  db.prepare('DELETE FROM mail WHERE id = ? AND character_id = ?').run(id, char.id);
  res.json({ ok: true });
});

export default router;
