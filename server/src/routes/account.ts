import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db';
import { authRequired } from '../middleware/auth';

const router = Router();
router.use(authRequired);

router.get('/me', (req, res) => {
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, email, created_at FROM users WHERE id = ?')
    .get(req.auth!.uid) as { id: number; username: string; email: string; created_at: number } | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const charCount = (db.prepare('SELECT COUNT(*) AS c FROM characters WHERE user_id = ?').get(req.auth!.uid) as { c: number }).c;
  res.json({ user, hasCharacter: charCount > 0 });
});

const changePwSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(6).max(100),
});

router.post('/password', async (req, res) => {
  const parse = changePwSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.auth!.uid) as { password_hash: string } | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const ok = await bcrypt.compare(parse.data.current, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }
  const hash = await bcrypt.hash(parse.data.next, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.auth!.uid);
  res.json({ ok: true });
});

const deleteCharSchema = z.object({
  confirm: z.literal('DELETE'),
});

router.post('/delete-character', (req, res) => {
  const parse = deleteCharSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Type DELETE to confirm.' });
    return;
  }
  const db = getDb();
  db.prepare('DELETE FROM characters WHERE user_id = ?').run(req.auth!.uid);
  res.json({ ok: true });
});

export default router;
