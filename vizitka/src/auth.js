// Сесии с бисквитка (httpOnly, SameSite=Lax) + хеширане на пароли (bcrypt).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db, { purgeExpiredSessions } from './db.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дни
export const SESSION_COOKIE = 'vz_sid';
const prod = process.env.NODE_ENV === 'production';

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function createSession(res, userId) {
  purgeExpiredSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare('INSERT INTO sessions (id, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    csrfToken,
    expiresAt
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: prod,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE id = ?').run(sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

// Закача req.user + req.session (или null) на всяка заявка.
export function attachUser(req, res, next) {
  req.user = null;
  req.session = null;
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  const session = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
    .get(sha256(token), Date.now());
  if (!session) return next();
  const user = db
    .prepare('SELECT id, email, created_at FROM users WHERE id = ?')
    .get(session.user_id);
  if (user) {
    req.user = user;
    req.session = session;
    res.locals.user = user;
    res.locals.csrfToken = session.csrf_token;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}
