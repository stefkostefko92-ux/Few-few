// backend/src/routes/game.js
// v50 — Server Season: таблото (Discord OAuth + права в сървъра). Настройки,
// роли за награда, магазин, класация, покупки. Лимитите по tier идват от
// lib/premium.js (shopItems 5/50, levelRoles 5/100) и се налагат при ЗАПИС —
// при сваляне на tier заварените редове остават, но нови не влизат.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { getServerTier } from "../lib/premium.js";
import { createWithinLimit } from "../lib/withinLimit.js";
import { getGameSettings, xpToReachLevel } from "../lib/game/xp.js";
import { COMPANIONS, publicCompanion, CURRENT_SEASON } from "../lib/game/companions.js";
import { QUEST_TYPES, QUEST_TYPE_KEYS, publicQuest } from "../lib/game/quests.js";
import { createQuest, cancelQuest } from "../lib/game/questOps.js";
import { writeAudit } from "../lib/auditLog.js";
import { notifyBot } from "../services/botNotifier.js";

const router = Router();
router.use(requireAuth, loadUser);

const SNOWFLAKE = /^\d{17,20}$/;
const snowflakeOrNull = z.string().regex(SNOWFLAKE).nullable().optional();

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  xpPerMessage: z.number().int().min(1).max(100).optional(),
  messageCooldownSec: z.number().int().min(10).max(3600).optional(),
  xpPerVoiceMinute: z.number().int().min(0).max(50).optional(),
  announceChannelId: snowflakeOrNull,
  levelUpMessage: z.boolean().optional(),
  dailySparks: z.number().int().min(1).max(1000).optional(),
  levelRoles: z.array(z.object({
    level: z.number().int().min(1).max(200),
    roleId: z.string().regex(SNOWFLAKE),
  })).max(100).optional(),
  spawnEnabled: z.boolean().optional(),
  spawnChannelIds: z.array(z.string().regex(SNOWFLAKE)).max(50).optional(),
  countingChannelId: snowflakeOrNull,
  triviaChannelId: snowflakeOrNull,
  triviaSchedule: z.enum(["daily", "weekly"]).nullable().optional(),
  questChannelId: snowflakeOrNull,
  questEnabled: z.boolean().optional(),
});

// ─── GET /api/game/:serverId — настройки + лимити + обзор ────────────────────
router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  const { serverId } = req.params;
  try {
    const [settings, tier, players, agg, top, shopCount] = await Promise.all([
      getGameSettings(serverId),
      getServerTier(serverId),
      prisma.memberProgress.count({ where: { serverId } }),
      prisma.memberProgress.aggregate({ where: { serverId }, _sum: { xp: true, messages: true, voiceMinutes: true, sparks: true } }),
      prisma.memberProgress.findMany({ where: { serverId }, orderBy: { xp: "desc" }, take: 5, select: { userId: true, xp: true, level: true, sparks: true, streak: true } }),
      prisma.shopItem.count({ where: { serverId } }),
    ]);
    res.json({
      settings,
      limits: { shopItems: tier.limits.shopItems, levelRoles: tier.limits.levelRoles, activeQuests: tier.limits.activeQuests, companionSlots: tier.limits.companionSlots },
      isPremium: !!tier.isPremium,
      stats: { players, totalXp: agg._sum.xp || 0, totalMessages: agg._sum.messages || 0, totalVoiceMinutes: agg._sum.voiceMinutes || 0, sparksInCirculation: agg._sum.sparks || 0, shopItems: shopCount, top },
      // Таблица „колко XP за ниво" — таблото я показва до редактора на ролите.
      levelTable: [1, 5, 10, 15, 20, 30, 50].map((l) => ({ level: l, xp: xpToReachLevel(l) })),
    });
  } catch (err) { next(err); }
});

// ─── PUT /api/game/:serverId/settings ────────────────────────────────────────
router.put("/:serverId/settings", requireServerAdmin, async (req, res, next) => {
  const { serverId } = req.params;
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const tier = await getServerTier(serverId);
    const data = { ...parsed.data };
    if (data.levelRoles) {
      // Дублирано ниво = двусмислена награда; лимит по tier.
      const levels = new Set(data.levelRoles.map((r) => r.level));
      if (levels.size !== data.levelRoles.length) return res.status(400).json({ error: "Duplicate level in levelRoles" });
      if (data.levelRoles.length > tier.limits.levelRoles) {
        return res.status(403).json({ error: `Level roles limit reached (${tier.limits.levelRoles})`, code: "LIMIT_REACHED", limit: tier.limits.levelRoles });
      }
      data.levelRoles = [...data.levelRoles].sort((a, b) => a.level - b.level);
    }
    // Дневна trivia е Premium (concept §5); Free пада на седмична, не мълчи.
    if (data.triviaSchedule === "daily" && !tier.isPremium) {
      return res.status(403).json({ error: "Daily trivia requires Premium", code: "PREMIUM_REQUIRED", feature: "game.kbTrivia" });
    }
    await getGameSettings(serverId); // гарантира реда
    const settings = await prisma.gameSettings.update({ where: { serverId }, data });
    await writeAudit({ actorId: req.user.id, action: "GAME_SETTINGS_UPDATED", targetId: serverId, metadata: { keys: Object.keys(data) } });
    // Ботът кешира настройките 60 s — кажи му да ги прочете наново.
    notifyBot("GAME_SETTINGS_CHANGED", { serverId }).catch(() => {});
    res.json(settings);
  } catch (err) { next(err); }
});

