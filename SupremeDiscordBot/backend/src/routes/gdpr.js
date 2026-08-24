// backend/src/routes/gdpr.js
// GDPR Article 15 (access), Article 17 (erasure), Article 20 (portability)
// User-facing endpoints for data subject rights.
//
// All endpoints require auth — user can only act on their own data.

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, loadUser);

/**
 * „Създадено от мен" — модели, които пазят КОЙ е направил записа.
 *
 * ДЕФЕКТЪТ (одит, 16.08.2026): експортът покриваше какво човекът е ПОЛУЧИЛ или
 * ПРЕТЪРПЯЛ (тикети, кандидатури, гласове, снимки на роли), но не и какво е
 * СЪЗДАЛ. Седем модела пазят `creatorId`/`createdBy` — това е лична данна за
 * същия субект („този човек е направил това, тогава, на този сървър") и
 * чл. 15(1) иска копие и от нея.
 *
 * Изричен `select` за всеки — НИКОГА цял ред. Особено при Webhook: той носи
 * `secret` и `url`, тоест работеща тайна и адрес на чужда система; те не са
 * лична данна за субекта и нямат работа във файл, който се сваля.
 *
 * РЕДЪТ Е ДОГОВОР: същият масив пълни и деструктурирането на `Promise.all`
 * по-долу. Разместване тук без разместване там разменя данните между полета —
 * тихо и правдоподобно. Гейтът `gdprCreatedBy` пази съответствието.
 */
const CREATED_BY_MODELS = [
  ["poll", "creatorId", { id: true, serverId: true, question: true, createdAt: true }],
  ["giveaway", "creatorId", { id: true, serverId: true, prize: true, createdAt: true }],
  ["scheduledMessage", "createdBy", { id: true, serverId: true, createdAt: true }],
  ["stickyMessage", "createdBy", { id: true, serverId: true, createdAt: true }],
  ["cannedResponse", "createdBy", { id: true, serverId: true, name: true, createdAt: true }],
  ["webhook", "createdBy", { id: true, serverId: true, name: true, createdAt: true }],
  ["kbArticle", "createdBy", { id: true, serverId: true, title: true, createdAt: true }],
];
export { CREATED_BY_MODELS };

// ─── GET /api/gdpr/export ─────────────────────────────────────────────────────
// Article 15 (Right of access) + Article 20 (Right to data portability)
// Returns all data the platform holds about the authenticated user in
// structured, machine-readable JSON. User can download this file.

