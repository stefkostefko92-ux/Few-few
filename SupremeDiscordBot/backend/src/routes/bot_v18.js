// backend/src/routes/bot_v18.js
// v1.8 bot-facing endpoints for polls, giveaways, sticky messages, scheduled messages.
// All protected by x-bot-secret.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { fireWebhooks } from "../services/webhooks.js";
import { notifyBot } from "../services/botNotifier.js";
import { pickRandom } from "../lib/shuffle.js";
import { findBestMatch } from "../lib/kbMatch.js";
import { getServerTier, planHasFeature } from "../lib/premium.js";

const router = Router();
router.use(requireBotSecret);

// ══════════════════════════════ POLLS ══════════════════════════════

router.post("/poll/create", async (req, res, next) => {
  const { serverId, creatorId, channelId, question, options, multiChoice, closesAt } = req.body;
  if (!serverId || !channelId || !question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  try {
    const poll = await prisma.poll.create({
      data: {
        serverId, creatorId, channelId, question,
        options: options.slice(0, 9),
        multiChoice: !!multiChoice,
        closesAt: closesAt ? new Date(closesAt) : null,
      },
    });
    res.status(201).json(poll);
  } catch (err) { next(err); }
});

router.patch("/poll/:id/spawned", async (req, res, next) => {
  try {
    const poll = await prisma.poll.update({
      where: { id: req.params.id },
      data: { messageId: req.body.messageId },
    });
    res.json(poll);
  } catch (err) { next(err); }
});

router.get("/poll/:id", async (req, res, next) => {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.id },
      include: { votes: true },
    });
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    const counts = poll.options.map((_, i) => poll.votes.filter((v) => v.option === i).length);
    res.json({ ...poll, counts });
  } catch (err) { next(err); }
});

router.post("/poll/:id/vote", async (req, res, next) => {
  const { userId, option } = req.body;
  try {
    const poll = await prisma.poll.findUnique({ where: { id: req.params.id } });
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    if (poll.closedAt) return res.status(400).json({ error: "Poll is closed" });
    if (option < 0 || option >= poll.options.length) return res.status(400).json({ error: "Invalid option" });

    // Single-choice: clicking the SAME option again removes the vote (toggle off);
    // clicking a different option switches. Previously re-clicking just re-voted.
    if (!poll.multiChoice) {
      const prev = await prisma.pollVote.findFirst({ where: { pollId: poll.id, userId } });
      if (prev && prev.option === option) {
        await prisma.pollVote.delete({ where: { id: prev.id } });
        const counts = await recountPoll(poll.id, poll.options.length);
        return res.json({ toggled: "off", counts });
      }
      await prisma.pollVote.deleteMany({ where: { pollId: poll.id, userId } });
    } else {
      // Multi-choice: toggle — if already voted for this option, remove
      const existing = await prisma.pollVote.findUnique({
        where: { pollId_userId_option: { pollId: poll.id, userId, option } },
      }).catch(() => null);
      if (existing) {
        await prisma.pollVote.delete({ where: { id: existing.id } });
        const counts = await recountPoll(poll.id, poll.options.length);
        return res.json({ toggled: "off", counts });
      }
    }

    await prisma.pollVote.create({ data: { pollId: poll.id, userId, option } });
    const counts = await recountPoll(poll.id, poll.options.length);
    res.json({ toggled: "on", counts });
  } catch (err) { next(err); }
});

async function recountPoll(pollId, optionCount) {
  const votes = await prisma.pollVote.findMany({ where: { pollId } });
  return Array.from({ length: optionCount }, (_, i) => votes.filter((v) => v.option === i).length);
}

