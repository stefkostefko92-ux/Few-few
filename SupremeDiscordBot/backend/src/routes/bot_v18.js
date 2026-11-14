// backend/src/routes/bot_v18.js
// v1.8 bot-facing endpoints for polls, giveaways, sticky messages, scheduled messages.
// All protected by x-bot-secret.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { fireGiveawayEnded } from "../lib/webhookEvents.js";
import { drawWinners } from "../lib/giveawayDraw.js";
import { anchorDayOf } from "../lib/recurrence.js";
import { notifyBot } from "../services/botNotifier.js";
import { findBestMatch } from "../lib/kbMatch.js";
import { getServerTier, planHasFeature } from "../lib/premium.js";
import { createWithinLimit } from "../lib/withinLimit.js";
import { grantXpOnce, XP_REWARDS } from "../lib/game/xp.js";

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

    // А8: четене → изтриване → запис са ЕДНА транзакция под advisory lock по
    // (анкета, потребител). Преди това два паралелни клика минаваха и двата през
    // `deleteMany` + `create` и в анкета с един избор оставаха 2 гласа.
    // Single-choice: същата опция втори път = оттегляне; друга опция = смяна.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"pollvote:" + poll.id + ":" + userId}))`;
      if (!poll.multiChoice) {
        const prev = await tx.pollVote.findFirst({ where: { pollId: poll.id, userId } });
        if (prev && prev.option === option) {
          await tx.pollVote.delete({ where: { id: prev.id } });
          return "off";
        }
        await tx.pollVote.deleteMany({ where: { pollId: poll.id, userId } });
      } else {
        const existing = await tx.pollVote.findUnique({
          where: { pollId_userId_option: { pollId: poll.id, userId, option } },
        }).catch(() => null);
        if (existing) {
          await tx.pollVote.delete({ where: { id: existing.id } });
          return "off";
        }
      }
      await tx.pollVote.create({ data: { pollId: poll.id, userId, option } });
      return "on";
    });
    if (outcome === "off") {
      const counts = await recountPoll(poll.id, poll.options.length);
      return res.json({ toggled: "off", counts });
    }
    const counts = await recountPoll(poll.id, poll.options.length);
    // v50 — XP за глас: веднъж на анкета (ключът пази от toggle-фермене).
    grantXpOnce(poll.serverId, userId, `poll:${poll.id}`, XP_REWARDS.POLL_VOTE).catch(() => {});
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

// Томболите са по (id, serverId) навсякъде. `/giveaway end|reroll` приемаше
// свободно въведен id → админ на сървър A приключваше/теглеше наново томбола на
// сървър B (червен екип, 10.10.2026). Чужд id → 404, както несъществуващ.
const GW_SNOWFLAKE = /^\d{17,20}$/;
const gwServer = (req) => String(req.body?.serverId ?? req.query?.serverId ?? "");

