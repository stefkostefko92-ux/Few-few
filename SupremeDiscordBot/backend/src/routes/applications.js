// backend/src/routes/applications.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin, requireBotSecret } from "../middleware/auth.js";
import { notifyBot } from "../services/botNotifier.js";
import { buildTranscript } from "../lib/appTranscript.js";
import { getServerTier, sanitizeFormForTier } from "../lib/premium.js";
// POST /submit реферираше submitApplication без да го внася → ReferenceError
// (латентен 500). Ботът днес вика каноничния /api/bot/application/submit, значи
// маршрутът е резервен, но счупен резерв е по-лош от никакъв. Един източник.
import { submitApplication } from "../services/applicationSubmit.js";

const router = Router();

// ─── POST /api/applications/submit ──────────────────────────────────────────
// MUST be before /:serverId to avoid route conflict
// Called by the Discord bot (uses x-bot-secret header, NOT user session)
//
// v1.4 additions (appy.bot parity):
//   - Check cooldownSeconds / maxSubmissions / closedAt on the form
//   - Ping pingRoleIds in the review channel
//   - Track submission count in form_cooldowns

router.post("/submit", requireBotSecret, async (req, res, next) => {
  try {
    // Правилата живеят в services/applicationSubmit.js — ЕДИН източник и за
    // уеб пътя, и за бота. Копие тук би дрейфнало (както се случи веднъж:
    // ботът викаше друг маршрут и минаваше БЕЗ проверки).
    const r = await submitApplication(req.body);
    if (!r.ok) {
      return res.status(r.status).json({
        error: r.error,
        ...(r.code && { code: r.code }),
        ...(r.remainingSeconds != null && { remainingSeconds: r.remainingSeconds }),
      });
    }
    res.status(201).json({ ...r.application, pingRoleIds: r.pingRoleIds });
  } catch (err) {
    next(err);
  }
});


// ─── GET /api/applications/:serverId ─────────────────────────────────────────────

