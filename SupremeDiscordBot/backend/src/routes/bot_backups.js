// backend/src/routes/bot_backups.js
// Резервни копия — страната на бота (bot secret). Монтира се на /api/bot.
//
//   GET  /backup-restores/:id           ботът взима задачата: копието + картата стар → нов ID
//   POST /backup-restores/:id/progress  ботът докладва: добавки към картата, броячи, бележки, край
//
// Картата се пази след ВСЯКА стъпка (Б15) — рестарт на бота продължава оттам, докъдето е стигнал.
// Всеки запис е условен по статуса: спряно от таблото не се „съживява“ от закъснял доклад.
import { Router } from "express";
import { z } from "zod/v3";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { writeAudit } from "../lib/auditLog.js";
import { openBackup } from "../lib/backups.js";

const router = Router();
router.use("/backup-restores", requireBotSecret);

const ID_RE = /^c[a-z0-9]{20,40}$/;
const ACTIVE = ["PENDING", "RUNNING"];
const MAX_WARNINGS = 200;
const snowflake = z.string().regex(/^\d{15,22}$/);
const idMapPart = z.record(snowflake, snowflake).refine((m) => Object.keys(m).length <= 600, "too many entries");

const progressBody = z.object({
  idMap: z.object({ roles: idMapPart.optional(), channels: idMapPart.optional() }).optional(),
  counts: z.record(z.string().max(40), z.union([z.number().int().min(0).max(100000), z.record(z.string().max(40), z.number().int().min(0).max(100000))])).optional(),
  warnings: z.array(z.object({
    kind: z.string().max(20),
    name: z.string().max(120).optional(),
    code: z.string().max(40),
    reason: z.string().max(300).optional(),
  })).max(100).optional(),
  status: z.enum(["DONE", "FAILED"]).optional(),
});

router.get("/backup-restores/:id", async (req, res, next) => {
  if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: "Restore not found" });
  try {
    const r = await prisma.backupRestore.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: "Restore not found" });
    if (!ACTIVE.includes(r.status)) return res.status(409).json({ error: "Restore is not running", code: "NOT_RUNNING", status: r.status });

    const now = new Date();
    const claim = await prisma.backupRestore.updateMany({
      where: { id: r.id, status: { in: ACTIVE } },
      data: { status: "RUNNING", startedAt: r.startedAt || now, heartbeatAt: now, attempts: { increment: 1 } },
    });
    if (!claim.count) return res.status(409).json({ error: "Restore is not running", code: "NOT_RUNNING" });

    const backup = await prisma.serverBackup.findUnique({ where: { id: r.backupId } });
    if (!backup) {
      await prisma.backupRestore.updateMany({
        where: { id: r.id, status: { in: ACTIVE } },
        data: { status: "FAILED", activeServerId: null, finishedAt: now, warnings: [{ kind: "backup", code: "BACKUP_GONE" }] },
      });
      return res.status(410).json({ error: "The backup no longer exists", code: "BACKUP_GONE" });
    }
    res.json({
      restore: { id: r.id, mode: r.mode, sourceServerId: r.sourceServerId, targetServerId: r.targetServerId, idMap: r.idMap || {} },
      snapshot: openBackup(backup),
    });
  } catch (err) { next(err); }
});

router.post("/backup-restores/:id/progress", async (req, res, next) => {
  if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: "Restore not found" });
  const parsed = progressBody.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid progress report" });
  const body = parsed.data;
  try {
    const r = await prisma.backupRestore.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: "Restore not found" });
    if (r.status !== "RUNNING") return res.json({ ok: true, stop: true, status: r.status });

    const prev = r.idMap && typeof r.idMap === "object" ? r.idMap : {};
    const idMap = {
      roles: { ...(prev.roles || {}), ...(body.idMap?.roles || {}) },
      channels: { ...(prev.channels || {}), ...(body.idMap?.channels || {}) },
    };
    const warnings = [...(Array.isArray(r.warnings) ? r.warnings : []), ...(body.warnings || [])].slice(0, MAX_WARNINGS);
    const now = new Date();
    const data = { idMap, warnings, heartbeatAt: now, ...(body.counts ? { counts: { ...(r.counts || {}), ...body.counts } } : {}) };
    if (body.status) Object.assign(data, { status: body.status, finishedAt: now, activeServerId: null });

    const u = await prisma.backupRestore.updateMany({ where: { id: r.id, status: "RUNNING" }, data });
    if (!u.count) return res.json({ ok: true, stop: true });

    if (body.status) {
      await writeAudit({
        actorId: null, actorTag: "SYSTEM", serverId: r.targetServerId,
        action: body.status === "DONE" ? "BACKUP_RESTORE_FINISHED" : "BACKUP_RESTORE_FAILED",
        targetId: r.id,
        metadata: { backupId: r.backupId, mode: r.mode, counts: data.counts || r.counts || {}, warnings: warnings.length },
      });
    }
    res.json({ ok: true, stop: false });
  } catch (err) { next(err); }
});

export default router;
