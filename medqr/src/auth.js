import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import db from './db.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 дни

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// Криптографски силен, URL-безопасен токен. Използва се както за сесии,
// така и за спешния достъп (трябва да е непредвидим).
export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

export function createSession(userId) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(token, userId, expiresAt);
  return token;
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function userFromSession(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token);
  return row || null;
}

// Express middleware: добавя req.user или null.
export function attachUser(req, _res, next) {
  req.user = userFromSession(req.cookies?.sid);
  next();
}

// Express middleware: изисква вписан потребител.
export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}
