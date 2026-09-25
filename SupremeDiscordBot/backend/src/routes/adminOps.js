// backend/src/routes/adminOps.js
// Админ конзола — операционните табове (v3.4): System · Security · Billing ·
// Fleet · Compliance (DSR). Монтира се на /api/admin до routes/admin.js.
//
// Същите гардове като admin.js: вход + staff роля + потвърден втори фактор;
// всичко, което променя състояние, иска и СВЕЖО потвърждение (step-up) и
// MAIN_OWNER. Нищо тук не връща тайни: ключове, токени и IP адреси се показват
// обобщени (keyLabel) или изобщо не.

import { Router } from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import axios from "axios";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getRedis } from "../lib/redisClient.js";
import { writeAudit } from "../lib/auditLog.js";
import { requireAuth, loadUser, requireSuperUser, requireMainOwner } from "../middleware/auth.js";
import { requireMfa, requireFreshMfa, mfaEnforced, STAFF_ROLES } from "../middleware/mfa.js";
import { adminIpAllowlist, allowlistState } from "../middleware/adminIpAllowlist.js";
import { alertOwner, alertsEnabled, ALERT_KINDS } from "../lib/securityAlerts.js";
import { snapshot as bruteForceSnapshot, unblock as bruteForceUnblock } from "../lib/bruteForce.js";
import { billingConfig } from "../lib/billing.js";
import { discordSubscriptionLabel } from "../lib/discordSubscription.js";
import { summarizeDiscordUser, eraseDiscordUser } from "../lib/dsr.js";
import { aiTrainingAttested } from "../services/aiReply.js";
import { COMPANIONS, publicCompanion } from "../lib/game/companions.js";
import { getCurrentSeason, listSeasons, createSeason, updateSeason, publicSeason } from "../lib/game/seasons.js";

const router = Router();
router.use(requireAuth, loadUser, adminIpAllowlist, requireSuperUser, requireMfa);
const stepUp = requireFreshMfa();

