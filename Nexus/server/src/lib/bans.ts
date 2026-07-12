/**
 * Ban infrastructure — постоянен бан по потребител + по IP + по device-id
 * („HWID"). Браузърът няма истински хардуерен идентификатор, затова
 * „HWID" тук е стабилен клиентски fingerprint (localStorage → header
 * `x-device-id`); евадва се с чистене на storage/друго устройство, а IP
 * банът се евадва с VPN — затова банваме И двете едновременно за максимална
 * издръжливост. Основен тригер: chargeback (Stripe dispute). Плюс ръчен
 * админ бан.
 */
import type { Request } from 'express';
import { getDb } from '../db';

/** Извлича клиентското IP (зад reverse proxy) от заявката. */
export function clientIp(req: Request): string {
  return (req.ip || '').replace('::ffff:', '')
    || ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim()
    || '';
}

/** Клиентски device-id (браузър „HWID"). Ограничен по дължина. */
export function clientHwid(req: Request): string {
  const raw = (req.headers['x-device-id'] as string) || '';
  return raw.slice(0, 128).trim();
}

export interface BanStatus {
  banned: boolean;
  reason?: string;
  /** 0 = постоянен; >0 = епоха на изтичане (временен бан). */
  until?: number;
}

/** true, ако банът важи СЕГА (0 = постоянен; иначе изтича в бъдещето). */
function active(until: number): boolean {
  return until === 0 || until > Date.now();
}

/** Банат ли е конкретен потребител (изтеклите временни банове = не-банат). */
export function isUserBanned(uid: number): BanStatus {
  const row = getDb().prepare('SELECT banned, banned_reason, banned_until FROM users WHERE id = ?').get(uid) as
    | { banned: number; banned_reason: string; banned_until: number }
    | undefined;
  if (row && row.banned === 1 && active(row.banned_until)) {
    return { banned: true, reason: row.banned_reason, until: row.banned_until };
  }
  return { banned: false };
}

/** Банат ли е IP. Празният низ / изтеклият бан никога не са банати. */
export function isIpBanned(ip: string): BanStatus {
  if (!ip) return { banned: false };
  const row = getDb().prepare('SELECT reason, expires_at FROM banned_ips WHERE ip = ?').get(ip) as { reason: string; expires_at: number } | undefined;
  if (row && active(row.expires_at)) return { banned: true, reason: row.reason, until: row.expires_at };
  return { banned: false };
}

/** Банато ли е устройство (device-id). Празният низ / изтеклият бан = не. */
export function isHwidBanned(hwid: string): BanStatus {
  if (!hwid) return { banned: false };
  const row = getDb().prepare('SELECT reason, expires_at FROM banned_devices WHERE hwid = ?').get(hwid) as { reason: string; expires_at: number } | undefined;
  if (row && active(row.expires_at)) return { banned: true, reason: row.reason, until: row.expires_at };
  return { banned: false };
}

/**
 * Комбинирана проверка за заявка: потребител ИЛИ неговото текущо IP/HWID.
 * Използва се в authRequired на всяка заявка.
 */
export function requestBanStatus(uid: number | undefined, ip: string, hwid: string): BanStatus {
  if (uid !== undefined) {
    const u = isUserBanned(uid);
    if (u.banned) return u;
  }
  const byIp = isIpBanned(ip);
  if (byIp.banned) return byIp;
  return isHwidBanned(hwid);
}

/** Проверка при login/register — спира създаване/влизане от банати ip/hwid. */
export function isBanEvasion(ip: string, hwid: string): BanStatus {
  const byIp = isIpBanned(ip);
  if (byIp.banned) return byIp;
  return isHwidBanned(hwid);
}

/**
 * Постоянен бан на потребител + неговите IP и device-id. Всичко в една
 * транзакция. Бумва token_version → всички съществуващи JWT-та веднага
 * падат в authRequired (не чака ban проверката). Идемпотентно (INSERT OR
 * REPLACE по PK). `ip`/`hwid` са по избор (напр. само едното известно).
 */
export function banUser(opts: { userId: number; ip?: string; hwid?: string; reason: string; durationMs?: number }): void {
  const { userId, ip, hwid, reason, durationMs } = opts;
  const db = getDb();
  const now = Date.now();
  // 0 = постоянен; иначе изтича след durationMs. Отрицателно/0 → постоянен.
  const until = durationMs && durationMs > 0 ? now + durationMs : 0;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users SET banned = 1, banned_reason = ?, banned_at = ?, banned_until = ?, token_version = token_version + 1 WHERE id = ?`,
    ).run(reason, now, until, userId);
    if (ip) {
      db.prepare(
        `INSERT INTO banned_ips (ip, reason, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, user_id = excluded.user_id, expires_at = excluded.expires_at`,
      ).run(ip, reason, userId, now, until);
    }
    if (hwid) {
      db.prepare(
        `INSERT INTO banned_devices (hwid, reason, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(hwid) DO UPDATE SET reason = excluded.reason, user_id = excluded.user_id, expires_at = excluded.expires_at`,
      ).run(hwid, reason, userId, now, until);
    }
  });
  tx();
}

/**
 * Изчиства ИЗТЕКЛИ временни банове (реши го периодично от server.ts). Държи
 * таблиците чисти; самите проверки вече третират изтеклите като не-банати,
 * така че това е хигиена, не коректност. Връща брой засегнати редове.
 */
export function pruneExpiredBans(): number {
  const db = getDb();
  const now = Date.now();
  const u = db.prepare(`UPDATE users SET banned = 0, banned_reason = '', banned_until = 0 WHERE banned = 1 AND banned_until > 0 AND banned_until <= ?`).run(now);
  const i = db.prepare(`DELETE FROM banned_ips WHERE expires_at > 0 AND expires_at <= ?`).run(now);
  const d = db.prepare(`DELETE FROM banned_devices WHERE expires_at > 0 AND expires_at <= ?`).run(now);
  return (u.changes || 0) + (i.changes || 0) + (d.changes || 0);
}

/** Вдига бана на потребител + маха неговите IP/HWID от ban списъците. */
export function unbanUser(userId: number): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE users SET banned = 0, banned_reason = '', banned_until = 0 WHERE id = ?`).run(userId);
    db.prepare(`DELETE FROM banned_ips WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM banned_devices WHERE user_id = ?`).run(userId);
  });
  tx();
}
