import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';

const router = Router();
router.use(authRequired);

function getCharId(uid: number): number | undefined {
  const r = getDb().prepare('SELECT id FROM characters WHERE user_id = ?').get(uid) as { id: number } | undefined;
  return r?.id;
}

/** Последни нотификации + брой непрочетени (за bell badge). */
router.get('/', (req, res) => {
  const cid = getCharId(req.auth!.uid);
  if (!cid) { res.json({ items: [], unread: 0 }); return; }
  const db = getDb();
  const items = db.prepare('SELECT id, kind, message, ref, read_at, created_at FROM notifications WHERE character_id = ? ORDER BY created_at DESC LIMIT 30').all(cid);
  const unread = (db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE character_id = ? AND read_at = 0').get(cid) as { n: number }).n;
  res.json({ items, unread });
});

/** Маркирай всички като прочетени (или конкретна по id). */
const readSchema = z.object({ id: z.number().int().positive().optional() });
router.post('/read', (req, res) => {
  const cid = getCharId(req.auth!.uid);
  if (!cid) { res.status(404).json({ error: 'No character' }); return; }
  const p = readSchema.safeParse(req.body);
  const now = Date.now();
  const db = getDb();
  if (p.success && p.data.id) {
    db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND character_id = ? AND read_at = 0').run(now, p.data.id, cid);
  } else {
    db.prepare('UPDATE notifications SET read_at = ? WHERE character_id = ? AND read_at = 0').run(now, cid);
  }
  res.json({ ok: true });
});

export default router;
