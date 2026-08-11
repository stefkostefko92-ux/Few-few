// backend/src/routes/reactionroles.js
// v33 — Reaction Roles (react → get a role). Dashboard CRUD + spawn.
// Едно съобщение (embed) с до 20 двойки emoji → роля; ботът слуша
// messageReactionAdd/Remove (bot/src/events/) и дава/маха ролята.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { getServerTier } from "../lib/premium.js";
import { notifyBot, notifyBotVerbose } from "../services/botNotifier.js";
import { createWithinLimit } from "../lib/withinLimit.js";

const router = Router();

router.use(requireAuth, loadUser);

// Discord: до 20 реакции на съобщение → до 20 двойки.
const MAX_PAIRS = 20;

const pairSchema = z.object({
  // Unicode emoji ("🎮") или custom emoji "name:123456789012345678"
  emoji: z.string().min(1).max(64),
  roleId: z.string().regex(/^\d{17,20}$/, "Invalid Discord role ID"),
  label: z.string().max(80).optional().nullable(),
});

const rrmSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().max(2000).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#5865F2"),
  exclusive: z.boolean().default(false),
  pairs: z.array(pairSchema).min(1).max(MAX_PAIRS)
    // Дублирано emoji в едно съобщение = двусмислен mapping
    .refine((ps) => new Set(ps.map((p) => p.emoji)).size === ps.length, {
      message: "Duplicate emoji in pairs",
    }),
});

// ─── GET /api/reactionroles/:serverId ────────────────────────────────────────
router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const messages = await prisma.reactionRoleMessage.findMany({
      where: { serverId: req.params.serverId },
      include: { pairs: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/reactionroles/:serverId ───────────────────────────────────────
router.post("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = rrmSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { isPremium, limits } = await getServerTier(req.params.serverId);
    const { pairs, ...rest } = parsed.data;
    // Атомарно count+create (lib/withinLimit.js).
    const created = await createWithinLimit({
      model: "reactionRoleMessage",
      where: { serverId: req.params.serverId },
      limit: limits.reactionRoleMessages,
      create: (tx) => tx.reactionRoleMessage.create({
        data: {
          serverId: req.params.serverId,
          ...rest,
          pairs: { create: pairs.map((p) => ({ emoji: p.emoji, roleId: p.roleId, label: p.label || null })) },
        },
        include: { pairs: true },
      }),
    });
    if (!created.ok) {
      return res.status(403).json({
        error: `Reaction role message limit (${limits.reactionRoleMessages}) reached.${!isPremium ? " Upgrade to Premium for 25." : ""}`,
        code: "LIMIT_REACHED",
      });
    }

    res.status(201).json(created.row);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/reactionroles/:serverId/:id ────────────────────────────────────
router.put("/:serverId/:id", requireServerAdmin, async (req, res, next) => {
  try {
    // Cross-tenant IDOR guard: съобщението трябва да е на URL serverId.
    const owned = await prisma.reactionRoleMessage.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Reaction role message not found", code: "NOT_FOUND" });

    const parsed = rrmSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { pairs, ...rest } = parsed.data;
    const rrm = await prisma.reactionRoleMessage.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(pairs && {
          pairs: {
            deleteMany: {},
            create: pairs.map((p) => ({ emoji: p.emoji, roleId: p.roleId, label: p.label || null })),
          },
        }),
      },
      include: { pairs: true },
    });

    // Ако вече е публикувано в Discord — обнови embed-а и реакциите на живо.
    // Тих провал = „Запазено" в таблото + СТАРО съобщение в Discord (лъжещ
    // успех). Записът е валиден, затова не грешка, а botWarning.
    let botWarning = null;
    if (rrm.channelId && rrm.messageId) {
      const r = await notifyBotVerbose("REACTION_ROLE_UPDATE", { rrmId: rrm.id, serverId: req.params.serverId });
      if (r?.botError) {
        botWarning = `Saved, but the spawned message was not updated: ${String(r.botError).slice(0, 300)}`;
      }
    }

    res.json(botWarning ? { ...rrm, botWarning } : rrm);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/reactionroles/:serverId/:id ─────────────────────────────────
router.delete("/:serverId/:id", requireServerAdmin, async (req, res, next) => {
  try {
    const rrm = await prisma.reactionRoleMessage.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
    });
    if (!rrm) return res.status(404).json({ error: "Reaction role message not found", code: "NOT_FOUND" });

    // Best-effort: изтрий и Discord съобщението (иначе остават мъртви реакции).
    if (rrm.channelId && rrm.messageId) {
      notifyBot("REACTION_ROLE_DELETE", {
        serverId: req.params.serverId,
        channelId: rrm.channelId,
        messageId: rrm.messageId,
      }).catch(() => {});
    }

    await prisma.reactionRoleMessage.delete({ where: { id: rrm.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/reactionroles/:serverId/:id/spawn ─────────────────────────────
// Ботът постанова embed-а в канала и слага началните реакции.
const spawnSchema = z.object({
  channelId: z.string().regex(/^\d{17,20}$/, "Invalid Discord channel ID"),
});

router.post("/:serverId/:id/spawn", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = spawnSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "A valid Discord channel ID is required (17–20 digits)." });
    }

    const owned = await prisma.reactionRoleMessage.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Reaction role message not found", code: "NOT_FOUND" });

    const result = await notifyBotVerbose("REACTION_ROLE_SPAWN", {
      rrmId: req.params.id,
      serverId: req.params.serverId,
      channelId: parsed.data.channelId,
    });

    if (!result?.messageId) {
      // Истинската причина от бота, не измислена диагноза (клас „лъжеща грешка").
      return res.status(502).json({
        error: result?.botError
          ? `The bot could not post the message: ${String(result.botError).slice(0, 300)}`
          : "Bot is offline or failed to post the message. Check the channel ID and that the bot can write there.",
      });
    }

    await prisma.reactionRoleMessage.update({
      where: { id: req.params.id },
      data: { channelId: result.channelId, messageId: result.messageId },
    });

    res.json({ ok: true, channelId: result.channelId, messageId: result.messageId });
  } catch (err) {
    next(err);
  }
});

export default router;
