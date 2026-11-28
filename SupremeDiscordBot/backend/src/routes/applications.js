// backend/src/routes/applications.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { grantXpOnce, XP_REWARDS } from "../lib/game/xp.js";
import { requireAuth, loadUser, requireServerAdmin, requireBotSecret } from "../middleware/auth.js";
import { notifyBot } from "../services/botNotifier.js";
import { buildTranscript } from "../lib/appTranscript.js";
import { getServerTier, sanitizeFormForTier } from "../lib/premium.js";
// POST /submit реферираше submitApplication без да го внася → ReferenceError
// (латентен 500). Ботът днес вика каноничния /api/bot/application/submit, значи
// маршрутът е резервен, но счупен резерв е по-лош от никакъв. Един източник.
import { submitApplication } from "../services/applicationSubmit.js";
import { ensureUserStub } from "../lib/ensureUser.js";
import { claimApplicationReview, closeApplicationDiscussion, openApplicationDiscussion, requireApplicationReviewer } from "../lib/applicationReview.js";
import { fireApplicationReviewed } from "../lib/webhookEvents.js";

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

    // История на кандидата — предишните му кандидатури В ТОЗИ сървър.
    // Ревюващият вижда „този вече е кандидатствал 3 пъти и е отказван два
    // пъти", вместо да съди всяка кандидатура като първа.
    //
    // ВАЖНО (мултинаемност): скоупът е { serverId, userId } — история от ДРУГ
    // сървър не е наша за показване, дори за същия Discord потребител.
    const HISTORY_CAP = 50;
    const history = await prisma.application.findMany({
      where: {
        serverId: req.params.serverId,
        userId: app.userId,
        id: { not: app.id },            // текущата не е част от историята си
      },
      select: {
        // Няма поле `reviewedAt` — `updatedAt` е моментът на последната
        // промяна, тоест на решението за вече ревюваните.
        id: true, status: true, createdAt: true, updatedAt: true,
        reviewerId: true, reviewNote: true,
        form: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: HISTORY_CAP,
    });

    // Броячите се смятат от изтеглените редове — при таван 50 на кандидат
    // в един сървър това е пълната картина на практика; `truncated` казва
    // честно, ако не е.
    const counts = { PENDING: 0, APPROVED: 0, DENIED: 0 };
    for (const h of history) {
      if (counts[h.status] !== undefined) counts[h.status]++;
    }

    res.json({
      ...app,
      history,
      historyMeta: { total: history.length, counts, truncated: history.length === HISTORY_CAP },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/applications/:serverId/:appId/review ───────────────────────────
// Approve or deny an application

router.post("/:serverId/:appId/review", requireAuth, loadUser, requireApplicationReviewer, async (req, res, next) => {
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
    // Собствената кандидатура решава само човек с Manage Server (червен екип,
    // 13.11.2026): мениджър подаваше в своя формуляр и си я одобряваше сам —
    // взимаше ролите от acceptRoleIds и сваляше изпитателната. Забранен е и
    // отказът: и той раздава и маха роли.
    if (!req.reviewerIsAdmin && String(application.userId) === String(req.user.id)) {
      return res.status(403).json({ error: "You cannot review your own application", code: "SELF_REVIEW" });
    }
    const statusMap = { approve: "APPROVED", deny: "DENIED" };

    // Т6: условен запис по PENDING — вторият ревюър получава 409, роли и ЛС се дават веднъж.
    const won = application.status === "PENDING" && await claimApplicationReview({
      id: application.id, serverId: application.serverId, status: statusMap[action], reviewerId: req.user.id, note,
    });
    if (!won) return res.status(409).json({ error: "Application already reviewed", code: "ALREADY_REVIEWED" });
    const updated = { ...application, status: statusMap[action], reviewerId: req.user.id, reviewNote: note ?? null };
    delete updated.form; delete updated.user;
    closeApplicationDiscussion({ applicationId: application.id, serverId: application.serverId, outcome: action }).catch(() => {});
    // v50 — XP за одобрена кандидатура (веднъж на кандидатура).
    if (action === "approve") grantXpOnce(application.serverId, application.userId, `app:${application.id}`, XP_REWARDS.APPLICATION_APPROVED).catch(() => {});

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
        // Т18: `{server}` е ИМЕТО на сървъра, не snowflake.
        const serverRow = await prisma.server.findUnique({ where: { id: req.params.serverId }, select: { name: true } });
        dmMessage = interpolate(customMessage, { user: application.user, server: serverRow?.name || "", note });
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

    // Webhook — същият помощник като при решение от бутон в Discord (А2).
    fireApplicationReviewed(application, action, { reviewerId: req.user.id, note });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Simple placeholder interpolation for accept/deny DM templates.
// Supports: {user}, {username}, {server}, {note}
function interpolate(template, { user, server, note }) {
  if (!template) return null;
  const vars = {
    user: user?.username ? `<@${user.id}>` : "",
    username: user?.username || "",
    server: server || "",
    note: note || "",
  };
  return template.replace(/\{(user|username|server|note)\}/g, (_, k) => vars[k]);
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

    const transcript = buildTranscript(app.form.questions, app.answers);
    // Т6: най-много един канал — мястото се заема ПРЕДИ ботът да го създаде.
    const r = await openApplicationDiscussion({
      app, serverId: req.params.serverId, reviewerId: req.user.id, reviewerTag: req.user.username, transcript,
    });
    if (r.status === 200 && r.body.ticketId && !r.body.alreadyExists) {
      await prisma.auditLog.create({
        data: {
          actorId: req.user.id,
          serverId: req.params.serverId,
          action: "APPLICATION_DISCUSSION_STARTED",
          targetId: app.id,
          metadata: { channelId: r.body.channelId, ticketId: r.body.ticketId },
        },
      }).catch(() => {});
    }
    res.status(r.status).json(r.body);
  } catch (err) { next(err); }
});


export default router;
