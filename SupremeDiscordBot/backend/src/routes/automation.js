// backend/src/routes/automation.js
// Admin (session-authed) CRUD for polls, giveaways, sticky, scheduled messages.
// The bot has its own x-bot-secret routes in bot_v18.js for interaction-triggered ops;
// this file is for dashboard UI.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { notifyBot } from "../services/botNotifier.js";
import { requirePremium, getServerTier, BASE_LIMITS, PREMIUM_LIMITS } from "../lib/premium.js";

const router = Router();
router.use(requireAuth, loadUser);

// ══════════════════════════════ POLLS ══════════════════════════════

router.get("/:serverId/polls", requireServerAdmin, async (req, res, next) => {
  try {
    const polls = await prisma.poll.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { votes: true } } },
      take: 100,
    });
    res.json(polls.map((p) => ({ ...p, totalVotes: p._count.votes })));
  } catch (err) { next(err); }
});

router.post("/:serverId/polls/:id/close", requireServerAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.poll.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Poll not found" });
    const poll = await prisma.poll.update({
      where: { id: req.params.id },
      data: { closedAt: new Date() },
    });
    // Tell bot to update the Discord message
    if (poll.messageId) {
      notifyBot("POLL_UPDATE", { pollId: poll.id, channelId: poll.channelId, messageId: poll.messageId }).catch(() => {});
    }
    res.json(poll);
  } catch (err) { next(err); }
});

router.delete("/:serverId/polls/:id", requireServerAdmin, async (req, res, next) => {
  try {
    const { count } = await prisma.poll.deleteMany({
      where: { id: req.params.id, serverId: req.params.serverId },
    });
    if (!count) return res.status(404).json({ error: "Poll not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ══════════════════════════════ GIVEAWAYS ══════════════════════════════

router.get("/:serverId/giveaways", requireServerAdmin, async (req, res, next) => {
  try {
    const list = await prisma.giveaway.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { entries: true } } },
      take: 100,
    });
    res.json(list.map((g) => ({ ...g, entryCount: g._count.entries })));
  } catch (err) { next(err); }
});

router.post("/:serverId/giveaways/:id/end", requireServerAdmin, async (req, res, next) => {
  try {
    const g = await prisma.giveaway.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      include: { entries: true },
    });
    if (!g) return res.status(404).json({ error: "Giveaway not found" });
    if (g.endedAt) return res.status(400).json({ error: "Already ended" });

    const shuffled = [...g.entries].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, g.winnerCount).map((e) => e.userId);

    const updated = await prisma.giveaway.update({
      where: { id: g.id },
      data: { endedAt: new Date(), winnerIds: winners },
    });

    notifyBot("GIVEAWAY_ENDED", {
      giveawayId: g.id, channelId: g.channelId, messageId: g.messageId,
      prize: g.prize, winners,
    }).catch(() => {});

    res.json({ ...updated, winners });
  } catch (err) { next(err); }
});

router.post("/:serverId/giveaways/:id/reroll", requireServerAdmin, async (req, res, next) => {
  try {
    const g = await prisma.giveaway.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      include: { entries: true },
    });
    if (!g) return res.status(404).json({ error: "Giveaway not found" });

    const eligible = g.entries.filter((e) => !g.winnerIds.includes(e.userId));
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, g.winnerCount).map((e) => e.userId);

    const updated = await prisma.giveaway.update({
      where: { id: g.id },
      data: { winnerIds: winners },
    });

    notifyBot("GIVEAWAY_ENDED", {
      giveawayId: g.id, channelId: g.channelId, messageId: g.messageId,
      prize: g.prize, winners, reroll: true,
    }).catch(() => {});

    res.json({ ...updated, winners });
  } catch (err) { next(err); }
});

