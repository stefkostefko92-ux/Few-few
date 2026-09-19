// backend/src/routes/bot_game.js
// v50 — Server Season: endpoint-ите, които БОТЪТ вика (x-bot-secret).
// Настройки на играта, XP на партиди (съобщения без съдържание + гласови
// минути), /daily, профил, класация, магазин. Всичко е скопирано по serverId
// (мулти-тенант); правилата за XP/нива живеят в lib/game/xp.js.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { getServerTier } from "../lib/premium.js";
import {
  getGameSettings, awardXp, computeDaily, levelProgress, rolesForLevel, DAILY_XP,
} from "../lib/game/xp.js";
import { contribute } from "../lib/game/questOps.js";
import { companionById, publicCompanion } from "../lib/game/companions.js";
import { getCurrentSeason } from "../lib/game/seasons.js";

const router = Router();
router.use(requireBotSecret);

const SNOWFLAKE = /^\d{17,20}$/;

// ─── GET /api/bot/game/settings/:serverId ────────────────────────────────────
router.get("/game/settings/:serverId", async (req, res, next) => {
  try {
    const settings = await getGameSettings(req.params.serverId);
    const tier = await getServerTier(req.params.serverId);
    res.json({ ...settings, isPremium: !!tier.isPremium, limits: tier.limits });
  } catch (err) { next(err); }
});