router.get("/:serverId", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  const { status, formId, search } = req.query;
  // Клампваме page/limit (клиентски `limit` беше неограничен `take`).
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const page = Math.max(1, Number(req.query.page) || 1);

  try {
    const where = {
      serverId: req.params.serverId,
      ...(status && { status }),
      ...(formId && { formId }),
      ...(search && {
        OR: [
          { id: { contains: search } },
          { user: { username: { contains: search, mode: "insensitive" } } },
        ],
      }),
    };

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          form: { select: { name: true } },
          user: { select: { id: true, username: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.application.count({ where }),
    ]);

    res.json({ applications, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/applications/:serverId/:appId ───────────────────────────────────

router.get("/:serverId/:appId", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.appId, serverId: req.params.serverId },
      include: {
        form: { include: { questions: { orderBy: { order: "asc" } } } },
        user: true,
        ticket: true,
      },
    });

    if (!app) return res.status(404).json({ error: "Application not found" });
    res.json(app);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/applications/:serverId/:appId/review ───────────────────────────
// Approve or deny an application

router.post("/:serverId/:appId/review", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  const { action, note } = req.body; // action: approve | deny

  if (!["approve", "deny"].includes(action)) {
    return res.status(400).json({ error: "action must be approve or deny" });
  }

  try {
    const application = await prisma.application.findFirst({
      where: { id: req.params.appId, serverId: req.params.serverId },
      include: {
        form: { include: { questions: { orderBy: { order: "asc" } } } },
        user: true,
      },
    });

    if (!application) return res.status(404).json({ error: "Application not found" });
    if (application.status !== "PENDING") {
      return res.status(400).json({ error: "Application already reviewed" });
    }

    const statusMap = { approve: "APPROVED", deny: "DENIED" };

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: {
        status: statusMap[action],
        reviewerId: req.user.id,
        reviewNote: note,
      },
    });

    // ─── Role application + always-DM notification ──────────────────────────
    // Applies to approve and deny. Users ALWAYS get a DM notification,
    // even if no custom acceptMessage/denyMessage is configured.
    // Същият гейт като по ботовия път: авто-ролите и персонализираните DM-и са
    // платени функции (`form.autoRoleOnReview`, `form.customDmMessages`), а се
    // четяха сурови от базата. Свален сървър продължаваше да ги изпълнява.
    // (Червен екип, кръг 2, 07.08.2026)
    const { plan } = await getServerTier(application.serverId);
    const form = sanitizeFormForTier(application.form, plan);
    if (action === "approve" || action === "deny") {
      const rolesToAdd    = action === "approve" ? (form.acceptRoleIds || []) : (form.denyRoleIds || []);
      const rolesToRemove = action === "approve" ? (form.removeRoleIds || []) : [];
      const customMessage = action === "approve" ? form.acceptMessage : form.denyMessage;

      // Build DM message: custom template if set, otherwise default with reason
      let dmMessage;
      if (customMessage) {
        dmMessage = interpolate(customMessage, { user: application.user, server: req.params.serverId, note });
      } else {
        const statusEmoji = action === "approve" ? "✅" : "❌";
        const statusWord  = action === "approve" ? "approved" : "denied";
        dmMessage = `${statusEmoji} Your application to **${form.name}** has been ${statusWord}.`;
        if (note) dmMessage += `\n\n**Reason from staff:**\n> ${note.split("\n").join("\n> ")}`;
      }

      // Always fire — user gets DM even without roles
      notifyBot("APPLICATION_APPLY_OUTCOME", {
        serverId:    req.params.serverId,
        userId:      application.userId,
        rolesToAdd,
        rolesToRemove,
        dmMessage,
        action,
      }).catch((e) => console.warn("[applications] apply-outcome failed:", e.message));
    }

    // Notify bot to update the review embed in Discord
    if (application.reviewMessageId && application.reviewChannelId) {
      await notifyBot("APPLICATION_REVIEWED", {
        serverId: req.params.serverId,
        applicationId: application.id,
        action,
        reviewMessageId: application.reviewMessageId,
        reviewChannelId: application.reviewChannelId,
        reviewerTag: req.user.username,
        note,
      });
    }

    // ─── Auto-post application transcript to configured channel ──────────────
    if (form.transcriptChannelId) {
      const transcript = buildTranscript(form.questions, application.answers);
      notifyBot("APPLICATION_TRANSCRIPT", {
        serverId: req.params.serverId,
        channelId: form.transcriptChannelId,
        applicationId: application.id,
        formName: form.name,
        applicantId: application.userId,
        applicantTag: application.user?.username || "Unknown",
        action,
        reviewerTag: req.user.username,
        reviewerId: req.user.id,
        note,
        transcript,
      }).catch((e) => console.warn("[applications] transcript post failed:", e.message));
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: `APPLICATION_${statusMap[action]}`,
        targetId: application.id,
        metadata: { note },
      },
    });

    // v1.8 — fire webhook
    const { fireWebhooks } = await import("../services/webhooks.js");
    const eventName = action === "approve" ? "APPLICATION_APPROVED"
                    : action === "deny"    ? "APPLICATION_DENIED"
                    : "APPLICATION_SUBMITTED";
    fireWebhooks(req.params.serverId, eventName, {
      applicationId: application.id,
      formId: application.formId,
      userId: application.userId,
      reviewerId: req.user.id,
      note,
    }).catch(() => {});

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Simple placeholder interpolation for accept/deny DM templates.
// Supports: {user}, {username}, {server}, {note}
function interpolate(template, { user, server, note }) {
  if (!template) return null;
  return template
    .replaceAll("{user}",     user?.username ? `<@${user.id}>` : "")
    .replaceAll("{username}", user?.username || "")
    .replaceAll("{server}",   server || "")
    .replaceAll("{note}",     note || "");
}

// ─── DELETE /api/applications/:serverId/:appId ────────────────────────────────
// Deletes a single application. If it's linked to a ticket (INTERVIEW status),
// the ticket's applicationId is nulled first to avoid FK violation.

