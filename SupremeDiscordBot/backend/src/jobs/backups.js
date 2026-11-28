// backend/src/jobs/backups.js
// Резервни копия — фоновите задачи (docs/BACKUP_SPEC.md). Регистрират се в services/scheduler.js.
//
//   runAutoBackups      всеки час: автоматично копие на сървърите, за които е време по плана (Б4)
//   runRestoreWatchdog  всеки 2 мин: буди забравени възстановявания; след 5 опита — FAILED (Б15)
import { prisma } from "../lib/prisma.js";
import { getServerTier } from "../lib/premium.js";
import { captureFromBot, kickRestore } from "../lib/backupBot.js";
import { createBackup, backupLimits, autoBackupDue } from "../lib/backups.js";
import { eachPage } from "../lib/paginate.js";
import { writeAudit } from "../lib/auditLog.js";

/** Таван на снимките в един пробег — товарът към Discord се разлива през часовете. */
export const AUTO_BACKUPS_PER_RUN = 200;
export const RESTORE_MAX_ATTEMPTS = 5;
const PENDING_STALE_MS = 60 * 1000;
const RUNNING_STALE_MS = 3 * 60 * 1000;

export async function runAutoBackups(now = new Date()) {
  const out = { checked: 0, created: 0, failed: 0, skipped: 0 };
  await eachPage(
    prisma.server,
    { where: { botRemovedAt: null }, select: { id: true, ownerId: true } },
    async (s) => {
      if (out.created + out.failed >= AUTO_BACKUPS_PER_RUN) return;
      out.checked += 1;
      const tier = await getServerTier(s.id);
      const limits = backupLimits(tier);
      const last = await prisma.serverBackup.findFirst({
        where: { serverId: s.id, kind: "AUTO" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (!autoBackupDue({ lastAutoAt: last?.createdAt || null, everyDays: limits.autoEveryDays, now })) {
        out.skipped += 1;
        return;
      }
      const cap = await captureFromBot(s.id);
      if (!cap?.ok) { out.failed += 1; return; }
      const r = await createBackup(s.id, { kind: "AUTO", tier, snapshot: cap.snapshot });
      if (r.ok) out.created += 1; else out.failed += 1;
    },
    { onError: (err, row) => { out.failed += 1; console.error(`[backups] автоматично копие за ${row?.id}: ${err?.message}`); } },
  );
  return out;
}

export async function runRestoreWatchdog(now = new Date()) {
  const out = { kicked: 0, failed: 0 };
  const rows = await prisma.backupRestore.findMany({
    where: {
      OR: [
        { status: "PENDING", createdAt: { lt: new Date(now.getTime() - PENDING_STALE_MS) } },
        { status: "RUNNING", OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: new Date(now.getTime() - RUNNING_STALE_MS) } }] },
      ],
    },
    select: { id: true, status: true, attempts: true, targetServerId: true },
    take: 50,
  });
  for (const r of rows || []) {
    if ((r.attempts || 0) >= RESTORE_MAX_ATTEMPTS) {
      const u = await prisma.backupRestore.updateMany({
        where: { id: r.id, status: { in: ["PENDING", "RUNNING"] } },
        data: { status: "FAILED", activeServerId: null, finishedAt: now },
      });
      if (u?.count) {
        out.failed += 1;
        await writeAudit({ actorId: null, actorTag: "SYSTEM", serverId: r.targetServerId, action: "BACKUP_RESTORE_FAILED", targetId: r.id, metadata: { reason: "NO_PROGRESS", attempts: r.attempts } });
      }
      continue;
    }
    await kickRestore(r.id);
    out.kicked += 1;
  }
  return out;
}
