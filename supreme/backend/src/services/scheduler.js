// backend/src/services/scheduler.js
// Scheduled background jobs using node-cron.
// Handles: archive cleanup, expired session cleanup.
// Import this file once from index.js — it starts all crons automatically.

import cron from "node-cron";
import { prisma } from "../lib/prisma.js";

// ─── Job 1: Archive cleanup ───────────────────────────────────────────────────
// Runs daily at 03:00 UTC.
// Deletes archiveHtml from tickets older than the server's retention policy.
// Premium servers: null retention = keep forever.
// Base servers: 30-day default (archiveRetentionDays = 30).

cron.schedule("0 3 * * *", async () => {
  console.log("[Scheduler] Running archive cleanup...");
  try {
    // Get all servers that have a defined retention period
    const servers = await prisma.server.findMany({
      where: { archiveRetentionDays: { not: null } },
      select: { id: true, archiveRetentionDays: true },
    });

    let cleaned = 0;
    for (const server of servers) {
      const cutoff = new Date(
        Date.now() - server.archiveRetentionDays * 24 * 60 * 60 * 1000
      );

      const result = await prisma.ticket.updateMany({
        where: {
          serverId: server.id,
          status: { in: ["CLOSED", "ARCHIVED"] },
          closedAt: { lt: cutoff },
          archiveHtml: { not: null },
        },
        data: { archiveHtml: null },
      });
      cleaned += result.count;
    }

    if (cleaned > 0) {
      console.log(`[Scheduler] Archive cleanup: cleared HTML from ${cleaned} tickets`);
    }
  } catch (err) {
    console.error("[Scheduler] Archive cleanup error:", err.message);
  }
});

// ─── Job 2: Expired session cleanup ──────────────────────────────────────────
// Runs every hour. Removes Discord OAuth2 sessions that have expired.
// connect-pg-simple handles express sessions separately (pruneSessionInterval).
// This job cleans our custom sessions table used for Discord API calls.

cron.schedule("0 * * * *", async () => {
  try {
    const result = await prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      console.log(`[Scheduler] Cleaned ${result.count} expired Discord sessions`);
    }
  } catch (err) {
    console.error("[Scheduler] Session cleanup error:", err.message);
  }
});

// ─── Job 3: Premium archive retention enforcement ────────────────────────────
// When a server downgrades from Premium to Base, their retention becomes 30 days.
// This job enforces that — runs weekly on Sunday at 04:00 UTC.

cron.schedule("0 4 * * 0", async () => {
  try {
    // Set archiveRetentionDays = 30 for any non-premium server that has null retention
    // (null means "forever" which is a Premium perk)
    const result = await prisma.server.updateMany({
      where: { isPremium: false, archiveRetentionDays: null },
      data: { archiveRetentionDays: 30 },
    });
    if (result.count > 0) {
      console.log(`[Scheduler] Enforced 30-day retention on ${result.count} downgraded servers`);
    }
  } catch (err) {
    console.error("[Scheduler] Retention enforcement error:", err.message);
  }
});

// ─── Job 4: Inactivity auto-close (v1.5 — Premium) ───────────────────────────
// Runs every 30 minutes. Closes tickets that have had no activity for X hours
// (configured per panel via inactivityCloseHours).

