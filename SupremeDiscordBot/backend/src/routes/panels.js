// backend/src/routes/panels.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { notifyBot } from "../services/botNotifier.js";
import { validatePremiumFields, getServerTier } from "../lib/premium.js";
import { createWithinLimit } from "../lib/withinLimit.js";

const router = Router();

// Cross-tenant guard за button.formId: връща { status, body } при референс към
// форма извън сървъра, иначе null. Ползва се в create и update.
async function assertFormsOwned(buttons, serverId) {
  const ids = [...new Set((buttons || []).map((b) => b.formId).filter(Boolean))];
  if (!ids.length) return null;
  const owned = await prisma.form.count({ where: { id: { in: ids }, serverId } });
  if (owned !== ids.length) {
    return { status: 400, body: { error: "A button references a form that doesn't belong to this server." } };
  }
  return null;
}

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
  slaFirstResponseMinutes: "panel.sla",
  slaResolutionMinutes:    "panel.sla",
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
  // v31 — SLA targets in minutes (Premium). null clears/disables; max 20160 = 2 weeks.
  slaFirstResponseMinutes: z.number().int().positive().max(20160).optional().nullable(),
  slaResolutionMinutes:    z.number().int().positive().max(20160).optional().nullable(),
  // До 25 опции: Discord позволява 25 в падащо меню (DROPDOWN) и 25 бутона
  // (5 реда × 5). Ботът вече реди бутоните по редове — виж utils/embed.js.
  buttons: z.array(z.object({
    label: z.string().min(1).max(80),
    emoji: z.string().optional(),
    style: z.enum(["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"]).optional(),
    formId: z.string().optional(),
  })).min(1).max(25),
});

router.post("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = createPanelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // Enforce panel limits — uses getServerTier() which honors active trial.
    // Самото броене+създаване е АТОМАРНО (виж lib/withinLimit.js): досега между
    // count() и create() нямаше нищо и две едновременни заявки минаваха и двете.
    const { isPremium } = await getServerTier(req.params.serverId);
    const limit = isPremium ? PREMIUM_PANEL_LIMIT : BASE_PANEL_LIMIT;

    // Validate premium-only fields
    const premErr = await validatePremiumFields(req.params.serverId, parsed.data, PANEL_PREMIUM_FIELDS);
    if (premErr) return res.status(premErr.status).json(premErr.body);

    // Cross-tenant guard (F6): button.formId трябва да е форма на ТОЗИ сървър.
    const formErr = await assertFormsOwned(parsed.data.buttons, req.params.serverId);
    if (formErr) return res.status(formErr.status).json(formErr.body);

    const { buttons, ...rest } = parsed.data;

    const created = await createWithinLimit({
      model: "panel",
      where: { serverId: req.params.serverId },
      limit,
      create: (tx) => tx.panel.create({
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
      }),
    });

    if (!created.ok) {
      return res.status(403).json({
        error: `Panel limit reached (${limit}). ${!isPremium ? "Upgrade to Premium for unlimited panels." : ""}`,
        code: "LIMIT_REACHED",
      });
    }
    const panel = created.row;

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

    // Cross-tenant guard (F6): button.formId трябва да е форма на ТОЗИ сървър.
    const formErr = await assertFormsOwned(parsed.data.buttons, req.params.serverId);
    if (formErr) return res.status(formErr.status).json(formErr.body);

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

// ─── POST /api/panels/:serverId/spawn-group ───────────────────────────────────
// Публикува НЯКОЛКО панела като ЕДНО съобщение (до 10 embed-а / 5 реда
// компоненти — таваните на Discord). Всички получават общ messageId, така че
// последваща редакция пресглобява цялото съобщение (виж /bot/panel siblings).
const spawnGroupSchema = z.object({
  channelId: z.string().regex(/^\d{17,20}$/, "Invalid Discord channel ID"),
  panelIds: z.array(z.string()).min(2, "Pick at least two panels").max(10),
  // Как изглежда групата в Discord:
  //   DROPDOWN — всички опции в ЕДНО падащо меню
  //   BUTTONS  — всички опции като общи бутони
  //   STACK    — отделен блок за всеки панел (заварено поведение)
  mode: z.enum(["DROPDOWN", "BUTTONS", "STACK"]).default("DROPDOWN"),
});

router.post("/:serverId/spawn-group", requireServerAdmin, async (req, res, next) => {
  const parsed = spawnGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid payload" });
  }
  const { channelId, panelIds, mode } = parsed.data;

  try {
    // Multi-tenant: ВСИЧКИ панели трябва да са на ТОЗИ сървър — клиентът подава
    // списък от id-та, значи е недоверен вход (cross-tenant IDOR иначе).
    const panels = await prisma.panel.findMany({
      where: { id: { in: panelIds }, serverId: req.params.serverId },
      include: { buttons: { include: { form: { include: { questions: { orderBy: { order: "asc" } } } } } } },
    });
    if (panels.length !== panelIds.length) {
      return res.status(404).json({ error: "One or more panels not found on this server" });
    }
    // Пази реда, който потребителят е избрал (findMany не го гарантира).
    const ordered = panelIds.map((id) => panels.find((p) => p.id === id));

    const result = await notifyBot("MULTI_PANEL_SPAWN", {
      panels: ordered,
      serverId: req.params.serverId,
      channelId,
      mode,
    });
    if (!result?.messageId) {
      return res.status(502).json({ error: "Bot is offline or failed to post the panels. Try again shortly." });
    }

    // Записваме позицията, за да е стабилен редът при по-късна редакция
    // (иначе съседите се подреждаха по createdAt и групата се разбъркваше).
    // updateMany е скоупнат и по serverId — multi-tenant правилото важи и за
    // вътрешни списъци, не само за клиентски подадени id-та.
    const posted = result.posted || [];
    await prisma.$transaction(
      posted.map((id, idx) => prisma.panel.update({
        where: { id },
        data: { channelId: result.channelId, messageId: result.messageId, groupOrder: idx, groupMode: mode },
      }))
    );
    // Панелите, които ботът е прескочил, НЕ бива да носят този messageId —
    // иначе остават сираци, сочещи съобщение, в което ги няма.
    const skippedIds = (result.skipped || []).map((x) => x.id).filter(Boolean);
    if (skippedIds.length) {
      await prisma.panel.updateMany({
        where: { id: { in: skippedIds }, serverId: req.params.serverId },
        data: { messageId: null, groupOrder: null, groupMode: null },
      });
    }

    res.json({
      ok: true,
      messageId: result.messageId,
      posted: result.posted?.length || 0,
      skipped: result.skipped || [],
    });
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
