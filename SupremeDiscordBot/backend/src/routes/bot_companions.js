// backend/src/routes/bot_companions.js
// v50 — Server Season, етап 2: спътници — endpoint-ите за бота (x-bot-secret).
// Логиката е в lib/game/companionOps.js; тук е само транспортът.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { getGameSettings } from "../lib/game/xp.js";
import { COMPANIONS, publicCompanion, companionById } from "../lib/game/companions.js";
import {
  createSpawn, catchSpawn, listOwned, feedCompanion, activateCompanion, releaseCompanion, proposeTrade, resolveTrade,
} from "../lib/game/companionOps.js";
import { getCurrentSeason, publicSeason } from "../lib/game/seasons.js";

const router = Router();
router.use(requireBotSecret);
const SNOWFLAKE = /^\d{17,20}$/;
const bad = (res, msg) => res.status(400).json({ error: msg });
const fail = (res, out) => {
  const status = { SPAWN_ACTIVE: 409, SPAWN_TOO_SOON: 429, SPAWN_NOT_FOUND: 404, ALREADY_CAUGHT: 409, SPAWN_EXPIRED: 410, COLLECTION_FULL: 403,
    NOT_OWNED: 404, MAX_STAGE: 409, NOT_ENOUGH_SPARKS: 402, INVALID_AMOUNT: 400, SELF_TRADE: 400, TRADE_PENDING: 409, TRADE_NOT_FOUND: 404,
    TRADE_CLOSED: 409, TRADE_EXPIRED: 410, NOT_RECIPIENT: 403, TRADE_STALE: 409 }[out.code] || 400;
  return res.status(status).json({ error: out.code, ...out });
};

// Каталогът (за таблото на бота/help) — публични полета.
router.get("/game/companions/catalog", async (_req, res, next) => {
  try {
    const season = await getCurrentSeason();
    res.json({ season: publicSeason(season), companions: COMPANIONS.map((c) => publicCompanion(c, 1, season)) });
  } catch (err) { next(err); }
});

// Поява: ботът пита след праг на активност; backend решава по интервал/жива поява.
router.post("/game/spawn", async (req, res, next) => {
  const { serverId, channelId } = req.body || {};
  if (!SNOWFLAKE.test(String(serverId)) || !SNOWFLAKE.test(String(channelId))) return bad(res, "serverId and channelId required");
  try {
    const s = await getGameSettings(serverId);
    if (!s.enabled || !s.spawnEnabled) return res.status(403).json({ error: "SPAWN_DISABLED" });
    if (s.spawnChannelIds?.length && !s.spawnChannelIds.includes(String(channelId))) return res.status(403).json({ error: "CHANNEL_NOT_ALLOWED" });
    const out = await createSpawn(serverId, channelId);
    if (!out.ok) return fail(res, out);
    res.status(201).json(out);
  } catch (err) { next(err); }
});

router.patch("/game/spawn/:id/message", async (req, res, next) => {
  const { messageId } = req.body || {};
  if (!SNOWFLAKE.test(String(messageId))) return bad(res, "messageId required");
  try {
    await prisma.companionSpawn.update({ where: { id: req.params.id }, data: { messageId: String(messageId) } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/game/spawn/:id/catch", async (req, res, next) => {
  const { userId } = req.body || {};
  if (!SNOWFLAKE.test(String(userId))) return bad(res, "userId required");
  try {
    const out = await catchSpawn(req.params.id, String(userId));
    if (!out.ok) return fail(res, out);
    res.json(out);
  } catch (err) { next(err); }
});

router.get("/game/companions/:serverId/:userId", async (req, res, next) => {
  try { res.json(await listOwned(req.params.serverId, req.params.userId)); } catch (err) { next(err); }
});

router.post("/game/companions/:serverId/:userId/feed", async (req, res, next) => {
  const { ownedId, sparks } = req.body || {};
  if (typeof ownedId !== "string") return bad(res, "ownedId required");
  try {
    const out = await feedCompanion(req.params.serverId, req.params.userId, ownedId, sparks);
    if (!out.ok) return fail(res, out);
    res.json(out);
  } catch (err) { next(err); }
});

router.post("/game/companions/:serverId/:userId/activate", async (req, res, next) => {
  const { ownedId } = req.body || {};
  if (typeof ownedId !== "string") return bad(res, "ownedId required");
  try {
    const out = await activateCompanion(req.params.serverId, req.params.userId, ownedId);
    if (!out.ok) return fail(res, out);
    res.json(out);
  } catch (err) { next(err); }
});

router.post("/game/companions/:serverId/:userId/release", async (req, res, next) => {
  const { ownedId } = req.body || {};
  if (typeof ownedId !== "string") return bad(res, "ownedId required");
  try {
    const out = await releaseCompanion(req.params.serverId, req.params.userId, ownedId);
    if (!out.ok) return fail(res, out);
    res.json(out);
  } catch (err) { next(err); }
});

router.post("/game/trade", async (req, res, next) => {
  const { serverId, fromUserId, toUserId, fromOwnedId, toOwnedId } = req.body || {};
  if (![serverId, fromUserId, toUserId].every((x) => SNOWFLAKE.test(String(x))) || typeof fromOwnedId !== "string" || typeof toOwnedId !== "string") return bad(res, "invalid trade");
  try {
    const out = await proposeTrade(serverId, fromUserId, toUserId, fromOwnedId, toOwnedId);
    if (!out.ok) return fail(res, out);
    res.status(201).json(out);
  } catch (err) { next(err); }
});

router.post("/game/trade/:id/resolve", async (req, res, next) => {
  const { userId, accept } = req.body || {};
  if (!SNOWFLAKE.test(String(userId))) return bad(res, "userId required");
  try {
    const out = await resolveTrade(req.params.id, String(userId), !!accept);
    if (!out.ok) return fail(res, out);
    res.json(out);
  } catch (err) { next(err); }
});

router.get("/game/companion/:id", async (req, res, next) => {
  const c = companionById(req.params.id);
  if (!c) return res.status(404).json({ error: "NOT_FOUND" });
  try { res.json(publicCompanion(c, Number(req.query.stage) || 1, await getCurrentSeason())); } catch (err) { next(err); }
});

export default router;