router.delete("/:serverId/giveaways/:id", requireServerAdmin, async (req, res, next) => {
  try {
    const { count } = await prisma.giveaway.deleteMany({
      where: { id: req.params.id, serverId: req.params.serverId },
    });
    if (!count) return res.status(404).json({ error: "Giveaway not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ══════════════════════════════ STICKY MESSAGES ══════════════════════════════

router.get("/:serverId/stickies", requireServerAdmin, async (req, res, next) => {
  try {
    const list = await prisma.stickyMessage.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { updatedAt: "desc" },
    });
    res.json(list);
  } catch (err) { next(err); }
});

router.post("/:serverId/stickies", requireServerAdmin, requirePremium("automation.sticky"), async (req, res, next) => {
  const { channelId, content, embedTitle, embedColor } = req.body;
  if (!channelId || !content) return res.status(400).json({ error: "channelId and content required" });
  try {
    // Enforce count limit
    const { limits } = await getServerTier(req.params.serverId);
    const existing = await prisma.stickyMessage.count({ where: { serverId: req.params.serverId } });
    if (existing >= limits.stickiesPerServer) {
      return res.status(403).json({
        error: `Sticky limit reached (${limits.stickiesPerServer}). Upgrade Premium for more.`,
        code: "LIMIT_REACHED",
      });
    }
    const sticky = await prisma.stickyMessage.upsert({
      where: { channelId },
      create: {
        serverId: req.params.serverId,
        channelId, content, embedTitle, embedColor: embedColor || "#00e5ff",
        createdBy: req.user.id,
      },
      update: {
        content, embedTitle, embedColor: embedColor || "#00e5ff",
        enabled: true, currentMessageId: null,
      },
    });
    res.json(sticky);
  } catch (err) { next(err); }
});

router.delete("/:serverId/stickies/:channelId", requireServerAdmin, async (req, res, next) => {
  try {
    await prisma.stickyMessage.deleteMany({
      where: { channelId: req.params.channelId, serverId: req.params.serverId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ══════════════════════════════ SCHEDULED MESSAGES ══════════════════════════════

router.get("/:serverId/scheduled", requireServerAdmin, async (req, res, next) => {
  try {
    const list = await prisma.scheduledMessage.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { sendAt: "asc" },
      take: 100,
    });
    res.json(list);
  } catch (err) { next(err); }
});

router.post("/:serverId/scheduled", requireServerAdmin, requirePremium("automation.scheduled"), async (req, res, next) => {
  const { channelId, content, embedTitle, embedDescription, embedColor, sendAt, recurrence } = req.body;
  if (!channelId || !content || !sendAt) return res.status(400).json({ error: "channelId, content, sendAt required" });
  try {
    const { limits } = await getServerTier(req.params.serverId);
    if (recurrence && !limits.recurringScheduled) {
      return res.status(403).json({
        error: "Recurring scheduled messages require Premium.",
        code: "PREMIUM_REQUIRED",
        feature: "automation.recurring",
      });
    }
    const existing = await prisma.scheduledMessage.count({
      where: { serverId: req.params.serverId, sentAt: null },
    });
    if (existing >= limits.scheduledPerServer) {
      return res.status(403).json({
        error: `Scheduled message limit reached (${limits.scheduledPerServer}).`,
        code: "LIMIT_REACHED",
      });
    }
    const m = await prisma.scheduledMessage.create({
      data: {
        serverId: req.params.serverId,
        channelId, content,
        embedTitle: embedTitle || null,
        embedDescription: embedDescription || null,
        embedColor: embedColor || "#00e5ff",
        sendAt: new Date(sendAt),
        recurrence: recurrence || null,
        createdBy: req.user.id,
      },
    });
    res.status(201).json(m);
  } catch (err) { next(err); }
});

router.delete("/:serverId/scheduled/:id", requireServerAdmin, async (req, res, next) => {
  try {
    const { count } = await prisma.scheduledMessage.deleteMany({
      where: { id: req.params.id, serverId: req.params.serverId },
    });
    if (!count) return res.status(404).json({ error: "Scheduled message not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ══════════════════════════════ COMMANDS CATALOG (read-only) ══════════════════════════════
// Exposes the same catalog the /help command uses, so the dashboard's
// Commands page stays in sync with the bot automatically.

router.get("/commands-catalog", async (req, res, next) => {
  try {
    const { COMMAND_CATALOG } = await import("../data/commandsCatalog.js");
    res.json(COMMAND_CATALOG);
  } catch (err) { next(err); }
});

// ══════════════════════════════ PREMIUM FEATURES CATALOG (v1.9) ══════════════════════════════
// Exposes the feature matrix + limits so the dashboard can render
// Premium badges, disable inputs, and show proper upgrade CTAs.

router.get("/premium-catalog", async (req, res, next) => {
  try {
    const { PREMIUM_FEATURES, BASE_LIMITS, PREMIUM_LIMITS } = await import("../lib/premium.js");
    res.json({ features: PREMIUM_FEATURES, baseLimits: BASE_LIMITS, premiumLimits: PREMIUM_LIMITS });
  } catch (err) { next(err); }
});

export default router;