// ─── POST /api/bot/game/xp-batch ─────────────────────────────────────────────
// Ботът трупа събития в паметта (охлаждането е при него) и праща на всеки ~30 s
// { serverId, entries: [{ userId, messageXpEvents, voiceMinutes }] }.
// Отговорът носи нивата нагоре, за да раздаде ботът ролите и да обяви.
const batchSchema = z.object({
  serverId: z.string().regex(SNOWFLAKE),
  entries: z.array(z.object({
    userId: z.string().regex(SNOWFLAKE),
    messageXpEvents: z.number().int().min(0).max(1000).default(0),
    voiceMinutes: z.number().int().min(0).max(24 * 60).default(0),
  })).max(500),
});
router.post("/game/xp-batch", async (req, res, next) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { serverId, entries } = parsed.data;
  try {
    const settings = await getGameSettings(serverId);
    if (!settings.enabled) return res.json({ enabled: false, levelUps: [] });
    const levelUps = [];
    for (const e of entries) {
      const amount = e.messageXpEvents * settings.xpPerMessage + e.voiceMinutes * settings.xpPerVoiceMinute;
      if (amount <= 0) continue;
      const r = await awardXp(serverId, e.userId, amount, {
        messages: e.messageXpEvents, voiceMinutes: e.voiceMinutes, touchMessageXp: e.messageXpEvents > 0,
      });
      if (r.leveledUp) {
        levelUps.push({ ...r, roleIds: rolesForLevel(settings.levelRoles, r.level) });
      }
    }
    // Етап 3: партидата е и принос към сървърните куестове (съобщения / гласови минути).
    // Страничен ефект — провал тук не бива да връща 500 на бота (XP-то вече е записано).
    try {
      await contribute(serverId, "MESSAGES", entries.map((e) => ({ userId: e.userId, amount: e.messageXpEvents })));
      await contribute(serverId, "VOICE_MINUTES", entries.map((e) => ({ userId: e.userId, amount: e.voiceMinutes })));
    } catch (err) { console.warn(`[game] quest contribute за ${serverId}: ${err.message}`); }
    res.json({
      enabled: true,
      levelUps,
      announceChannelId: settings.announceChannelId,
      levelUpMessage: settings.levelUpMessage,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/bot/game/daily ────────────────────────────────────────────────
router.post("/game/daily", async (req, res, next) => {
  const { serverId, userId } = req.body || {};
  if (!SNOWFLAKE.test(String(serverId)) || !SNOWFLAKE.test(String(userId))) {
    return res.status(400).json({ error: "serverId and userId required" });
  }
  try {
    const settings = await getGameSettings(serverId);
    if (!settings.enabled) return res.status(403).json({ error: "Game disabled", code: "GAME_DISABLED" });
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.memberProgress.upsert({
        where: { serverId_userId: { serverId, userId } }, update: {}, create: { serverId, userId },
      });
      const d = computeDaily(row, settings.dailySparks);
      if (!d.ok) return { ...d, sparksTotal: row.sparks, streak: row.streak };
      const updated = await tx.memberProgress.update({
        where: { id: row.id },
        data: { sparks: { increment: d.sparks }, streak: d.streak, lastDailyAt: new Date() },
      });
      return { ...d, sparksTotal: updated.sparks };
    });
    if (!result.ok) return res.status(429).json({ error: "Already claimed", code: "DAILY_COOLDOWN", retryInMs: result.retryInMs, streak: result.streak, sparksTotal: result.sparksTotal });
    // XP за дневния ритуал — отделно от искрите; може да вдигне ниво.
    const xp = await awardXp(serverId, userId, DAILY_XP);
    contribute(serverId, "DAILY_CLAIMS", [{ userId, amount: 1 }]).catch(() => {}); // етап 3
    const levelUp = xp.leveledUp ? { ...xp, roleIds: rolesForLevel(settings.levelRoles, xp.level) } : null;
    res.json({ ...result, xp: DAILY_XP, level: xp.level, levelUp, announceChannelId: settings.announceChannelId, levelUpMessage: settings.levelUpMessage });
  } catch (err) { next(err); }
});

// ─── GET /api/bot/game/profile/:serverId/:userId ─────────────────────────────
router.get("/game/profile/:serverId/:userId", async (req, res, next) => {
  const { serverId, userId } = req.params;
  try {
    const settings = await getGameSettings(serverId);
    const row = await prisma.memberProgress.findUnique({ where: { serverId_userId: { serverId, userId } } });
    const xp = row?.xp || 0;
    const rank = row ? (await prisma.memberProgress.count({ where: { serverId, xp: { gt: xp } } })) + 1 : null;
    const players = await prisma.memberProgress.count({ where: { serverId } });
    const companions = await prisma.memberCompanion.count({ where: { serverId, userId } }).catch(() => 0);
    const activeRow = row?.activeCompanionId
      ? await prisma.memberCompanion.findUnique({ where: { id: row.activeCompanionId } }).catch(() => null)
      : null;
    // Ботът показва име + картинка, не вътрешния id (одит 19.09.2026).
    const active = activeRow
      ? { ...activeRow, ...publicCompanion(companionById(activeRow.companionId), activeRow.stage, await getCurrentSeason()) }
      : null;
    const nextDailyAt = row?.lastDailyAt ? new Date(new Date(row.lastDailyAt).getTime() + 24 * 3600 * 1000) : null;
    res.json({
      enabled: settings.enabled,
      userId,
      xp,
      progress: levelProgress(xp),
      sparks: row?.sparks || 0,
      streak: row?.streak || 0,
      messages: row?.messages || 0,
      voiceMinutes: row?.voiceMinutes || 0,
      rank, players,
      companions,
      activeCompanion: active,
      nextDailyAt,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/bot/game/leaderboard/:serverId?by=xp|sparks&limit=10 ───────────
router.get("/game/leaderboard/:serverId", async (req, res, next) => {
  const by = ["xp", "sparks", "seasonXp"].includes(String(req.query.by)) ? String(req.query.by) : "xp";
  const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));
  try {
    const rows = await prisma.memberProgress.findMany({
      where: { serverId: req.params.serverId },
      orderBy: [{ [by]: "desc" }, { updatedAt: "asc" }],
      take: limit,
      select: { userId: true, xp: true, level: true, sparks: true, seasonXp: true, streak: true },
    });
    res.json({ by, rows });
  } catch (err) { next(err); }
});

// ─── Магазин ─────────────────────────────────────────────────────────────────
router.get("/game/shop/:serverId", async (req, res, next) => {
  try {
    const items = await prisma.shopItem.findMany({
      where: { serverId: req.params.serverId, enabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { purchases: true } } },
    });
    res.json(items.map((i) => ({
      id: i.id, name: i.name, description: i.description, priceSparks: i.priceSparks, type: i.type,
      roleId: i.roleId, durationDays: i.durationDays,
      stockLeft: i.stock == null ? null : Math.max(0, i.stock - i._count.purchases),
    })));
  } catch (err) { next(err); }
});

// Покупка: ЕДНА транзакция — наличност, искри, запис. Ботът след това дава ролята.
router.post("/game/shop/:serverId/buy", async (req, res, next) => {
  const { userId, itemId } = req.body || {};
  const { serverId } = req.params;
  if (!SNOWFLAKE.test(String(userId)) || typeof itemId !== "string") return res.status(400).json({ error: "userId and itemId required" });
  try {
    const settings = await getGameSettings(serverId);
    if (!settings.enabled) return res.status(403).json({ error: "Game disabled", code: "GAME_DISABLED" });
    const out = await prisma.$transaction(async (tx) => {
      const item = await tx.shopItem.findFirst({ where: { id: itemId, serverId, enabled: true } });
      if (!item) return { error: "Item not found", code: "ITEM_NOT_FOUND", status: 404 };
      if (item.stock != null) {
        const sold = await tx.shopPurchase.count({ where: { itemId: item.id } });
        if (sold >= item.stock) return { error: "Sold out", code: "SOLD_OUT", status: 409 };
      }
      const row = await tx.memberProgress.upsert({
        where: { serverId_userId: { serverId, userId } }, update: {}, create: { serverId, userId },
      });
      if (row.sparks < item.priceSparks) {
        return { error: "Not enough sparks", code: "NOT_ENOUGH_SPARKS", status: 402, sparks: row.sparks, price: item.priceSparks };
      }
      // Условен decrement: ако междувременно искрите са паднали (двоен клик), 0 реда.
      const dec = await tx.memberProgress.updateMany({
        where: { id: row.id, sparks: { gte: item.priceSparks } },
        data: { sparks: { decrement: item.priceSparks } },
      });
      if (dec.count !== 1) return { error: "Not enough sparks", code: "NOT_ENOUGH_SPARKS", status: 402 };
      const expiresAt = item.durationDays ? new Date(Date.now() + item.durationDays * 86_400_000) : null;
      const purchase = await tx.shopPurchase.create({
        data: { serverId, userId, itemId: item.id, priceSparks: item.priceSparks, expiresAt },
      });
      return { ok: true, purchase, item, sparksLeft: row.sparks - item.priceSparks };
    });
    if (out.error) return res.status(out.status).json(out);
    res.json(out);
  } catch (err) { next(err); }
});

export default router;
