// backend/src/lib/backups.js
// Резервни копия на сървъра — запис, лимити, срок (docs/BACKUP_SPEC.md).
//
// Копието се пази ШИФРОВАНО (Б2): имената на канали и теми са съдържание на клиента, а базата не
// е мястото, където то бива да се чете на открито. Таблото получава само сводка.
import { prisma } from "./prisma.js";
import { encrypt, decrypt } from "./crypto.js";
import { BASE_LIMITS } from "./premium.js";
import { parseSnapshot, stripForStorage, snapshotCounts } from "./backupSnapshot.js";

const DAY = 24 * 60 * 60 * 1000;
/** Б17 — колко дълго живеят копията, след като ботът е махнат (или сървърът — изтрит). */
export const BACKUP_KEEP_AFTER_REMOVAL_DAYS = 90;
/** Б5 — ръчно копие най-много веднъж на толкова време на сървър. */
export const MANUAL_COOLDOWN_MS = 10 * 60 * 1000;
/** Колко дълго се пази историята на приключилите възстановявания. */
export const RESTORE_HISTORY_DAYS = 90;

/** Полетата, които излизат към таблото. Никога `data`. */
export const BACKUP_PUBLIC_SELECT = {
  id: true, serverId: true, guildName: true, kind: true, createdBy: true,
  roleCount: true, categoryCount: true, channelCount: true, sizeBytes: true,
  expiresAt: true, createdAt: true,
};
export function publicBackup(row) {
  if (!row) return null;
  return Object.fromEntries(Object.keys(BACKUP_PUBLIC_SELECT).map((k) => [k, row[k] ?? null]));
}

/** Лимитите на плана (Б4) — числата живеят в premium.js. */
export function backupLimits(tier) {
  const l = tier?.limits || BASE_LIMITS;
  return {
    manual: l.manualBackups ?? BASE_LIMITS.manualBackups,
    autoKeep: l.autoBackupsKept ?? BASE_LIMITS.autoBackupsKept,
    autoEveryDays: l.autoBackupEveryDays ?? BASE_LIMITS.autoBackupEveryDays,
  };
}

/**
 * Време ли е за автоматично копие. Час толеранс: задачата тече всеки час, и дневно копие,
 * направено в 03:20, не бива утре да изпусне 03:17 и да чака още цял ден.
 */
export function autoBackupDue({ lastAutoAt, everyDays, now = new Date() }) {
  if (!everyDays) return false;
  if (!lastAutoAt) return true;
  return now.getTime() - new Date(lastAutoAt).getTime() >= everyDays * DAY - 60 * 60 * 1000;
}

/**
 * Записва копие. Проверява го, маха тикетите и личните права по канал, шифрова, а при
 * автоматично — изтрива най-старите автоматични над лимита. Ръчните никога не се трият сами.
 * @returns {Promise<{ok:true, backup:object} | {ok:false, status:number, code:string, error?:string, limit?:number}>}
 */
