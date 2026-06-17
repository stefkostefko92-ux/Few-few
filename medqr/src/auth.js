import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import db from './db.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 дни
const PENDING_TTL_MS = 1000 * 60 * 5; // 5 минути за въвеждане на 2FA код
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

// Криптографски силен, URL-безопасен токен (сесии и спешен достъп).
export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

// ---- Сесии ----
export function createSession(userId) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
  return token;
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function userFromSession(token) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT u.id, u.email FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`
      )
      .get(token) || null
  );
}

export function attachUser(req, _res, next) {
  req.user = userFromSession(req.cookies?.sid);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

// ---- Заключване след неуспешни опити (brute-force защита) ----
export function isLocked(user) {
  return !!(
    user.locked_until &&
    new Date(user.locked_until).getTime() > Date.now()
  );
}

export function registerFailedAttempt(user) {
  const attempts = (user.failed_attempts || 0) + 1;
  if (attempts >= MAX_FAILED) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    db.prepare(
      'UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?'
    ).run(until, user.id);
    return true; // заключен
  }
  db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id);
  return false;
}

export function resetAttempts(userId) {
  db.prepare(
    'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?'
  ).run(userId);
}

// ---- Временно състояние между паролата и 2FA кода ----
export function createPendingLogin(userId) {
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
  db.prepare(
    'INSERT INTO pending_logins (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(token, userId, expiresAt);
  return token;
}

export function userIdFromPending(token) {
  if (!token) return null;
  const row = db
    .prepare(
      "SELECT user_id FROM pending_logins WHERE token = ? AND expires_at > datetime('now')"
    )
    .get(token);
  return row ? row.user_id : null;
}

export function destroyPending(token) {
  if (token) db.prepare('DELETE FROM pending_logins WHERE token = ?').run(token);
}