cron.schedule("*/30 * * * *", async () => {
  try {
    // Get all panels that have inactivity close configured
    const panels = await prisma.panel.findMany({
      where: {
        inactivityCloseHours: { not: null, gt: 0 },
        server: { isPremium: true },  // Premium-gated feature
      },
      select: { id: true, inactivityCloseHours: true, logChannelId: true, counterPadding: true },
    });

    if (!panels.length) return;

    const { notifyBot } = await import("./botNotifier.js");

    for (const panel of panels) {
      const cutoff = new Date(Date.now() - panel.inactivityCloseHours * 60 * 60 * 1000);

      const inactiveTickets = await prisma.ticket.findMany({
        where: {
          panelId: panel.id,
          status: { in: ["OPEN", "CLAIMED"] },
          lastActivityAt: { lt: cutoff },
        },
        select: { id: true, channelId: true, serverId: true, number: true, creatorId: true },
      });

      for (const t of inactiveTickets) {
        try {
          // Mark closed
          await prisma.ticket.update({
            where: { id: t.id },
            data: {
              status: "CLOSED",
              closedAt: new Date(),
              closeReason: `Auto-closed due to ${panel.inactivityCloseHours}h of inactivity`,
            },
          });
          await prisma.auditLog.create({
            data: {
              actorId: null,
              actorTag: "SYSTEM",
              serverId: t.serverId,
              action: "TICKET_AUTO_CLOSED",
              targetId: t.id,
              metadata: { reason: "inactivity", hours: panel.inactivityCloseHours },
            },
          });

          // Tell the bot to post a notice in the channel
          await notifyBot("TICKET_AUTO_CLOSED", {
            ticketId: t.id,
            channelId: t.channelId,
            serverId: t.serverId,
            hours: panel.inactivityCloseHours,
            logChannelId: panel.logChannelId,
            number: t.number,
            padding: panel.counterPadding,
          }).catch(() => {});
        } catch (err) {
          console.error(`[inactivity] failed on ticket ${t.id}:`, err.message);
        }
      }

      if (inactiveTickets.length > 0) {
        console.log(`[Scheduler] Auto-closed ${inactiveTickets.length} inactive tickets for panel ${panel.id}`);
      }
    }
  } catch (err) {
    console.error("[Scheduler] Inactivity close error:", err.message);
  }
});

// ─── Job 5: Giveaway auto-end (v1.8) ───────────────────
cron.schedule("* * * * *", async () => {
  try {
    const due = await prisma.giveaway.findMany({
      where: { endedAt: null, endsAt: { lte: new Date() } },
      include: { entries: true },
    });
    if (!due.length) return;
    const { notifyBot } = await import("./botNotifier.js");
    for (const g of due) {
      const shuffled = [...g.entries].sort(() => Math.random() - 0.5);
      const winners = shuffled.slice(0, g.winnerCount).map(e => e.userId);
      await prisma.giveaway.update({ where: { id: g.id }, data: { endedAt: new Date(), winnerIds: winners } });
      await notifyBot("GIVEAWAY_ENDED", { giveawayId: g.id, channelId: g.channelId, messageId: g.messageId, prize: g.prize, winners }).catch(()=>{});
    }
  } catch (err) { console.error("[Scheduler] giveaway end:", err.message); }
});

// ─── Job 6: Scheduled messages (v1.8) ────────────────────
cron.schedule("* * * * *", async () => {
  try {
    const due = await prisma.scheduledMessage.findMany({
      where: { sentAt: null, sendAt: { lte: new Date() } },
    });
    if (!due.length) return;
    const { notifyBot } = await import("./botNotifier.js");
    for (const m of due) {
      await notifyBot("SCHEDULED_MESSAGE_SEND", m).catch(()=>{});
      const update = { sentAt: new Date() };
      if (m.recurrence) {
        const now = new Date();
        const next = new Date(m.sendAt);
        if (m.recurrence === "daily") next.setDate(next.getDate() + 1);
        else if (m.recurrence === "weekly") next.setDate(next.getDate() + 7);
        else if (m.recurrence === "monthly") next.setMonth(next.getMonth() + 1);
        while (next <= now) {
          if (m.recurrence === "daily") next.setDate(next.getDate() + 1);
          else if (m.recurrence === "weekly") next.setDate(next.getDate() + 7);
          else next.setMonth(next.getMonth() + 1);
        }
        // For recurring: reset sentAt=null + push sendAt forward
        update.sentAt = null;
        update.sendAt = next;
      }
      await prisma.scheduledMessage.update({ where: { id: m.id }, data: update });
    }
  } catch (err) { console.error("[Scheduler] scheduled msg:", err.message); }
});

