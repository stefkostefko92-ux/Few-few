// backend/src/jobs/dataRetention.js
// Scheduled job — enforces data retention policy per Privacy Policy commitments.
// Runs daily via node-cron. Anonymizes/deletes data past retention windows.
//
// Retention schedule:
//   Free tier: ticket transcripts 30 days after close
//   Premium tier: indefinite (customer-controlled)
//   Audit logs: 2 years
//   Abuse reports: 1 year after resolution
//   Anonymized users: maintained (for referential integrity)
//   Transaction records: 7 years (legal obligation, NEVER auto-delete)
//   Servers with the bot removed: personal data purged 30 days after removal
//     (the Server row, PaymentLog and AuditLog survive — financial records
//      carry a 7-year legal obligation and cascade off Server)
//
// ON ERROR: logs but does NOT throw. Retention run failure must not crash backend.

import { prisma } from "../lib/prisma.js";
import { effectiveFreeWhere } from "../lib/premium.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runRetentionJob() {
  const startedAt = new Date();
  const results = {
    ticketsAnonymized: 0,
    auditLogsDeleted: 0,
    abuseReportsDeleted: 0,
    removedServersPurged: 0,
    errors: [],
  };

  console.log(`[retention] 🕐 Starting retention job at ${startedAt.toISOString()}`);

  // ── 1. Anonymize Free-tier closed tickets older than 30 days ────────────────
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);

    // Find closed tickets on Free-tier servers past 30 days
    const candidates = await prisma.ticket.findMany({
      where: {
        status: { in: ["CLOSED", "ARCHIVED"] },
        closedAt: { lt: thirtyDaysAgo },
        // Only anonymize if the server is not EFFECTIVELY premium — agency
        // seats and trials don't set the raw isPremium flag, and deleting a
        // paying agency customer's transcripts is irreversible data loss.
        server: effectiveFreeWhere(),
        // Skip already-anonymized
        NOT: { archiveHtml: { startsWith: "<!-- anonymized" } },
      },
      select: { id: true, serverId: true },
      take: 500, // batch to avoid locking DB
    });

    for (const ticket of candidates) {
      try {
        // Replace archive HTML with anonymization marker, delete message rows
        await prisma.$transaction([
          prisma.ticketMessage.deleteMany({ where: { ticketId: ticket.id } }),
          prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              archiveHtml: `<!-- anonymized ${new Date().toISOString()} — 30-day retention for Free tier -->`,
            },
          }),
        ]);
        results.ticketsAnonymized++;
      } catch (err) {
        results.errors.push({ type: "ticket", id: ticket.id, error: err.message });
      }
    }

    console.log(`[retention] ✅ Tickets anonymized: ${results.ticketsAnonymized}`);
  } catch (err) {
    console.error(`[retention] ❌ Ticket retention failed:`, err.message);
    results.errors.push({ type: "tickets", error: err.message });
  }

  // ── 2. Delete audit logs older than 2 years ─────────────────────────────────
  try {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * MS_PER_DAY);

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: twoYearsAgo },
        // Don't delete records with legal retention implications
        // SERVER_DATA_PURGED е едновременно дедуп ключ за секция 3б И
        // доказателство, че изтриването е извършено — изтрием ли го след 2
        // години, губим и следата, и защитата от повторно пускане.
        action: { notIn: ["GDPR_ACCOUNT_DELETED", "GDPR_DATA_EXPORT", "ABUSE_REPORT", "SERVER_DATA_PURGED"] },
      },
    });
    results.auditLogsDeleted = deleted.count;
    console.log(`[retention] ✅ Audit logs deleted: ${deleted.count}`);
  } catch (err) {
    console.error(`[retention] ❌ Audit log retention failed:`, err.message);
    results.errors.push({ type: "audit", error: err.message });
  }

  // ── 3. Delete resolved abuse reports older than 1 year ──────────────────────
  try {
    const oneYearAgo = new Date(Date.now() - 365 * MS_PER_DAY);

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        action: "ABUSE_REPORT",
        createdAt: { lt: oneYearAgo },
      },
    });
    results.abuseReportsDeleted = deleted.count;
    console.log(`[retention] ✅ Abuse reports deleted: ${deleted.count}`);
  } catch (err) {
    console.error(`[retention] ❌ Abuse report retention failed:`, err.message);
    results.errors.push({ type: "abuse", error: err.message });
  }

  // ── 3б. Изчисти ЛИЧНИТЕ данни на сървъри без бот от 30+ дни ────────────────
  // Политиката обещава „Until server is removed“ (PrivacyPage), но `botRemovedAt`
  // беше само маркер: единствените консуматори бяха филтър за таблото и
  // изчистване при повторна покана. Данните на клиент, махнал бота, живееха
  // безсрочно — чл. 5(1)(д) и нарушено собствено обещание.
  //
  // ВНИМАНИЕ — първата версия на тази секция триеше самия ред Server. Това е
  // ГРЕШНО: PaymentLog и AuditLog висят на него с onDelete: Cascade, тоест
  // изтриването унищожаваше финансовите записи, за които заглавието на ТОЗИ файл
  // казва „7 години, НИКОГА не се трият автоматично“, плюс GDPR доказателствата,
  // които секция 2 изрично пази. Коментарът в routes/bot.js:134 обяснява същото:
  // мекото изтриване е нарочно, за да оцелеят абонаментът и историята на
  // плащанията при повторна покана.
  //
  // Затова трием ЛИЧНИТЕ данни (тикети и съобщенията в тях, кандидатури, форми,
  // панели, verification, reaction roles, статии, членства), а обвивката Server
  // + PaymentLog + AuditLog остават. Това е и правилният прочит на чл. 17(3)(б):
  // задължението по счетоводното законодателство надделява за финансовите
  // записи, но не оправдава пазенето на чужди разговори.
  //
  // Сървър с ЖИВ платен абонамент се прескача: бот, махнат по погрешка, докато
  // клиентът плаща, не бива да си губи данните — той всеки момент може да върне бота.
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * MS_PER_DAY);
    const ACTIVE_PAID = ["active", "past_due", "trialing", "unpaid", "incomplete"];

    const candidates = await prisma.server.findMany({
      where: {
        botRemovedAt: { not: null, lt: thirtyDaysAgo },
        NOT: { stripeStatus: { in: ACTIVE_PAID } },
        // Веднъж изчистен → не го пипаме пак (маркерът е и одитната следа).
        auditLogs: { none: { action: "SERVER_DATA_PURGED" } },
      },
      select: { id: true },
    });

    for (const { id: serverId } of candidates) {
      await prisma.$transaction([
        // Ticket трие TicketMessage по каскада; същото за Application/Form полета.
        prisma.ticket.deleteMany({ where: { serverId } }),
        prisma.application.deleteMany({ where: { serverId } }),
        prisma.form.deleteMany({ where: { serverId } }),
        prisma.panel.deleteMany({ where: { serverId } }),
        prisma.verificationPanel.deleteMany({ where: { serverId } }),
        prisma.reactionRoleMessage.deleteMany({ where: { serverId } }),
        prisma.kbArticle.deleteMany({ where: { serverId } }),
        prisma.serverMember.deleteMany({ where: { serverId } }),
        prisma.auditLog.create({
          data: { actorId: null, actorTag: "SYSTEM", serverId, action: "SERVER_DATA_PURGED", targetId: serverId },
        }),
      ]);
      results.removedServersPurged += 1;
    }
    console.log(`[retention] ✅ Removed-server data purged: ${results.removedServersPurged}`);
  } catch (err) {
    console.error(`[retention] ❌ Removed-server purge failed:`, err.message);
    results.errors.push({ type: "removedServers", error: err.message });
  }

  // ── 4. Log the run itself for compliance evidence ───────────────────────────
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorTag: "SYSTEM_RETENTION_JOB",
        serverId: null,
        action: "RETENTION_JOB_EXECUTED",
        targetId: null,
        metadata: {
          startedAt: startedAt.toISOString(),
          completedAt: new Date().toISOString(),
          ...results,
        },
      },
    });
  } catch (err) {
    console.error(`[retention] ❌ Failed to log retention run:`, err.message);
  }

  const duration = Date.now() - startedAt.getTime();
  console.log(`[retention] 🏁 Completed in ${duration}ms — ${results.ticketsAnonymized} tickets, ${results.auditLogsDeleted} audit logs, ${results.abuseReportsDeleted} abuse reports`);

  return results;
}

// ─── Schedule — runs at 03:00 UTC daily ──────────────────────────────────────
export function scheduleRetention() {
  // Compute milliseconds until next 03:00 UTC
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  const msUntil = next.getTime() - now.getTime();

  setTimeout(() => {
    runRetentionJob().catch((err) => console.error("[retention] Unhandled error:", err));
    // Then every 24 hours
    setInterval(() => {
      runRetentionJob().catch((err) => console.error("[retention] Unhandled error:", err));
    }, 24 * 60 * 60 * 1000);
  }, msUntil);

  console.log(`[retention] 📅 Scheduled — next run at ${next.toISOString()}`);
}
