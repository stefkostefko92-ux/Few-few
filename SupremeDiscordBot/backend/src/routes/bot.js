// backend/src/routes/bot.js
// Internal routes called BY the Discord bot to interact with the backend API
// (separate from the bot-notifier that calls the bot)
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { generateHtmlTranscript } from "../utils/archive.js";
import { ensureArchiveToken, tokenizedArchiveUrl } from "../lib/archiveToken.js";
import { decrypt } from "../lib/crypto.js";
import { pickNextAssignee } from "../services/roundRobin.js";
import { generateAutoReply, aiRateLimitOk } from "../services/aiReply.js";
import { getServerTier } from "../lib/premium.js";

const router = Router();

router.use(requireBotSecret);

// ─── GET /api/bot/server/:serverId ────────────────────────────────────────────
// Bot fetches server config to know which features are enabled

router.get("/server/:serverId", async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      include: {
        panels: {
          include: {
            buttons: { include: { form: { include: { questions: { orderBy: { order: "asc" } } } } } },
          },
        },
        forms: { include: { questions: { orderBy: { order: "asc" } } } },
      },
    });

    if (!server) {
      // Auto-register server on first bot join
      return res.json({ id: req.params.serverId, isPremium: false, panels: [], forms: [] });
    }

    res.json(server);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/server/register ───────────────────────────────────────────
// Called when bot joins a new guild

router.post("/server/register", async (req, res, next) => {
  const { id, name, icon, ownerId } = req.body;
  if (!id || !name) return res.status(400).json({ error: "id and name required" });

  try {
    // Upsert clears botRemovedAt on re-join so the server reappears in user dashboards.
    const server = await prisma.server.upsert({
      where: { id },
      create: { id, name, icon: icon || null, ownerId: ownerId || "UNKNOWN" },
      update: { name, icon: icon || null, botRemovedAt: null },
    });

    await prisma.auditLog.create({
      data: {
        actorId: ownerId || null,
        actorTag: ownerId ? undefined : "SYSTEM",
        serverId: id,
        action: "BOT_JOINED",
        targetId: id,
      },
    });

    res.json(server);
  } catch (err) {
    next(err);
  }
});


// ─── GET /api/bot/server/:serverId/token ─────────────────────────────────────
// Returns the decrypted custom bot token for white-label bots.
// Only accessible with the bot secret — never exposed to users.

router.get("/server/:serverId/token", async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { customBotToken: true },
    });

    if (!server) return res.status(404).json({ error: "Server not found" });
    // White-label bot runs only while the server holds the White-label / Agency
    // tier (getServerTier resolves own plan, active trial and agency seats).
    const { hasWhiteLabel } = await getServerTier(req.params.serverId);
    if (!hasWhiteLabel || !server.customBotToken) {
      return res.json({ token: null });
    }

    try {
      const token = decrypt(server.customBotToken);
      res.json({ token });
    } catch {
      // Decryption failed — token may have been stored before encryption was added
      res.json({ token: null, warning: "Token could not be decrypted — please re-enter it" });
    }
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/bot/server/:serverId ─────────────────────────────────────────
// Called by bot's guildDelete event when the bot is kicked/removed from a guild.
// Soft-delete: mark botRemovedAt timestamp instead of hard-deleting so that:
//   - Stripe subscription remains intact (customer may re-invite)
//   - Payment history is preserved for audit/financial records
//   - Ticket archives stay viewable
// The server is hidden from user dashboards via botRemovedAt IS NULL filter.
// guildCreate event clears botRemovedAt on re-invite.

