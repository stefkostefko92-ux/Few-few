// ============================================================
//  PANEV ASCENSORI — Auth (JWT httpOnly cookies + bcrypt)
// ============================================================

'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const db     = require('./db');

const JWT_SECRET    = process.env.JWT_SECRET;
const JWT_EXPIRES   = process.env.JWT_EXPIRES   || '4h';
const COOKIE_NAME   = 'pa_admin_token';
const COOKIE_MAX_MS = 4 * 60 * 60 * 1000; // 4h

if (!JWT_SECRET) {
  console.warn('\n  ⚠  JWT_SECRET non configurato in .env — uso valore default INSICURO.');
  console.warn('  ⚠  In produzione imposta JWT_SECRET con almeno 64 caratteri random.\n');
}

const ACTIVE_SECRET = JWT_SECRET || 'panev-dev-secret-do-not-use-in-production-please-set-JWT_SECRET-env-var';

// ── Brute force protection ────────────────────────────────────
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 15 * 60 * 1000; // 15 min

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
}

function isLocked(ip) {
  const rec = db.getLoginAttempt(ip);
  if (!rec || !rec.locked_until) return false;
  const until = new Date(rec.locked_until + 'Z').getTime(); // SQLite datetime is UTC
  if (Date.now() >= until) {
    db.clearLoginAttempt(ip);
    return false;
  }
  return Math.ceil((until - Date.now()) / 60000); // remaining minutes
}

function recordFailure(ip) {
  const rec = db.getLoginAttempt(ip) || { count: 0 };
  const count = rec.count + 1;
  let lockedUntil = null;
  if (count >= MAX_ATTEMPTS) {
    // SQLite datetime('now') returns UTC; add LOCKOUT_MS ms
    const dt = new Date(Date.now() + LOCKOUT_MS);
    lockedUntil = dt.toISOString().slice(0, 19).replace('T', ' ');
  }
  db.recordLoginAttempt(ip, count, lockedUntil);
  return { count, lockedUntil };
}

function clearFailures(ip) {
  db.clearLoginAttempt(ip);
}

// ── Token handling ────────────────────────────────────────────
function issueToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    ACTIVE_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, ACTIVE_SECRET);
  } catch {
    return null;
  }
}

function setAuthCookie(res, token, isProd) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: !!isProd,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_MS,
    path: '/',
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// ── Express middleware ────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Autenticazione richiesta' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Sessione scaduta o non valida' });

  const user = db.getAdminById(payload.sub);
  if (!user) return res.status(401).json({ error: 'Utente non valido' });

  req.adminUser = user;
  next();
}

// ── Password helpers ──────────────────────────────────────────
async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

async function verifyPassword(plain, hash) {
  try { return await bcrypt.compare(plain, hash); }
  catch { return false; }
}

module.exports = {
  COOKIE_NAME,
  clientIp,
  isLocked,
  recordFailure,
  clearFailures,
  issueToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  requireAdmin,
  hashPassword,
  verifyPassword,
  MAX_ATTEMPTS,
};
