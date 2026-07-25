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

// Токен: base64url(JSON{u, exp, ab, g, jti, n}) + "." + HMAC.
//   exp — кога изтича ТАЗИ бисквитка (плъзгащ се, подновява се при активност)
//   ab  — абсолютен таван: докъдето сесията може да се подновява изобщо
//   g   — поколение: увеличиш ли го в конфига, ВСИЧКИ издадени токени падат
//         (изход от всички устройства, смяна на парола/2FA)
//   jti — идентификатор на сесията (за списък и поименна отмяна)
export function createSession(secret, user, ttlMs, { absoluteMs = ttlMs, gen = 0, jti } = {}) {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({
      u: user,
      exp: now + ttlMs,
      ab: now + absoluteMs,
      g: gen,
      jti: jti || crypto.randomBytes(9).toString('base64url'),
      n: crypto.randomBytes(8).toString('hex'),
    })
  ).toString('base64url');
  return `${payload}.${hmac(secret, payload)}`;
}

export function verifySession(secret, token, { gen = 0, revoked = null } = {}) {
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
    const now = Date.now();
    if (!data.exp || now > data.exp) return null; // бездействие
    if (data.ab && now > data.ab) return null; // абсолютен таван
    if ((data.g || 0) !== gen) return null; // отменено поколение
    if (revoked && data.jti && revoked.has(data.jti)) return null; // поименно отменена
    return { user: data.u, exp: data.exp, absolute: data.ab, jti: data.jti, gen: data.g || 0 };
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
const FAIL_MAX_KEYS = 5000; // таван на картата — иначе подправени IP-та я растат без край
const fails = new Map();

// Изхвърля изтеклите записи и налага таван (най-старите падат първи).
function pruneFails() {
  const now = Date.now();
  for (const [ip, times] of fails) {
    const recent = times.filter((t) => now - t < FAIL_WINDOW_MS);
    if (recent.length) fails.set(ip, recent);
    else fails.delete(ip);
  }
  if (fails.size > FAIL_MAX_KEYS) {
    const excess = fails.size - FAIL_MAX_KEYS;
    let i = 0;
    for (const ip of fails.keys()) {
      if (i++ >= excess) break;
      fails.delete(ip);
    }
  }
}

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
  pruneFails();
}

// Само за тестове — нулира състоянието на лимитера.
export function _resetLoginLimiter() {
  fails.clear();
}

export function loginSucceeded(ip) {
  fails.delete(ip);
}