// ─── Магазин (CRUD) ──────────────────────────────────────────────────────────
const itemSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  priceSparks: z.number().int().min(1).max(1_000_000),
  type: z.enum(["ROLE", "CUSTOM"]).default("ROLE"),
  roleId: z.string().regex(SNOWFLAKE).nullable().optional(),
  durationDays: z.number().int().min(1).max(365).nullable().optional(),
  stock: z.number().int().min(1).max(100000).nullable().optional(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
}).refine((i) => i.type !== "ROLE" || !!i.roleId, { message: "roleId is required for ROLE items", path: ["roleId"] });

router.get("/:serverId/shop", requireServerAdmin, async (req, res, next) => {
  try {
    const items = await prisma.shopItem.findMany({
      where: { serverId: req.params.serverId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { purchases: true } } },
    });
    res.json(items.map((i) => ({ ...i, sold: i._count.purchases, _count: undefined })));
  } catch (err) { next(err); }
});

router.post("/:serverId/shop", requireServerAdmin, async (req, res, next) => {
  const { serverId } = req.params;
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const tier = await getServerTier(serverId);
    const result = await createWithinLimit({
      model: "shopItem",
      where: { serverId },
      limit: tier.limits.shopItems,
      create: (tx) => tx.shopItem.create({ data: { serverId, ...parsed.data } }),
    });
    if (!result.ok) {
      return res.status(403).json({ error: `Shop item limit reached (${tier.limits.shopItems})`, code: "LIMIT_REACHED", limit: tier.limits.shopItems, count: result.count });
    }
    await writeAudit({ actorId: req.user.id, action: "GAME_SHOP_ITEM_CREATED", targetId: serverId, metadata: { itemId: result.row.id, name: result.row.name } });
    res.status(201).json(result.row);
  } catch (err) { next(err); }
});

router.patch("/:serverId/shop/:itemId", requireServerAdmin, async (req, res, next) => {
  const { serverId, itemId } = req.params;
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const existing = await prisma.shopItem.findFirst({ where: { id: itemId, serverId } });
    if (!existing) return res.status(404).json({ error: "Item not found" });
    const item = await prisma.shopItem.update({ where: { id: itemId }, data: parsed.data });
    res.json(item);
  } catch (err) { next(err); }
});

