// backend/src/routes/panels.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { notifyBot } from "../services/botNotifier.js";
import { validatePremiumFields, getServerTier } from "../lib/premium.js";

const router = Router();

router.use(requireAuth, loadUser);

const PREMIUM_PANEL_LIMIT = 50;
const BASE_PANEL_LIMIT = 1;

// Map of panel fields → premium feature keys, for bulk validation on POST/PUT
const PANEL_PREMIUM_FIELDS = {
  observerRoleIds:      "panel.observerRoles",
  dmOnOpen:             "panel.dmOnOpen",
  dmOnOpenMessage:      "panel.dmOnOpen",
  dmOnClose:            "panel.dmOnClose",
  dmOnCloseMessage:     "panel.dmOnClose",
  closeAskMessage:      "panel.closeAskMessage",
  feedbackEnabled:      "panel.feedbackEnabled",
  inactivityCloseHours: "panel.inactivityAutoClose",
  autoCloseOnLeave:     "panel.autoCloseOnLeave",
  categoryClosedId:     "panel.multipleCategories",
};

// ─── GET /api/panels/:serverId ────────────────────────────────────────────────

router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const panels = await prisma.panel.findMany({
      where: { serverId: req.params.serverId },
      include: { buttons: { include: { form: { select: { id: true, name: true } } } } },
    });
    res.json(panels);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/panels/:serverId ───────────────────────────────────────────────

const createPanelSchema = z.object({
  name: z.string().min(1).max(50),
  title: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
  categoryId: z.string().optional(),
  supportRoleIds: z.array(z.string()).default([]),
  maxOpenPerUser: z.number().int().min(1).max(10).optional(),
  namingTemplate: z.string().optional(),
  // ─── v1.5 TicketTool parity fields ─────────────────────────────────────────
  categoryOpenId:       z.string().optional().nullable(),
  categoryClosedId:     z.string().optional().nullable(),
  logChannelId:         z.string().optional().nullable(),
  transcriptChannelId:  z.string().optional().nullable(),
  channelNamePrefix:    z.string().max(30).optional(),
  counterPadding:       z.number().int().min(1).max(8).optional(),
  welcomeMessage:       z.string().max(4000).optional().nullable(),
  welcomeEmbedColor:    z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  closeAskEnabled:      z.boolean().optional(),
  closeAskMessage:      z.string().max(2000).optional().nullable(),
  dmOnOpen:             z.boolean().optional(),
  dmOnOpenMessage:      z.string().max(2000).optional().nullable(),
  dmOnClose:            z.boolean().optional(),
  dmOnCloseMessage:     z.string().max(2000).optional().nullable(),
  observerRoleIds:      z.array(z.string()).optional(),
  maxOpenPerUserPanel:  z.number().int().min(0).max(100).optional().nullable(),
  buttonStyle:          z.enum(["BUTTON", "DROPDOWN", "THREAD"]).optional(),
  inactivityCloseHours: z.number().int().min(1).max(24 * 30).optional().nullable(),
  autoCloseOnLeave:     z.boolean().optional(),
  feedbackEnabled:      z.boolean().optional(),
  // v1.7 verification gate
  requireVerifiedRoleIds:    z.array(z.string()).optional(),
  verificationDeniedMessage: z.string().max(2000).optional().nullable(),
  // v30 — default priority applied to tickets opened from this panel.
  // Optional so existing dashboard payloads (without the field yet) still pass.
  defaultPriority:      z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  buttons: z.array(z.object({
    label: z.string().min(1).max(80),
    emoji: z.string().optional(),
    style: z.enum(["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"]).optional(),
    formId: z.string().optional(),
  })).min(1).max(5),
});

