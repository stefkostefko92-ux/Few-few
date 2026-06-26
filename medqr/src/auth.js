import { randomBytes, createHash } from 'node:crypto';
import db from './db.js';
import { hashSecret, verifySecret, needsRehash } from './hashing.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 дни (обикновена сесия)
const REMEMBER_TTL_MS = 1000 * 60 * 60 * 24 * 365; // 1 година („остани вписан“ / приложение)
const PENDING_TTL_MS = 1000 * 60 * 5; // 5 минути за въвеждане на 2FA код
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const ttlFor = (longLived) => (longLived ? REMEMBER_TTL_MS : SESSION_TTL_MS);

// Опции за бисквитката на сесията (sid). maxAge = срок на валидност.
export function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
  };
}

// Argon2id хеширане (async). Приема и стари bcrypt хешове при проверка.
export const hashPassword = (plain) => hashSecret(plain);
export const verifyPassword = (plain, hash) => verifySecret(plain, hash);
export { needsRehash };

// Криптографски силен, URL-безопасен токен (сесии и спешен достъп).
export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

// ---- Сесии ----
// remember=true прави сесията дълготрайна (за приложението/„остани вписан“).
// Връща токена и maxAge за бисквитката.
export function createSession(userId, req, remember = false) {
  const token = randomToken(32);
  const ttl = ttlFor(remember);
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const ip = req ? (req.ip || '').trim() : null;
  const ua = req ? String(req.get?.('user-agent') || '').slice(0, 300) : null;
  db.prepare(
    'INSERT INTO sessions (token, user_id, ip, user_agent, long_lived, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(token, userId, ip, ua, remember ? 1 : 0, expiresAt);
  return { token, maxAge: ttl };
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function userFromSession(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, s.long_lived FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token);
  if (!row) return null;
  // Плъзгащо подновяване: активният потребител не бива изхвърлян (вход веднъж).
  const ttl = ttlFor(row.long_lived);
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  db.prepare("UPDATE sessions SET last_seen = datetime('now'), expires_at = ? WHERE token = ?").run(
    expiresAt,
    token
  );
  return { id: row.id, email: row.email, _ttlMs: ttl };
}

// Списък с активни сесии на потребител (за „активни устройства").
export function listSessions(userId) {
  return db
    .prepare(
      `SELECT token, ip, user_agent, created_at, last_seen
       FROM sessions WHERE user_id = ? AND expires_at > datetime('now')
       ORDER BY last_seen DESC`
    )
    .all(userId);
}

// Изход от всички устройства, освен текущото (или всички, ако keepToken е празно).
export function destroyOtherSessions(userId, keepToken) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, keepToken || '');
}

export function attachUser(req, res, next) {
  const user = userFromSession(req.cookies?.sid);
  req.user = user;
  // Плъзгащо подновяване и на бисквитката, за да не изтича при активен достъп.
  if (user && res && req.cookies?.sid) {
    res.cookie('sid', req.cookies.sid, sessionCookieOptions(user._ttlMs));
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

// ---- Заключване след неуспешни опити (brute-force защита) ----
export function isLocked(user) {
  return !!(user.locked_until && new Date(user.locked_until).getTime() > Date.now());
}

export function registerFailedAttempt(user) {
  const attempts = (user.failed_attempts || 0) + 1;
  if (attempts >= MAX_FAILED) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = ? WHERE id = ?').run(
      until,
      user.id
    );
    return true; // заключен
  }
  db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?').run(attempts, user.id);
  return false;
}

export function resetAttempts(userId) {
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(userId);
}

// ---- Временно състояние между паролата и 2FA кода ----
export function createPendingLogin(userId) {
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + PENDING_TTL_MS).toISOString();
  db.prepare('INSERT INTO pending_logins (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
  return token;
}

export function userIdFromPending(token) {
  if (!token) return null;
  const row = db
    .prepare("SELECT user_id FROM pending_logins WHERE token = ? AND expires_at > datetime('now')")
    .get(token);
  return row ? row.user_id : null;
}

export function destroyPending(token) {
  if (token) db.prepare('DELETE FROM pending_logins WHERE token = ?').run(token);
}

// ---- Еднократни токени (потвърждение на имейл / нулиране на парола) ----
const hashToken = (raw) => createHash('sha256').update(raw).digest('hex');

export function createToken(userId, type, ttlMinutes) {
  const raw = randomToken(32);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60000).toISOString();
  // Само един активен токен от даден тип на потребител.
  db.prepare('DELETE FROM tokens WHERE user_id = ? AND type = ?').run(userId, type);
  db.prepare('INSERT INTO tokens (token_hash, user_id, type, expires_at) VALUES (?, ?, ?, ?)').run(
    hashToken(raw),
    userId,
    type,
    expiresAt
  );
  return raw;
}

// Проверява токена БЕЗ да го консумира (за GET страници). Връща user_id или null.
export function peekToken(raw, type) {
  if (!raw) return null;
  const row = db
    .prepare(
      "SELECT user_id FROM tokens WHERE token_hash = ? AND type = ? AND expires_at > datetime('now')"
    )
    .get(hashToken(raw), type);
  return row ? row.user_id : null;
}

// Проверява и консумира (изтрива) токена. Връща user_id или null.
export function consumeToken(raw, type) {
  if (!raw) return null;
  const hash = hashToken(raw);
  const row = db
    .prepare(
      "SELECT user_id FROM tokens WHERE token_hash = ? AND type = ? AND expires_at > datetime('now')"
    )
    .get(hash, type);
  db.prepare('DELETE FROM tokens WHERE token_hash = ?').run(hash);
  return row ? row.user_id : null;
}

export function destroyUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// ---- Резервни кодове за 2FA ----
// Генерира нов комплект (изтрива старите), връща суровите кодове за еднократно показване.
export async function generateRecoveryCodes(userId, count = 10) {
  db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
  const codes = [];
  const insert = db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)');
  for (let i = 0; i < count; i++) {
    // 10 hex знака, групирани (напр. "a1b2c-3d4e5") — лесни за въвеждане.
    const raw = randomBytes(5).toString('hex');
    const pretty = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    codes.push(pretty);
    insert.run(userId, await hashSecret(pretty));
  }
  return codes;
}

export function countRecoveryCodes(userId) {
  return db
    .prepare('SELECT COUNT(*) c FROM recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .get(userId).c;
}

// Проверява и консумира резервен код. Връща true при успех.
export async function consumeRecoveryCode(userId, code) {
  const norm = String(code || '')
    .trim()
    .toLowerCase();
  if (!norm) return false;
  const rows = db
    .prepare('SELECT id, code_hash FROM recovery_codes WHERE user_id = ? AND used_at IS NULL')
    .all(userId);
  for (const row of rows) {
    if (await verifySecret(norm, row.code_hash)) {
      db.prepare("UPDATE recovery_codes SET used_at = datetime('now') WHERE id = ?").run(row.id);
      return true;
    }
  }
  return false;
}
