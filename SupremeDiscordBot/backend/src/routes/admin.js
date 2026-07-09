// backend/src/routes/admin.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireSuperUser, requireMainOwner } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, loadUser, requireSuperUser);

// ─── GET /api/admin/analytics ─────────────────────────────────────────────────

router.get("/analytics", async (req, res, next) => {
  try {
    const [
      totalServers,
      premiumServers,
      totalTickets,
      totalUsers,
      openTickets,
      totalForms,
      totalApplications,
      totalPanels,
      recentTicketsRaw,
    ] = await Promise.all([
      prisma.server.count(),
      prisma.server.count({ where: { isPremium: true } }),
      prisma.ticket.count(),
      prisma.user.count(),
      prisma.ticket.count({ where: { status: "OPEN" } }),
      prisma.form.count(),
      prisma.application.count(),
      prisma.panel.count(),
      // Tickets per day for last 30 days
      // NOTE: column is "createdAt" (double-quoted camelCase), NOT created_at
      // ::int cast avoids BigInt serialization errors
      prisma.$queryRaw`
        SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
        FROM tickets
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ]);

    // JS Date objects don't serialize to proper ISO in raw results reliably across Node.js versions
    const recentTickets = (recentTicketsRaw || []).map((r) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
      count: Number(r.count) || 0,
    }));

    const mrr = await calculateMRR();

    res.json({
      totalServers,
      premiumServers,
      baseServers: totalServers - premiumServers,
      premiumPercentage: totalServers > 0 ? Number(((premiumServers / totalServers) * 100).toFixed(1)) : 0,
      totalTickets,
      openTickets,
      totalUsers,
      totalForms,
      totalApplications,
      totalPanels,
      mrr,
      recentTickets,
    });
  } catch (err) {
    console.error("[analytics] error:", err);
    next(err);
  }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

router.get("/users", async (req, res, next) => {
  const { query, role, page = 1, limit = 50 } = req.query;

  try {
    const where = {
      ...(query && {
        OR: [
          { username: { contains: query, mode: "insensitive" } },
          { id: { contains: query } },
        ],
      }),
      ...(role && { globalRole: role }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          _count: { select: { tickets: true, applications: true, serverMembers: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/users/:userId ─────────────────────────────────────────────

router.get("/users/:userId", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: {
        serverMembers: {
          include: { server: { select: { id: true, name: true, isPremium: true } } },
        },
        tickets: { take: 5, orderBy: { createdAt: "desc" } },
        sessions: { select: { createdAt: true, expiresAt: true }, take: 5 },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    // Get stripe payments for servers this user owns
    const ownedServerIds = user.serverMembers
      .filter((m) => m.serverRole === "ADMIN")
      .map((m) => m.serverId);

    const payments = await prisma.paymentLog.findMany({
      where: { serverId: { in: ownedServerIds } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    res.json({ ...user, payments });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/users/:userId/role ──────────────────────────────────────

router.patch("/users/:userId/role", requireMainOwner, async (req, res, next) => {
  const { role } = req.body;
  const validRoles = ["SUPER_USER", "SUPPORT_STAFF", "USER"];

  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
  }

  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
      action: "role_change",
      newRole: role,
      targetId: req.params.userId,
    });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) return res.status(404).json({ error: "User not found" });

    // Cannot modify Main Owner
    if (target.globalRole === "MAIN_OWNER") {
      return res.status(403).json({ error: "Cannot modify the Main Owner" });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { globalRole: role },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "USER_ROLE_CHANGED",
        targetId: req.params.userId,
        metadata: { oldRole: target.globalRole, newRole: role },
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/users/:userId/blacklist ─────────────────────────────────

router.patch("/users/:userId/blacklist", requireMainOwner, async (req, res, next) => {
  const { blacklisted } = req.body;

  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
      action: blacklisted ? "blacklist" : "unblacklist",
      targetId: req.params.userId,
    });
  }

  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) return res.status(404).json({ error: "User not found" });

    if (target.globalRole === "MAIN_OWNER") {
      return res.status(403).json({ error: "Cannot blacklist the Main Owner" });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { isBlacklisted: !!blacklisted },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: blacklisted ? "USER_BLACKLISTED" : "USER_UNBLACKLISTED",
        targetId: req.params.userId,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/servers ───────────────────────────────────────────────────

router.get("/servers", async (req, res, next) => {
  const { page = 1, limit = 50, premium } = req.query;

  try {
    const where = {
      ...(premium !== undefined && { isPremium: premium === "true" }),
    };

    const [servers, total] = await Promise.all([
      prisma.server.findMany({
        where,
        include: { _count: { select: { tickets: true, panels: true, forms: true, members: true } } },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.server.count({ where }),
    ]);

    res.json({ servers, total });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/payments ──────────────────────────────────────────────────

router.get("/payments", async (req, res, next) => {
  const { page = 1, limit = 50, status } = req.query;

  try {
    const where = { ...(status && { status }) };

    const [payments, total, mrr] = await Promise.all([
      prisma.paymentLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.paymentLog.count({ where }),
      calculateMRR(),
    ]);

    res.json({ payments, total, mrr });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/audit-logs ────────────────────────────────────────────────

router.get("/audit-logs", async (req, res, next) => {
  const { page = 1, limit = 100, action, actorId } = req.query;

  try {
    const where = {
      ...(action && { action: { contains: action, mode: "insensitive" } }),
      ...(actorId && { actorId }),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, username: true, avatar: true } } },
        // actorTag is on the log itself (for SYSTEM entries where actor is null)
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total });
  } catch (err) {
    next(err);
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function calculateMRR() {
  const result = await prisma.paymentLog.aggregate({
    _sum: { amount: true },
    where: {
      status: "paid",
      createdAt: {
        gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      },
    },
  });
  return (result._sum.amount || 0) / 100; // Convert cents to dollars
}

// ─── PATCH /api/admin/servers/:serverId/premium ──────────────────────────────
// Manually grant or revoke Premium on a server. Bypasses Stripe entirely.
// Used by Main Owner / Super User to give Premium as a gift, for trials,
// for partners, or for testing.
// When revoking, if the server had an active Stripe subscription, we DON'T
// cancel it — we just flip the flag. To cancel Stripe subscriptions, use the
// Stripe Dashboard directly.

router.patch("/servers/:serverId/premium", requireSuperUser, async (req, res, next) => {
  const { enabled, reason } = req.body;

  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be true or false" });
  }

  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });

    const updated = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        isPremium: enabled,
        ...(enabled && {
          premiumSince: server.premiumSince || new Date(),
          stripeStatus: server.stripeStatus || "manual",
          archiveRetentionDays: null, // forever
        }),
        ...(!enabled && {
          archiveRetentionDays: 30,
        }),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: enabled ? "PREMIUM_GRANTED_MANUAL" : "PREMIUM_REVOKED_MANUAL",
        targetId: req.params.serverId,
        metadata: { reason: reason || null, grantedBy: req.user.username },
      },
    });

    // Log as a paymentLog entry marked manual for the financial ledger
    if (enabled) {
      await prisma.paymentLog.create({
        data: {
          serverId: req.params.serverId,
          amount: 0,
          currency: "usd",
          status: "manual_grant",
          description: `Manually granted by ${req.user.username}${reason ? ` — ${reason}` : ""}`,
        },
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/servers/:serverId ─────────────────────────────────────────
// Full server detail with related counts — admin view of any server

router.get("/servers/:serverId", async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      include: {
        _count: { select: { tickets: true, panels: true, forms: true, applications: true, members: true, paymentLogs: true } },
        paymentLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });
    // Never leak encrypted bot token
    const { customBotToken: _t, ...safe } = server;
    res.json(safe);
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/servers/:serverId ───────────────────────────────────────
// Admin edit of server settings (log channels, retention, custom bot name/avatar)

router.patch("/servers/:serverId", async (req, res, next) => {
  const {
    name, logChannelId, archiveChannelId, archiveRetentionDays,
    customBotName, customBotAvatar,
    aiRepliesEnabled, aiRepliesPrompt,
    roundRobinEnabled, roundRobinRoleId,
  } = req.body;

  try {
    const updated = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        ...(name !== undefined && { name }),
        ...(logChannelId !== undefined && { logChannelId: logChannelId || null }),
        ...(archiveChannelId !== undefined && { archiveChannelId: archiveChannelId || null }),
        ...(archiveRetentionDays !== undefined && { archiveRetentionDays }),
        ...(customBotName !== undefined && { customBotName: customBotName || null }),
        ...(customBotAvatar !== undefined && { customBotAvatar: customBotAvatar || null }),
        ...(aiRepliesEnabled !== undefined && { aiRepliesEnabled: Boolean(aiRepliesEnabled) }),
        ...(aiRepliesPrompt !== undefined && { aiRepliesPrompt: aiRepliesPrompt || null }),
        ...(roundRobinEnabled !== undefined && { roundRobinEnabled: Boolean(roundRobinEnabled) }),
        ...(roundRobinRoleId !== undefined && { roundRobinRoleId: roundRobinRoleId || null }),
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "SERVER_EDITED_ADMIN",
        targetId: req.params.serverId,
        metadata: { changedBy: req.user.username, fields: Object.keys(req.body) },
      },
    });

    const { customBotToken: _t, ...safe } = updated;
    res.json(safe);
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/servers/:serverId ──────────────────────────────────────
// Hard-delete a server from the platform DB (also cascades tickets, panels, forms, etc.
// due to Prisma onDelete: CASCADE). Requires ?confirm=true.
// The bot will still be in the Discord guild — use the bot to leave manually if needed.

router.delete("/servers/:serverId", requireMainOwner, async (req, res, next) => {
  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
      action: "server_delete",
      targetId: req.params.serverId,
    });
  }

  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // Log BEFORE delete — cascade removes audit logs linked to the server
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: null, // set to null so the log persists after cascade
        action: "SERVER_DELETED",
        targetId: req.params.serverId,
        metadata: {
          serverName: server.name,
          wasPremium: server.isPremium,
          deletedBy: req.user.username,
        },
      },
    });

    await prisma.server.delete({ where: { id: req.params.serverId } });

    res.json({ ok: true, deleted: req.params.serverId });
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/users/:userId ──────────────────────────────────────────
// Hard-delete a user account. Requires MAIN_OWNER + ?confirm=true.
// Tickets/applications created by this user are NOT deleted (onDelete: RESTRICT) —
// they remain anonymized with the old userId referenced.

router.delete("/users/:userId", requireMainOwner, async (req, res, next) => {
  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
      action: "user_delete",
      targetId: req.params.userId,
    });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.globalRole === "MAIN_OWNER") {
      return res.status(403).json({ error: "Cannot delete the Main Owner" });
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        actorTag: req.user.username,
        action: "USER_DELETED",
        targetId: req.params.userId,
        metadata: { username: user.username, deletedBy: req.user.username },
      },
    });

    // Check for created tickets/applications — if any, refuse (RESTRICT would fail anyway)
    const [ticketCount, appCount] = await Promise.all([
      prisma.ticket.count({ where: { creatorId: req.params.userId } }),
      prisma.application.count({ where: { userId: req.params.userId } }),
    ]);

    if (ticketCount > 0 || appCount > 0) {
      return res.status(400).json({
        error: "User has associated tickets/applications and cannot be deleted",
        hint: "Use blacklist instead — it's less destructive and preserves history",
        ticketCount,
        applicationCount: appCount,
      });
    }

    await prisma.user.delete({ where: { id: req.params.userId } });
    res.json({ ok: true, deleted: req.params.userId });
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/payments/:paymentId ────────────────────────────────────
// Remove an erroneous manual payment log entry. Stripe-logged entries should
// NOT be deleted — they're part of the financial audit trail.

router.delete("/payments/:paymentId", requireMainOwner, async (req, res, next) => {
  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm",
    });
  }
  try {
    const p = await prisma.paymentLog.findUnique({ where: { id: req.params.paymentId } });
    if (!p) return res.status(404).json({ error: "Payment not found" });
    if (p.stripeInvoiceId) {
      return res.status(400).json({
        error: "Cannot delete Stripe-linked payment logs (financial audit trail)",
        hint: "Only manual grant entries may be removed",
      });
    }
    await prisma.paymentLog.delete({ where: { id: req.params.paymentId } });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "PAYMENT_LOG_DELETED",
        targetId: req.params.paymentId,
        metadata: { amount: p.amount, status: p.status, deletedBy: req.user.username },
      },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/audit-logs/purge ─────────────────────────────────────────
// Bulk-purge audit logs older than N days. MAIN_OWNER only.

router.post("/audit-logs/purge", requireMainOwner, async (req, res, next) => {
  const { olderThanDays } = req.body;
  if (!Number.isInteger(olderThanDays) || olderThanDays < 30) {
    return res.status(400).json({
      error: "olderThanDays must be an integer >= 30",
      hint: "Audit logs younger than 30 days cannot be purged (legal retention)",
    });
  }
  try {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        // Never purge destructive actions — they must be preserved forever
        action: { notIn: [
          "USER_BLACKLISTED", "USER_UNBLACKLISTED", "USER_DELETED",
          "USER_ROLE_CHANGED", "SERVER_DELETED",
          "PREMIUM_GRANTED_MANUAL", "PREMIUM_REVOKED_MANUAL",
        ]},
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: "AUDIT_LOG_PURGE",
        metadata: { deleted: result.count, olderThanDays, purgedBy: req.user.username },
      },
    });
    res.json({ ok: true, deleted: result.count });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/servers/:serverId/reset ──────────────────────────────────
// Wipe all panels/forms/tickets/applications for a server but keep the server record.
// Useful for "start fresh" without deleting the server itself or Stripe subscription.

router.post("/servers/:serverId/reset", requireMainOwner, async (req, res, next) => {
  if (req.query.confirm !== "true") {
    return res.status(400).json({
      error: "Destructive action requires confirmation",
      hint: "Add ?confirm=true to confirm — this deletes ALL panels, forms, tickets, applications for this server",
    });
  }

  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });

    const [tickets, applications, panels, forms] = await prisma.$transaction([
      prisma.ticket.deleteMany({ where: { serverId: req.params.serverId } }),
      prisma.application.deleteMany({ where: { serverId: req.params.serverId } }),
      prisma.panel.deleteMany({ where: { serverId: req.params.serverId } }),
      prisma.form.deleteMany({ where: { serverId: req.params.serverId } }),
    ]);

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "SERVER_RESET",
        targetId: req.params.serverId,
        metadata: {
          tickets: tickets.count,
          applications: applications.count,
          panels: panels.count,
          forms: forms.count,
          resetBy: req.user.username,
        },
      },
    });

    res.json({
      ok: true,
      deleted: {
        tickets: tickets.count,
        applications: applications.count,
        panels: panels.count,
        forms: forms.count,
      },
    });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/servers/:serverId/audit-message ──────────────────────────
// Post a system message to a specific server channel (admin broadcast).
// Sends via the bot internal API.

router.post("/servers/:serverId/broadcast", async (req, res, next) => {
  const { channelId, title, message } = req.body;
  if (!channelId || !message) return res.status(400).json({ error: "channelId and message required" });

  try {
    // Dynamically import to avoid circular dep
    const { notifyBot } = await import("../services/botNotifier.js");
    const result = await notifyBot("ADMIN_BROADCAST", {
      serverId: req.params.serverId,
      channelId,
      title: title || "Platform Notice",
      message,
      senderTag: req.user.username,
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "ADMIN_BROADCAST",
        targetId: channelId,
        metadata: { title, message: message.slice(0, 200), sentBy: req.user.username },
      },
    });

    res.json({ ok: true, result });
  } catch (err) { next(err); }
});

export default router;