// GET /api/bot/guild/:guildId/applications/pending — за /form review autocomplete
// (label = кандидат + форма, value = пълния cuid). Само PENDING — review-ва се
// само каквото още не е решено.
router.get("/guild/:guildId/applications/pending", async (req, res, next) => {
  try {
    const apps = await prisma.application.findMany({
      where: { serverId: req.params.guildId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { form: { select: { name: true } }, user: { select: { username: true } } },
    });
    res.json(apps.map((a) => ({ id: a.id, formName: a.form?.name, username: a.user?.username })));
  } catch (err) { next(err); }
});

// ══════════════════════════════ GIVEAWAYS ══════════════════════════════

// GET /api/bot/guild/:guildId/giveaways — за /giveaway end|reroll autocomplete
// (label = резюме, value = пълния cuid). Скоупнато по serverId — bot-secret
// пази endpoint-а, но пак не искаме кръстосан достъп между сървъри.
router.get("/guild/:guildId/giveaways", async (req, res, next) => {
  try {
    const giveaways = await prisma.giveaway.findMany({
      where: { serverId: req.params.guildId },
      orderBy: { endsAt: "desc" },
      take: 50,
      select: { id: true, prize: true, endsAt: true, endedAt: true },
    });
    res.json(giveaways);
  } catch (err) { next(err); }
});

router.post("/giveaway/create", async (req, res, next) => {
  const { serverId, creatorId, channelId, prize, description, winnerCount, endsAt, requiredRoleIds } = req.body;
  if (!serverId || !channelId || !prize || !endsAt) return res.status(400).json({ error: "Invalid payload" });
  try {
    const g = await prisma.giveaway.create({
      data: {
        serverId, creatorId, channelId, prize,
        description: description || null,
        winnerCount: winnerCount || 1,
        endsAt: new Date(endsAt),
        requiredRoleIds: requiredRoleIds || [],
      },
    });
    res.status(201).json(g);
  } catch (err) { next(err); }
});

router.patch("/giveaway/:id/spawned", async (req, res, next) => {
  try {
    const g = await prisma.giveaway.update({
      where: { id: req.params.id },
      data: { messageId: req.body.messageId },
    });
    res.json(g);
  } catch (err) { next(err); }
});

router.get("/giveaway/:id", async (req, res, next) => {
  try {
    const g = await prisma.giveaway.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { entries: true } } },
    });
    if (!g) return res.status(404).json({ error: "Giveaway not found" });
    res.json({ ...g, entryCount: g._count.entries });
  } catch (err) { next(err); }
});

router.post("/giveaway/:id/enter", async (req, res, next) => {
  const { userId } = req.body;
  try {
    const g = await prisma.giveaway.findUnique({ where: { id: req.params.id } });
    if (!g) return res.status(404).json({ error: "Giveaway not found" });
    if (g.endedAt) return res.status(400).json({ error: "Giveaway has ended" });

    // Toggle — if already entered, remove
    const existing = await prisma.giveawayEntry.findUnique({
      where: { giveawayId_userId: { giveawayId: g.id, userId } },
    }).catch(() => null);

    if (existing) {
      await prisma.giveawayEntry.delete({ where: { id: existing.id } });
      const entryCount = await prisma.giveawayEntry.count({ where: { giveawayId: g.id } });
      return res.json({ entered: false, entryCount, requiredRoleIds: g.requiredRoleIds });
    }

    await prisma.giveawayEntry.create({ data: { giveawayId: g.id, userId } });
    const entryCount = await prisma.giveawayEntry.count({ where: { giveawayId: g.id } });
    res.json({ entered: true, entryCount, requiredRoleIds: g.requiredRoleIds });
  } catch (err) { next(err); }
});

router.post("/giveaway/:id/end", async (req, res, next) => {
  try {
    const winners = await pickGiveawayWinners(req.params.id);
    res.json({ winners });
  } catch (err) { next(err); }
});

router.post("/giveaway/:id/reroll", async (req, res, next) => {
  try {
    const winners = await pickGiveawayWinners(req.params.id, true);
    res.json({ winners });
  } catch (err) { next(err); }
});

async function pickGiveawayWinners(giveawayId, reroll = false) {
  const g = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    include: { entries: true },
  });
  if (!g) throw new Error("Giveaway not found");
  if (!reroll && g.endedAt) throw new Error("Giveaway already ended");

  // Filter out previous winners on reroll
  const eligible = reroll
    ? g.entries.filter((e) => !g.winnerIds.includes(e.userId))
    : g.entries;

  // Fair winner selection (Fisher–Yates, not a biased sort-shuffle)
  const winners = pickRandom(eligible, g.winnerCount).map((e) => e.userId);

  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: { endedAt: g.endedAt || new Date(), winnerIds: winners },
  });

  // Fire external webhooks (customer integrations)
  fireWebhooks(g.serverId, "GIVEAWAY_ENDED", {
    giveawayId, prize: g.prize, winners, entryCount: g.entries.length,
  }).catch(() => {});

  // Update the public Discord message + announce winners in the channel.
  // Previously missing on the /giveaway end + reroll command path, so manual
  // ends never announced publicly (unlike the scheduler auto-end and dashboard).
  notifyBot("GIVEAWAY_ENDED", {
    giveawayId, channelId: g.channelId, messageId: g.messageId,
    prize: g.prize, winners, reroll,
  }).catch(() => {});

  return winners;
}

