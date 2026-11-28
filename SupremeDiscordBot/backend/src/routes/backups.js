// backend/src/routes/backups.js
// Резервни копия на сървъра — таблото (docs/BACKUP_SPEC.md). Монтира се на /api/backups.
//
//   GET    /mine                                       копията, на които съм собственик (Б10)
//   GET    /server/:serverId                           списък + лимити + последното възстановяване
//   POST   /server/:serverId                           ръчно копие сега
//   GET    /server/:serverId/restores                  история на възстановяванията
//   POST   /server/:serverId/restore/preflight         план преди старта (Б11)
//   POST   /server/:serverId/restore                   старт (serverId = ЦЕЛТА)
//   GET    /server/:serverId/restore/:restoreId        прогрес
//   POST   /server/:serverId/restore/:restoreId/cancel спиране
//   GET    /server/:serverId/:backupId                 сводка на копие
//   DELETE /server/:serverId/:backupId                 изтриване
import { Router } from "express";
import { z } from "zod/v3";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { getServerTier } from "../lib/premium.js";
import { captureFromBot, preflightFromBot, kickRestore } from "../lib/backupBot.js";
import {
  createBackup, backupLimits, getServerBackup, openBackup, publicBackup, isExpired, liveWhere,
  BACKUP_PUBLIC_SELECT, MANUAL_COOLDOWN_MS,
} from "../lib/backups.js";
import { summarizeSnapshot, planRestore, snapshotIds } from "../lib/backupSnapshot.js";

const router = Router();
router.use(requireAuth, loadUser);

const ID_RE = /^c[a-z0-9]{20,40}$/;
const ADMINISTRATOR = 0x8n;
const ACTIVE = ["PENDING", "RUNNING"];

const RESTORE_PUBLIC_SELECT = {
  id: true, backupId: true, sourceServerId: true, targetServerId: true, mode: true, status: true,
  counts: true, warnings: true, createdAt: true, startedAt: true, finishedAt: true,
};
const publicRestore = (r) => (r ? Object.fromEntries(Object.keys(RESTORE_PUBLIC_SELECT).map((k) => [k, r[k] ?? null])) : null);

/**
 * Б8 — връщане иска СОБСТВЕНИТЕ права на човека в целевия сървър: собственик или Administrator.
 * `req.discordGuild` идва от requireServerAdmin; при staff заобикалянето го няма — и така трябва:
 * staff акаунт не възстановява в чужд сървър.
 */
function requireRestoreRights(req, res, next) {
  const g = req.discordGuild;
  if (!g) return res.status(403).json({ error: "Restoring needs your own Administrator permission in this server.", code: "OWN_RIGHTS_REQUIRED" });
  let perms = 0n;
  try { perms = BigInt(g.permissions || "0"); } catch { perms = 0n; }
  if (g.owner === true || (perms & ADMINISTRATOR) === ADMINISTRATOR) return next();
  return res.status(403).json({ error: "Only the server owner or someone with Administrator can restore a backup.", code: "ADMIN_REQUIRED" });
}

/**
 * Копието за възстановяване в целевия сървър. В същия сървър — всеки с правата от Б8.
 * В ДРУГ сървър — само собственикът на копието (Б9). Иначе 404: не казваме, че копието съществува.
 */
async function loadRestoreSource(req, res) {
  const backupId = String(req.body?.backupId || "");
  if (!ID_RE.test(backupId)) { res.status(404).json({ error: "Backup not found", code: "NOT_FOUND" }); return null; }
  const row = await prisma.serverBackup.findUnique({ where: { id: backupId } });
  const target = req.params.serverId;
  const sameServer = !!row && row.serverId === target;
  if (!row || isExpired(row) || (!sameServer && (!row.ownerId || row.ownerId !== req.user.id))) {
    res.status(404).json({ error: "Backup not found", code: "NOT_FOUND" });
    return null;
  }
  return { row, snapshot: openBackup(row), sameServer };
}

async function buildPlan(target, { snapshot, sameServer }) {
  const pf = await preflightFromBot(target, snapshotIds(snapshot));
  if (!pf?.ok) return { error: pf?.error || "bot unreachable" };
  return { plan: planRestore(snapshot, { sameServer, ...pf }) };
}

// ─── Моите копия (изтрити сървъри) ────────────────────────────────────────────
router.get("/mine", async (req, res, next) => {
  try {
    const rows = await prisma.serverBackup.findMany({
      where: { ownerId: req.user.id, ...liveWhere() },
      orderBy: { createdAt: "desc" },
      select: BACKUP_PUBLIC_SELECT,
      take: 300,
    });
    const ids = [...new Set(rows.map((r) => r.serverId))];
    const servers = ids.length
      ? await prisma.server.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, botRemovedAt: true } })
      : [];
    const byId = new Map(servers.map((s) => [s.id, s]));
    res.json({
      servers: ids.map((id) => {
        const s = byId.get(id);
        const backups = rows.filter((r) => r.serverId === id).map(publicBackup);
        return { serverId: id, name: s?.name || backups[0]?.guildName, botPresent: !!s && !s.botRemovedAt, backups };
      }),
    });
  } catch (err) { next(err); }
});

