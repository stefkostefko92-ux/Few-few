import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../db';
import { signToken } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';

const router = Router();

// Ensure the password-reset bookkeeping table exists. Idempotent — runs
// on every server boot via the route registration.
const db = getDb();
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
`);

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
  logFromRequest(req, { category: 'auth', action: 'register', user_id: uid, message: `New user ${username}`, meta: { email } });
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
    logFromRequest(req, { category: 'auth', action: 'login_failed', level: 'warn', message: `Unknown identifier ${username}` });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    logFromRequest(req, { category: 'auth', action: 'login_failed', level: 'warn', user_id: user.id, message: `Bad password for ${user.username}` });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), user.id);
  const token = signToken({ uid: user.id, username: user.username });
  logFromRequest(req, { category: 'auth', action: 'login', user_id: user.id, message: `Login ${user.username}` });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin } });
});

/* =========================================================================
   Password reset — token-based flow.
   No email service is configured; the token is returned in the response
   so an admin / support workflow can deliver it out-of-band, OR the
   front-end can paste it directly into the reset form. When SMTP gets
   wired up later, swap the response to { sent: true } and email the
   token instead.
   ========================================================================= */
const forgotSchema = z.object({ identifier: z.string().min(1) });

router.post('/forgot', async (req, res) => {
  const parse = forgotSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { identifier } = parse.data;
  const db = getDb();
  const user = db
    .prepare('SELECT id, username, email FROM users WHERE username=? OR email=?')
    .get(identifier, identifier) as { id: number; username: string; email: string } | undefined;
  // Always pretend it worked, to avoid an account-enumeration oracle.
  if (!user) {
    logFromRequest(req, { category: 'auth', action: 'forgot_unknown', level: 'warn', message: `forgot for unknown ${identifier}` });
    res.json({ ok: true });
    return;
  }
  const token = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000; // 1 hour
  db.prepare('INSERT INTO password_resets (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, user.id, expires, Date.now());
  logFromRequest(req, { category: 'auth', action: 'forgot', user_id: user.id, message: `password reset requested ${user.username}` });
  // In production replace with email + return { ok: true } only.
  res.json({ ok: true, devToken: token, expiresAt: expires });
});

const resetSchema = z.object({
  token: z.string().length(48),
  newPassword: z.string().min(6).max(100),
});

router.post('/reset', async (req, res) => {
  const parse = resetSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ error: parse.error.flatten() }); return; }
  const { token, newPassword } = parse.data;
  const db = getDb();
  const row = db.prepare('SELECT * FROM password_resets WHERE token=?').get(token) as
    | { user_id: number; expires_at: number; used_at: number } | undefined;
  if (!row || row.used_at || row.expires_at < Date.now()) {
    res.status(400).json({ error: 'Invalid or expired token' });
    return;
  }
  const hash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, row.user_id);
  db.prepare('UPDATE password_resets SET used_at=? WHERE token=?').run(Date.now(), token);
  logFromRequest(req, { category: 'auth', action: 'password_reset', user_id: row.user_id, message: 'password updated via reset token' });
  res.json({ ok: true });
});

export default router;
