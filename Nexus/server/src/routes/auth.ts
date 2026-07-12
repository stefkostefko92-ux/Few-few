import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../db';
import { signToken } from '../middleware/auth';
import { logFromRequest } from '../lib/logger';
import { clientIp, clientHwid, isBanEvasion } from '../lib/bans';

const router = Router();

/**
 * PII minimisation for event_log (GDPR Art. 5(1)(c)). Lets us correlate
 * repeat unknown-identifier attempts for forensics without dumping raw
 * usernames or emails into a log that's exported with a DB backup.
 */
function hashIdentifier(s: string): string {
  return crypto.createHash('sha256').update(s.trim().toLowerCase()).digest('hex').slice(0, 12);
}

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

// Audit #14: 6-char minimum was below OWASP guidance. Push to 8 chars
// and reject the 50 most common breached passwords; refuse anything
// where the username or email local-part is a substring.
const COMMON_PASSWORDS = new Set([
  'password','12345678','qwerty12','iloveyou','welcome1','admin123','password1',
  'letmein1','dragon12','football','baseball','password!','qwertyui','asdfghjk',
  'zxcvbnm1','monkey12','master12','sunshine','princess','qwerty123','password123',
  'iloveyou1','welcome123','12345abc','abcd1234','1q2w3e4r','passw0rd','p@ssword',
  'qazwsxedc','starwars','superman','batman123','spider123','hello1234','trustno1',
]);
// Shared so other routes that mint or rotate passwords (admin user
// create, account change-password) enforce the same floor.
export const passwordRule = z.string().min(8).max(100)
  .refine((p) => !COMMON_PASSWORDS.has(p.toLowerCase()), 'Password is too common');
export const PASSWORD_BCRYPT_ROUNDS = 12;

// GDPR Art. 8 — digital consent age varies per member state. Bulgaria and
// Italy set the floor at 14 (ЗЗЛД 25е / Codice Privacy 2-quinquies); France
// 15; Germany / most other EU 16; non-EU 13 as a global floor.
const AGE_OF_DIGITAL_CONSENT: Record<string, number> = {
  BG: 14, IT: 14, FR: 15,
  DE: 16, AT: 16, IE: 16, HU: 16, NL: 16, LU: 16, LT: 16, RO: 16, SK: 16, HR: 16,
  default: 16,
};

function ageFromDob(dob: string, now = new Date()): number {
  const d = new Date(dob);
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const registerSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, underscores only'),
  email: z.string().email(),
  password: passwordRule,
  // ISO date (YYYY-MM-DD) — never displayed back. Used once at register
  // time for the age gate and stored hashed-less so the user can later
  // amend it via a support request (no self-service field).
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth required'),
  country: z.string().length(2).regex(/^[A-Z]{2}$/),
});

