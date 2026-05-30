import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db';
import { signToken } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, underscores only'),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

router.post('/register', async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const { username, email, password } = parse.data;
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    res.status(409).json({ error: 'Username or email already in use' });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const now = Date.now();
  const info = db
    .prepare('INSERT INTO users (username, email, password_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .run(username, email, hash, now, now);
  const uid = info.lastInsertRowid as number;
  const token = signToken({ uid, username });
  res.status(201).json({ token, user: { id: uid, username, email, is_admin: 0 } });
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

router.post('/login', async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const { username, password } = parse.data;
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, email, password_hash, is_admin FROM users WHERE username = ? OR email = ?')
    .get(username, username) as { id: number; username: string; email: string; password_hash: string; is_admin: number } | undefined;
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), user.id);
  const token = signToken({ uid: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin } });
});

export default router;
