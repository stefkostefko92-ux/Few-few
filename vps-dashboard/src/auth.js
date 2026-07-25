// Автентикация: scrypt хеш на паролата + HMAC-подписани сесийни токени (stateless).
// Нула зависимости — само node:crypto. Времево-константни сравнения навсякъде.
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split(':');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

// Токен: base64url(JSON{u, exp, n}) + "." + HMAC. Изтича след ttl; nonce пази от повторение на стар payload с друг подпис.
export function createSession(secret, user, ttlMs) {
  const payload = Buffer.from(
    JSON.stringify({ u: user, exp: Date.now() + ttlMs, n: crypto.randomBytes(8).toString('hex') })
  ).toString('base64url');
  return `${payload}.${hmac(secret, payload)}`;
}

export function verifySession(secret, token) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(secret, payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return { user: data.u, exp: data.exp };
  } catch {
    return null;
  }
}

export function tokenEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Лимит на login опитите: 5 провала / 10 мин на IP (в паметта — достатъчно за 1 админ).
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const fails = new Map();

export function loginAllowed(ip) {
  const rec = fails.get(ip);
  if (!rec) return true;
  const recent = rec.filter((t) => Date.now() - t < FAIL_WINDOW_MS);
  fails.set(ip, recent);
  return recent.length < FAIL_LIMIT;
}

export function loginFailed(ip) {
  const rec = fails.get(ip) || [];
  rec.push(Date.now());
  fails.set(ip, rec);
}

export function loginSucceeded(ip) {
  fails.delete(ip);
}