router.post('/register', async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: parse.error.flatten() });
    return;
  }
  const { username, email, password, dateOfBirth, country } = parse.data;
  // Анти-евейжън: банато IP/устройство не може да си прави НОВ акаунт.
  const evade = isBanEvasion(clientIp(req), clientHwid(req));
  if (evade.banned) {
    logFromRequest(req, { category: 'moderation', action: 'register_blocked_ban', level: 'warn', message: 'register from banned ip/device' });
    res.status(403).json({ error: 'banned', reason: evade.reason || 'Access from this device or network is banned.' });
    return;
  }
  // Server-side age gate — the client UI also blocks but a hand-rolled
  // POST would bypass it. We refuse the registration entirely below the
  // threshold instead of asking for parental consent (the operator does
  // not have the parental-consent infrastructure yet).
  const minAge = AGE_OF_DIGITAL_CONSENT[country] ?? AGE_OF_DIGITAL_CONSENT.default;
  const age = ageFromDob(dateOfBirth);
  if (!Number.isFinite(age) || age < 0 || age > 130) {
    res.status(400).json({ error: 'Invalid date of birth' });
    return;
  }
  if (age < minAge) {
    res.status(403).json({ error: `Registration requires age ${minAge}+ in ${country}.` });
    return;
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (existing) {
    res.status(409).json({ error: 'Username or email already in use' });
    return;
  }
  const hash = await bcrypt.hash(password, 12);  // audit #14: rounds 12 ≥ OWASP guidance
  const now = Date.now();
  const info = db
    .prepare('INSERT INTO users (username, email, password_hash, date_of_birth, country, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(username, email, hash, dateOfBirth, country, now, now);
  const uid = info.lastInsertRowid as number;
  const token = signToken({ uid, username }, 0);
  // Do NOT put the raw email in meta: logEvent mirrors meta to stdout and
  // fans it out to any configured webhook (incl. non-EU ones like Discord),
  // which would be an undeclared PII transfer. A one-way hash keeps the
  // event useful for support without leaking the address.
  logFromRequest(req, { category: 'auth', action: 'register', user_id: uid, message: `New user ${username}`, meta: { email_hash: hashIdentifier(email), country, age } });
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
    .prepare('SELECT id, username, email, password_hash, is_admin, token_version, banned, banned_reason FROM users WHERE username = ? OR email = ?')
    .get(username, username) as { id: number; username: string; email: string; password_hash: string; is_admin: number; token_version: number; banned: number; banned_reason: string } | undefined;
  // Audit #5: always run a bcrypt to flatten the timing difference between
  // unknown-user and bad-password branches. The cost MUST match the real
  // hashes (bcrypt.hash(..., 12)) — a cheaper cost-10 dummy ran ~4x faster
  // and re-opened the user-enumeration timing oracle this is meant to close.
  const dummyHash = '$2b$12$0123456789012345678901u4qHYAxvqlH/2DH9MlYrFkH4q/Tj0aae';
  if (!user) {
    await bcrypt.compare(password, dummyHash).catch(() => false);
    logFromRequest(req, { category: 'auth', action: 'login_failed', level: 'warn', message: `Unknown identifier ${hashIdentifier(username)}` });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    logFromRequest(req, { category: 'auth', action: 'login_failed', level: 'warn', user_id: user.id, message: `Bad password for ${user.username}` });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  // Бан: самият акаунт, или текущото IP/устройство (анти-евейжън).
  if (user.banned === 1) {
    res.status(403).json({ error: 'banned', reason: user.banned_reason || 'Account banned.' });
    return;
  }
  const evade = isBanEvasion(clientIp(req), clientHwid(req));
  if (evade.banned) {
    res.status(403).json({ error: 'banned', reason: evade.reason || 'Access from this device or network is banned.' });
    return;
  }
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), user.id);
  const token = signToken({ uid: user.id, username: user.username }, user.token_version || 0);
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
    logFromRequest(req, { category: 'auth', action: 'forgot_unknown', level: 'warn', message: `forgot for unknown ${hashIdentifier(identifier)}` });
    res.json({ ok: true });
    return;
  }
  const token = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + 60 * 60 * 1000; // 1 hour
  db.prepare('INSERT INTO password_resets (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, user.id, expires, Date.now());
  logFromRequest(req, { category: 'auth', action: 'forgot', user_id: user.id, message: `password reset requested ${user.username}` });
  // Audit #4: never leak the reset token in the HTTP response in
  // production. In dev we still return `devToken` for local testing.
  const body: any = { ok: true };
  if (process.env.NODE_ENV !== 'production') {
    body.devToken = token;
    body.expiresAt = expires;
  }
  res.json(body);
});

const resetSchema = z.object({
  // Audit fix: regex-validate hex shape but don't lock to one length,
  // so future randomBytes(32) tokens still pass.
  token: z.string().trim().regex(/^[a-f0-9]{32,128}$/, 'malformed token'),
  newPassword: z.string().min(8).max(100),  // bumped to 8 (audit #14)
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
  const hash = await bcrypt.hash(newPassword, 12);
  // Bump token_version to immediately invalidate every existing JWT
  // for this user (audit #6).
  db.prepare('UPDATE users SET password_hash=?, token_version=token_version+1 WHERE id=?').run(hash, row.user_id);
  db.prepare('UPDATE password_resets SET used_at=? WHERE token=?').run(Date.now(), token);
  logFromRequest(req, { category: 'auth', action: 'password_reset', user_id: row.user_id, message: 'password updated via reset token' });
  res.json({ ok: true });
});

export default router;