// ─── Списък ───────────────────────────────────────────────────────────────────
router.get("/server/:serverId", requireServerAdmin, async (req, res, next) => {
  const serverId = req.params.serverId;
  try {
    const [backups, tier, lastRestore] = await Promise.all([
      prisma.serverBackup.findMany({ where: { serverId, ...liveWhere() }, orderBy: { createdAt: "desc" }, select: BACKUP_PUBLIC_SELECT }),
      getServerTier(serverId),
      prisma.backupRestore.findFirst({ where: { targetServerId: serverId }, orderBy: { createdAt: "desc" }, select: RESTORE_PUBLIC_SELECT }),
    ]);
    const list = (backups || []).map(publicBackup);
    res.json({
      backups: list,
      limits: backupLimits(tier),
      usage: { manual: list.filter((b) => b.kind === "MANUAL").length, auto: list.filter((b) => b.kind === "AUTO").length },
      lastRestore: publicRestore(lastRestore),
    });
  } catch (err) { next(err); }
});

// ─── Ръчно копие ──────────────────────────────────────────────────────────────
router.post("/server/:serverId", requireServerAdmin, async (req, res, next) => {
  const serverId = req.params.serverId;
  try {
    const tier = await getServerTier(serverId);
    const limits = backupLimits(tier);
    const manual = await prisma.serverBackup.count({ where: { serverId, kind: "MANUAL" } });
    if (manual >= limits.manual) {
      return res.status(409).json({ error: `Your plan keeps ${limits.manual} manual backups. Delete one to make room.`, code: "BACKUP_LIMIT", limit: limits.manual });
    }
    const last = await prisma.serverBackup.findFirst({ where: { serverId, kind: "MANUAL" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const since = last ? Date.now() - new Date(last.createdAt).getTime() : Infinity;
    if (since < MANUAL_COOLDOWN_MS) {
      const wait = Math.ceil((MANUAL_COOLDOWN_MS - since) / 1000);
      res.set("Retry-After", String(wait));
      return res.status(429).json({ error: "A backup was made a few minutes ago. Try again shortly.", code: "BACKUP_COOLDOWN", retryAfterSec: wait });
    }

    const cap = await captureFromBot(serverId);
    if (!cap?.ok) return res.status(503).json({ error: "The bot could not read the server right now. Nothing was saved — try again in a minute.", code: "BOT_UNAVAILABLE" });

    const out = await createBackup(serverId, { kind: "MANUAL", tier, snapshot: cap.snapshot, createdBy: req.user.id });
    if (!out.ok) {
      if (out.retryAfterSec) res.set("Retry-After", String(out.retryAfterSec));
      return res.status(out.status).json({ error: out.error || out.code, code: out.code, limit: out.limit, retryAfterSec: out.retryAfterSec });
    }

    await writeAudit({
      actorId: req.user.id, serverId, action: "BACKUP_CREATED", targetId: out.backup.id,
      metadata: { kind: "MANUAL", roles: out.backup.roleCount, categories: out.backup.categoryCount, channels: out.backup.channelCount },
    });
    res.status(201).json({ backup: out.backup });
  } catch (err) { next(err); }
});

// ─── История на възстановяванията ─────────────────────────────────────────────
router.get("/server/:serverId/restores", requireServerAdmin, async (req, res, next) => {
  try {
    const rows = await prisma.backupRestore.findMany({
      where: { targetServerId: req.params.serverId }, orderBy: { createdAt: "desc" }, take: 10, select: RESTORE_PUBLIC_SELECT,
    });
    res.json({ restores: (rows || []).map(publicRestore) });
  } catch (err) { next(err); }
});

// ─── Проверка преди старта ────────────────────────────────────────────────────
router.post("/server/:serverId/restore/preflight", requireServerAdmin, requireRestoreRights, async (req, res, next) => {
  try {
    const src = await loadRestoreSource(req, res);
    if (!src) return;
    const r = await buildPlan(req.params.serverId, src);
    if (r.error) return res.status(503).json({ error: "The bot could not check the server right now. Try again in a minute.", code: "BOT_UNAVAILABLE" });
    res.json({ plan: r.plan, backup: publicBackup(src.row) });
  } catch (err) { next(err); }
});

// ─── Старт ────────────────────────────────────────────────────────────────────
const startBody = z.object({ backupId: z.string().regex(ID_RE), confirm: z.literal(true) });
router.post("/server/:serverId/restore", requireServerAdmin, requireRestoreRights, async (req, res, next) => {
  const target = req.params.serverId;
  if (!startBody.safeParse(req.body).success) return res.status(400).json({ error: "Choose a backup and confirm the restore.", code: "CONFIRM_REQUIRED" });
  try {
    const src = await loadRestoreSource(req, res);
    if (!src) return;
    const r = await buildPlan(target, src);
    if (r.error) return res.status(503).json({ error: "The bot could not check the server right now. Try again in a minute.", code: "BOT_UNAVAILABLE" });
    if (r.plan.blockers.length) return res.status(409).json({ error: "The restore cannot start yet.", code: "RESTORE_BLOCKED", plan: r.plan });

    let restore;
    try {
      restore = await prisma.backupRestore.create({
        data: {
          backupId: src.row.id,
          sourceServerId: src.row.serverId,
          targetServerId: target,
          requestedBy: req.user.id,
          mode: r.plan.mode,
          status: "PENDING",
          activeServerId: target, // уникален: второ възстановяване в същия сървър пада тук (Б14)
          counts: { planned: { roles: r.plan.roles.toCreate, channels: r.plan.channels.toCreate } },
        },
      });
    } catch (err) {
      if (err?.code === "P2002") return res.status(409).json({ error: "A restore is already running in this server.", code: "RESTORE_RUNNING" });
      throw err;
    }

    await writeAudit({
      actorId: req.user.id, serverId: target, action: "BACKUP_RESTORE_STARTED", targetId: restore.id,
      metadata: { backupId: src.row.id, sourceServerId: src.row.serverId, mode: r.plan.mode, roles: r.plan.roles.toCreate, channels: r.plan.channels.toCreate },
    });
    // Без await: ботът може да е зает; пазачът в задачите го буди пак (jobs/backups.js).
    Promise.resolve().then(() => kickRestore(restore.id)).catch(() => {});
    res.status(202).json({ restore: publicRestore(restore), plan: r.plan });
  } catch (err) { next(err); }
});

// ─── Прогрес ──────────────────────────────────────────────────────────────────
router.get("/server/:serverId/restore/:restoreId", requireServerAdmin, async (req, res, next) => {
  if (!ID_RE.test(req.params.restoreId)) return res.status(404).json({ error: "Restore not found" });
  try {
    const r = await prisma.backupRestore.findFirst({
      where: { id: req.params.restoreId, targetServerId: req.params.serverId },
      select: RESTORE_PUBLIC_SELECT,
    });
    if (!r) return res.status(404).json({ error: "Restore not found" });
    res.json({ restore: publicRestore(r) });
  } catch (err) { next(err); }
});

// ─── Спиране ──────────────────────────────────────────────────────────────────
router.post("/server/:serverId/restore/:restoreId/cancel", requireServerAdmin, requireRestoreRights, async (req, res, next) => {
  if (!ID_RE.test(req.params.restoreId)) return res.status(404).json({ error: "Restore not found" });
  try {
    const r = await prisma.backupRestore.updateMany({
      where: { id: req.params.restoreId, targetServerId: req.params.serverId, status: { in: ACTIVE } },
      data: { status: "CANCELLED", activeServerId: null, finishedAt: new Date() },
    });
    if (!r.count) return res.status(409).json({ error: "This restore is not running.", code: "NOT_RUNNING" });
    await writeAudit({ actorId: req.user.id, serverId: req.params.serverId, action: "BACKUP_RESTORE_CANCELLED", targetId: req.params.restoreId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Сводка на копие ──────────────────────────────────────────────────────────
router.get("/server/:serverId/:backupId", requireServerAdmin, async (req, res, next) => {
  if (!ID_RE.test(req.params.backupId)) return res.status(404).json({ error: "Backup not found" });
  try {
    const row = await getServerBackup(req.params.serverId, req.params.backupId);
    if (!row) return res.status(404).json({ error: "Backup not found" });
    res.json({ backup: publicBackup(row), summary: summarizeSnapshot(openBackup(row)) });
  } catch (err) { next(err); }
});

// ─── Изтриване ────────────────────────────────────────────────────────────────
router.delete("/server/:serverId/:backupId", requireServerAdmin, async (req, res, next) => {
  if (!ID_RE.test(req.params.backupId)) return res.status(404).json({ error: "Backup not found" });
  try {
    const row = await getServerBackup(req.params.serverId, req.params.backupId);
    if (!row) return res.status(404).json({ error: "Backup not found" });
    const r = await prisma.serverBackup.deleteMany({ where: { id: row.id, serverId: req.params.serverId } });
    if (!r.count) return res.status(404).json({ error: "Backup not found" });
    await writeAudit({ actorId: req.user.id, serverId: req.params.serverId, action: "BACKUP_DELETED", targetId: row.id, metadata: { kind: row.kind } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
