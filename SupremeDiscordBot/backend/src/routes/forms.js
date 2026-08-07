// backend/src/routes/forms.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { validatePremiumFields, getServerTier } from "../lib/premium.js";
import { notifyBot } from "../services/botNotifier.js";
import { createWithinLimit } from "../lib/withinLimit.js";

// ─── Premium field map ──────────────────────────────────────────────────────
const FORM_PREMIUM_FIELDS = {
  acceptRoleIds:   "form.autoRoleOnReview",
  denyRoleIds:     "form.autoRoleOnReview",
  removeRoleIds:   "form.autoRoleOnReview",
  acceptMessage:   "form.customDmMessages",
  denyMessage:     "form.customDmMessages",
  cooldownSeconds: "form.cooldowns",
  maxSubmissions:  "form.cooldowns",
};

const QUESTION_PREMIUM_FIELDS = {
  validationRegex:   "form.validationRegex",
  validationMessage: "form.validationRegex",
  branches:          "form.conditionalBranching",
};

const router = Router();

router.use(requireAuth, loadUser);

const BASE_FORM_LIMIT = 2;
const BASE_QUESTION_LIMIT = 10;

// ─── GET /api/forms/:serverId ─────────────────────────────────────────────────

router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const forms = await prisma.form.findMany({
      where: { serverId: req.params.serverId },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    res.json(forms);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/forms/:serverId/:formId ─────────────────────────────────────────

router.get("/:serverId/:formId", requireServerAdmin, async (req, res, next) => {
  try {
    const form = await prisma.form.findFirst({
      where: { id: req.params.formId, serverId: req.params.serverId },
      include: { questions: { orderBy: { order: "asc" } } },
    });
    if (!form) return res.status(404).json({ error: "Form not found" });
    res.json(form);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/forms/:serverId ────────────────────────────────────────────────

const questionSchema = z.object({
  label: z.string().min(1).max(300),
  placeholder: z.string().max(300).optional(),
  type: z.enum(["SHORT_TEXT", "PARAGRAPH", "SELECT", "MULTI_SELECT", "NUMBER"]).default("SHORT_TEXT"),
  required: z.boolean().default(true),
  minLength: z.number().int().optional(),
  maxLength: z.number().int().optional(),
  choices: z.array(z.string()).optional(),
  // branches: { "choice_value": "next_question_index" }
  branches: z.record(z.string()).optional(),
  // Appy.bot-style regex validation
  validationRegex:   z.string().max(500).optional().nullable(),
  validationMessage: z.string().max(500).optional().nullable(),
});

const createFormSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isApplication: z.boolean().default(false),
  reviewChannelId: z.string().optional(),
  transcriptChannelId: z.string().optional(),
  // v34 — Discord категория за discuss каналите (празно = авто-избор по име)
  discussCategoryId: z.string().optional(),
  // Appy.bot-style fields — all optional, backward-compatible
  acceptRoleIds:   z.array(z.string()).optional(),
  denyRoleIds:     z.array(z.string()).optional(),
  removeRoleIds:   z.array(z.string()).optional(),
  managerRoleIds:  z.array(z.string()).optional(),
  pingRoleIds:     z.array(z.string()).optional(),
  acceptMessage:   z.string().max(2000).optional().nullable(),
  denyMessage:     z.string().max(2000).optional().nullable(),
  cooldownSeconds: z.number().int().min(0).max(86400 * 30).optional(),
  maxSubmissions:  z.number().int().min(0).optional().nullable(),
  closed:          z.boolean().optional(),
  requireVerification: z.boolean().optional(),
  questions: z.array(questionSchema).min(1).max(50), // raised from 25 → 50 for Premium
});

router.post("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = createFormSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { isPremium, limits } = await getServerTier(req.params.serverId);

    // Count limits
    // Броенето и създаването са АТОМАРНИ (lib/withinLimit.js) — виж бележката там.
    if (parsed.data.questions.length > limits.questionsPerForm) {
      return res.status(403).json({
        error: `Question limit (${limits.questionsPerForm}) exceeded.${!isPremium ? " Upgrade to Premium." : ""}`,
        code: "LIMIT_REACHED",
      });
    }

    // Premium field validation
    if (!isPremium) {
      const formErr = await validatePremiumFields(req.params.serverId, parsed.data, FORM_PREMIUM_FIELDS);
      if (formErr) return res.status(formErr.status).json(formErr.body);

      // Check each question for premium question-level fields
      for (const q of parsed.data.questions) {
        const qErr = await validatePremiumFields(req.params.serverId, q, QUESTION_PREMIUM_FIELDS);
        if (qErr) return res.status(qErr.status).json(qErr.body);
      }
    }

    const { questions, closed, ...rest } = parsed.data;
    // Normalise empty strings to null for optional fields
    if (rest.reviewChannelId === "") rest.reviewChannelId = null;
    if (rest.transcriptChannelId === "") rest.transcriptChannelId = null;
    if (rest.discussCategoryId === "") rest.discussCategoryId = null;
    if (rest.acceptMessage === "") rest.acceptMessage = null;
    if (rest.denyMessage === "") rest.denyMessage = null;

    const created = await createWithinLimit({
      model: "form",
      where: { serverId: req.params.serverId },
      limit: limits.forms,
      create: (tx) => tx.form.create({
      data: {
        serverId: req.params.serverId,
        ...rest,
        closedAt: closed ? new Date() : null,
        questions: {
          create: questions.map((q, i) => ({
            order: i,
            label: q.label,
            placeholder: q.placeholder,
            type: q.type,
            required: q.required,
            minLength: q.minLength,
            maxLength: q.maxLength,
            choices: q.choices || [],
            branches: q.branches || {},
            validationRegex:   q.validationRegex   || null,
            validationMessage: q.validationMessage || null,
          })),
        },
      },
      include: { questions: { orderBy: { order: "asc" } } },
      }),
    });
    if (!created.ok) {
      return res.status(403).json({
        error: `Form limit (${limits.forms}) reached.${!isPremium ? " Upgrade to Premium for 50." : ""}`,
        code: "LIMIT_REACHED",
      });
    }

    res.status(201).json(created.row);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/forms/:serverId/:formId ─────────────────────────────────────────

router.put("/:serverId/:formId", requireServerAdmin, async (req, res, next) => {
  try {
    // Cross-tenant IDOR guard: requireServerAdmin authorizes the caller only for
    // the URL serverId — confirm the form actually belongs to it before mutating
    // (same pattern as the GET handler and panels.js/panelBelongsToServer).
    const owned = await prisma.form.findFirst({
      where: { id: req.params.formId, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Form not found", code: "NOT_FOUND" });

    const parsed = createFormSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const { isPremium, limits } = await getServerTier(req.params.serverId);

    if (parsed.data.questions && parsed.data.questions.length > limits.questionsPerForm) {
      return res.status(403).json({
        error: `Question limit (${limits.questionsPerForm}) exceeded.${!isPremium ? " Upgrade to Premium." : ""}`,
        code: "LIMIT_REACHED",
      });
    }

    if (!isPremium) {
      const formErr = await validatePremiumFields(req.params.serverId, parsed.data, FORM_PREMIUM_FIELDS);
      if (formErr) return res.status(formErr.status).json(formErr.body);
      for (const q of (parsed.data.questions || [])) {
        const qErr = await validatePremiumFields(req.params.serverId, q, QUESTION_PREMIUM_FIELDS);
        if (qErr) return res.status(qErr.status).json(qErr.body);
      }
    }

    const { questions, closed, ...rest } = parsed.data;
    if (rest.reviewChannelId === "") rest.reviewChannelId = null;
    if (rest.transcriptChannelId === "") rest.transcriptChannelId = null;
    if (rest.discussCategoryId === "") rest.discussCategoryId = null;
    if (rest.acceptMessage === "")   rest.acceptMessage   = null;
    if (rest.denyMessage === "")     rest.denyMessage     = null;

    const form = await prisma.form.update({
      where: { id: req.params.formId },
      data: {
        ...rest,
        ...(closed !== undefined && { closedAt: closed ? new Date() : null }),
        ...(questions && {
          questions: {
            deleteMany: {},
            create: questions.map((q, i) => ({
              order: i,
              label: q.label,
              placeholder: q.placeholder,
              type: q.type || "SHORT_TEXT",
              required: q.required ?? true,
              minLength: q.minLength,
              maxLength: q.maxLength,
              choices: q.choices || [],
              branches: q.branches || {},
              validationRegex:   q.validationRegex   || null,
              validationMessage: q.validationMessage || null,
            })),
          },
        }),
      },
      include: { questions: { orderBy: { order: "asc" } } },
    });

    res.json(form);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/forms/:serverId/:formId/spawn ──────────────────────────────────
// Публикува формата като embed + бутон в Discord канал направо от dashboard-а —
// същият пост като /form spawn (customId form_direct:<formId>), само че ботът
// го изпраща по заявка на backend-а (notifyBot → /internal/form-spawn).

const spawnFormSchema = z.object({
  // Discord snowflake — числов низ 17–20 знака
  channelId: z.string().regex(/^\d{17,20}$/, "Invalid Discord channel ID"),
  buttonLabel: z.string().min(1).max(80).optional(), // Discord button label limit
});

router.post("/:serverId/:formId/spawn", requireServerAdmin, async (req, res, next) => {
  try {
    const parsed = spawnFormSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "A valid Discord channel ID is required (17–20 digits)." });
    }

    // Cross-tenant IDOR guard: формата трябва да принадлежи на URL serverId.
    const form = await prisma.form.findFirst({
      where: { id: req.params.formId, serverId: req.params.serverId },
      select: { id: true, name: true, description: true, closedAt: true },
    });
    if (!form) return res.status(404).json({ error: "Form not found", code: "NOT_FOUND" });
    if (form.closedAt) {
      return res.status(409).json({
        error: "This form is closed for submissions. Reopen it before posting.",
        code: "FORM_CLOSED",
      });
    }

    const result = await notifyBot("FORM_SPAWN", {
      serverId: req.params.serverId,
      formId: form.id,
      channelId: parsed.data.channelId,
      formName: form.name,
      formDescription: form.description,
      buttonLabel: parsed.data.buttonLabel,
    });

    if (!result?.messageId) {
      return res.status(502).json({
        error: "Bot is offline or failed to post the form. Check the channel ID and that the bot can write there.",
      });
    }

    res.json({ ok: true, channelId: result.channelId, messageId: result.messageId });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/forms/:serverId/:formId ──────────────────────────────────────

router.delete("/:serverId/:formId", requireServerAdmin, async (req, res, next) => {
  try {
    // Cross-tenant IDOR guard: confirm the form belongs to this server before
    // any count/cascade-delete (requireServerAdmin only checks the URL serverId).
    const owned = await prisma.form.findFirst({
      where: { id: req.params.formId, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!owned) return res.status(404).json({ error: "Form not found", code: "NOT_FOUND" });

    // Check for applications first — forms with submissions shouldn't silently
    // drop user data. If force=true query param, delete applications too.
    const appCount = await prisma.application.count({
      where: { formId: req.params.formId },
    });

    if (appCount > 0 && req.query.force !== "true") {
      return res.status(409).json({
        error: `Form has ${appCount} application submission${appCount === 1 ? "" : "s"}. Delete applications first, or pass ?force=true to remove them too.`,
        code: "FORM_HAS_APPLICATIONS",
        applicationCount: appCount,
      });
    }

    // Cascade delete using interactive transaction — lets us handle
    // optional tables gracefully without breaking the transaction.
    await prisma.$transaction(async (tx) => {
      await tx.application.deleteMany({ where: { formId: req.params.formId } });
      await tx.formCooldown.deleteMany({ where: { formId: req.params.formId } });
      await tx.formQuestion.deleteMany({ where: { formId: req.params.formId } });
      await tx.form.delete({ where: { id: req.params.formId } });
    });

    res.json({ ok: true, applicationsDeleted: appCount });
  } catch (err) {
    next(err);
  }
});

export default router;