const PKG = (() => {
  try { return JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8")); }
  catch { return { version: "unknown" }; }
})();

const BOT_URL = () => process.env.BOT_API_URL || "http://bot:3001";
async function botCall(method, path, data) {
  try {
    const res = await axios({ method, url: `${BOT_URL()}${path}`, data, timeout: 15000, headers: { "x-bot-secret": process.env.API_SECRET } });
    return { ok: true, data: res.data };
  } catch (err) {
    return { ok: false, error: err?.response?.data?.error || err.message, status: err?.response?.status || 0 };
  }
}

// ─── GET /api/admin/system ───────────────────────────────────────────────────
router.get("/system", async (req, res, next) => {
  try {
    const t0 = Date.now();
    const db = await prisma.$queryRaw`SELECT 1 AS ok`.then(() => ({ ok: true, latencyMs: Date.now() - t0 })).catch((e) => ({ ok: false, error: e.message }));
    const redis = await (async () => {
      const r = getRedis();
      if (!r) return { ok: false, configured: false };
      const t = Date.now();
      try { await r.ping(); return { ok: true, configured: true, latencyMs: Date.now() - t }; }
      catch (e) { return { ok: false, configured: true, error: e.message }; }
    })();
    const bot = await (async () => {
      try {
        const r = await axios.get(`${BOT_URL()}/health`, { timeout: 5000, validateStatus: () => true });
        return { ok: r.status === 200, ...r.data };
      } catch (e) { return { ok: false, error: e.message }; }
    })();
    const migration = await prisma.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`
      .then((rows) => rows?.[0] || null).catch(() => null);
    const pendingMigrations = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NULL`
      .then((rows) => Number(rows?.[0]?.n || 0)).catch(() => null);

    // Пулсът на задачите: последен JOB_OK_* и JOB_FAIL_* по задача (одитният дневник).
    const heartbeats = await prisma.auditLog.groupBy({
      by: ["action"],
      where: { OR: [{ action: { startsWith: "JOB_OK_" } }, { action: { startsWith: "JOB_FAIL_" } }] },
      _max: { createdAt: true },
    }).catch(() => []);
    const jobs = {};
    for (const h of heartbeats) {
      const ok = h.action.startsWith("JOB_OK_");
      const name = h.action.replace(/^JOB_(OK|FAIL)_/, "").toLowerCase().replace(/_/g, "-");
      jobs[name] ??= { lastOk: null, lastFail: null };
      jobs[name][ok ? "lastOk" : "lastFail"] = h._max.createdAt;
    }

    const billing = billingConfig();
    // Провалени доставки на изходящи webhook-и (всички сървъри) — досега се
    // виждаха само от оператора на съответния сървър.
    const failingWebhooks = await Promise.resolve().then(() => prisma.webhook.findMany({
      where: { failCount: { gt: 0 } },
      select: { id: true, serverId: true, name: true, failCount: true, lastStatus: true, lastDeliveryAt: true, enabled: true },
      orderBy: { failCount: "desc" }, take: 20,
    })).then((r) => r || []).catch(() => []);
    const failingWebhookCount = await Promise.resolve().then(() => prisma.webhook.count({ where: { failCount: { gt: 0 } } })).then((n) => n || 0).catch(() => 0);
    res.json({
      webhooks: { failing: failingWebhookCount, items: failingWebhooks },
      now: new Date().toISOString(),
      backend: { version: PKG.version, node: process.version, uptimeSec: Math.floor(process.uptime()), env: process.env.NODE_ENV || "development" },
      db, redis, bot,
      migration: { latest: migration?.migration_name || null, finishedAt: migration?.finished_at || null, pending: pendingMigrations },
      jobs,
      billing: { provider: billing.provider, discordConfigured: billing.discord.configured, stripeLegacy: billing.stripe.legacyManagement },
      config: {
        mfaEnforced: mfaEnforced(),
        adminIpAllowlist: allowlistState(),
        securityAlertsDm: alertsEnabled(),
        transcriptEncryption: true,
        sentry: !!process.env.SENTRY_DSN,
        gemini: !!process.env.GEMINI_API_KEY,
        aiTrainingAttested: aiTrainingAttested(),
        redisUrl: !!process.env.REDIS_URL,
        frontendUrl: process.env.FRONTEND_URL || null,
        trustProxy: req.app.get("trust proxy") ?? null,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/security ─────────────────────────────────────────────────
router.get("/security", async (req, res, next) => {
  try {
    const staff = await prisma.user.findMany({
      where: { globalRole: { in: [...STAFF_ROLES] } },
      select: { id: true, username: true, globalRole: true, mfaEnabledAt: true, mfaBackupCodes: true, updatedAt: true, createdAt: true },
      orderBy: { globalRole: "asc" },
    });
    // Живи сесии по потребител (express_sessions: sess->>'userId').
    const sessionRows = await prisma.$queryRaw`SELECT sess->>'userId' AS uid, COUNT(*)::int AS n FROM express_sessions WHERE expire > NOW() GROUP BY 1`.catch(() => []);
    const sessionsByUser = Object.fromEntries((sessionRows || []).map((r) => [r.uid, Number(r.n)]));
    const totalSessions = (sessionRows || []).reduce((n, r) => n + Number(r.n), 0);

    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [securityEvents, apiKeys, blacklisted] = await Promise.all([
      prisma.auditLog.findMany({
        where: { createdAt: { gte: since }, action: { in: [
          "MFA_ENABLED", "MFA_DISABLED", "MFA_VERIFY_FAILED", "MFA_BACKUP_CODE_USED", "MFA_BACKUP_CODES_REGENERATED",
          "BRUTE_FORCE_BLOCK", "ROLE_CHANGED", "USER_BLACKLISTED", "USER_UNBLACKLISTED", "DSR_ERASED", "SECURITY_UNBLOCK", "API_KEY_REVOKED_ADMIN",
        ] } },
        orderBy: { createdAt: "desc" }, take: 100,
        include: { actor: { select: { id: true, username: true } } },
      }).catch(() => []),
      prisma.apiKey.findMany({
        select: { id: true, serverId: true, userId: true, name: true, keyPrefix: true, scopes: true, lastUsedAt: true, expiresAt: true, revokedAt: true, requestCount: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 200,
      }).catch(() => []),
      prisma.user.count({ where: { isBlacklisted: true } }).catch(() => 0),
    ]);

    res.json({
      mfaEnforced: mfaEnforced(),
      staff: staff.map((u) => {
        let backupCodesLeft = 0;
        try { backupCodesLeft = JSON.parse(u.mfaBackupCodes || "[]").length; } catch { backupCodesLeft = 0; }
        return { id: u.id, username: u.username, globalRole: u.globalRole, mfaEnabled: !!u.mfaEnabledAt, mfaEnabledAt: u.mfaEnabledAt, backupCodesLeft, sessions: sessionsByUser[u.id] || 0, createdAt: u.createdAt };
      }),
      sessions: { total: totalSessions },
      bruteForce: bruteForceSnapshot(),
      apiKeys: { active: apiKeys.filter((k) => !k.revokedAt).length, revoked: apiKeys.filter((k) => !!k.revokedAt).length, items: apiKeys },
      blacklisted,
      events: securityEvents,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/security/unblock ────────────────────────────────────────
router.post("/security/unblock", requireMainOwner, stepUp, async (req, res, next) => {
  const parsed = z.object({ scope: z.string().min(1).max(40), key: z.string().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "scope and key are required" });
  try {
    const result = await bruteForceUnblock(parsed.data.scope, parsed.data.key);
    await writeAudit({ actorId: req.user.id, action: "SECURITY_UNBLOCK", targetId: parsed.data.scope, metadata: { key: parsed.data.key, ...result } });
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/security/apikeys/:id ──────────────────────────────────
router.delete("/security/apikeys/:id", requireMainOwner, stepUp, async (req, res, next) => {
  try {
    const key = await prisma.apiKey.findUnique({ where: { id: req.params.id }, select: { id: true, serverId: true, userId: true, revokedAt: true, keyPrefix: true } });
    if (!key) return res.status(404).json({ error: "API key not found" });
    if (!key.revokedAt) await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await writeAudit({ actorId: req.user.id, serverId: key.serverId, action: "API_KEY_REVOKED_ADMIN", targetId: key.id, metadata: { keyPrefix: key.keyPrefix, ownerUserId: key.userId } });
    res.json({ ok: true, alreadyRevoked: !!key.revokedAt });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/users/:userId/mfa/reset ─────────────────────────────────
// Нулира втория фактор на потребител (загубен телефон + резервни кодове).
// Само MAIN_OWNER със свеж фактор; сваля и живите сесии на човека (влиза
// наново и записва пак); одит + DM до собственика. Собственикът не може да
// нулира САМ СЕБЕ СИ оттук — това би било заобикаляне на собствения му фактор.
router.post("/users/:userId/mfa/reset", requireMainOwner, stepUp, async (req, res, next) => {
  const id = z.string().regex(/^\d{5,25}$/).safeParse(req.params.userId);
  if (!id.success) return res.status(400).json({ error: "Invalid user id" });
  if (id.data === req.user.id) return res.status(400).json({ error: "Use the Account security page to manage your own second factor.", code: "SELF_RESET" });
  const body = z.object({ reason: z.string().min(3).max(300) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "reason (3–300 chars) is required" });
  try {
    const user = await prisma.user.findUnique({ where: { id: id.data }, select: { id: true, username: true, globalRole: true, mfaEnabledAt: true } });
    if (!user) return res.status(404).json({ error: "User not found" });
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: null, mfaEnabledAt: null, mfaBackupCodes: null, mfaLastUsedStep: null } });
    const sessions = await prisma.$executeRaw`DELETE FROM express_sessions WHERE sess->>'userId' = ${user.id}`.catch(() => 0);
    await writeAudit({ actorId: req.user.id, action: "MFA_RESET_BY_ADMIN", targetId: user.id, metadata: { reason: body.data.reason, hadMfa: !!user.mfaEnabledAt, sessionsRevoked: Number(sessions) || 0, ip: req.ip } });
    alertOwner(ALERT_KINDS.MFA_RESET_BY_ADMIN, "Second factor reset by an admin",
      `${req.user.username} reset TOTP for ${user.username} (${user.id}, ${user.globalRole}). Reason: ${body.data.reason}. Their sessions were revoked.`).catch(() => {});
    res.json({ ok: true, hadMfa: !!user.mfaEnabledAt, sessionsRevoked: Number(sessions) || 0 });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/billing ──────────────────────────────────────────────────
router.get("/billing", async (_req, res, next) => {
  try {
    const [discord, stripe, agencies, grace] = await Promise.all([
      prisma.server.findMany({
        where: { planSource: "discord" },
        select: { id: true, name: true, plan: true, discordEntitlementId: true, discordSkuId: true, discordSubscriptionId: true, discordSubscriptionStatus: true, discordCurrentPeriodEnd: true, premiumSince: true },
        orderBy: { premiumSince: "desc" }, take: 500,
      }),
      prisma.server.findMany({
        where: { OR: [{ planSource: "stripe" }, { stripeSubscriptionId: { not: null } }] },
        select: { id: true, name: true, plan: true, billingInterval: true, stripeStatus: true, accessUntil: true, gracePlan: true, pastDueSince: true, premiumSince: true },
        orderBy: { premiumSince: "desc" }, take: 500,
      }),
      prisma.agency.findMany({
        select: { id: true, ownerUserId: true, plan: true, seatLimit: true, planSource: true, stripeStatus: true, active: true, accessUntil: true, createdAt: true, _count: { select: { servers: true } } },
        orderBy: { createdAt: "desc" }, take: 200,
      }).catch(() => []),
      prisma.server.count({ where: { accessUntil: { gt: new Date() } } }),
    ]);
    const lastReconcile = await prisma.auditLog.findFirst({ where: { action: "PREMIUM_GRANTED_DISCORD", metadata: { path: ["via"], equals: "reconcile" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null);
    res.json({
      config: billingConfig(),
      discord: discord.map((s) => ({ ...s, statusLabel: discordSubscriptionLabel(s.discordSubscriptionStatus) })),
      stripe,
      agencies,
      graceServers: grace,
      lastReconcileGrantAt: lastReconcile?.createdAt || null,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/billing/reconcile ───────────────────────────────────────
// Ръчно пускане на entitlement реконсилиацията през бота (иначе на 6 ч).
router.post("/billing/reconcile", requireMainOwner, stepUp, async (req, res, next) => {
  try {
    const r = await botCall("post", "/internal/entitlement-reconcile", {});
    await writeAudit({ actorId: req.user.id, action: "ENTITLEMENT_RECONCILE_MANUAL", targetId: "discord", metadata: r.ok ? r.data : { error: r.error } });
    if (!r.ok) return res.status(502).json({ error: `Bot did not run the reconcile: ${r.error}` });
    res.json({ ok: true, ...r.data });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/fleet ────────────────────────────────────────────────────
router.get("/fleet", async (_req, res, next) => {
  try {
    const entitled = await prisma.server.findMany({
      where: { customBotToken: { not: null } },
      select: { id: true, name: true, plan: true, planSource: true, customBotName: true, agencyId: true, accessUntil: true },
      take: 500,
    });
    const health = await botCall("get", "/health");
    res.json({
      withToken: entitled,
      bot: health.ok ? health.data : { ok: false, error: health.error },
    });
  } catch (err) { next(err); }
});

router.post("/fleet/reconcile", requireMainOwner, stepUp, async (req, res, next) => {
  try {
    const r = await botCall("post", "/internal/whitelabel-reconcile", {});
    await writeAudit({ actorId: req.user.id, action: "WHITELABEL_RECONCILE_MANUAL", targetId: "fleet", metadata: r.ok ? r.data : { error: r.error } });
    if (!r.ok) return res.status(502).json({ error: `Bot did not run the reconcile: ${r.error}` });
    res.json({ ok: true, ...r.data });
  } catch (err) { next(err); }
});

// ─── Server Season: сезоните (v50) ───────────────────────────────────────────
// Глобални за платформата — затова са тук, не в таблото на сървъра. Четене за
// staff; създаване/промяна = MAIN_OWNER + step-up (сменя кои спътници се
// появяват във ВСИЧКИ сървъри). Логиката/валидацията е в lib/game/seasons.js.
const seasonSchema = z.object({
  code: z.string().min(1).max(16).optional(),
  name: z.string().min(1).max(80).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).optional(),
  companionIds: z.array(z.string().min(1).max(60)).max(100).optional(),
});

router.get("/game/season", async (_req, res, next) => {
  try {
    const now = new Date();
    const [current, all] = await Promise.all([getCurrentSeason({ now, fresh: true }), listSeasons()]);
    res.json({
      current: publicSeason(current, now),
      seasons: all.map((s) => publicSeason(s, now)),
      catalog: COMPANIONS.map((c) => { const p = publicCompanion(c, 1, current); return { id: p.id, name: p.name, rarity: p.rarity, rarityEmoji: p.rarityEmoji, family: p.family, imageUrl: p.imageUrl, seasonal: !!p.seasonId }; }),
    });
  } catch (err) { next(err); }
});

router.post("/game/season", requireMainOwner, stepUp, async (req, res, next) => {
  const parsed = seasonSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { code, name, startsAt, endsAt, companionIds = [] } = parsed.data;
  if (!code || !name || !startsAt || !endsAt) return res.status(400).json({ error: "code, name, startsAt и endsAt са задължителни" });
  try {
    const out = await createSeason({ code, name, startsAt, endsAt, companionIds });
    if (!out.ok) return res.status(out.code === "DUPLICATE" || out.code === "OVERLAP" ? 409 : 400).json({ error: out.error, code: out.code });
    await writeAudit({ actorId: req.user.id, action: "GAME_SEASON_CREATED", targetId: out.season.code, metadata: { name: out.season.name, startsAt: out.season.startsAt, endsAt: out.season.endsAt, companions: out.season.companionIds.length } });
    res.status(201).json(publicSeason(out.season));
  } catch (err) { next(err); }
});

router.put("/game/season/:code", requireMainOwner, stepUp, async (req, res, next) => {
  const parsed = seasonSchema.omit({ code: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const out = await updateSeason(req.params.code, parsed.data);
    if (!out.ok) return res.status(out.code === "NOT_FOUND" ? 404 : out.code === "OVERLAP" ? 409 : 400).json({ error: out.error, code: out.code });
    await writeAudit({ actorId: req.user.id, action: "GAME_SEASON_UPDATED", targetId: out.season.code, metadata: { keys: Object.keys(parsed.data) } });
    res.json(publicSeason(out.season));
  } catch (err) { next(err); }
});

// ─── Compliance / DSR ────────────────────────────────────────────────────────
const discordId = z.string().regex(/^\d{5,25}$/);

router.get("/dsr/requests", async (_req, res, next) => {
  try {
    const rows = await prisma.auditLog.findMany({
      where: { action: { in: ["DSR_ERASED", "GDPR_ACCOUNT_DELETED", "GDPR_EXPORT", "GDPR_CONSENT_WITHDRAWN"] } },
      orderBy: { createdAt: "desc" }, take: 200,
      include: { actor: { select: { id: true, username: true } } },
    });
    res.json({ requests: rows });
  } catch (err) { next(err); }
});

router.get("/dsr/:discordId", async (req, res, next) => {
  const id = discordId.safeParse(req.params.discordId);
  if (!id.success) return res.status(400).json({ error: "Invalid Discord user id" });
  try { res.json(await summarizeDiscordUser(id.data)); } catch (err) { next(err); }
});

router.post("/dsr/:discordId/erase", requireMainOwner, stepUp, async (req, res, next) => {
  const id = discordId.safeParse(req.params.discordId);
  if (!id.success) return res.status(400).json({ error: "Invalid Discord user id" });
  const body = z.object({ scope: z.enum(["identity", "full"]).default("identity"), note: z.string().max(500).optional(), confirm: z.literal(true) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "confirm:true and a valid scope are required" });
  try {
    const result = await eraseDiscordUser(id.data, { scope: body.data.scope, via: "admin", requestedBy: req.user.id, note: body.data.note || null });
    if (!result.ok) return res.status(409).json(result);
    if (body.data.scope === "full") {
      alertOwner(ALERT_KINDS.DSR_FULL_ERASE, "Full data erasure executed",
        `${req.user.username} erased ALL data (incl. ticket text) for Discord user ${id.data}. Note: ${body.data.note || "—"}.`).catch(() => {});
    }
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