export async function createBackup(serverId, { kind, tier, snapshot, createdBy = null }) {
  const parsed = parseSnapshot(snapshot);
  if (!parsed.ok) return { ok: false, status: 502, code: "BAD_SNAPSHOT", error: parsed.error };
  // Защита в дълбочина: ботът върнал копие на друг сървър не се записва под този.
  if (parsed.snapshot.guild.id !== serverId) return { ok: false, status: 502, code: "WRONG_SERVER" };

  const limits = backupLimits(tier);
  const tickets = await prisma.ticket.findMany({ where: { serverId, channelId: { not: null } }, select: { channelId: true } });
  const clean = stripForStorage(parsed.snapshot, { excludeChannelIds: (tickets || []).map((t) => t.channelId) });
  const json = JSON.stringify(clean);
  const data = {
    serverId,
    guildName: clean.guild.name,
    ownerId: parsed.snapshot.guild.ownerId || null, // от проверената снимка; в копието е null
    createdBy: kind === "MANUAL" ? createdBy : null,
    kind,
    data: encrypt(json),
    ...snapshotCounts(clean),
    sizeBytes: Buffer.byteLength(json, "utf8"),
  };

  if (kind === "MANUAL") {
    // Лимитът (Б4) и паузата (Б5) се броят ПОД КЛЮЧ за сървъра: иначе два едновременни POST
    // минават и двата проверката и записват и двата (ревю, 28.11.2026). Снимката вече е
    // направена — в транзакцията са само няколко бързи заявки.
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`server-backup:${serverId}`}))`;
      const manual = await tx.serverBackup.count({ where: { serverId, kind: "MANUAL" } });
      if (manual >= limits.manual) return { ok: false, status: 409, code: "BACKUP_LIMIT", limit: limits.manual };
      const last = await tx.serverBackup.findFirst({ where: { serverId, kind: "MANUAL" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      const since = last ? Date.now() - new Date(last.createdAt).getTime() : Infinity;
      if (since < MANUAL_COOLDOWN_MS) return { ok: false, status: 429, code: "BACKUP_COOLDOWN", retryAfterSec: Math.ceil((MANUAL_COOLDOWN_MS - since) / 1000) };
      const backup = await tx.serverBackup.create({ data, select: BACKUP_PUBLIC_SELECT });
      return { ok: true, backup: publicBackup(backup) };
    });
  }

  const backup = await prisma.serverBackup.create({ data, select: BACKUP_PUBLIC_SELECT });

  if (kind === "AUTO") {
    const autos = await prisma.serverBackup.findMany({
      where: { serverId, kind: "AUTO" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const extra = (autos || []).slice(Math.max(1, limits.autoKeep)).map((a) => a.id);
    if (extra.length) await prisma.serverBackup.deleteMany({ where: { id: { in: extra }, serverId, kind: "AUTO" } });
  }
  return { ok: true, backup: publicBackup(backup) };
}

/** Изтекло, но още неизтрито (нощната чистка не е минала) — за таблото вече го няма. */
export const isExpired = (row, now = new Date()) => !!row?.expiresAt && new Date(row.expiresAt) <= now;
/** Условие за живите копия (без изтеклите). */
export const liveWhere = (now = new Date()) => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

/** Копие на ТОЗИ сървър или null (Б7 — чуждото е 404, не 403; изтеклото — също). */
export async function getServerBackup(serverId, backupId) {
  const row = await prisma.serverBackup.findUnique({ where: { id: backupId } });
  return row && row.serverId === serverId && !isExpired(row) ? row : null;
}

/** Разшифрова и проверява наново. Хвърля, ако копието е повредено. */
export function openBackup(row) {
  const parsed = parseSnapshot(JSON.parse(decrypt(row.data)));
  if (!parsed.ok) throw new Error(`Повредено копие ${row.id}: ${parsed.error}`);
  return parsed.snapshot;
}

/** Б17 — ботът е махнат: копията на сървъра получават срок (само тези, които още нямат). */
export function markServerBackupsExpiring(serverId, now = new Date()) {
  return prisma.serverBackup.updateMany({
    where: { serverId, expiresAt: null },
    data: { expiresAt: new Date(now.getTime() + BACKUP_KEEP_AFTER_REMOVAL_DAYS * DAY) },
  });
}

/** Б17 — ботът е поканен пак: срокът пада. */
export function clearServerBackupsExpiry(serverId, now = new Date()) {
  // Само още живите: изтеклото не се „съживява“ — то чака нощната чистка.
  return prisma.serverBackup.updateMany({ where: { serverId, expiresAt: { gt: now } }, data: { expiresAt: null } });
}

/** Б17 — изтеклите копия и старата история на възстановяванията. */
export async function purgeExpiredBackups(now = new Date()) {
  const backups = await prisma.serverBackup.deleteMany({ where: { expiresAt: { lt: now } } });
  const restores = await prisma.backupRestore.deleteMany({
    where: {
      status: { in: ["DONE", "FAILED", "CANCELLED"] },
      finishedAt: { lt: new Date(now.getTime() - RESTORE_HISTORY_DAYS * DAY) },
    },
  });
  return { backups: backups?.count ?? 0, restores: restores?.count ?? 0 };
}