router.delete("/:serverId/shop/:itemId", requireServerAdmin, async (req, res, next) => {
  const { serverId, itemId } = req.params;
  try {
    const existing = await prisma.shopItem.findFirst({ where: { id: itemId, serverId } });
    if (!existing) return res.status(404).json({ error: "Item not found" });
    await prisma.shopItem.delete({ where: { id: itemId } });
    await writeAudit({ actorId: req.user.id, action: "GAME_SHOP_ITEM_DELETED", targetId: serverId, metadata: { itemId, name: existing.name } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Класация и покупки ──────────────────────────────────────────────────────
router.get("/:serverId/leaderboard", requireServerAdmin, async (req, res, next) => {
  const by = ["xp", "sparks", "seasonXp", "streak"].includes(String(req.query.by)) ? String(req.query.by) : "xp";
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  try {
    const rows = await prisma.memberProgress.findMany({
      where: { serverId: req.params.serverId },
      orderBy: [{ [by]: "desc" }, { updatedAt: "asc" }],
      take: limit,
      select: { userId: true, xp: true, level: true, sparks: true, seasonXp: true, streak: true, messages: true, voiceMinutes: true, updatedAt: true },
    });
    res.json({ by, rows });
  } catch (err) { next(err); }
});

router.get("/:serverId/purchases", requireServerAdmin, async (req, res, next) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  try {
    const rows = await prisma.shopPurchase.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { item: { select: { name: true, type: true, roleId: true } } },
    });
    res.json(rows);
  } catch (err) { next(err); }
});

// ─── Спътници: каталог + статистика на сървъра ───────────────────────────────
router.get("/:serverId/companions", requireServerAdmin, async (req, res, next) => {
  const { serverId } = req.params;
  try {
    const [counts, collectors, spawns] = await Promise.all([
      prisma.memberCompanion.groupBy({ by: ["companionId"], where: { serverId }, _count: { _all: true } }),
      prisma.memberCompanion.groupBy({ by: ["userId"], where: { serverId }, _count: { _all: true }, orderBy: { _count: { userId: "desc" } }, take: 10 }),
      prisma.companionSpawn.count({ where: { serverId } }),
    ]);
    const byId = Object.fromEntries(counts.map((c) => [c.companionId, c._count._all]));
    res.json({
      season: CURRENT_SEASON,
      spawns,
      caught: counts.reduce((s, c) => s + c._count._all, 0),
      catalog: COMPANIONS.map((c) => ({ ...publicCompanion(c, 1), caught: byId[c.id] || 0 })),
      collectors: collectors.map((c) => ({ userId: c.userId, count: c._count._all })),
    });
  } catch (err) { next(err); }
});

// ─── Етап 3: куестове + мини-игри (таблото) ──────────────────────────────────
router.get("/:serverId/quests", requireServerAdmin, async (req, res, next) => {
  const { serverId } = req.params;
  try {
    const now = new Date();
    const [active, history] = await Promise.all([
      prisma.serverQuest.findMany({ where: { serverId, status: "ACTIVE", endsAt: { gt: now } }, orderBy: { endsAt: "asc" }, include: { contributions: { orderBy: { amount: "desc" }, take: 5 } } }),
      prisma.serverQuest.findMany({ where: { serverId, OR: [{ status: { not: "ACTIVE" } }, { endsAt: { lte: now } }] }, orderBy: { endsAt: "desc" }, take: 20, include: { _count: { select: { contributions: true } } } }),
    ]);
    res.json({
      types: QUEST_TYPE_KEYS.map((k) => ({ key: k, emoji: QUEST_TYPES[k].emoji, reward: QUEST_TYPES[k].reward, min: QUEST_TYPES[k].min, max: QUEST_TYPES[k].max })),
      active: active.map((q) => publicQuest(q, { contributors: q.contributions.map((c) => ({ userId: c.userId, amount: c.amount })) })),
      history: history.map((q) => publicQuest(q, { contributors: q._count.contributions })),
    });
  } catch (err) { next(err); }
});

const questSchema = z.object({
  type: z.enum(QUEST_TYPE_KEYS),
  target: z.number().int().min(1).max(1_000_000),
  rewardSparks: z.number().int().min(1).max(10_000).optional(),
  days: z.number().int().min(1).max(30).default(7),
});
router.post("/:serverId/quests", requireServerAdmin, async (req, res, next) => {
  const { serverId } = req.params;
  const parsed = questSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const out = await createQuest(serverId, parsed.data);
    if (!out.ok) {
      if (out.code === "LIMIT_REACHED") return res.status(403).json({ error: `Active quests limit reached (${out.limit})`, code: "LIMIT_REACHED", limit: out.limit, count: out.count });
      return res.status(400).json({ error: out.code });
    }
    await writeAudit({ actorId: req.user.id, action: "GAME_QUEST_CREATED", targetId: serverId, metadata: { questId: out.quest.id, type: out.quest.type, target: out.quest.target } });
    res.status(201).json(publicQuest(out.quest));
  } catch (err) { next(err); }
});

router.delete("/:serverId/quests/:questId", requireServerAdmin, async (req, res, next) => {
  const { serverId, questId } = req.params;
  try {
    const out = await cancelQuest(serverId, questId);
    if (!out.ok) return res.status(out.code === "NOT_FOUND" ? 404 : 409).json({ error: out.code });
    await writeAudit({ actorId: req.user.id, action: "GAME_QUEST_CANCELLED", targetId: serverId, metadata: { questId } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get("/:serverId/minigames", requireServerAdmin, async (req, res, next) => {
  const { serverId } = req.params;
  try {
    const [settings, rounds, recent, winners] = await Promise.all([
      getGameSettings(serverId),
      prisma.triviaRound.count({ where: { serverId } }),
      prisma.triviaRound.findMany({ where: { serverId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, source: true, question: true, winnerId: true, createdAt: true, closedAt: true, _count: { select: { answers: true } } } }),
      prisma.triviaRound.groupBy({ by: ["winnerId"], where: { serverId, winnerId: { not: null } }, _count: { _all: true }, orderBy: { _count: { winnerId: "desc" } }, take: 10 }),
    ]);
    res.json({
      counting: { channelId: settings.countingChannelId, current: settings.countingCurrent, high: settings.countingHigh },
      trivia: {
        channelId: settings.triviaChannelId, schedule: settings.triviaSchedule, rounds,
        recent: recent.map((r) => ({ id: r.id, source: r.source, question: r.question, winnerId: r.winnerId, createdAt: r.createdAt, closedAt: r.closedAt, answers: r._count.answers })),
        winners: winners.map((w) => ({ userId: w.winnerId, wins: w._count._all })),
      },
    });
  } catch (err) { next(err); }
});

export default router;
