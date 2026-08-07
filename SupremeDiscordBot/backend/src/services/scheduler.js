// backend/src/services/scheduler.js
// Scheduled background jobs using node-cron.
// Handles: archive cleanup, expired session cleanup.
// Import this file once from index.js — it starts all crons automatically.

import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { pickRandom } from "../lib/shuffle.js";
import { pushPollUpdate } from "../lib/pollUpdate.js";
import { effectivePremiumWhere, effectiveFreeWhere } from "../lib/premium.js";

// ─── Обвивка на планираните задачи ───────────────────────────────────────────
// node-cron НЕ чака предното изпълнение: три от задачите тук вървят всяка минута
// и правят HTTP извиквания с 10-секунден timeout в последователен цикъл. Бавен
// ран се застъпва със следващия и едно и също съобщение тръгва два пъти.
// Освен това провалът вътре в cron callback се поглъщаше напълно — никой не
// слуша `execution:failed` на node-cron, значи спрял дунинг или спряло GDPR
// изтриване са напълно невидими. (Наблюдателят + Качествения, 07.08.2026)
const running = new Set();
function job(name, fn) {
  return async () => {
    if (running.has(name)) {
      console.warn(`[Scheduler] ${name} още върви — пропускам това задействане (застъпване)`);
      return;
    }
    running.add(name);
    const started = Date.now();
    try {
      await fn();
    } catch (err) {
      console.error(`[Scheduler] ${name} се провали: ${err?.message}`);
      try {
        const Sentry = await import("@sentry/node");
        Sentry.captureException(err, { tags: { job: name } });
      } catch { /* Sentry по избор */ }
    } finally {
      running.delete(name);
      const ms = Date.now() - started;
      if (ms > 30_000) console.warn(`[Scheduler] ${name} отне ${Math.round(ms / 1000)}s`);
    }
  };
}


// ─── Job 1: Archive cleanup ───────────────────────────────────────────────────
// Runs daily at 03:00 UTC.
// Deletes archiveHtml from tickets older than the server's retention policy.
// Premium servers: null retention = keep forever.
// Base servers: 30-day default (archiveRetentionDays = 30).

cron.schedule("0 3 * * *", job("0 3 * * *", async () => {
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
}));

// ─── Job 2: Expired session cleanup ──────────────────────────────────────────
// Runs every hour. Removes Discord OAuth2 sessions that have expired.
// connect-pg-simple handles express sessions separately (pruneSessionInterval).
// This job cleans our custom sessions table used for Discord API calls.

cron.schedule("0 * * * *", job("0 * * * *", async () => {
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
}));

// ─── Job 3: Premium archive retention enforcement ────────────────────────────
// When a server downgrades from Premium to Base, their retention becomes 30 days.
// This job enforces that — runs weekly on Sunday at 04:00 UTC.

cron.schedule("0 4 * * 0", job("0 4 * * 0", async () => {
  try {
    // Set archiveRetentionDays = 30 for any non-premium server that has null retention
    // (null means "forever" which is a Premium perk)
    // „Ефективно free“ — agency-покрити/trial сървъри пазят unlimited retention.
    // updateMany не поддържа relation филтри → findMany + updateMany по id.
    const downgraded = await prisma.server.findMany({
      where: { ...effectiveFreeWhere(), archiveRetentionDays: null },
      select: { id: true },
      take: 1000,
    });
    const result = downgraded.length
      ? await prisma.server.updateMany({
          where: { id: { in: downgraded.map((s) => s.id) } },
          data: { archiveRetentionDays: 30 },
        })
      : { count: 0 };
    if (result.count > 0) {
      console.log(`[Scheduler] Enforced 30-day retention on ${result.count} downgraded servers`);
    }
  } catch (err) {
    console.error("[Scheduler] Retention enforcement error:", err.message);
  }
}));

// ─── Job 4: Inactivity auto-close (v1.5 — Premium) ───────────────────────────
// Runs every 30 minutes. Closes tickets that have had no activity for X hours
// (configured per panel via inactivityCloseHours).

