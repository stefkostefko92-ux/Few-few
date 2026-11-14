// Имейлът на акаунта: потвърждаване на адреса и смяна на имейла чрез еднократни връзки.
// Токенът е 32 случайни байта (hex), в базата — само sha256; важи веднъж и изтича.
// Смяната НЕ става при заявката: едва когато човекът отвори връзката, пратена до НОВИЯ
// адрес (доказва, че го притежава). Резервиран за админ имейл никога не се взема (seedAdmins
// дава права по имейл при старт — смяната иначе би била път към админ).
import crypto from 'node:crypto';
import db from './db.js';
import { isReservedAdminEmail } from './auth.js';

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const CHANGE_TTL_MS = 60 * 60 * 1000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
export const normalizeEmail = (v) =>
  String(v || '')
    .trim()
    .toLowerCase();

// Нова връзка — предишните от същия вид за този акаунт стават невалидни (само една жива).
export function issueToken(userId, purpose, email) {
  const token = crypto.randomBytes(32).toString('hex');
  const ttl = purpose === 'verify' ? VERIFY_TTL_MS : CHANGE_TTL_MS;
  db.transaction(() => {
    db.prepare('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose);
    db.prepare(
      'INSERT INTO email_tokens (user_id, purpose, email, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, purpose, email, sha256(token), Date.now() + ttl);
  })();
  return token;
}

export function findToken(token, purpose) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  return db
    .prepare(
      `SELECT * FROM email_tokens
        WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`
    )
    .get(sha256(token), purpose, Date.now());
}

// Условно маркиране — при две едновременни отваряния само едното минава.
const consume = (id) =>
  db
    .prepare("UPDATE email_tokens SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL")
    .run(id).changes === 1;

/** Потвърждаване. true — потвърден; false — невалидна/изтекла/вече ползвана връзка. */
export function confirmVerify(token) {
  const t = findToken(token, 'verify');
  if (!t) return false;
  return db.transaction(() => {
    if (!consume(t.id)) return false;
    // Връзката е за адреса, до който е пратена: ако междувременно имейлът е сменен — не важи.
    const r = db
      .prepare(
        "UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now')) WHERE id = ? AND email = ?"
      )
      .run(t.user_id, t.email);
    return r.changes === 1;
  })();
}

/**
 * Проверка на новия адрес при заявка за смяна. Връща текст на грешка или null.
 * Зает адрес НЕ е грешка тук — извикващият отговаря еднакво и не праща нищо.
 */
export function changeError(currentEmail, next) {
  if (!EMAIL_RE.test(next) || next.length > 254) return 'Невалиден имейл адрес.';
  if (next === normalizeEmail(currentEmail)) return 'Това е текущият ти имейл.';
  if (isReservedAdminEmail(next))
    return 'Този имейл не може да се ползва оттук. Свържи се с администратор.';
  return null;
}

export const emailTaken = (email) =>
  Boolean(db.prepare('SELECT 1 FROM users WHERE email = ?').get(email));

/**
 * Смяна по връзката. Връща { ok, oldEmail, newEmail } или { ok:false, reason }:
 * 'invalid' (връзката) или 'taken' (адресът е зает междувременно / резервиран).
 */
export function confirmChange(token) {
  const t = findToken(token, 'change');
  if (!t) return { ok: false, reason: 'invalid' };
  if (emailTaken(t.email) || isReservedAdminEmail(t.email)) return { ok: false, reason: 'taken' };
  return db.transaction(() => {
    if (!consume(t.id)) return { ok: false, reason: 'invalid' };
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(t.user_id);
    if (!user) return { ok: false, reason: 'invalid' };
    try {
      db.prepare(
        "UPDATE users SET email = ?, email_verified_at = datetime('now') WHERE id = ?"
      ).run(t.email, t.user_id);
    } catch (e) {
      // Само UNIQUE е „зает“ (надпревара в последния момент). Всяка друга грешка се хвърля:
      // транзакцията се връща назад, връзката остава годна, а грешката стига до лога.
      if (e.code !== 'SQLITE_CONSTRAINT_UNIQUE') throw e;
      return { ok: false, reason: 'taken' };
    }
    // Старите връзки (потвърждаване на стария адрес, нулиране на паролата) вече не важат.
    db.prepare('DELETE FROM email_tokens WHERE user_id = ?').run(t.user_id);
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(t.user_id);
    return { ok: true, oldEmail: user.email, newEmail: t.email };
  })();
}

/**
 * Висящата смяна отпада. Вика се при всяко „възстановяване на контрола“ — нулиране и смяна на
 * паролата, „излез от всички устройства“ и бутона „Откажи смяната“. Иначе нападател с
 * откраднатата парола заявява смяна към свой адрес и я потвърждава, СЛЕД като собственикът
 * вече е сменил паролата по съвета от известието (ревю на Кодаджията, 14.11.2026).
 */
export const cancelPendingChange = (userId) =>
  db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'change'").run(userId)
    .changes > 0;

/** Адресът на висящата (неизтекла) смяна — за настройките. */
export const pendingChangeEmail = (userId) =>
  db
    .prepare(
      "SELECT email FROM email_tokens WHERE user_id = ? AND purpose = 'change' AND used_at IS NULL AND expires_at > ?"
    )
    .get(userId, Date.now())?.email || null;
