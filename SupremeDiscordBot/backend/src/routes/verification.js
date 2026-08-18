// backend/src/routes/verification.js
// CRUD + spawn for Verification Panels. The `/verify` endpoint is called by the
// bot when a user clicks/submits a verification challenge.

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin, requireBotSecret } from "../middleware/auth.js";
import { notifyBot, notifyBotVerbose } from "../services/botNotifier.js";
import { check, recordFailure, recordSuccess } from "../lib/bruteForce.js";
import { validatePremiumFields, getServerTier, planHasFeature } from "../lib/premium.js";
import { createWithinLimit } from "../lib/withinLimit.js";

const router = Router();

// ── Public-to-bot endpoint (x-bot-secret) ──────────────────────────────────
// MUST be defined before the requireAuth middleware so the bot can call it
// without a session cookie.

// GET /api/verification/bot/:panelId — bot loads full panel config + recent attempt counts
router.get("/bot/:panelId", requireBotSecret, async (req, res, next) => {
  try {
    const panel = await prisma.verificationPanel.findUnique({
      where: { id: req.params.panelId },
    });
    if (!panel) return res.status(404).json({ error: "Verification panel not found" });
    // БЕЗ tier санитизация тук — верификацията е защитна функция и НЕ се
    // сваля при изтекъл план. Досега MATH падаше до BUTTON, а възрастовият
    // праг се нулираше: анти-рейд защитата отслабваше тихо точно когато
    // клиентът спре да плаща, а вредата падаше върху членовете. Виж
    // бележката в lib/premium.js.
    res.json(panel);
  } catch (err) { next(err); }
});

// POST /api/verification/bot/:panelId/attempt — log attempt + gate check + apply roles
router.post("/bot/:panelId/attempt", requireBotSecret, async (req, res, next) => {
  const { userId, success, answer } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const panel = await prisma.verificationPanel.findUnique({
      where: { id: req.params.panelId },
    });
    if (!panel) return res.status(404).json({ error: "Verification panel not found" });

    // Check rate limit — count attempts in the last cooldownMinutes
    const since = new Date(Date.now() - panel.cooldownMinutes * 60 * 1000);
    const recentAttempts = await prisma.verificationAttempt.count({
      where: {
        verificationPanelId: panel.id,
        userId,
        createdAt: { gte: since },
      },
    });
    // Обхватът е ПО СЪРВЪР. Общият брояч в стълбата движи адаптивното
    // затягане; ако обхватът беше просто „verify", един член, който спами
    // своя сървър, би свил праговете за верификация на ВСИЧКИ наематели —
    // cross-tenant griefing. (Червен екип, 12.08.2026)
    const vScope = `verify:${panel.serverId}`;
    const vKey = `${panel.id}:${userId}`;

    if (recentAttempts >= panel.maxAttempts) {
      // ВАЖНО: тук НЕ броим провал. Опитът дори не е оценяван — отказваме го
      // заради изчерпан лимит. Броенето тук даваше на нападателя безплатен
      // лост: вече блокиран, той продължаваше да помпи брояча с всяка заявка.
      // Стълбата се храни само от РЕАЛНО оценени провали (по-долу).
      const esc = await check(vScope, vKey);
      const waitMinutes = esc.blocked
        ? Math.max(panel.cooldownMinutes, Math.ceil(esc.retryAfterSec / 60))
        : panel.cooldownMinutes;
      return res.status(429).json({
        error: `Too many attempts. Please wait ${waitMinutes} minutes before trying again.`,
        code: "VERIFICATION_COOLDOWN",
        cooldownMinutes: waitMinutes,
      });
    }

    // Ескалиралата блокировка важи и ПРЕДИ да се изчерпи прозорецът: иначе
    // нападателят би получавал нови 5 опита на всеки cooldown, вечно.
    const escalated = await check(vScope, vKey);
    if (escalated.blocked) {
      return res.status(429).json({
        error: `Too many attempts. Please wait ${Math.ceil(escalated.retryAfterSec / 60)} minutes before trying again.`,
        code: "VERIFICATION_COOLDOWN",
        cooldownMinutes: Math.ceil(escalated.retryAfterSec / 60),
      });
    }

    // Record attempt
    // Успешна верификация чисти ескалацията — човек, който е сбъркал няколко
    // пъти и после е решил задачата, не бива да носи наказание.
    if (success) await recordSuccess(vScope, vKey);
    else await recordFailure(vScope, vKey);

    await prisma.verificationAttempt.create({
      data: {
        verificationPanelId: panel.id,
        userId,
        success: Boolean(success),
        answer: answer ? String(answer).slice(0, 100) : null,
      },
    });

    // Update panel stats
    await prisma.verificationPanel.update({
      where: { id: panel.id },
      data: {
        successCount: success ? { increment: 1 } : undefined,
        failCount: !success ? { increment: 1 } : undefined,
      },
    });

    res.json({
      ok: true,
      success: Boolean(success),
      grantRoleIds: success ? (panel.grantRoleIds || []) : [],
      removeRoleIds: success ? (panel.removeRoleIds || []) : [],
      successMessage: success ? panel.successMessage : null,
      failureMessage: !success ? panel.failureMessage : null,
      dmSuccess: success && panel.dmOnSuccess ? panel.dmSuccessMessage : null,
      logChannelId: panel.logChannelId,
    });
  } catch (err) { next(err); }
});

// ── Admin endpoints (session auth) ────────────────────────────────────────
router.use(requireAuth, loadUser);

