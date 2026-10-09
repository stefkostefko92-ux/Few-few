// backend/src/routes/bot_minigames.js
// v50 — Server Season, етап 3: endpoint-ите за бота (x-bot-secret) — Counting,
// куестове, trivia. Логиката е в lib/game/{counting,questOps,trivia}.js.
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireBotSecret } from "../middleware/auth.js";
import { applyCount } from "../lib/game/counting.js";
import { activeQuests } from "../lib/game/questOps.js";
import { createRound, answerRound } from "../lib/game/trivia.js";

const router = Router();
router.use(requireBotSecret);
const SNOWFLAKE = /^\d{17,20}$/;
const bad = (res, msg) => res.status(400).json({ error: msg });
const fail = (res, out) => {
  const status = { COUNTING_DISABLED: 403, WRONG_NUMBER: 409, SAME_USER: 409, RACE: 409, GAME_DISABLED: 403, ROUND_OPEN: 409,
    ROUND_NOT_FOUND: 404, ROUND_CLOSED: 410, INVALID_OPTION: 400, ALREADY_ANSWERED: 409 }[out.code] || 400;
  return res.status(status).json({ error: out.code, ...out });
};

// ─── Counting ────────────────────────────────────────────────────────────────
router.post("/game/counting", async (req, res, next) => {
  const { serverId, userId, number } = req.body || {};
  if (!SNOWFLAKE.test(String(serverId)) || !SNOWFLAKE.test(String(userId)) || !Number.isInteger(number) || number < 1) return bad(res, "serverId, userId and integer number required");
  try {
    const out = await applyCount(String(serverId), String(userId), number);
    if (!out.ok) return fail(res, out);
    res.json(out);
  } catch (err) { next(err); }
});

// ─── Куестове ────────────────────────────────────────────────────────────────
router.get("/game/quests/:serverId", async (req, res, next) => {
  const userId = SNOWFLAKE.test(String(req.query.userId || "")) ? String(req.query.userId) : null;
  try { res.json(await activeQuests(req.params.serverId, userId)); } catch (err) { next(err); }
});

router.patch("/game/quest/:questId/message", async (req, res, next) => {
  const { messageId, channelId } = req.body || {};
  if (!SNOWFLAKE.test(String(messageId))) return bad(res, "messageId required");
  try {
    await prisma.serverQuest.update({ where: { id: req.params.questId }, data: { messageId: String(messageId), ...(SNOWFLAKE.test(String(channelId)) ? { channelId: String(channelId) } : {}) } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Trivia ──────────────────────────────────────────────────────────────────
router.post("/game/trivia/start", async (req, res, next) => {
  const { serverId, channelId, source } = req.body || {};
  if (!SNOWFLAKE.test(String(serverId)) || !SNOWFLAKE.test(String(channelId))) return bad(res, "serverId and channelId required");
  try {
    const out = await createRound(String(serverId), String(channelId), { source: source === "KB" ? "KB" : "BANK" });
    if (!out.ok) return fail(res, out);
    res.status(201).json(out);
  } catch (err) { next(err); }
});

router.patch("/game/trivia/:roundId/message", async (req, res, next) => {
  const { messageId } = req.body || {};
  if (!SNOWFLAKE.test(String(messageId))) return bad(res, "messageId required");
  try {
    await prisma.triviaRound.update({ where: { id: req.params.roundId }, data: { messageId: String(messageId) } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/game/trivia/:roundId/answer", async (req, res, next) => {
  const { userId, option, serverId } = req.body || {};
  if (!SNOWFLAKE.test(String(userId)) || !Number.isInteger(option)) return bad(res, "userId and integer option required");
  try {
    // Мулти-тенант: кръгът трябва да е от сървъра на бутона (одит 24.09.2026).
    const round = SNOWFLAKE.test(String(serverId)) ? await prisma.triviaRound.findUnique({ where: { id: req.params.roundId }, select: { serverId: true } }) : null;
    if (!round || round.serverId !== String(serverId)) return fail(res, { code: "ROUND_NOT_FOUND" });
    const out = await answerRound(req.params.roundId, String(userId), option);
    if (!out.ok) return fail(res, out);
    res.json(out);
  } catch (err) { next(err); }
});

export default router;