router.delete("/:serverId/:appId", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.appId, serverId: req.params.serverId },
      include: { ticket: true },
    });
    if (!app) return res.status(404).json({ error: "Application not found" });

    // Cascade: null out ticket.applicationId first (FK is SetNull but we're being explicit)
    if (app.ticket) {
      await prisma.ticket.update({
        where: { id: app.ticket.id },
        data: { applicationId: null },
      });
    }

    await prisma.application.delete({ where: { id: app.id } });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "APPLICATION_DELETED",
        targetId: app.id,
        metadata: { status: app.status, userId: app.userId, formId: app.formId },
      },
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /api/applications/:serverId/bulk-delete ─────────────────────────────
// Batch delete by status, form, or age. Useful for cleanup.
router.post("/:serverId/bulk-delete", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  const { status, formId, olderThanDays } = req.body || {};
  const where = { serverId: req.params.serverId };

  if (status && ["PENDING", "APPROVED", "DENIED", "INTERVIEW"].includes(status)) {
    where.status = status;
  }
  if (formId) where.formId = formId;
  if (olderThanDays && Number.isFinite(Number(olderThanDays))) {
    where.createdAt = { lt: new Date(Date.now() - Number(olderThanDays) * 24 * 60 * 60 * 1000) };
  }

  // Refuse if no filter — prevents accidental nuke
  if (!status && !formId && !olderThanDays) {
    return res.status(400).json({ error: "Provide at least one filter: status, formId, or olderThanDays" });
  }

  try {
    // Null out ticket refs first
    await prisma.ticket.updateMany({
      where: {
        serverId: req.params.serverId,
        applicationId: { not: null },
        application: where,
      },
      data: { applicationId: null },
    }).catch(() => {});

    const deleted = await prisma.application.deleteMany({ where });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "APPLICATION_BULK_DELETED",
        targetId: req.params.serverId,
        metadata: { count: deleted.count, filter: { status, formId, olderThanDays } },
      },
    }).catch(() => {});

    res.json({ deleted: deleted.count });
  } catch (err) { next(err); }
});


// ─── POST /api/applications/:serverId/:appId/discuss ───────────────────────
// Opens a private Discord channel between the applicant and reviewer(s)
// BEFORE approve/deny decision. Application status stays PENDING.
// Channel permissions: hidden from @everyone, visible to applicant + staff.

router.post("/:serverId/:appId/discuss", requireAuth, loadUser, requireServerAdmin, async (req, res, next) => {
  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.appId, serverId: req.params.serverId },
      include: {
        form: { include: { questions: { orderBy: { order: "asc" } } } },
        user: true,
      },
    });
    if (!app) return res.status(404).json({ error: "Application not found" });

    // Идемпотентност: Ticket.applicationId е @unique → само ЕДИН тикет на
    // кандидатура. Търсим БЕЗ статус филтър — затворен тикет иначе не се хваща,
    // ботът прави канал, а create гърми с P2002 (осиротял канал). Активен →
    // връщаме канала; затворен → 409 (не пресъздаваме). (Кодаджията)
    const existingTicket = await prisma.ticket.findUnique({
      where: { applicationId: app.id },
    });
    if (existingTicket) {
      if (["CLOSED", "ARCHIVED"].includes(existingTicket.status)) {
        return res.status(409).json({
          error: "A discussion was already opened for this application (the channel was closed).",
          code: "DISCUSSION_ALREADY_CLOSED",
        });
      }
      return res.json({
        ok: true,
        alreadyExists: true,
        channelId: existingTicket.channelId,
        ticketId: existingTicket.id,
      });
    }

    const transcript = buildTranscript(app.form.questions, app.answers);

    // Let bot create the channel
    const botResult = await notifyBot("APPLICATION_DISCUSS", {
      serverId: req.params.serverId,
      applicantId: app.userId,
      applicantTag: app.user?.username || "applicant",
      reviewerId: req.user.id,
      reviewerTag: req.user.username,
      applicationId: app.id,
      formName: app.form.name,
      managerRoleIds: app.form.managerRoleIds || [],
      discussCategoryId: app.form.discussCategoryId || null, // v34 — фиксирана категория
      transcript,
    });

    if (!botResult?.ok || !botResult?.channelId) {
      return res.status(502).json({
        error: botResult?.error || "Bot failed to create discussion channel",
      });
    }

    // Create a ticket record linking to the application
    const ticket = await prisma.ticket.create({
      data: {
        serverId: req.params.serverId,
        creatorId: app.userId,
        applicationId: app.id,
        channelId: botResult.channelId,
        status: "OPEN",
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "APPLICATION_DISCUSSION_STARTED",
        targetId: app.id,
        metadata: { channelId: botResult.channelId, ticketId: ticket.id },
      },
    }).catch(() => {});

    res.json({ ok: true, channelId: botResult.channelId, ticketId: ticket.id });
  } catch (err) { next(err); }
});


export default router;