// ══════════════════════════════ STICKY MESSAGES ══════════════════════════════

router.post("/sticky", async (req, res, next) => {
  const { serverId, channelId, content, embedTitle, embedColor, createdBy } = req.body;
  if (!serverId || !channelId || !content) return res.status(400).json({ error: "Invalid payload" });
  try {
    // Tier гейт (paritet с dashboard automation.js): sticky е premium. Слаш
    // командата минаваше право към upsert без проверка → free сървър създаваше
    // premium функция. (Одит 07.08.2026)
    const tier = await getServerTier(serverId);
    if (!planHasFeature(tier.plan, "automation.sticky")) {
      return res.status(403).json({ error: "Sticky messages require Premium.", code: "PREMIUM_REQUIRED" });
    }
    const sticky = await prisma.stickyMessage.upsert({
      where: { channelId },
      create: { serverId, channelId, content, embedTitle, embedColor, createdBy },
      update: { content, embedTitle, embedColor, enabled: true, currentMessageId: null },
    });
    res.json(sticky);
  } catch (err) { next(err); }
});

router.delete("/sticky/:channelId", async (req, res, next) => {
  try {
    await prisma.stickyMessage.deleteMany({ where: { channelId: req.params.channelId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get("/sticky/channel/:channelId", async (req, res, next) => {
  try {
    const sticky = await prisma.stickyMessage.findUnique({
      where: { channelId: req.params.channelId },
    });
    // Ботът препубликува sticky по този GET. Ако сървърът вече НЯМА premium
    // (seat detach, отмяна, дунинг), връщаме null → репостът спира. Иначе
    // премахната функция продължаваше да работи от запазения ред. (Одит 07.08.2026)
    if (sticky) {
      const tier = await getServerTier(sticky.serverId);
      if (!planHasFeature(tier.plan, "automation.sticky")) return res.json(null);
    }
    res.json(sticky);
  } catch (err) { next(err); }
});

router.patch("/sticky/channel/:channelId", async (req, res, next) => {
  try {
    const sticky = await prisma.stickyMessage.update({
      where: { channelId: req.params.channelId },
      data: { currentMessageId: req.body.currentMessageId },
    });
    res.json(sticky);
  } catch (err) { next(err); }
});

// ══════════════════════════════ SCHEDULED MESSAGES ══════════════════════════════

router.post("/schedule", async (req, res, next) => {
  const { serverId, channelId, content, embedTitle, embedDescription, embedColor, sendAt, recurrence, createdBy } = req.body;
  if (!serverId || !channelId || !content || !sendAt) return res.status(400).json({ error: "Invalid payload" });
  try {
    // Tier гейт (paritet с dashboard): насрочените са premium, повтарящите се —
    // само при план с `recurringScheduled`. Слаш командата минаваше без проверка.
    const tier = await getServerTier(serverId);
    if (!planHasFeature(tier.plan, "automation.scheduled")) {
      return res.status(403).json({ error: "Scheduled messages require Premium.", code: "PREMIUM_REQUIRED" });
    }
    if (recurrence && !tier.limits.recurringScheduled) {
      return res.status(403).json({ error: "Recurring messages require a higher plan.", code: "PREMIUM_REQUIRED" });
    }
    const m = await prisma.scheduledMessage.create({
      data: {
        serverId, channelId, content,
        embedTitle: embedTitle || null,
        embedDescription: embedDescription || null,
        embedColor: embedColor || "#00e5ff",
        sendAt: new Date(sendAt),
        recurrence: recurrence || null,
        createdBy: createdBy || "bot",
      },
    });
    res.status(201).json(m);
  } catch (err) { next(err); }
});

router.get("/schedule/:serverId", async (req, res, next) => {
  try {
    const list = await prisma.scheduledMessage.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { sendAt: "asc" },
      take: 50,
    });
    res.json(list);
  } catch (err) { next(err); }
});

router.delete("/schedule/:id", async (req, res, next) => {
  try {
    // Cross-tenant IDOR guard: the /admin schedule remove command forwards a
    // free-text id; scope the delete to the caller's guild so a ManageGuild admin
    // of server A cannot delete server B's scheduled message by guessing its cuid.
    const { serverId } = req.body || {};
    if (!serverId) return res.status(400).json({ error: "serverId required" });
    const result = await prisma.scheduledMessage.deleteMany({
      where: { id: req.params.id, serverId },
    });
    if (result.count === 0) return res.status(404).json({ error: "Scheduled message not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ══════════════════════════════ CANNED RESPONSES (/tag) ══════════════════════
// v2.9 — Ticket Tool parity, #1 staff request. Name is unique per server
// (kebab-case, ≤32 chars) and content ≤1500 — the bot validates both before
// calling here, but we re-validate server-side too (never trust the client).
const TAG_NAME_MAX = 32;
const TAG_CONTENT_MAX = 1500;
const TAG_LIMIT_FREE = 50;
// TODO(premium): raise to 200 for Premium servers once tier is easy to check
// here (bot_v18 routes don't currently join Server.plan on every call).
const TAG_LIMIT_PREMIUM = 200;

router.get("/tag/:serverId", async (req, res, next) => {
  try {
    const tags = await prisma.cannedResponse.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { name: "asc" },
    });
    res.json(tags);
  } catch (err) { next(err); }
});

router.post("/tag", async (req, res, next) => {
  const { serverId, name, content, createdBy, isPremium } = req.body;
  if (!serverId || !name || !content || !createdBy) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const cleanName = String(name).trim().toLowerCase().slice(0, TAG_NAME_MAX);
  if (!/^[a-z0-9-]{1,32}$/.test(cleanName)) {
    return res.status(400).json({ error: "Tag name must be kebab-case, ≤32 chars (a-z, 0-9, -)." });
  }
  const cleanContent = String(content).slice(0, TAG_CONTENT_MAX);
  try {
    const count = await prisma.cannedResponse.count({ where: { serverId } });
    const limit = isPremium ? TAG_LIMIT_PREMIUM : TAG_LIMIT_FREE;
    if (count >= limit) {
      return res.status(400).json({ error: `Tag limit reached (${limit}). Delete an existing tag first.` });
    }
    const tag = await prisma.cannedResponse.create({
      data: { serverId, name: cleanName, content: cleanContent, createdBy },
    });
    res.status(201).json(tag);
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ error: `A tag named "${cleanName}" already exists.` });
    }
    next(err);
  }
});

router.delete("/tag/:serverId/:name", async (req, res, next) => {
  try {
    const result = await prisma.cannedResponse.deleteMany({
      where: { serverId: req.params.serverId, name: req.params.name },
    });
    if (result.count === 0) return res.status(404).json({ error: "Tag not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/tag/:serverId/:name/use", async (req, res, next) => {
  try {
    const tag = await prisma.cannedResponse.findUnique({
      where: { serverId_name: { serverId: req.params.serverId, name: req.params.name } },
    });
    if (!tag) return res.status(404).json({ error: "Tag not found" });
    const updated = await prisma.cannedResponse.update({
      where: { id: tag.id },
      data: { usageCount: { increment: 1 } },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ══════════════════════════════ KNOWLEDGE BASE (v32 — suggest + feedback) ═════
// GET  /bot/kb/:serverId/suggest?q=... — best-match article for a new ticket's
//      opening text. Read-only; increments usageCount on a hit so the "top
//      article" stats stay meaningful. Fire-and-forget from the bot's
//      createTicketFromPanel — never blocks ticket creation.
// POST /bot/kb/:articleId/feedback — 👍/👎 button vote on a suggested article.

router.get("/kb/:serverId/suggest", async (req, res, next) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ article: null });
  try {
    const articles = await prisma.kbArticle.findMany({
      where: { serverId: req.params.serverId, enabled: true },
    });
    const match = findBestMatch(articles, q);
    if (!match) return res.json({ article: null });
    const updated = await prisma.kbArticle.update({
      where: { id: match.id },
      data: { usageCount: { increment: 1 } },
    });
    res.json({ article: updated });
  } catch (err) { next(err); }
});

router.post("/kb/:articleId/feedback", async (req, res, next) => {
  const helpful = !!req.body.helpful;
  try {
    const article = await prisma.kbArticle.update({
      where: { id: req.params.articleId },
      data: helpful
        ? { helpfulCount: { increment: 1 } }
        : { notHelpfulCount: { increment: 1 } },
    });
    res.json(article);
  } catch (err) {
    if (err?.code === "P2025") return res.status(404).json({ error: "Article not found" });
    next(err);
  }
});

// ══════════════════════════════ /stats (bot-secret analytics read) ═══════════
// v2.9 — analytics.js requires a dashboard session (requireAuth+loadUser), which
// the bot doesn't have; this is a read-only, serverId-scoped mirror for the
// /stats slash command (mirrors the leaderboard/overview queries in analytics.js).
router.get("/stats/:serverId", async (req, res, next) => {
  try {
    const serverId = req.params.serverId;
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      open7d, closed7d, open30d, closed30d, openTotal,
      closedForAvg, closedGrouped, openByPriorityGrouped,
    ] = await Promise.all([
      prisma.ticket.count({ where: { serverId, createdAt: { gte: sevenDaysAgo } } }),
      prisma.ticket.count({ where: { serverId, status: "CLOSED", closedAt: { gte: sevenDaysAgo } } }),
      prisma.ticket.count({ where: { serverId, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.ticket.count({ where: { serverId, status: "CLOSED", closedAt: { gte: thirtyDaysAgo } } }),
      prisma.ticket.count({ where: { serverId, status: "OPEN" } }),
      prisma.ticket.findMany({
        where: { serverId, feedbackRating: { not: null }, closedAt: { gte: thirtyDaysAgo } },
        select: { feedbackRating: true },
      }),
      prisma.ticket.groupBy({
        by: ["assigneeId"],
        where: { serverId, assigneeId: { not: null }, status: "CLOSED", closedAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
      // v30 — open tickets (OPEN or CLAIMED) grouped by priority, for /stats.
      prisma.ticket.groupBy({
        by: ["priority"],
        where: { serverId, status: { in: ["OPEN", "CLAIMED"] } },
        _count: { _all: true },
      }),
    ]);

    const avgFeedback = closedForAvg.length
      ? closedForAvg.reduce((sum, t) => sum + t.feedbackRating, 0) / closedForAvg.length
      : null;

    const topStaff = closedGrouped
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 3)
      .map((c) => ({ userId: c.assigneeId, closed: c._count._all }));

    // v30 — always report all 4 buckets (0 for priorities with no open tickets)
    // so the bot doesn't need to guess which keys are present.
    const openByPriority = { LOW: 0, NORMAL: 0, HIGH: 0, URGENT: 0 };
    for (const g of openByPriorityGrouped) openByPriority[g.priority] = g._count._all;

    res.json({
      open: { total: openTotal, byPriority: openByPriority },
      tickets: {
        opened7d: open7d, closed7d,
        opened30d: open30d, closed30d,
      },
      topStaff30d: topStaff,
      avgFeedback30d: avgFeedback !== null ? Math.round(avgFeedback * 10) / 10 : null,
      feedbackCount30d: closedForAvg.length,
    });
  } catch (err) { next(err); }
});

// ══════════════════════════════ SERVER EVENT LOG ═════════════════════════════
// Per-guild config the bot reads (cached) before deciding whether to log an event.
router.get("/:serverId/eventlog-config", async (req, res, next) => {
  try {
    const s = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: {
        eventLogEnabled: true, eventLogChannelId: true, eventLogCategories: true,
        eventLogChannels: true,
      },
    });
    if (!s) return res.json({ enabled: false, channelId: null, categories: [], channels: {} });
    res.json({
      enabled: s.eventLogEnabled,
      channelId: s.eventLogChannelId,
      categories: s.eventLogCategories || [],
      // v37 — per-категория канали; ботът пада обратно към channelId, ако
      // за дадена категория няма запис.
      channels: s.eventLogChannels || {},
    });
  } catch (err) { next(err); }
});

// Note: activity events are posted by the bot to the server's own Discord log
// channel only — they are NOT persisted in our database (owner decision), so
// there is no /event-log write endpoint or dashboard viewer.

export default router;