router.delete("/server/:serverId", async (req, res, next) => {
  try {
    await prisma.server.updateMany({
      where: { id: req.params.serverId, botRemovedAt: null },
      data:  { botRemovedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorTag: "SYSTEM",
        serverId: req.params.serverId,
        action: "BOT_REMOVED",
        targetId: req.params.serverId,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// ─── POST /api/bot/ticket/by-channel/:channelId/close-if-open ────────────────
// Called when Discord channel is deleted — closes ticket if one exists for it.
// Silently no-ops if no open ticket for this channel.

router.post("/ticket/by-channel/:channelId/close-if-open", async (req, res, next) => {
  const { reason } = req.body;

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        channelId: req.params.channelId,
        status: { notIn: ["CLOSED", "ARCHIVED"] },
      },
      include: { messages: { orderBy: { createdAt: "asc" } }, creator: true, assignee: true },
    });

    if (!ticket) return res.json({ ok: true, closed: false });

    const html = generateHtmlTranscript(ticket);
    const token = await ensureArchiveToken(ticket.id, ticket.archiveToken);

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: "CLOSED",
        closeReason: reason || "Channel deleted",
        closedAt: new Date(),
        archiveHtml: html,
        archiveUrl: tokenizedArchiveUrl(ticket.id, token),
      },
    });

    res.json({ ok: true, closed: true, ticketId: ticket.id });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/ticket/by-channel/:channelId ───────────────────────────────

router.get("/ticket/by-channel/:channelId", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { channelId: req.params.channelId, status: { notIn: ["CLOSED", "ARCHIVED"] } },
    });
    if (!ticket) return res.status(404).json({ error: "No active ticket for this channel" });
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/ticket/create ─────────────────────────────────────────────
// Bot creates a ticket record after creating the Discord channel.
// Handles: maxOpenPerUser enforcement, round-robin assignment, AI auto-reply trigger.

router.post("/ticket/create", async (req, res, next) => {
  const { serverId, panelId, creatorId, channelId, firstMessage } = req.body;

  if (!serverId || !creatorId) {
    return res.status(400).json({ error: "serverId and creatorId are required" });
  }

  try {
    // Load full panel config (v1.5 — we need many more fields now)
    const panel = panelId
      ? await prisma.panel.findUnique({
          where: { id: panelId },
          select: {
            id: true, name: true,
            maxOpenPerUser: true, maxOpenPerUserPanel: true,
            supportRoleIds: true, counterPadding: true,
          },
        })
      : null;

    // ── 1a. Per-server open limit enforcement ───────────────────────────────
    const maxOpen = panel?.maxOpenPerUser ?? 1;
    const openCount = await prisma.ticket.count({
      where: { serverId, creatorId, status: { in: ["OPEN", "CLAIMED"] } },
    });
    if (openCount >= maxOpen) {
      return res.status(429).json({
        error: `You already have ${openCount} open ticket(s). Please wait for them to be resolved before opening a new one.`,
        code: "MAX_TICKETS_REACHED",
      });
    }

    // ── 1b. Per-panel open limit (v1.5) ─────────────────────────────────────
    if (panel?.maxOpenPerUserPanel && panelId) {
      const panelOpenCount = await prisma.ticket.count({
        where: { panelId, creatorId, status: { in: ["OPEN", "CLAIMED"] } },
      });
      if (panelOpenCount >= panel.maxOpenPerUserPanel) {
        return res.status(429).json({
          error: `You already have ${panelOpenCount} open ticket(s) for panel "${panel.name}".`,
          code: "PANEL_LIMIT_REACHED",
        });
      }
    }

    // ── 2. Round-robin assignment (Premium) ────────────────────────────────
    const botToken = process.env.BOT_TOKEN;
    const assigneeId = await pickNextAssignee(serverId, botToken);

    // ── 3. Atomic counter increment + ticket create (v1.5) ──────────────────
    // Use a transaction to ensure counter is never duplicated under concurrency.
    let ticket, updatedPanel;
    try {
      [ticket, updatedPanel] = await prisma.$transaction(async (tx) => {
      // Race-safe open-limit: the count above is a fast path — two concurrent
      // panel clicks could both pass it. Take a per-(server,user) advisory lock
      // so concurrent creates serialize, then re-count inside the lock (the lock
      // is held until this tx commits, so the waiter sees the committed ticket).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serverId + ":" + creatorId}))`;
      const openNow = await tx.ticket.count({
        where: { serverId, creatorId, status: { in: ["OPEN", "CLAIMED"] } },
      });
      if (openNow >= maxOpen) {
        const e = new Error("MAX_TICKETS_REACHED"); e.code = "MAX_TICKETS_REACHED"; throw e;
      }
      let nextNumber = null;
      if (panelId) {
        const bumped = await tx.panel.update({
          where: { id: panelId },
          data: { ticketCounter: { increment: 1 } },
          select: { ticketCounter: true, counterPadding: true },
        });
        nextNumber = bumped.ticketCounter;
      }
      const created = await tx.ticket.create({
        data: {
          serverId,
          panelId: panelId || null,
          creatorId,
          channelId: channelId || null,
          status: assigneeId ? "CLAIMED" : "OPEN",
          assigneeId: assigneeId || null,
          number: nextNumber,
          lastActivityAt: new Date(),
        },
      });
      return [created, { ticketCounter: nextNumber }];
      });
    } catch (e) {
      if (e.code === "MAX_TICKETS_REACHED") {
        return res.status(429).json({
          error: "You already have the maximum number of open tickets. Please wait for one to be resolved.",
          code: "MAX_TICKETS_REACHED",
        });
      }
      throw e;
    }

    // ── 4. AI auto-reply (Premium, async — don't block the response) ───────
    if (channelId) {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { aiRepliesEnabled: true, aiRepliesPrompt: true, name: true },
      });
      // getServerTier покрива собствен план + trial + agency seat — суровият
      // isPremium изпускаше agency-покрити сървъри (платена функция не работи).
      const { isPremium: isEffectivePremium } = await getServerTier(serverId);
      if (isEffectivePremium && server?.aiRepliesEnabled && aiRateLimitOk(serverId)) {
        generateAutoReply({
          userMessage: firstMessage || "",
          serverName: server.name,
          customPrompt: server.aiRepliesPrompt,
          customApiKey: null,
        }).then((reply) => {
          if (reply) {
            import("../services/botNotifier.js").then(({ notifyBot }) => {
              notifyBot("AI_REPLY", { channelId, content: reply, ticketId: ticket.id });
            });
          }
        }).catch(() => {});
      }
    }

    const serverTicketCount = await prisma.ticket.count({ where: { serverId } });

    res.json({
      ...ticket,
      assigneeId,
      ticketCount: serverTicketCount,
      number: ticket.number,
    });

    // Notify the assigned staff member asynchronously
    if (assigneeId) {
      import("../services/botNotifier.js").then(({ notifyBot }) => {
        notifyBot("TICKET_ASSIGNED", { channelId: channelId || null, assigneeId, ticketId: ticket.id });
      });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/ticket/:ticketId/message ───────────────────────────────────
// Bot logs a message to the ticket transcript

router.post("/ticket/:ticketId/message", async (req, res, next) => {
  const { authorId, authorTag, content, attachments } = req.body;

  if (!authorId || !authorTag) {
    return res.status(400).json({ error: "authorId and authorTag are required" });
  }

  try {
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: req.params.ticketId,
        authorId,
        authorTag,
        content: content || "",
        attachments: attachments || [],
      },
    });
    res.json(message);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/ticket/:ticketId/close ────────────────────────────────────
// Bot closes a ticket (from slash command in Discord)

router.post("/ticket/:ticketId/close", async (req, res, next) => {
  const { closedById, reason } = req.body;

  try {
    // Verify ticket exists and is closeable before updating
    const existing = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { id: true, status: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });
    if (existing.status === "CLOSED" || existing.status === "ARCHIVED") {
      return res.status(400).json({ error: "Ticket is already closed" });
    }

    const ticket = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { status: "CLOSED", closeReason: reason, closedAt: new Date() },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        creator: true, assignee: true,
        panel: { select: { transcriptChannelId: true, name: true } },
        server: { select: { archiveChannelId: true } },
      },
    });

    // Generate HTML archive
    const html = generateHtmlTranscript(ticket);

    const token = await ensureArchiveToken(ticket.id, ticket.archiveToken);
    const archiveUrl = tokenizedArchiveUrl(ticket.id, token);
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { archiveHtml: html, archiveUrl },
    });

    // Build full URL — prefer env var, fallback to request headers (for auto-detection)
    let base = process.env.FRONTEND_URL || process.env.ARCHIVE_BASE_URL || "";
    if (!base && req.headers["x-forwarded-host"]) {
      const proto = req.headers["x-forwarded-proto"] || "https";
      base = `${proto}://${req.headers["x-forwarded-host"]}`;
    }
    if (!base && req.headers.host) {
      // fallback to request host — works only if same host
      base = `https://${req.headers.host}`;
    }

    console.log(`[ticket:close] Saved transcript for ${ticket.id}, archiveHtml=${html.length} bytes, base=${base}`);

    res.json({
      ...ticket,
      archiveHtml: undefined, // don't send full HTML over the wire
      archiveUrl,
      fullArchiveUrl: base ? `${base}${archiveUrl}` : archiveUrl,
      transcriptChannelId: ticket.panel?.transcriptChannelId || ticket.server?.archiveChannelId || null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/ticket/:ticketId (v1.5) ─────────────────────────────────────
// Lightweight lookup for bot interaction handlers — includes panel config.

router.get("/ticket/:ticketId", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      include: { panel: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    res.json(ticket);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/claim (v1.5 — rewired) ───────────────────

router.post("/ticket/:ticketId/claim", async (req, res, next) => {
  const { userId } = req.body;
  try {
    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { assigneeId: userId, status: "CLAIMED", lastActivityAt: new Date() },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/unclaim ──────────────────────────────────

router.post("/ticket/:ticketId/unclaim", async (req, res, next) => {
  try {
    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { assigneeId: null, status: "OPEN", lastActivityAt: new Date() },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/reopen (v1.5) ────────────────────────────

router.post("/ticket/:ticketId/reopen", async (req, res, next) => {
  const { reopenerId } = req.body;
  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { status: true, serverId: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });
    if (existing.status !== "CLOSED") {
      return res.status(400).json({ error: "Only closed tickets can be reopened" });
    }

    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: {
        status: "OPEN",
        reopenedAt: new Date(),
        reopenCount: { increment: 1 },
        closedAt: null,
        lastActivityAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: reopenerId || null,
        actorTag: reopenerId ? undefined : "SYSTEM",
        serverId: existing.serverId,
        action: "TICKET_REOPENED",
        targetId: req.params.ticketId,
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/delete (v1.5) ────────────────────────────
// Soft-delete: marks ticket as ARCHIVED, preserves archiveHtml + archiveUrl
// forever so transcript remains accessible even after Discord channel is deleted.
// The Discord channel itself is deleted separately by the bot (interactionCreate).

router.post("/ticket/:ticketId/delete", async (req, res, next) => {
  const { deleterId } = req.body;
  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { serverId: true, status: true, archiveHtml: true, archiveToken: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });

    // If no transcript exists yet, generate one now from any logged messages
    // BEFORE archiving (in case ticket was force-deleted without proper close)
    let archiveHtml = existing.archiveHtml;
    const token = await ensureArchiveToken(req.params.ticketId, existing.archiveToken);
    const archiveUrl = tokenizedArchiveUrl(req.params.ticketId, token);

    if (!archiveHtml) {
      const fullTicket = await prisma.ticket.findUnique({
        where: { id: req.params.ticketId },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          creator: true,
          assignee: true,
        },
      });
      if (fullTicket) {
        archiveHtml = generateHtmlTranscript(fullTicket);
      }
    }

    await prisma.auditLog.create({
      data: {
        actorId: deleterId || null,
        actorTag: deleterId ? undefined : "SYSTEM",
        serverId: existing.serverId,
        action: "TICKET_DELETED",
        targetId: req.params.ticketId,
      },
    });

    // Soft-delete: ARCHIVED status keeps the row + transcript forever.
    // channelId is cleared since the Discord channel will be deleted.
    await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: {
        status: "ARCHIVED",
        channelId: null,
        closedAt: existing.status === "CLOSED" ? undefined : new Date(),
        archiveHtml,
        archiveUrl,
      },
    });

    res.json({ ok: true, archived: true });
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/transcript (v1.5) ────────────────────────
// Regenerate HTML transcript on demand. Returns archive URL if available.

router.post("/ticket/:ticketId/transcript", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      include: { messages: { orderBy: { createdAt: "asc" } }, creator: true, assignee: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const html = generateHtmlTranscript(ticket);
    const token = await ensureArchiveToken(ticket.id, ticket.archiveToken);
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { archiveHtml: html, archiveUrl: tokenizedArchiveUrl(ticket.id, token) },
    });

    const url = `${process.env.FRONTEND_URL || ""}${tokenizedArchiveUrl(ticket.id, token)}`;
    res.json({ ok: true, url });
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/feedback (v1.5) ──────────────────────────

router.post("/ticket/:ticketId/feedback", async (req, res, next) => {
  const { rating, comment, userId } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be an integer between 1 and 5" });
  }
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { creatorId: true, serverId: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (userId && ticket.creatorId !== userId) {
      return res.status(403).json({ error: "Only the ticket creator can leave feedback" });
    }

    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: {
        feedbackRating: rating,
        feedbackComment: comment || null,
        feedbackAt: new Date(),
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/rename (v1.5) ────────────────────────────

router.post("/ticket/:ticketId/rename", async (req, res, next) => {
  const { newName, actorId } = req.body;
  if (!newName) return res.status(400).json({ error: "newName required" });
  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { channelId: true, serverId: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });

    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { renamedFrom: newName, lastActivityAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        serverId: existing.serverId,
        action: "TICKET_RENAMED",
        targetId: req.params.ticketId,
        metadata: { newName },
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── GET /api/bot/panel/:panelId (v1.5 — augmented with v1.5 fields) ─────────
// Already exists below, but the new one returns full config including v1.5 fields

// ─── POST /api/bot/ticket/:ticketId/escalate (v1.6) ──────────────────────────
// Move a ticket to a different panel. Keeps all history.

router.post("/ticket/:ticketId/escalate", async (req, res, next) => {
  const { newPanelId, actorId, reason } = req.body;
  if (!newPanelId) return res.status(400).json({ error: "newPanelId required" });

  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { serverId: true, panelId: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const newPanel = await prisma.panel.findUnique({
      where: { id: newPanelId },
      select: { serverId: true },
    });
    if (!newPanel) return res.status(404).json({ error: "Target panel not found" });
    if (newPanel.serverId !== ticket.serverId) {
      return res.status(400).json({ error: "Cannot escalate to a panel in a different server" });
    }

    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { panelId: newPanelId, lastActivityAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorId: actorId || null,
        serverId: ticket.serverId,
        action: "TICKET_ESCALATED",
        targetId: req.params.ticketId,
        metadata: { fromPanelId: ticket.panelId, toPanelId: newPanelId, reason },
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── GET /api/bot/guild/:guildId/panels (v1.6) ───────────────────────────────
// Simple panel list for autocomplete in /new and /escalate commands.

router.get("/guild/:guildId/panels", async (req, res, next) => {
  try {
    const panels = await prisma.panel.findMany({
      where: { serverId: req.params.guildId },
      select: {
        id: true, name: true,
        categoryOpenId: true, categoryId: true,
        supportRoleIds: true,
        counterPadding: true,
        channelNamePrefix: true,
      },
      orderBy: { name: "asc" },
    });
    res.json(panels);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/application/submit ────────────────────────────────────────

router.post("/application/submit", async (req, res, next) => {
  const { serverId, formId, userId, answers, reviewMessageId, reviewChannelId } = req.body;

  try {
    const application = await prisma.application.create({
      data: { serverId, formId, userId, answers, reviewMessageId, reviewChannelId },
    });
    res.json(application);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/user/:userId/blacklisted ────────────────────────────────────

router.get("/user/:userId/blacklisted", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { isBlacklisted: true },
    });
    res.json({ blacklisted: user?.isBlacklisted || false });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/user/:userId/open-tickets/:guildId (v1.5) ──────────────────
// Used by guildMemberRemove event to find tickets that may need auto-close

router.get("/user/:userId/open-tickets/:guildId", async (req, res, next) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        serverId: req.params.guildId,
        creatorId: req.params.userId,
        status: { in: ["OPEN", "CLAIMED"] },
      },
      include: { panel: { select: { autoCloseOnLeave: true, counterPadding: true } } },
    });
    res.json(tickets);
  } catch (err) { next(err); }
});

// ─── GET /api/bot/panel/:panelId ─────────────────────────────────────────────

router.get("/panel/:panelId", async (req, res, next) => {
  try {
    const panel = await prisma.panel.findUnique({
      where: { id: req.params.panelId },
      include: {
        buttons: { include: { form: { include: { questions: { orderBy: { order: "asc" } } } } } },
        server: { select: { isPremium: true } },
      },
    });
    if (!panel) return res.status(404).json({ error: "Panel not found" });
    res.json(panel);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/bot/panel/:panelId/spawned ───────────────────────────────────
// Bot reports back the Discord message/channel IDs after spawning a panel

router.patch("/panel/:panelId/spawned", async (req, res, next) => {
  const { channelId, messageId } = req.body;

  try {
    const panel = await prisma.panel.update({
      where: { id: req.params.panelId },
      data: { channelId, messageId },
    });
    res.json(panel);
  } catch (err) {
    next(err);
  }
});


// ─── PATCH /api/bot/server/:serverId ─────────────────────────────────────────
// Bot updates white-label settings (premium only).
// Only allows safe fields: customBotName, customBotAvatar (NOT the token — tokens
// must be set via the web dashboard where users can review what they're submitting).

router.patch("/server/:serverId", async (req, res, next) => {
  const { customBotName, customBotAvatar } = req.body;

  if (!customBotName && !customBotAvatar) {
    return res.status(400).json({ error: "Provide customBotName and/or customBotAvatar" });
  }

  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { isPremium: true, trialEndsAt: true },
    });

    if (!server) return res.status(404).json({ error: "Server not found" });
    const isEffectivePremium = !!server.isPremium || (server.trialEndsAt && server.trialEndsAt > new Date());
    if (!isEffectivePremium) {
      return res.status(403).json({ error: "White-label settings require Premium" });
    }

    const updated = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        ...(customBotName !== undefined && { customBotName }),
        ...(customBotAvatar !== undefined && { customBotAvatar }),
      },
      select: { id: true, customBotName: true, customBotAvatar: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/bot/application/:id ──────────────────────────────────────────
// Bot updates reviewMessageId + reviewChannelId after posting the review embed

router.patch("/application/:id", async (req, res, next) => {
  const { reviewMessageId, reviewChannelId } = req.body;
  if (!reviewMessageId || !reviewChannelId) {
    return res.status(400).json({ error: "reviewMessageId and reviewChannelId required" });
  }
  try {
    const application = await prisma.application.update({
      where: { id: req.params.id },
      data: { reviewMessageId, reviewChannelId },
    });
    res.json(application);
  } catch (err) {
    next(err);
  }
});


// ─── GET /api/bot/servers/with-custom-tokens ─────────────────────────────────
// Returns all Premium servers that have a custom bot token configured.
// Used by ClientManager to boot white-label clients on startup.

router.get("/servers/with-custom-tokens", async (req, res, next) => {
  try {
    // White-label ботове бутват само сървъри, чийто ефективен tier носи
    // white-label: собствен whitelabel/agency план, активен agency seat, или
    // legacy grandfather (isPremium без plan → whitelabel fallback). Trial дава
    // само Premium → не бутва бранд бот (/token така или иначе би върнал null).
    const servers = await prisma.server.findMany({
      where: {
        customBotToken: { not: null },
        OR: [
          { plan: { in: ["whitelabel", "agency5", "agency10"] } },
          { agency: { is: { active: true } } },
          { AND: [{ isPremium: true }, { plan: "free" }] },
        ],
      },
      select: { id: true, name: true },
    });
    res.json(servers);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/application/:appId/review ─────────────────────────────────
// Called by the bot when a staff member clicks Approve/Deny button
// in Discord. Mirrors the logic of /api/applications/:serverId/:appId/review
// but authenticated via bot secret instead of user session.

router.post("/application/:appId/review", async (req, res, next) => {
  const { action, note, reviewerId, reviewerTag, serverId } = req.body;

  if (!["approve", "deny"].includes(action)) {
    return res.status(400).json({ error: "action must be approve or deny" });
  }

  try {
    const application = await prisma.application.findFirst({
      where: { id: req.params.appId, ...(serverId && { serverId }) },
      include: {
        form: { include: { questions: { orderBy: { order: "asc" } } } },
        user: true,
      },
    });

    if (!application) return res.status(404).json({ error: "Application not found" });
    if (application.status !== "PENDING") {
      return res.status(400).json({ error: "Application already reviewed" });
    }

    const statusMap = { approve: "APPROVED", deny: "DENIED" };

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: {
        status: statusMap[action],
        reviewerId: reviewerId || null,
        reviewNote: note || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: reviewerId || null,
        actorTag: reviewerTag || "BOT",
        serverId: application.serverId,
        action: `APPLICATION_${statusMap[action]}`,
        targetId: application.id,
        metadata: { note: note || null, via: "discord_button" },
      },
    });

    // Grant/remove roles + DM the applicant. The Discord-button path previously
    // only changed status, so approvals granted no role and sent no notification —
    // this mirrors the dashboard review path (applications.js APPLICATION_APPLY_OUTCOME).
    const form = application.form;
    const rolesToAdd    = action === "approve" ? (form.acceptRoleIds || []) : (form.denyRoleIds || []);
    const rolesToRemove = action === "approve" ? (form.removeRoleIds || []) : [];
    const customMessage = action === "approve" ? form.acceptMessage : form.denyMessage;
    let dmMessage;
    if (customMessage) {
      dmMessage = customMessage
        .replaceAll("{user}", application.user?.id ? `<@${application.user.id}>` : "")
        .replaceAll("{username}", application.user?.username || "")
        .replaceAll("{server}", application.serverId)
        .replaceAll("{note}", note || "");
    } else {
      const statusEmoji = action === "approve" ? "✅" : "❌";
      const statusWord  = action === "approve" ? "approved" : "denied";
      dmMessage = `${statusEmoji} Your application to **${form.name}** has been ${statusWord}.`;
      if (note) dmMessage += `\n\n**Reason from staff:**\n> ${note.split("\n").join("\n> ")}`;
    }
    import("../services/botNotifier.js").then(({ notifyBot }) => {
      notifyBot("APPLICATION_APPLY_OUTCOME", {
        serverId: application.serverId,
        userId: application.userId,
        rolesToAdd,
        rolesToRemove,
        dmMessage,
        action,
      }).catch((e) => console.warn("[bot review] apply-outcome failed:", e.message));
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/application/:appId ─────────────────────────────────────────
// Bot fetches application details
router.get("/application/:appId", async (req, res, next) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.appId },
      include: {
        form: { include: { questions: { orderBy: { order: "asc" } } } },
        user: true,
      },
    });
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json(application);
  } catch (err) {
    next(err);
  }
});

export default router;
