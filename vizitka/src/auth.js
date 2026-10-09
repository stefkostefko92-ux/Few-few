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
    .prepare('SELECT id, email, is_admin, created_at FROM users WHERE id = ?')
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