router.patch("/giveaway/:id/spawned", async (req, res, next) => {
  const serverId = gwServer(req);
  if (!GW_SNOWFLAKE.test(serverId)) return res.status(400).json({ error: "serverId required" });
  if (!GW_SNOWFLAKE.test(String(req.body?.messageId))) return res.status(400).json({ error: "messageId required" });
  try {
    const r = await prisma.giveaway.updateMany({
      where: { id: req.params.id, serverId },
      data: { messageId: String(req.body.messageId) },
    });
    if (r.count !== 1) return res.status(404).json({ error: "Giveaway not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get("/giveaway/:id", async (req, res, next) => {
  const serverId = gwServer(req);
  if (!GW_SNOWFLAKE.test(serverId)) return res.status(400).json({ error: "serverId required" });
  try {
    const g = await prisma.giveaway.findFirst({
      where: { id: req.params.id, serverId },
      include: { _count: { select: { entries: true } } },
    });
    if (!g) return res.status(404).json({ error: "Giveaway not found" });
    res.json({ ...g, entryCount: g._count.entries });
  } catch (err) { next(err); }
});

router.post("/giveaway/:id/enter", async (req, res, next) => {
  const { userId, memberRoleIds } = req.body || {};
  const serverId = gwServer(req);
  if (!GW_SNOWFLAKE.test(serverId) || !GW_SNOWFLAKE.test(String(userId))) return res.status(400).json({ error: "serverId and userId required" });
  try {
    const g = await prisma.giveaway.findFirst({ where: { id: req.params.id, serverId } });
    if (!g) return res.status(404).json({ error: "Giveaway not found" });
    if (g.endedAt) return res.status(400).json({ error: "Giveaway has ended" });

    // Toggle — if already entered, remove. Излизането е позволено и без роли
    // (човек, загубил ролята, може да се оттегли).
    const existing = await prisma.giveawayEntry.findUnique({
      where: { giveawayId_userId: { giveawayId: g.id, userId } },
    }).catch(() => null);

    if (existing) {
      await prisma.giveawayEntry.delete({ where: { id: existing.id } });
      const entryCount = await prisma.giveawayEntry.count({ where: { giveawayId: g.id } });
      return res.json({ entered: false, entryCount, requiredRoleIds: g.requiredRoleIds });
    }

    // А4: изискваните роли се проверяват ПРЕДИ записа. Преди това записът ставаше
    // първо и се махаше с втори toggle (`.catch(() => {})`): при двоен клик или
    // приключила томбола записът оставаше. Липсващ/невалиден `memberRoleIds` при
    // раздаване с изискване е отказ (fail closed) — клиентът не се вярва.
    if (g.requiredRoleIds.length > 0) {
      const have = Array.isArray(memberRoleIds) && memberRoleIds.length <= 250
        ? new Set(memberRoleIds.map(String))
        : null;
      const missing = have ? g.requiredRoleIds.filter((r) => !have.has(r)) : g.requiredRoleIds;
      if (missing.length > 0) {
        return res.status(403).json({ error: "ROLE_REQUIRED", missingRoleIds: missing, requiredRoleIds: g.requiredRoleIds });
      }
    }

    await prisma.giveawayEntry.create({ data: { giveawayId: g.id, userId } });
    const entryCount = await prisma.giveawayEntry.count({ where: { giveawayId: g.id } });
    // v50 — XP за участие: веднъж на подарък.
    grantXpOnce(g.serverId, userId, `giveaway:${g.id}`, XP_REWARDS.GIVEAWAY_ENTER).catch(() => {});
    res.json({ entered: true, entryCount, requiredRoleIds: g.requiredRoleIds });
  } catch (err) { next(err); }
});

// Cross-tenant IDOR guard: giveaway_id идва като свободен текст от /giveaway
// end|reroll, а x-bot-secret е общ за всички сървъри. Ботът праща serverId от
// interaction.guildId; скоупваме по него (чужд/непознат id -> 404, без теглене).
// serverId минава през същата проверка за snowflake като останалите маршрути
// за томболи (gwServer/GW_SNOWFLAKE) — обект или празно е 400.
function giveawayAction(reroll) {
  return async (req, res, next) => {
    const serverId = gwServer(req);
    if (!GW_SNOWFLAKE.test(serverId)) return res.status(400).json({ error: "serverId required" });
    try {
      const r = await pickGiveawayWinners(req.params.id, serverId, reroll);
      if (r.status === "notfound") return res.status(404).json({ error: "Giveaway not found" });
      if (r.status === "conflict") return res.status(409).json({ error: "Giveaway already ended" });
      if (r.status === "notended") return res.status(409).json({ error: "Giveaway has not ended yet", code: "NOT_ENDED" });
      res.json({ winners: r.winners });
    } catch (err) { next(err); }
  };
}

router.post("/giveaway/:id/end", giveawayAction(false));
router.post("/giveaway/:id/reroll", giveawayAction(true));

async function pickGiveawayWinners(giveawayId, serverId, reroll = false) {
  const g = await prisma.giveaway.findFirst({
    where: { id: giveawayId, serverId },
    include: { entries: true },
  });
  if (!g) return { status: "notfound" };
  if (!reroll && g.endedAt) return { status: "conflict" };

  // Reroll е само СЛЕД края (А3): иначе обявява победители на още течаща томбола.
  if (reroll && !g.endedAt) return { status: "notended" };

  // Fair winner selection (Fisher–Yates), без предишните победители при reroll и
  // само хора, които още са в сървъра (А4).
  const winners = await drawWinners(g, g.entries, { reroll });

  // Условен запис (race): ръчен end + cron или двама админи не бива да теглят
  // по два пъти. При end пазим endedAt: null; count 0 -> някой вече приключи.
  const written = await prisma.giveaway.updateMany({
    where: { id: giveawayId, serverId, endedAt: reroll ? { not: null } : null },
    data: { endedAt: g.endedAt || new Date(), winnerIds: winners },
  });
  if (written.count === 0) return { status: "conflict" };

  // Fire external webhooks (customer integrations)
  fireGiveawayEnded(g, winners, g.entries.length, { reroll }).catch(() => {});

  // Update the public Discord message + announce winners in the channel.
  // Previously missing on the /giveaway end + reroll command path, so manual
  // ends never announced publicly (unlike the scheduler auto-end and dashboard).
  // serverId е ЗАДЪЛЖИТЕЛЕН: ботът резолвира канала през guildChannel(serverId, …).
  notifyBot("GIVEAWAY_ENDED", {
    serverId: g.serverId, giveawayId, channelId: g.channelId, messageId: g.messageId,
    prize: g.prize, winners, reroll,
  }).catch(() => {});

  return { status: "ok", winners };
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
    // А6: лимитът `stickiesPerServer` важи само при СЪЗДАВАНЕ (upsert по канал);
    // канал със sticky на друг сървър се отказва (изолация).
    const existing = await prisma.stickyMessage.findUnique({ where: { channelId }, select: { serverId: true } });
    if (existing && existing.serverId !== serverId) {
      return res.status(409).json({ error: "This channel already has a sticky on another server." });
    }
    const limit = tier.limits.stickiesPerServer;
    const sticky = await prisma.$transaction(async (tx) => {
      if (!existing) {
        const count = await tx.stickyMessage.count({ where: { serverId } });
        if (count >= limit) { const e = new Error("LIMIT_REACHED"); e.__limit = true; throw e; }
      }
      return tx.stickyMessage.upsert({
        where: { channelId },
        create: { serverId, channelId, content, embedTitle, embedColor, createdBy },
        update: { content, embedTitle, embedColor, enabled: true, currentMessageId: null },
      });
    }, { isolationLevel: "Serializable" }).catch((err) => {
      if (err?.__limit || err?.code === "P2034") return null;
      throw err;
    });
    if (!sticky) return res.status(403).json({ error: `Sticky limit reached (${limit}).`, code: "LIMIT_REACHED" });
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
    // А6: същият атомарен лимит като таблото (`scheduledPerServer`, само чакащите).
    const created = await createWithinLimit({
      model: "scheduledMessage",
      where: { serverId, sentAt: null },
      limit: tier.limits.scheduledPerServer,
      create: (tx) => tx.scheduledMessage.create({
        data: {
          serverId, channelId, content,
          embedTitle: embedTitle || null,
          embedDescription: embedDescription || null,
          embedColor: embedColor || "#00e5ff",
          sendAt: new Date(sendAt),
          recurrence: recurrence || null,
          // Discord не казва часовата зона на човека — смята се в UTC; денят от
          // месеца се помни, за да не се измества месечното (А5).
          anchorDay: recurrence ? anchorDayOf(new Date(sendAt), null) : null,
          createdBy: createdBy || "bot",
        },
      }),
    });
    if (!created.ok) {
      return res.status(403).json({ error: `Scheduled message limit reached (${tier.limits.scheduledPerServer}).`, code: "LIMIT_REACHED" });
    }
    res.status(201).json(created.row);
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
  // Тарифата се резолвира ТУК, не се вярва на req.body (одит 09.08.2026).
  // Маршрутът е зад requireBotSecret, но правилото е едно: правата идват от
  // getServerTier — единствената дефиниция — не от полето на повикващия.
  const { serverId, name, content, createdBy } = req.body;
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
    const { isPremium } = await getServerTier(serverId);
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