const createSchema = z.object({
  name:        z.string().min(1).max(50),
  title:       z.string().min(1).max(256),
  description: z.string().max(2000).optional().nullable(),
  color:       z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  imageUrl:    z.string().url().optional().or(z.literal("")),
  thumbnailUrl:z.string().url().optional().or(z.literal("")),
  type:        z.enum(["BUTTON", "MATH", "REACTION"]).optional(),
  buttonLabel: z.string().max(80).optional(),
  buttonEmoji: z.string().max(20).optional().or(z.literal("")),
  buttonStyle: z.enum(["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"]).optional(),
  successMessage: z.string().max(2000).optional().nullable(),
  failureMessage: z.string().max(2000).optional().nullable(),
  mathDifficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  grantRoleIds:   z.array(z.string()).optional(),
  removeRoleIds:  z.array(z.string()).optional(),
  minAccountAgeDays: z.number().int().min(0).max(3650).optional().nullable(),
  logChannelId: z.string().optional().nullable(),
  dmOnSuccess:  z.boolean().optional(),
  dmSuccessMessage: z.string().max(2000).optional().nullable(),
  maxAttempts:  z.number().int().min(1).max(100).optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
});

// GET /api/verification/:serverId — list all verification panels
router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const panels = await prisma.verificationPanel.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { createdAt: "desc" },
    });
    res.json(panels);
  } catch (err) { next(err); }
});

// POST /api/verification/:serverId — create
router.post("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Premium gates: MATH type + minAccountAgeDays + verification panel count
    const { isPremium, limits } = await getServerTier(req.params.serverId);
    // Атомарно: count+create в една Serializable транзакция (lib/withinLimit.js).
    const created = await createWithinLimit({
      model: "verificationPanel",
      where: { serverId: req.params.serverId },
      limit: limits.verificationPanels,
      create: (tx) => tx.verificationPanel.create({
      data: {
        serverId: req.params.serverId,
        ...parsed.data,
      },
      }),
    });
    if (!created.ok) {
      return res.status(403).json({
        error: `Verification panel limit reached (${limits.verificationPanels}).`,
        code: "LIMIT_REACHED",
      });
    }
    const panel = created.row;

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "VERIFICATION_PANEL_CREATED",
        targetId: panel.id,
        metadata: { name: panel.name, type: panel.type },
      },
    });

    res.status(201).json(panel);
  } catch (err) { next(err); }
});

// PUT /api/verification/:serverId/:panelId — update
router.put("/:serverId/:panelId", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = createSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Same premium gates on update
    const { isPremium } = await getServerTier(req.params.serverId);

    const existing = await prisma.verificationPanel.findFirst({
      where: { id: req.params.panelId, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Verification panel not found" });

    const panel = await prisma.verificationPanel.update({
      where: { id: req.params.panelId },
      data: parsed.data,
    });

    // Live-update spawned message if it exists.
    // Тих провал = „Запазено" в таблото + СТАР панел в Discord (лъжещ успех).
    let botWarning = null;
    if (panel.channelId && panel.messageId) {
      const r = await notifyBotVerbose("VERIFICATION_UPDATE", { panelId: panel.id, serverId: req.params.serverId });
      if (r?.botError) {
        botWarning = `Saved, but the spawned message was not updated: ${String(r.botError).slice(0, 300)}`;
      }
    }

    res.json(botWarning ? { ...panel, botWarning } : panel);
  } catch (err) { next(err); }
});

// DELETE /api/verification/:serverId/:panelId — delete
router.delete("/:serverId/:panelId", requireServerAdmin, async (req, res, next) => {
  try {
    const { count } = await prisma.verificationPanel.deleteMany({
      where: { id: req.params.panelId, serverId: req.params.serverId },
    });
    if (!count) return res.status(404).json({ error: "Verification panel not found" });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "VERIFICATION_PANEL_DELETED",
        targetId: req.params.panelId,
      },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/verification/:serverId/:panelId/spawn — spawn verification panel in Discord channel
router.post("/:serverId/:panelId/spawn", requireServerAdmin, async (req, res, next) => {
  const { channelId } = req.body;
  if (!channelId) return res.status(400).json({ error: "channelId required" });

  try {
    // Cross-tenant IDOR guard: confirm the panel belongs to this server before
    // spawning/updating it (requireServerAdmin only checks the URL serverId).
    const owned = await prisma.verificationPanel.findFirst({
      where: { id: req.params.panelId, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Verification panel not found", code: "NOT_FOUND" });

    const result = await notifyBotVerbose("VERIFICATION_SPAWN", {
      panelId: req.params.panelId,
      serverId: req.params.serverId,
      channelId,
    });

    // Истинската причина от бота, не измислена диагноза (клас „лъжеща грешка").
    if (result?.botError) {
      return res.status(502).json({
        error: `The bot could not post the panel: ${String(result.botError).slice(0, 300)}`,
      });
    }
    if (result?.error) return res.status(400).json({ error: result.error });
    if (!result?.messageId) return res.status(502).json({ error: "Bot did not respond" });

    await prisma.verificationPanel.update({
      where: { id: req.params.panelId },
      data: { channelId: result.channelId, messageId: result.messageId },
    });

    res.json({ ok: true, channelId: result.channelId, messageId: result.messageId });
  } catch (err) { next(err); }
});

// PATCH /api/verification/bot/:panelId/spawned — bot confirms spawn
router.patch("/bot/:panelId/spawned", requireBotSecret, async (req, res, next) => {
  const { channelId, messageId } = req.body;
  try {
    const panel = await prisma.verificationPanel.update({
      where: { id: req.params.panelId },
      data: { channelId, messageId },
    });
    res.json(panel);
  } catch (err) { next(err); }
});

export default router;
