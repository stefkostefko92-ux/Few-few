// backend/src/routes/bot_v18.js
// v1.8 bot-facing endpoints for polls, giveaways, sticky messages, scheduled messages.
// All protected by x-bot-secret.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { fireWebhooks } from "../services/webhooks.js";

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

    // Single-choice: remove user's previous votes for this poll
    if (!poll.multiChoice) {
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

// ══════════════════════════════ GIVEAWAYS ══════════════════════════════

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

  // Shuffle
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const winners = shuffled.slice(0, g.winnerCount).map((e) => e.userId);

  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: { endedAt: g.endedAt || new Date(), winnerIds: winners },
  });

  // Fire webhook
  fireWebhooks(g.serverId, "GIVEAWAY_ENDED", {
    giveawayId, prize: g.prize, winners, entryCount: g.entries.length,
  }).catch(() => {});

  return winners;
}

// ══════════════════════════════ STICKY MESSAGES ══════════════════════════════

router.post("/sticky", async (req, res, next) => {
  const { serverId, channelId, content, embedTitle, embedColor, createdBy } = req.body;
  if (!serverId || !channelId || !content) return res.status(400).json({ error: "Invalid payload" });
  try {
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
    await prisma.scheduledMessage.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
