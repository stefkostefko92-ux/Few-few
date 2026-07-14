// Автентикация за админ панела — нула зависимости (node:crypto).
// Парола: scrypt хеш. Сесия: подписана с HMAC бисквитка (без сървърно състояние).

import { scryptSync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

// ── Пароли ──────────────────────────────────────────────────────────────────
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const h = scryptSync(String(password), record.salt, 32);
  const stored = Buffer.from(record.hash, 'hex');
  return h.length === stored.length && timingSafeEqual(h, stored);
}

// ── Сесии (подписана бисквитка) ──────────────────────────────────────────────
const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** Връща token „payloadB64.signatureB64". `ttlSec` = валидност. */
export function signSession(secret, ttlSec = 60 * 60 * 8, now = Date.now()) {
  const payload = b64u(JSON.stringify({ exp: now + ttlSec * 1000 }));
  const sig = b64u(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

/** Проверява token; връща payload обект или null (изтекъл/подправен). */
export function verifySession(secret, token, now = Date.now()) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = b64u(createHmac('sha256', secret).update(payload).digest());
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data.exp !== 'number' || data.exp < now) return null;
  return data;
}

// ── Бисквитки ─────────────────────────────────────────────────────────────────
export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookieSet(name, value, { maxAge, secure = true } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/admin`;
  if (secure) c += '; Secure';
  if (maxAge != null) c += `; Max-Age=${maxAge}`;
  return c;
}