router.get("/export", async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Collect all data tied to this user ID
    // Одит 09.08.2026: декларацията „всички лични данни" пропускаше 5 таблици,
    // които РЕТЕНЦИЯТА познава и трие (dataRetention.js) — асиметрия, доказваща
    // пропуска. Чл. 15 отговор без тях е доказуемо непълен пред КЗЛД.
    const [user, servers, tickets, ticketMessages, applications, auditLogs, apiKeys, sessions,
           verificationAttempts, formCooldowns, pollVotes, giveawayEntries, memberships, roleSnapshots,
           // „Създадено от мен" — редът СЪВПАДА с масива CREATED_BY_MODELS по-долу.
           polls, giveaways, scheduledMessages, stickyMessages, cannedResponses, webhooks, kbArticles] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      // Server membership — relation is `members` (ServerMember[]), not `users`
      prisma.server.findMany({
        where: {
          OR: [
            { ownerId: userId },                                  // Servers user owns
            { members: { some: { userId } } },                    // Servers user is member of
          ],
        },
        select: { id: true, name: true, icon: true, isPremium: true, createdAt: true },
      }).catch(() => []),
      // Чл. 15(4): копието не бива да засяга правата на другите. Пълният запис
      // носи `archiveHtml` (транскрипт с ЧУЖДИ съобщения — staff и др.) и
      // `archiveToken` (таен ключ към публичния архив). И двете се изключват —
      // allowlist на собствените данни на субекта, не denylist. Одит 11.08.2026.
      prisma.ticket.findMany({
        where: { creatorId: userId },
        select: {
          id: true, serverId: true, panelId: true, status: true, priority: true,
          firstResponseAt: true, slaBreachedAt: true, slaResolutionBreachedAt: true,
          channelId: true, applicationId: true, archiveUrl: true, closedAt: true,
          closeReason: true, number: true, reopenedAt: true, reopenCount: true,
          renamedFrom: true, feedbackRating: true, feedbackComment: true, feedbackAt: true,
          lastActivityAt: true, inactivityNotifiedAt: true, createdAt: true, updatedAt: true,
          creatorId: true, assigneeId: true,
        },
      }),
      prisma.ticketMessage.findMany({ where: { authorId: userId } }),
      prisma.application.findMany({ where: { userId } }),
      // Чл. 15(1): субектът е лично данно и когато е ОБЕКТ на действие (напр.
      // блокиране/изтриване от админ), не само когато е автор. Само actorId
      // пропускаше именно записите ЗА него.
      prisma.auditLog.findMany({
        where: { OR: [{ actorId: userId }, { targetId: userId }] },
        take: 1000,
        orderBy: { createdAt: "desc" },
      }),
      prisma.apiKey.findMany({
        where: { userId },
        select: { id: true, name: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      }).catch(() => []),
      // Session metadata (without tokens) — for transparency on active sessions
      prisma.session.findMany({
        where: { userId },
        select: { id: true, expiresAt: true, createdAt: true },
      }).catch(() => []),
      // Promise.resolve().then(...) а не директно извикване: една липсваща/
      // преименувана таблица е синхронен TypeError, който би съборил ЦЕЛИЯ
      // експорт — а чл. 15 отговорът е по-добър непълен по един раздел,
      // отколкото 500. Същото пази и тестовите мокове.
      Promise.resolve().then(() => prisma.verificationAttempt.findMany({ where: { userId } })).catch(() => []),
      Promise.resolve().then(() => prisma.formCooldown.findMany({
        where: { userId },
        select: { formId: true, submissionCount: true, lastSubmittedAt: true },
      })).catch(() => []),
      Promise.resolve().then(() => prisma.pollVote.findMany({ where: { userId }, select: { pollId: true, option: true, createdAt: true } })).catch(() => []),
      Promise.resolve().then(() => prisma.giveawayEntry.findMany({ where: { userId }, select: { giveawayId: true, createdAt: true } })).catch(() => []),
      Promise.resolve().then(() => prisma.serverMember.findMany({ where: { userId }, select: { serverId: true, serverRole: true, joinedAt: true } })).catch(() => []),
      // v45 — снимките на Discord роли („лепкави роли") са лични данни за
      // субекта и подлежат на чл. 15 като всичко останало.
      Promise.resolve().then(() => prisma.memberRoleSnapshot.findMany({
        where: { userId },
        select: { serverId: true, roleIds: true, capturedAt: true },
      })).catch(() => []),
      // ─── „Създадено от мен" ───────────────────────────────────────────────
      // ДЕФЕКТЪТ (одит, 16.08.2026): експортът покриваше какво човекът е
      // ПОЛУЧИЛ или ПРЕТЪРПЯЛ (тикети, кандидатури, гласове, снимки на роли),
      // но не и какво е СЪЗДАЛ. Седем модела пазят `creatorId`/`createdBy` —
      // това е лична данна за същия субект („този човек е направил това, тогава,
      // на този сървър") и чл. 15(1) иска копие и от нея.
      //
      // Изричен `select` както навсякъде тук: НИКОГА цял ред. Особено при
      // Webhook — той носи `secret` и `url`, тоест идентификатор на чужда
      // система и работеща тайна; те не са лична данна за субекта и нямат
      // работа в експорт, който се сваля като файл.
      ...CREATED_BY_MODELS.map(([model, field, select]) =>
        Promise.resolve()
          .then(() => prisma[model].findMany({ where: { [field]: userId }, select }))
          .catch(() => []),
      ),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      platform: "Supreme Bot",
      subject: {
        id: userId,
        type: "user",
      },
      data: {
        profile: user ? {
          id: user.id,
          discordId: user.id,
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar,
          // Чл. 15(1) иска ВСИЧКИ лични данни, които обработваме — имейлът от
          // OAuth scope `email` беше пропуснат.
          email: user.email,
          globalRole: user.globalRole,
          // Блокирането е факт, който обработваме ЗА субекта → чл. 15(1) иска
          // да е видим в експорта.
          isBlacklisted: user.isBlacklisted,
          language: user.language,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          // Note: OAuth tokens (accessToken, refreshToken) are stored in the
          // Session model and excluded from export per security best practice.
        } : null,
        servers_with_membership: servers,
        tickets_created: tickets,
        ticket_messages_sent: ticketMessages,
        applications_submitted: applications,
        api_keys: apiKeys,
        active_sessions: sessions,
        audit_log_entries: auditLogs,
        verification_attempts: verificationAttempts,
        form_submission_counters: formCooldowns,
        poll_votes: pollVotes,
        giveaway_entries: giveawayEntries,
        server_memberships: memberships,
        discord_role_snapshots: roleSnapshots,
        // Чл. 15(1) — какво субектът е СЪЗДАЛ, не само какво е получил.
        created_by_me: {
          polls,
          giveaways,
          scheduled_messages: scheduledMessages,
          sticky_messages: stickyMessages,
          canned_responses: cannedResponses,
          webhooks,
          kb_articles: kbArticles,
        },
      },
      metadata: {
        gdpr_articles_addressed: ["Article 15 (right of access)", "Article 20 (right to data portability)"],
        format: "JSON",
        note: "This file contains all personal data Supreme Bot holds about you. To request deletion, use /api/gdpr/delete-account.",
      },
    };

    // Audit this data access for compliance
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        serverId: null,
        action: "GDPR_DATA_EXPORT",
        targetId: userId,
        metadata: { endpoint: "/api/gdpr/export" },
      },
    }).catch(() => {});

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="supreme-bot-data-${userId}-${Date.now()}.json"`);
    res.json(payload);
  } catch (err) { next(err); }
});

// ─── POST /api/gdpr/delete-account ────────────────────────────────────────────
// Article 17 (Right to erasure / "right to be forgotten")
// Anonymizes user data instead of hard-delete to preserve:
//   - Audit log integrity (for other users' right to know who did what to their server)
//   - Ticket transcripts of other users who interacted (their data rights)
//   - Financial records (legal obligation to retain invoices 7-10 years in EU)
//
// Process:
//   1. User confirms with their Discord ID (CSRF-like protection)
//   2. Personal fields (username, avatar) are nullified/anonymized
//   3. Tokens revoked
//   4. User ID retained in audit logs as "[deleted user]"
//
// NOTE: Discord user ID is pseudonymous by nature. Discord itself allows users
// to delete their Discord account which renders our ID useless.

router.post("/delete-account", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { confirmDiscordId } = req.body;

    // Confirmation check — user must type their Discord ID
    if (confirmDiscordId !== userId) {
      return res.status(400).json({
        error: "Confirmation mismatch. Please provide your Discord user ID to confirm deletion.",
      });
    }

    // Check if user owns servers with active Premium subscriptions
    // Server.ownerId is the actual owner column (single ID, not a relation)
    const activeServers = await prisma.server.count({
      where: {
        ownerId: userId,
        isPremium: true,
        stripeSubscriptionId: { not: null },
      },
    }).catch(() => 0);

    // Agency абонаментите не са вързани за сървър (Agency.ownerUserId), затова
    // отделна проверка — иначе изтриването на акаунт минаваше при активна
    // Agency (клиентът продължаваше да плаща абонамент за изтрит акаунт).
    const activeAgencies = await prisma.agency.count({
      where: { ownerUserId: userId, active: true, stripeSubscriptionId: { not: null } },
    }).catch(() => 0);

    if (activeServers > 0 || activeAgencies > 0) {
      const parts = [];
      if (activeServers > 0) parts.push(`${activeServers} active Premium subscription(s)`);
      if (activeAgencies > 0) parts.push(`${activeAgencies} active Agency subscription(s)`);
      return res.status(400).json({
        error: `You have ${parts.join(" and ")}. Please cancel them (Premium page / Agency billing portal) before deleting your account.`,
        code: "ACTIVE_SUBSCRIPTIONS",
      });
    }

    // Anonymize user data (soft delete preserving referential integrity)
    await prisma.$transaction(async (tx) => {
      // 1. Anonymize profile — only fields that actually exist on User model
      await tx.user.update({
        where: { id: userId },
        data: {
          username: `[deleted-user-${userId.slice(-6)}]`,
          discriminator: "0",
          avatar: null,
          // Имейлът ИМА поле на User (schema.prisma) — идва от OAuth scope
          // `email`. Стар коментар тук твърдеше обратното и заради него имейлът
          // преживяваше „изтриването“: чл. 17 дефект, намерен при одита 07.08.2026.
          email: null,
          // accessToken/refreshToken живеят в Session и падат на следващата стъпка.
        },
      });

      // 1b. Псевдонимизирай денормализирания подпис в тикет-съобщенията.
      // `authorTag` пази „User#1234" като СТРИНГ — пряко идентифициращо, което
      // преживяваше анонимизацията (чл. 17 дефект). Съдържанието се пази
      // (референтна цялост към чуждите тикети), но подписът се сверява с
      // анонимизираното име.
      await tx.ticketMessage.updateMany({
        where: { authorId: userId },
        data: { authorTag: `[deleted-user-${userId.slice(-6)}]` },
      }).catch(() => {});

      // 1в. Снимките на Discord роли (v45) са лични данни без стойност след
      // изтриване на акаунта — премахват се изцяло (чл. 17).
      //
      // Promise.resolve().then(...) а не пряко извикване: липсващ/непознат
      // модел (например преди прилагане на миграцията) е СИНХРОНЕН TypeError,
      // който би прекъснал цялата транзакция по изтриването — тоест едно ново
      // поле би счупило правото на изтриване. Същата причина като в експорта.
      await Promise.resolve()
        .then(() => tx.memberRoleSnapshot.deleteMany({ where: { userId } }))
        .catch(() => {});

      // 2. Delete all sessions (revokes OAuth tokens — they're stored here)
      await tx.session.deleteMany({ where: { userId } }).catch(() => {});

      // 3. Revoke all API keys
      await tx.apiKey.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }).catch(() => {});

      // 4. Audit trail — immutable record of deletion request
      await tx.auditLog.create({
        data: {
          actorId: userId,
          serverId: null,
          action: "GDPR_ACCOUNT_DELETED",
          targetId: userId,
          metadata: {
            anonymizedAt: new Date().toISOString(),
            reason: "User-requested deletion under GDPR Article 17",
          },
        },
      });
    });

    // Destroy session
    req.session?.destroy?.(() => {});

    res.json({
      ok: true,
      message: "Your account has been deleted. Your profile (username, avatar) has been anonymized and your sessions and OAuth tokens erased. A non-identifying internal reference is kept only for referential integrity (so other users' records stay intact), and transactional invoice records are retained for the legally required 7 years. After those periods the remaining data is purged.",
    });
  } catch (err) { next(err); }
});

// ─── POST /api/gdpr/withdraw-consent ──────────────────────────────────────────
// Article 7(3) — withdrawal of consent
// User can revoke processing consent for optional features (analytics, marketing)
// while retaining the account. Essential processing (auth, billing) cannot be
// withdrawn without account deletion.

router.post("/withdraw-consent", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { category } = req.body; // "analytics" | "marketing" | "all-optional"

    const allowed = ["analytics", "marketing", "all-optional"];
    if (!allowed.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${allowed.join(", ")}` });
    }

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        serverId: null,
        action: "GDPR_CONSENT_WITHDRAWN",
        targetId: userId,
        metadata: { category, withdrawnAt: new Date().toISOString() },
      },
    });

    res.json({
      ok: true,
      message: `Consent withdrawn for category: ${category}. Essential processing (authentication, billing) continues per contract performance (Article 6(1)(b)).`,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/gdpr/report-abuse ──────────────────────────────────────────────
// Content abuse reporting — required for platforms hosting user-generated content
// under DSA (Digital Services Act) for EU operators.

router.post("/report-abuse", async (req, res, next) => {
  try {
    const { targetType, targetId, reason, details } = req.body;

    const allowedTypes = ["ticket", "application", "panel", "form", "user", "server"];
    if (!allowedTypes.includes(targetType)) {
      return res.status(400).json({ error: `targetType must be: ${allowedTypes.join(", ")}` });
    }
    if (!reason || reason.length < 10) {
      return res.status(400).json({ error: "reason must be at least 10 characters" });
    }

    // Store as audit log entry with ABUSE_REPORT action
    const report = await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: null,
        action: "ABUSE_REPORT",
        targetId: targetId || null,
        metadata: {
          targetType,
          reason,
          details: (details || "").slice(0, 2000),
          reportedAt: new Date().toISOString(),
          reporterIp: req.ip,
        },
      },
    });

    // Surface the report to operators immediately. Sentry is the alerting
    // channel in production (routes to abuse@carbonstealth.eu via its rules);
    // the console line guarantees a record even when Sentry is not configured.
    console.warn(`[DSA] Abuse report ${report.id}: type=${targetType} target=${targetId || "n/a"} reporter=${req.user.id}`);
    if (process.env.SENTRY_DSN) {
      try {
        const Sentry = await import("@sentry/node");
        Sentry.captureMessage(`DSA abuse report: ${targetType}`, {
          level: "warning",
          tags: { kind: "abuse_report" },
          extra: { reportId: report.id, targetId, reason },
        });
      } catch { /* monitoring is best-effort — never block the response */ }
    }

    res.json({
      ok: true,
      reportId: report.id,
      message: "Report received. We will review within 48 hours per our DSA obligations.",
    });
  } catch (err) { next(err); }
});

export default router;