router.post("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = createPanelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // Enforce panel limits — uses getServerTier() which honors active trial
    const { isPremium } = await getServerTier(req.params.serverId);
    const panelCount = await prisma.panel.count({ where: { serverId: req.params.serverId } });
    const limit = isPremium ? PREMIUM_PANEL_LIMIT : BASE_PANEL_LIMIT;
    if (panelCount >= limit) {
      return res.status(403).json({
        error: `Panel limit reached (${limit}). ${!isPremium ? "Upgrade to Premium for unlimited panels." : ""}`,
        code: "LIMIT_REACHED",
      });
    }

    // Validate premium-only fields
    const premErr = await validatePremiumFields(req.params.serverId, parsed.data, PANEL_PREMIUM_FIELDS);
    if (premErr) return res.status(premErr.status).json(premErr.body);

    const { buttons, ...rest } = parsed.data;

    const panel = await prisma.panel.create({
      data: {
        serverId: req.params.serverId,
        ...rest,
        buttons: {
          create: buttons.map((b) => ({
            label: b.label,
            emoji: b.emoji,
            style: b.style || "PRIMARY",
            formId: b.formId || null,
          })),
        },
      },
      include: { buttons: true },
    });

    await logAudit(req.user.id, req.params.serverId, "PANEL_CREATED", panel.id, { name: panel.name });
    res.status(201).json(panel);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/panels/:serverId/:panelId ───────────────────────────────────────

router.put("/:serverId/:panelId", requireServerAdmin, async (req, res, next) => {
  try {
    if (!(await panelBelongsToServer(req))) return res.status(404).json({ error: "Panel not found" });
    const parsed = createPanelSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Validate premium-only fields
    const premErr = await validatePremiumFields(req.params.serverId, parsed.data, PANEL_PREMIUM_FIELDS);
    if (premErr) return res.status(premErr.status).json(premErr.body);

    const { buttons, ...rest } = parsed.data;

    const panel = await prisma.panel.update({
      where: { id: req.params.panelId },
      data: {
        ...rest,
        ...(buttons && {
          buttons: {
            deleteMany: {},
            create: buttons.map((b) => ({
              label: b.label,
              emoji: b.emoji,
              style: b.style || "PRIMARY",
              formId: b.formId || null,
            })),
          },
        }),
      },
      include: { buttons: true },
    });

    // If panel is already spawned in Discord, push live update via bot
    if (panel.messageId && panel.channelId) {
      await notifyBot("PANEL_UPDATE", { panelId: panel.id, serverId: req.params.serverId });
    }

    res.json(panel);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/panels/:serverId/:panelId ────────────────────────────────────

router.delete("/:serverId/:panelId", requireServerAdmin, async (req, res, next) => {
  try {
    if (!(await panelBelongsToServer(req))) return res.status(404).json({ error: "Panel not found" });
    await prisma.panel.delete({ where: { id: req.params.panelId } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/panels/:serverId/:panelId/spawn ────────────────────────────────
// Tell the bot to post (or re-post) this panel in a Discord channel

router.post("/:serverId/:panelId/spawn", requireServerAdmin, async (req, res, next) => {
  const { channelId } = req.body;
  if (!channelId) return res.status(400).json({ error: "channelId required" });

  try {
    if (!(await panelBelongsToServer(req))) return res.status(404).json({ error: "Panel not found" });
    const result = await notifyBot("PANEL_SPAWN", {
      panelId: req.params.panelId,
      serverId: req.params.serverId,
      channelId,
    });

    if (!result?.channelId) {
      return res.status(502).json({ error: "Bot is offline or failed to spawn the panel. Try again shortly." });
    }

    await prisma.panel.update({
      where: { id: req.params.panelId },
      data: { channelId: result.channelId, messageId: result.messageId },
    });

    res.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    next(err);
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

// Guards against cross-server access: the panelId in the URL must belong to
// the serverId the caller was authorized for by requireServerAdmin.
async function panelBelongsToServer(req) {
  const panel = await prisma.panel.findFirst({
    where: { id: req.params.panelId, serverId: req.params.serverId },
    select: { id: true },
  });
  return !!panel;
}

async function logAudit(actorId, serverId, action, targetId, metadata) {
  await prisma.auditLog.create({ data: { actorId, serverId, action, targetId, metadata } });
}

export default router;