cron.schedule("*/30 * * * *", job("*/30 * * * *", async () => {
  try {
    // Get all panels that have inactivity close configured
    const panels = await prisma.panel.findMany({
      where: {
        inactivityCloseHours: { not: null, gt: 0 },
        server: effectivePremiumWhere(), // Premium-gated — вкл. agency/trial покритие
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
}));

// ─── Job 5: Giveaway auto-end (v1.8) ───────────────────
cron.schedule("* * * * *", job("* * * * *", async () => {
  try {
    const due = await prisma.giveaway.findMany({
      where: { endedAt: null, endsAt: { lte: new Date() } },
      include: { entries: true },
    });
    if (!due.length) return;
    const { notifyBot } = await import("./botNotifier.js");
    for (const g of due) {
      const winners = pickRandom(g.entries, g.winnerCount).map(e => e.userId);
      await prisma.giveaway.update({ where: { id: g.id }, data: { endedAt: new Date(), winnerIds: winners } });
      await notifyBot("GIVEAWAY_ENDED", { serverId: g.serverId, giveawayId: g.id, channelId: g.channelId, messageId: g.messageId, prize: g.prize, winners }).catch(()=>{});
    }
  } catch (err) { console.error("[Scheduler] giveaway end:", err.message); }
}));

// ─── Job 5b: Poll auto-close ───────────────────
// The /poll duration_hours option sets closesAt; without this job it was dead
// (polls never closed). Closes due polls and re-renders the Discord message.
cron.schedule("* * * * *", job("* * * * *", async () => {
  try {
    const due = await prisma.poll.findMany({
      where: { closedAt: null, closesAt: { lte: new Date() } },
      select: { id: true },
    });
    if (!due.length) return;
    for (const p of due) {
      await prisma.poll.update({ where: { id: p.id }, data: { closedAt: new Date() } });
      await pushPollUpdate(p.id);
    }
  } catch (err) { console.error("[Scheduler] poll close:", err.message); }
}));

// ─── Job 6: Scheduled messages (v1.8) ────────────────────
cron.schedule("* * * * *", job("* * * * *", async () => {
  try {
    const due = await prisma.scheduledMessage.findMany({
      where: { sentAt: null, sendAt: { lte: new Date() } },
    });
    if (!due.length) return;
    const { notifyBot } = await import("./botNotifier.js");
    for (const m of due) {
      // Резултатът СЕ ЧЕТЕ. Досега `.catch(()=>{})` изяждаше провала и редът
      // веднага се маркираше като изпратен — еднократно съобщение, чийто канал е
      // изтрит или ботът е офлайн, изчезваше без следа, а таблото твърдеше
      // „изпратено“. (Кодаджията, 07.08.2026)
      const sent = await notifyBot("SCHEDULED_MESSAGE_SEND", m).catch(() => null);

      if (sent?.ok !== true) {
        // Не маркираме — ще опитаме пак на следващата минута. Но НЕ вечно:
        // след 24 часа безуспешни опити се отказваме с одитен запис, иначе
        // счупен канал би генерирал шум завинаги.
        const ageMs = Date.now() - new Date(m.sendAt).getTime();
        if (ageMs < 24 * 60 * 60 * 1000) {
          console.warn(`[Scheduler] насрочено съобщение ${m.id} НЕ е изпратено — ще опитам пак`);
          continue;
        }
        console.error(`[Scheduler] насрочено съобщение ${m.id} се отказва след 24ч опити`);
        await prisma.auditLog.create({
          data: {
            actorId: null, actorTag: "SYSTEM_SCHEDULER", serverId: m.serverId,
            action: "SCHEDULED_MESSAGE_FAILED", targetId: m.id,
            metadata: { channelId: m.channelId, sendAt: m.sendAt },
          },
        }).catch(() => {});
      }

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
}));

// ─── Job 7: Trial expiry notifications (v2.0; DM канал — v3.1) ────────────────
// Runs daily at 9am UTC. Logs servers whose trial expires in 3 days,
// and audit-logs expired trials (but doesn't block access — premium helper
// already returns isPremium=false when trialEndsAt < now).
//
// v3.1 — известията вече РЕАЛНО стигат до собственика: продуктът няма имейл
// инфраструктура, затова каналът е Discord DM през бота (botNotifier.dmUser).
//
// Веднъж на сървър: маркер в auditLog (TRIAL_EXPIRING_DM / TRIAL_EXPIRED_DM).
// Отделен от съществуващите TRIAL_EXPIRING_SOON/TRIAL_EXPIRED записи — те се
// пишат при ВСЯКО пускане на job-а (дневник), затова НЕ стават за дедуп ключ.
//
// Ред на действията (умишлен): маркерът се пише ПРЕДИ DM-а → най-много един
// опит, никакъв спам при срив между двете. Ако транспортът към бота падне
// (ботът е рестартиран/офлайн → dmUser връща null), маркерът се ТРИЕ, за да
// има нов опит утре. Трайна пречка (затворен DM → { ok:false }) оставя
// маркера — повторният опит не би минал.
const TRIAL_DM_COLOR = 0x00e5ff;

async function sendTrialDm({ server, action, embed }) {
  // Вече известен за този етап → пропускаме.
  const already = await prisma.auditLog.findFirst({
    where: { serverId: server.id, action },
    select: { id: true },
  });
  if (already) return false;

  const marker = await prisma.auditLog.create({
    data: {
      actorId: null,
      actorTag: "SYSTEM",
      serverId: server.id,
      action,
      targetId: server.ownerId,
    },
  });

  const { dmUser } = await import("./botNotifier.js");
  const result = await dmUser(server.ownerId, embed).catch(() => null);

  if (result === null) {
    // Временен провал (ботът е недостъпен) → махаме маркера, опитваме утре.
    await prisma.auditLog.delete({ where: { id: marker.id } }).catch(() => {});
    return false;
  }
  if (result.ok !== true) {
    // Трайна пречка — записваме причината, но НЕ повтаряме.
    await prisma.auditLog
      .update({ where: { id: marker.id }, data: { metadata: { delivered: false, reason: result.reason } } })
      .catch(() => {});
    return false;
  }
  await prisma.auditLog
    .update({ where: { id: marker.id }, data: { metadata: { delivered: true } } })
    .catch(() => {});
  return true;
}

cron.schedule("0 9 * * *", job("0 9 * * *", async () => {
  try {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const premiumUrl = (serverId) => `${process.env.FRONTEND_URL}/dashboard/${serverId}/premium`;
    // Discord timestamp markdown — показва датата в ЛОКАЛНАТА зона на четящия,
    // вместо да налагаме UTC форматиране от сървъра.
    const discordDate = (d) => `<t:${Math.floor(d.getTime() / 1000)}:D>`;
    const discordRelative = (d) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;

    // Servers whose trial expires in the next 3 days and are not on Premium.
    // Изключваме agency-покрити: те са платени през агенцията, а не собствен
    // trial → не бива да получават „trial-ът ти изтича“ DM (суровият isPremium
    // може да е застоял, затова и явната agency проверка).
    const notAgencyCovered = { OR: [{ agencyId: null }, { agency: { is: { active: false } } }] };
    const expiring = await prisma.server.findMany({
      where: {
        isPremium: false,
        trialEndsAt: { gte: now, lte: in3Days },
        ...notAgencyCovered,
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

      // Известие до собственика на сървъра (веднъж). Текстът е на английски —
      // източникът на истината за bot UI низовете (backend/src/i18n/en.js).
      // Локализацията bg/it иска нови i18n ключове → отделна задача (Преводач).
      await sendTrialDm({
        server: s,
        action: "TRIAL_EXPIRING_DM",
        embed: {
          title: "⏰ Your Supreme Bot trial is ending",
          description:
            `The Premium trial for **${s.name}** ends on ${discordDate(s.trialEndsAt)} ` +
            `(${discordRelative(s.trialEndsAt)}).\n\n` +
            "Keep your Premium features — AI auto-replies, verification, unlimited ticket " +
            "archives, giveaways, webhooks and the REST API — by subscribing before then.\n\n" +
            // Не е бутон за поръчка: линкът само отваря страницата с тарифите.
            // Обвързващият бутон с етикет по чл. 8(2) Дир. 2011/83/ЕС е там.
            `**[View plans and pricing](${premiumUrl(s.id)})**`,
          color: TRIAL_DM_COLOR,
          footer: {
            // Без правни твърдения в едно изречение: пълната преддоговорна
            // информация (цена с ДДС, 14-дневен отказ, чл. 16(а)/8(8) искане)
            // се показва на страницата за плащане, където се сключва договорът.
            text:
              "Supreme Bot · You receive this because you own this Discord server. " +
              "Prices include VAT; your 14-day withdrawal rights are explained at checkout.",
          },
          timestamp: new Date().toISOString(),
        },
      }).catch((err) => console.error(`[Scheduler] trial DM ${s.id}:`, err.message));
    }

    // Servers whose trial just expired (within the last 24h)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const justExpired = await prisma.server.findMany({
      where: {
        isPremium: false,
        trialEndsAt: { gte: yesterday, lt: now },
        ...notAgencyCovered,
      },
      select: { id: true, name: true, ownerId: true },
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

      await sendTrialDm({
        server: s,
        action: "TRIAL_EXPIRED_DM",
        embed: {
          title: "Your Supreme Bot trial has ended",
          description:
            `The Premium trial for **${s.name}** has expired and the server is back on the free tier.\n\n` +
            "**What you no longer have:** AI auto-replies · verification panels · " +
            "round-robin assignment · giveaways · webhooks · REST API · unlimited " +
            "ticket archives (archives now clear after 30 days).\n\n" +
            "Your configuration is kept — subscribing restores everything as it was.\n\n" +
            `**[View plans and pricing](${premiumUrl(s.id)})**`,
          color: TRIAL_DM_COLOR,
          footer: { text: "Supreme Bot · You receive this because you own this Discord server." },
          timestamp: new Date().toISOString(),
        },
      }).catch((err) => console.error(`[Scheduler] trial-expired DM ${s.id}:`, err.message));
    }
  } catch (err) {
    console.error("[Scheduler] trial expiry check:", err.message);
  }
}));

// ─── Job 8: Daily metrics snapshot (v2.1) ───────────────────────────
// Runs at 00:05 UTC every day. Aggregates yesterday's ticket/form/app/verification
// activity into daily_metrics for fast analytics queries.
cron.schedule("5 0 * * *", job("5 0 * * *", async () => {
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
}));

// ─── Job 9: SLA breach detection (v31 — Premium) ─────────────────────────────
// Runs every 10 minutes. For panels with an SLA configured, flags tickets that
// missed the first-response or resolution target and DMs the assignee (or the
// server owner if unclaimed). `slaBreachedAt` is the "already notified" marker
// — once set we never re-check that ticket again (no spam on every run).
// Batched (take 200 per dimension per panel) + try/catch per ticket so one bad
// row can't take down the whole job.

const SLA_BREACH_COLOR = 0xed4245; // Discord "danger" red

function slaDashboardUrl(serverId, ticketId) {
  return `${process.env.FRONTEND_URL || ""}/dashboard/${serverId}/tickets/${ticketId}`;
}

async function notifySlaBreach({ ticket, panel, type, minutesLate }) {
  const { dmUser } = await import("./botNotifier.js");
  const targetUserId = ticket.assigneeId || ticket.server?.ownerId;
  if (!targetUserId) return;

  const label = type === "first_response" ? "First-response" : "Resolution";
  const ticketLabel = ticket.number != null ? `#${ticket.number}` : ticket.id;

  await dmUser(targetUserId, {
    title: `⚠️ SLA breached — ${label}`,
    description:
      `Ticket **${ticketLabel}** in **${panel?.name || "unknown panel"}** missed its ` +
      `${label.toLowerCase()} SLA by ~${minutesLate} min.\n\n` +
      `**[Open ticket](${slaDashboardUrl(ticket.serverId, ticket.id)})**`,
    color: SLA_BREACH_COLOR,
    timestamp: new Date().toISOString(),
  }).catch(() => null);
}

cron.schedule("*/10 * * * *", job("*/10 * * * *", async () => {
  try {
    const now = new Date();
    const panels = await prisma.panel.findMany({
      where: {
        OR: [
          { slaFirstResponseMinutes: { not: null } },
          { slaResolutionMinutes: { not: null } },
        ],
        server: effectivePremiumWhere(now), // SLA is a Premium feature — agency/trial covered too
      },
      select: {
        id: true, name: true, serverId: true,
        slaFirstResponseMinutes: true, slaResolutionMinutes: true,
      },
    });

    if (!panels.length) return;

    let breached = 0;

    for (const panel of panels) {
      // ── (a) First-response breach ──────────────────────────────────────
      if (panel.slaFirstResponseMinutes) {
        const cutoff = new Date(now.getTime() - panel.slaFirstResponseMinutes * 60 * 1000);
        const overdue = await prisma.ticket.findMany({
          where: {
            panelId: panel.id,
            status: { in: ["OPEN", "CLAIMED"] },
            firstResponseAt: null,
            slaBreachedAt: null,
            createdAt: { lt: cutoff },
          },
          select: { id: true, serverId: true, number: true, assigneeId: true, createdAt: true },
          take: 200,
        });

        for (const t of overdue) {
          try {
            await prisma.ticket.update({ where: { id: t.id }, data: { slaBreachedAt: now } });
            const minutesLate = Math.round((now.getTime() - t.createdAt.getTime()) / 60000) - panel.slaFirstResponseMinutes;
            await prisma.auditLog.create({
              data: {
                actorId: null,
                actorTag: "SYSTEM",
                serverId: t.serverId,
                action: "SLA_BREACH",
                targetId: t.id,
                metadata: { type: "first_response", panelId: panel.id, minutesLate },
              },
            });
            const server = await prisma.server.findUnique({ where: { id: t.serverId }, select: { ownerId: true } });
            await notifySlaBreach({ ticket: { ...t, server }, panel, type: "first_response", minutesLate });
            breached++;
          } catch (err) {
            console.error(`[sla] first-response breach failed for ticket ${t.id}:`, err.message);
          }
        }
      }

      // ── (b) Resolution breach ──────────────────────────────────────────
      if (panel.slaResolutionMinutes) {
        const cutoff = new Date(now.getTime() - panel.slaResolutionMinutes * 60 * 1000);
        const overdue = await prisma.ticket.findMany({
          where: {
            panelId: panel.id,
            status: { in: ["OPEN", "CLAIMED"] },
            slaBreachedAt: null,
            createdAt: { lt: cutoff },
          },
          select: { id: true, serverId: true, number: true, assigneeId: true, createdAt: true },
          take: 200,
        });

        for (const t of overdue) {
          try {
            await prisma.ticket.update({ where: { id: t.id }, data: { slaBreachedAt: now } });
            const minutesLate = Math.round((now.getTime() - t.createdAt.getTime()) / 60000) - panel.slaResolutionMinutes;
            await prisma.auditLog.create({
              data: {
                actorId: null,
                actorTag: "SYSTEM",
                serverId: t.serverId,
                action: "SLA_BREACH",
                targetId: t.id,
                metadata: { type: "resolution", panelId: panel.id, minutesLate },
              },
            });
            const server = await prisma.server.findUnique({ where: { id: t.serverId }, select: { ownerId: true } });
            await notifySlaBreach({ ticket: { ...t, server }, panel, type: "resolution", minutesLate });
            breached++;
          } catch (err) {
            console.error(`[sla] resolution breach failed for ticket ${t.id}:`, err.message);
          }
        }
      }
    }

    if (breached > 0) {
      console.log(`[Scheduler] SLA breach check: flagged ${breached} tickets`);
    }
  } catch (err) {
    console.error("[Scheduler] SLA breach check error:", err.message);
  }
}));

console.log("[Scheduler] Background jobs started");
