// Единичен админ (собственикът) — подписана сесийна бисквитка, bcrypt парола от средата.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

function sign(value) {
  return crypto.createHmac('sha256', config.session.secret).update(value).digest('base64url');
}

export function createSession(res) {
  const payload = JSON.stringify({ u: 'admin', exp: Date.now() + config.session.maxAgeMs });
  const b64 = Buffer.from(payload).toString('base64url');
  res.cookie(config.session.cookieName, `${b64}.${sign(b64)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: config.session.maxAgeMs,
  });
}

export function destroySession(res) {
  res.clearCookie(config.session.cookieName);
}

export function readSession(req) {
  const raw = req.cookies?.[config.session.cookieName];
  if (!raw) return null;
  const [b64, sig] = raw.split('.');
  if (!b64 || !sig) return null;
  const expected = sign(b64);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8'));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyLogin(email, password) {
  if (!config.admin.email || !config.admin.passwordHash) {
    // Dev режим без конфигуриран админ: admin@localhost / admin (никога в продукция).
    if (config.env !== 'production') return email === 'admin@localhost' && password === 'admin';
    return false;
  }
  return email === config.admin.email && bcrypt.compareSync(password, config.admin.passwordHash);
}

export function requireAuth(req, res, next) {
  const session = readSession(req);
  if (!session) return res.redirect('/login');
  req.session = session;
  next();
}
