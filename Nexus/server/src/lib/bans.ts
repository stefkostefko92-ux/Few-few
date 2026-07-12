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
}

/** Банат ли е конкретен потребител (по флаг). */
export function isUserBanned(uid: number): BanStatus {
  const row = getDb().prepare('SELECT banned, banned_reason FROM users WHERE id = ?').get(uid) as
    | { banned: number; banned_reason: string }
    | undefined;
  if (row && row.banned === 1) return { banned: true, reason: row.banned_reason };
  return { banned: false };
}

/** Банат ли е IP. Празният низ никога не е банат (без фалшиви положителни). */
export function isIpBanned(ip: string): BanStatus {
  if (!ip) return { banned: false };
  const row = getDb().prepare('SELECT reason FROM banned_ips WHERE ip = ?').get(ip) as { reason: string } | undefined;
  return row ? { banned: true, reason: row.reason } : { banned: false };
}

/** Банато ли е устройство (device-id). Празният низ никога не е банат. */
export function isHwidBanned(hwid: string): BanStatus {
  if (!hwid) return { banned: false };
  const row = getDb().prepare('SELECT reason FROM banned_devices WHERE hwid = ?').get(hwid) as { reason: string } | undefined;
  return row ? { banned: true, reason: row.reason } : { banned: false };
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
export function banUser(opts: { userId: number; ip?: string; hwid?: string; reason: string }): void {
  const { userId, ip, hwid, reason } = opts;
  const db = getDb();
  const now = Date.now();
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users SET banned = 1, banned_reason = ?, banned_at = ?, token_version = token_version + 1 WHERE id = ?`,
    ).run(reason, now, userId);
    if (ip) {
      db.prepare(
        `INSERT INTO banned_ips (ip, reason, user_id, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, user_id = excluded.user_id`,
      ).run(ip, reason, userId, now);
    }
    if (hwid) {
      db.prepare(
        `INSERT INTO banned_devices (hwid, reason, user_id, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(hwid) DO UPDATE SET reason = excluded.reason, user_id = excluded.user_id`,
      ).run(hwid, reason, userId, now);
    }
  });
  tx();
}

/** Вдига бана на потребител + маха неговите IP/HWID от ban списъците. */
export function unbanUser(userId: number): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE users SET banned = 0, banned_reason = '' WHERE id = ?`).run(userId);
    db.prepare(`DELETE FROM banned_ips WHERE user_id = ?`).run(userId);
    db.prepare(`DELETE FROM banned_devices WHERE user_id = ?`).run(userId);
  });
  tx();
}
