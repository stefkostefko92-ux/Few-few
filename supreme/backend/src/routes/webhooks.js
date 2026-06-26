// backend/src/routes/webhooks.js
// Admin CRUD for webhooks + panel duplicate endpoint.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { VALID_EVENTS, validateWebhookUrl } from "../services/webhooks.js";
import { requirePremium, getServerTier } from "../lib/premium.js";

const router = Router();
router.use(requireAuth, loadUser);

const schema = z.object({
  name:    z.string().min(1).max(100),
  url:     z.string().url(),
  secret:  z.string().max(200).optional().nullable(),
  enabled: z.boolean().optional(),
  events:  z.array(z.enum(VALID_EVENTS)).min(1),
});

router.get("/:serverId/webhooks", requireServerAdmin, async (req, res, next) => {
  try {
    const hooks = await prisma.webhook.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { createdAt: "desc" },
    });
    res.json(hooks);
  } catch (err) { next(err); }
});

router.post("/:serverId/webhooks", requireServerAdmin, requirePremium("integrations.webhooks"), async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const urlError = await validateWebhookUrl(parsed.data.url);
    if (urlError) return res.status(400).json({ error: urlError });
    const { limits } = await getServerTier(req.params.serverId);
    const existing = await prisma.webhook.count({ where: { serverId: req.params.serverId } });
    if (existing >= limits.webhooks) {
      return res.status(403).json({
        error: `Webhook limit reached (${limits.webhooks}).`,
        code: "LIMIT_REACHED",
      });
    }
    const hook = await prisma.webhook.create({
      data: { ...parsed.data, serverId: req.params.serverId, createdBy: req.user.id },
    });
    res.status(201).json(hook);
  } catch (err) { next(err); }
});

router.put("/:serverId/webhooks/:id", requireServerAdmin, requirePremium("integrations.webhooks"), async (req, res, next) => {
  try {
    const parsed = schema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    if (parsed.data.url) {
      const urlError = await validateWebhookUrl(parsed.data.url);
      if (urlError) return res.status(400).json({ error: urlError });
    }
    const existing = await prisma.webhook.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "Webhook not found" });
    const hook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(hook);
  } catch (err) { next(err); }
});

router.delete("/:serverId/webhooks/:id", requireServerAdmin, async (req, res, next) => {
  try {
    const { count } = await prisma.webhook.deleteMany({
      where: { id: req.params.id, serverId: req.params.serverId },
    });
    if (!count) return res.status(404).json({ error: "Webhook not found" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get("/events", (req, res) => {
  res.json({ events: VALID_EVENTS });
});

// ─── Panel duplicate (v1.8) ─────────────────────────────────────────────────
router.post("/:serverId/panels/:panelId/duplicate", requireServerAdmin, requirePremium("data.panelDuplicate"), async (req, res, next) => {
  try {
    const original = await prisma.panel.findFirst({
      where: { id: req.params.panelId, serverId: req.params.serverId },
      include: { buttons: true },
    });
    if (!original) return res.status(404).json({ error: "Panel not found" });

    // Strip fields we don't want to copy
    const {
      id: _id, createdAt: _c, updatedAt: _u,
      channelId: _ch, messageId: _msg, ticketCounter: _tc,
      buttons, ...rest
    } = original;

    const duplicate = await prisma.panel.create({
      data: {
        ...rest,
        name: `${original.name} (copy)`,
        ticketCounter: 0,
        buttons: {
          create: buttons.map((b) => ({
            label: b.label,
            emoji: b.emoji,
            style: b.style,
            formId: b.formId,
          })),
        },
      },
      include: { buttons: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "PANEL_DUPLICATED",
        targetId: duplicate.id,
        metadata: { sourceId: original.id },
      },
    });

    res.status(201).json(duplicate);
  } catch (err) { next(err); }
});

export default router;
