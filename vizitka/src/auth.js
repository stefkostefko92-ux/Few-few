// Сесии с бисквитка (httpOnly, SameSite=Lax) + хеширане на пароли (bcrypt).
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import db, { purgeExpiredSessions } from './db.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дни
export const SESSION_COOKIE = 'vz_sid';
const prod = process.env.NODE_ENV === 'production';

// Админите се задават през ADMIN_EMAILS (запетая-разделени) на сървъра. При старт
// маркираме СЪЩЕСТВУВАЩИТЕ акаунти с is_admin = 1.
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export function seedAdmins() {
  if (!ADMIN_EMAILS.size) return;
  const mark = db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?');
  for (const email of ADMIN_EMAILS) mark.run(email);
}

// Резервиран ли е този имейл за админ? Саморегистрацията с такъв имейл се ОТКАЗВА:
// иначе първият, който познае адреса, си взема админ правата (акаунтът още не
// съществува → няма кой да го заеме). Провизионирането е от сървъра — виж
// `npm run admin:add` и DEPLOY.md.
export const isReservedAdminEmail = (email) =>
  ADMIN_EMAILS.has(
    String(email || '')
      .trim()
      .toLowerCase()
  );

// Правата идват САМО от колоната в базата. Преди тук имаше и жива проверка срещу
// ADMIN_EMAILS, която превръщаше „познай имейла" в „стани админ".
export const isAdmin = (user) => Boolean(user) && user.is_admin === 1;

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Фиктивен хеш със същата цена — сравняваме срещу него, когато потребителят не
// съществува, за да не издава времето на отговора кои имейли са регистрирани.
let dummyHash = null;
export async function verifyDummyPassword(password) {
  dummyHash ??= await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
  return bcrypt.compare(password, dummyHash);
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Груб етикет на устройството от User-Agent („Chrome · Android“) — само за да познаеш
// своята сесия в списъка. Без версии и без IP: идентификация не е нужна, а и не я искаме.
export function deviceLabel(ua) {
  const s = String(ua || '');
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /Firefox\//.test(s)
        ? 'Firefox'
        : /Chrome\//.test(s)
          ? 'Chrome'
          : /Safari\//.test(s)
            ? 'Safari'
            : '';
  const os = /Android/.test(s)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(s)
      ? 'iOS'
      : /Windows/.test(s)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(s)
          ? 'macOS'
          : /Linux/.test(s)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' · ') || 'Непознато устройство';
}

export function createSession(res, userId, req) {
  purgeExpiredSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare(
    'INSERT INTO sessions (id, user_id, csrf_token, expires_at, device) VALUES (?, ?, ?, ?, ?)'
  ).run(sha256(token), userId, csrfToken, expiresAt, deviceLabel(req?.get?.('user-agent')));
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: prod,
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

// ── Чакащ втори фактор ───────────────────────────────────────────────────────
// След вярна парола при включен 2FA НЕ създаваме сесия: даваме краткоживееща (5 мин)
// подписана бисквитка „паролата е минала за потребител N“. Сесията се ражда едва след
// верния код. Подписът е HMAC с тайна, генерирана при старт — бисквитката не може да
// се подправи, а рестарт просто я обезсилва (потребителят въвежда паролата отново).
const PENDING_COOKIE = 'vz_2fa';
const PENDING_TTL_MS = 5 * 60 * 1000;
const pendingKey = crypto.randomBytes(32);
const signPending = (payload) =>
  crypto.createHmac('sha256', pendingKey).update(payload).digest('base64url');

export function startPendingLogin(res, userId) {
  const payload = `${userId}.${Date.now() + PENDING_TTL_MS}`;
  res.cookie(PENDING_COOKIE, `${payload}.${signPending(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: prod,
    maxAge: PENDING_TTL_MS,
    path: '/login',
  });
}

// Потребителят, чиято парола е минала преди малко, или null.
export function pendingLoginUser(req) {
  const raw = String(req.cookies?.[PENDING_COOKIE] || '');
  const m = /^(\d+)\.(\d+)\.([\w-]+)$/.exec(raw);
  if (!m) return null;
  const expected = Buffer.from(signPending(`${m[1]}.${m[2]}`));
  const got = Buffer.from(m[3]);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  if (Number(m[2]) < Date.now()) return null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(m[1])) || null;
}

export const clearPendingLogin = (res) => res.clearCookie(PENDING_COOKIE, { path: '/login' });

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
    .prepare('SELECT id, email, is_admin, created_at, email_verified_at FROM users WHERE id = ?')
    .get(session.user_id);
  if (user) {
    req.user = user;
    req.session = session;
    res.locals.user = user;
    res.locals.isAdmin = isAdmin(user);
    res.locals.csrfToken = session.csrf_token;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  if (!isAdmin(req.user)) return res.status(403).render('404', { title: 'Няма достъп' });
  next();
}