// ─── Job 7: Trial expiry notifications (v2.0) ─────────────────────
// Runs daily at 9am UTC. Logs servers whose trial expires in 3 days,
// and audit-logs expired trials (but doesn't block access — premium helper
// already returns isPremium=false when trialEndsAt < now).
cron.schedule("0 9 * * *", async () => {
  try {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Servers whose trial expires in the next 3 days and are not on Premium
    const expiring = await prisma.server.findMany({
      where: {
        isPremium: false,
        trialEndsAt: { gte: now, lte: in3Days },
      },
      select: { id: true, name: true, trialEndsAt: true, ownerId: true },
    });

    for (const s of expiring) {
      const hoursLeft = Math.floor((s.trialEndsAt.getTime() - now.getTime()) / (60 * 60 * 1000));
      console.log(`[Scheduler] Trial expiring soon: ${s.name} (${s.id}) — ${hoursLeft}h left`);
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorTag: "SYSTEM",
          serverId: s.id,
          action: "TRIAL_EXPIRING_SOON",
          targetId: s.id,
          metadata: { hoursLeft, trialEndsAt: s.trialEndsAt },
        },
      }).catch(() => {});
    }

    // Servers whose trial just expired (within the last 24h)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const justExpired = await prisma.server.findMany({
      where: {
        isPremium: false,
        trialEndsAt: { gte: yesterday, lt: now },
      },
      select: { id: true, name: true },
    });

    for (const s of justExpired) {
      console.log(`[Scheduler] Trial expired: ${s.name} (${s.id}) — access downgraded`);
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorTag: "SYSTEM",
          serverId: s.id,
          action: "TRIAL_EXPIRED",
          targetId: s.id,
        },
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[Scheduler] trial expiry check:", err.message);
  }
});

// ─── Job 8: Daily metrics snapshot (v2.1) ───────────────────────────
// Runs at 00:05 UTC every day. Aggregates yesterday's ticket/form/app/verification
// activity into daily_metrics for fast analytics queries.
cron.schedule("5 0 * * *", async () => {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setUTCHours(23, 59, 59, 999);

    // Get distinct server IDs that had activity yesterday
    const activeServers = await prisma.ticket.findMany({
      where: { createdAt: { gte: yesterday, lte: endOfYesterday } },
      select: { serverId: true },
      distinct: ["serverId"],
    });

    for (const { serverId } of activeServers) {
      const [
        ticketsOpened, ticketsClosed, ticketsEscalated,
        formsSubmitted, appsApproved, appsDenied,
        verSuccess, verFailure,
      ] = await Promise.all([
        prisma.ticket.count({ where: { serverId, createdAt: { gte: yesterday, lte: endOfYesterday } } }),
        prisma.ticket.count({ where: { serverId, closedAt:  { gte: yesterday, lte: endOfYesterday } } }),
        prisma.auditLog.count({ where: { serverId, action: "TICKET_ESCALATED", createdAt: { gte: yesterday, lte: endOfYesterday } } }),
        prisma.application.count({ where: { serverId, createdAt: { gte: yesterday, lte: endOfYesterday } } }),
        prisma.application.count({ where: { serverId, status: "APPROVED", updatedAt: { gte: yesterday, lte: endOfYesterday } } }),
        prisma.application.count({ where: { serverId, status: "DENIED",   updatedAt: { gte: yesterday, lte: endOfYesterday } } }),
        prisma.verificationAttempt.count({ where: { panel: { serverId }, success: true,  createdAt: { gte: yesterday, lte: endOfYesterday } } }),
        prisma.verificationAttempt.count({ where: { panel: { serverId }, success: false, createdAt: { gte: yesterday, lte: endOfYesterday } } }),
      ]);

      await prisma.dailyMetric.upsert({
        where: { serverId_date: { serverId, date: yesterday } },
        create: {
          serverId, date: yesterday,
          ticketsOpened, ticketsClosed, ticketsEscalated,
          formsSubmitted,
          applicationsApproved: appsApproved,
          applicationsDenied:   appsDenied,
          verificationsSuccess: verSuccess,
          verificationsFailure: verFailure,
        },
        update: {
          ticketsOpened, ticketsClosed, ticketsEscalated,
          formsSubmitted,
          applicationsApproved: appsApproved,
          applicationsDenied:   appsDenied,
          verificationsSuccess: verSuccess,
          verificationsFailure: verFailure,
        },
      });
    }
    console.log(`[Scheduler] Daily metrics snapshotted for ${activeServers.length} servers`);
  } catch (err) {
    console.error("[Scheduler] daily metrics:", err.message);
  }
});

console.log("[Scheduler] Background jobs started");
