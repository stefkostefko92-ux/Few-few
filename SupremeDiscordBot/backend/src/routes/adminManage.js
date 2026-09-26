// backend/src/routes/adminManage.js
// v51 — CRUD разширение на админ конзолата: играта по сървъри, поддръжка
// (тикети/панели/форми през всички сървъри), white-label ботове, потребители и
// достъп. Монтира се на /api/admin до admin.js и adminOps.js.
//
// Същата верига като там: вход + staff роля + потвърден втори фактор за ВСИЧКО;
// всяка промяна иска и свежо потвърждение (step-up); разрушителните — и
// MAIN_OWNER. Всяка промяна влиза в одитния дневник. Нищо тук не връща тайни.
//
// Каквото таблото на сървъра вече прави (настройки на играта, магазин, куестове,
// затваряне на тикет, изтриване на панел/форма), админът го прави ОТТАМ —
// requireServerAdmin пуска платформения админ с потвърден фактор. Тук е само
// това, което го няма никъде другаде.
import { Router } from "express";
import axios from "axios";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/auditLog.js";
import { requireAuth, loadUser, requireSuperUser, requireMainOwner } from "../middleware/auth.js";
import { requireMfa, requireFreshMfa } from "../middleware/mfa.js";
import { adminIpAllowlist } from "../middleware/adminIpAllowlist.js";
import { notifyBot, notifyBotVerbose } from "../services/botNotifier.js";
import { isBlacklistActive } from "../lib/blacklist.js";
import { levelFromXp } from "../lib/game/xp.js";
import { adjustMember, grantCompanion, resetServerGame, MAX_ADJUST } from "../lib/game/admin.js";
import { releaseCompanion } from "../lib/game/companionOps.js";
import { companionById, publicCompanion } from "../lib/game/companions.js";
import { deleteSeason } from "../lib/game/seasons.js";

const router = Router();
router.use(requireAuth, loadUser, adminIpAllowlist, requireSuperUser, requireMfa);
const stepUp = requireFreshMfa();

const SNOWFLAKE = /^\d{17,20}$/;
const snowflake = z.string().regex(SNOWFLAKE);
const page = (q) => Math.max(1, Number(q) || 1);
const limit = (q, max = 100) => Math.min(max, Math.max(1, Number(q) || 50));

async function serverOr404(res, serverId) {
  if (!SNOWFLAKE.test(String(serverId))) { res.status(400).json({ error: "Invalid server id" }); return null; }
  const server = await prisma.server.findUnique({ where: { id: serverId }, select: { id: true, name: true } });
  if (!server) { res.status(404).json({ error: "Server not found" }); return null; }
  return server;
}

// ═══ Играта по сървъри ═══════════════════════════════════════════════════════

// GET /api/admin/game/servers/:serverId/members?q=&page=
// Играчите на сървъра: XP, ниво, искри, брой спътници. q = част от id или име
// (името е известно само за хора, влизали в таблото).
router.get("/game/servers/:serverId/members", async (req, res, next) => {
  try {
    const server = await serverOr404(res, req.params.serverId);
    if (!server) return;
    const q = String(req.query.q || "").trim().slice(0, 64);
    const take = limit(req.query.limit), p = page(req.query.page);
    let userIds = null;
    if (q && !/^\d+$/.test(q)) {
      const users = await prisma.user.findMany({ where: { username: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 200 });
      userIds = users.map((u) => u.id);
    }
    const where = { serverId: server.id, ...(q && (/^\d+$/.test(q) ? { userId: { contains: q } } : { userId: { in: userIds } })) };
    const [rows, total] = await Promise.all([
      prisma.memberProgress.findMany({ where, orderBy: { xp: "desc" }, skip: (p - 1) * take, take,
        select: { userId: true, xp: true, level: true, seasonXp: true, sparks: true, streak: true, messages: true, voiceMinutes: true, activeCompanionId: true, updatedAt: true } }),
      prisma.memberProgress.count({ where }),
    ]);
    const ids = rows.map((r) => r.userId);
    const [users, companions] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, avatar: true } }),
      prisma.memberCompanion.groupBy({ by: ["userId"], where: { serverId: server.id, userId: { in: ids } }, _count: { _all: true } }),
    ]);
    const nameById = Object.fromEntries(users.map((u) => [u.id, u.username]));
    const compById = Object.fromEntries(companions.map((c) => [c.userId, c._count._all]));
    res.json({
      server,
      total, page: p, limit: take,
      members: rows.map((r) => ({ ...r, username: nameById[r.userId] || null, companions: compById[r.userId] || 0, levelFromXp: levelFromXp(r.xp) })),
    });
  } catch (err) { next(err); }
});

// GET /api/admin/game/servers/:serverId/members/:userId/companions
router.get("/game/servers/:serverId/members/:userId/companions", async (req, res, next) => {
  if (!SNOWFLAKE.test(req.params.userId)) return res.status(400).json({ error: "Invalid user id" });
  try {
    const server = await serverOr404(res, req.params.serverId);
    if (!server) return;
    const rows = await prisma.memberCompanion.findMany({ where: { serverId: server.id, userId: req.params.userId }, orderBy: { caughtAt: "asc" } });
    res.json({
      companions: rows.map((r) => {
        const c = publicCompanion(companionById(r.companionId), r.stage);
        return { id: r.id, companionId: r.companionId, name: c?.name || r.companionId, rarity: c?.rarity || null, rarityEmoji: c?.rarityEmoji || "", stage: r.stage, fed: r.fed, seasonId: r.seasonId, caughtAt: r.caughtAt };
      }),
    });
  } catch (err) { next(err); }
});

// PATCH /api/admin/game/servers/:serverId/members/:userId  { xpDelta, sparksDelta, reason }
router.patch("/game/servers/:serverId/members/:userId", stepUp, async (req, res, next) => {
  if (!SNOWFLAKE.test(req.params.userId)) return res.status(400).json({ error: "Invalid user id" });
  const body = z.object({
    xpDelta: z.number().int().min(-MAX_ADJUST).max(MAX_ADJUST).default(0),
    sparksDelta: z.number().int().min(-MAX_ADJUST).max(MAX_ADJUST).default(0),
    reason: z.string().trim().min(3).max(300),
  }).safeParse(req.body || {});
  if (!body.success) return res.status(400).json({ error: "xpDelta / sparksDelta (integers) and a reason (3–300 chars) are required" });
  try {
    const server = await serverOr404(res, req.params.serverId);
    if (!server) return;
    const out = await adjustMember(server.id, req.params.userId, body.data);
    if (!out.ok) return res.status(400).json({ error: out.code, code: out.code });
    await writeAudit({ actorId: req.user.id, serverId: server.id, action: "GAME_MEMBER_ADJUSTED", targetId: req.params.userId,
      metadata: { xpDelta: body.data.xpDelta, sparksDelta: body.data.sparksDelta, reason: body.data.reason, before: out.before, after: out.after } });
    res.json(out);
  } catch (err) { next(err); }
});

// POST /api/admin/game/servers/:serverId/members/:userId/companions  { companionId, stage, reason }
router.post("/game/servers/:serverId/members/:userId/companions", stepUp, async (req, res, next) => {
  if (!SNOWFLAKE.test(req.params.userId)) return res.status(400).json({ error: "Invalid user id" });
  const body = z.object({
    companionId: z.string().regex(/^[a-z0-9-]{1,64}$/),
    stage: z.number().int().min(1).max(3).default(1),
    reason: z.string().trim().min(3).max(300),
  }).safeParse(req.body || {});
  if (!body.success) return res.status(400).json({ error: "companionId, stage (1–3) and a reason (3–300 chars) are required" });
  try {
    const server = await serverOr404(res, req.params.serverId);
    if (!server) return;
    const out = await grantCompanion(server.id, req.params.userId, body.data.companionId, { stage: body.data.stage });
    if (!out.ok) return res.status(out.code === "UNKNOWN_COMPANION" ? 404 : 400).json({ error: out.code, code: out.code });
    await writeAudit({ actorId: req.user.id, serverId: server.id, action: "GAME_COMPANION_GRANTED", targetId: req.params.userId,
      metadata: { companionId: body.data.companionId, stage: body.data.stage, ownedId: out.owned.id, reason: body.data.reason } });
    res.status(201).json(out);
  } catch (err) { next(err); }
});

// DELETE /api/admin/game/servers/:serverId/companions/:ownedId  { reason }
router.delete("/game/servers/:serverId/companions/:ownedId", stepUp, async (req, res, next) => {
  const reason = z.string().trim().min(3).max(300).safeParse(req.body?.reason);
  if (!reason.success) return res.status(400).json({ error: "A reason (3–300 chars) is required" });
  try {
    const server = await serverOr404(res, req.params.serverId);
    if (!server) return;
    // Притежанието се търси В РАМКИТЕ на сървъра — id от друг сървър е 404.
    const owned = await prisma.memberCompanion.findFirst({ where: { id: req.params.ownedId, serverId: server.id }, select: { id: true, userId: true, companionId: true, stage: true } });
    if (!owned) return res.status(404).json({ error: "Companion not found on this server" });
    const out = await releaseCompanion(server.id, owned.userId, owned.id);
    if (!out.ok) return res.status(404).json({ error: out.code });
    await writeAudit({ actorId: req.user.id, serverId: server.id, action: "GAME_COMPANION_REVOKED", targetId: owned.userId,
      metadata: { companionId: owned.companionId, stage: owned.stage, ownedId: owned.id, reason: reason.data } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/admin/game/servers/:serverId/reset  { scope: "progress"|"all", confirm: true, reason }
router.post("/game/servers/:serverId/reset", requireMainOwner, stepUp, async (req, res, next) => {
  const body = z.object({ scope: z.enum(["progress", "all"]), confirm: z.literal(true), reason: z.string().trim().min(3).max(300) }).safeParse(req.body || {});
  if (!body.success) return res.status(400).json({ error: "scope (progress|all), confirm:true and a reason are required" });
  try {
    const server = await serverOr404(res, req.params.serverId);
    if (!server) return;
    const out = await resetServerGame(server.id, body.data.scope);
    await writeAudit({ actorId: req.user.id, serverId: server.id, action: "GAME_RESET_BY_ADMIN", targetId: server.id, metadata: { scope: body.data.scope, reason: body.data.reason, counts: out.counts } });
    notifyBot("GAME_SETTINGS_CHANGED", { serverId: server.id }).catch(() => {});
    res.json(out);
  } catch (err) { next(err); }
});

// DELETE /api/admin/game/season/:code — само сезон, който още не е започнал.
router.delete("/game/season/:code", requireMainOwner, stepUp, async (req, res, next) => {
  try {
    const out = await deleteSeason(String(req.params.code));
    if (!out.ok) return res.status(out.code === "NOT_FOUND" ? 404 : 409).json({ error: out.error, code: out.code });
    await writeAudit({ actorId: req.user.id, action: "GAME_SEASON_DELETED", targetId: out.season.code, metadata: { name: out.season.name, startsAt: out.season.startsAt, endsAt: out.season.endsAt } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ═══ Поддръжка: тикети, панели, форми през всички сървъри ════════════════════

const TICKET_STATUSES = ["OPEN", "CLAIMED", "CLOSED", "ARCHIVED"];

// GET /api/admin/support/tickets?serverId=&status=&q=&page=
router.get("/support/tickets", async (req, res, next) => {
  try {
    const take = limit(req.query.limit), p = page(req.query.page);
    const status = TICKET_STATUSES.includes(String(req.query.status)) ? String(req.query.status) : null;
    const serverId = SNOWFLAKE.test(String(req.query.serverId || "")) ? String(req.query.serverId) : null;
    const q = String(req.query.q || "").trim().slice(0, 64);
    const qNum = /^\d{1,6}$/.test(q) ? Number(q) : null;
    const where = {
      ...(serverId && { serverId }),
      ...(status && { status }),
      ...(q && { OR: [
        { id: q },
        { creatorId: q },
        { channelId: q },
        ...(qNum !== null ? [{ number: qNum }] : []),
        { creator: { username: { contains: q, mode: "insensitive" } } },
      ] }),
    };
    const [rows, total] = await Promise.all([
      prisma.ticket.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (p - 1) * take, take,
        // Без archiveHtml (транскриптът е голям и е шифриран) и без съдържание.
        select: {
          id: true, serverId: true, number: true, status: true, priority: true, channelId: true, closedAt: true, closeReason: true,
          createdAt: true, lastActivityAt: true, archiveToken: true,
          server: { select: { name: true } },
          creator: { select: { id: true, username: true } },
          assignee: { select: { id: true, username: true } },
          panel: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);
    res.json({
      total, page: p, limit: take,
      tickets: rows.map(({ archiveToken, ...t }) => ({ ...t, hasTranscript: !!archiveToken })),
    });
  } catch (err) { next(err); }
});

// DELETE /api/admin/support/tickets/:ticketId?confirm=true  { reason }
// Само ЗАТВОРЕН тикет: отвореният още има канал в Discord — първо се затваря
// (таблото на сървъра → Tickets), иначе каналът остава без запис.
router.delete("/support/tickets/:ticketId", requireMainOwner, stepUp, async (req, res, next) => {
  if (req.query.confirm !== "true") return res.status(400).json({ error: "Destructive action requires confirmation", hint: "Add ?confirm=true to confirm" });
  const reason = z.string().trim().min(3).max(300).safeParse(req.body?.reason);
  if (!reason.success) return res.status(400).json({ error: "A reason (3–300 chars) is required" });
  try {
    const t = await prisma.ticket.findUnique({ where: { id: req.params.ticketId }, select: { id: true, serverId: true, number: true, status: true, creatorId: true } });
    if (!t) return res.status(404).json({ error: "Ticket not found" });
    if (!["CLOSED", "ARCHIVED"].includes(t.status)) return res.status(409).json({ error: "Close the ticket first", code: "TICKET_OPEN" });
    await prisma.ticket.delete({ where: { id: t.id } }); // съобщенията падат с каскада
    await writeAudit({ actorId: req.user.id, serverId: t.serverId, action: "TICKET_DELETED_BY_ADMIN", targetId: t.id, metadata: { number: t.number, creatorId: t.creatorId, reason: reason.data } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/admin/support/panels?serverId=&q=&page=
router.get("/support/panels", async (req, res, next) => {
  try {
    const take = limit(req.query.limit), p = page(req.query.page);
    const serverId = SNOWFLAKE.test(String(req.query.serverId || "")) ? String(req.query.serverId) : null;
    const q = String(req.query.q || "").trim().slice(0, 64);
    const where = { ...(serverId && { serverId }), ...(q && { OR: [{ id: q }, { name: { contains: q, mode: "insensitive" } }] }) };
    const [rows, total] = await Promise.all([
      prisma.panel.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p - 1) * take, take,
        select: { id: true, serverId: true, name: true, channelId: true, messageId: true, createdAt: true, server: { select: { name: true } }, _count: { select: { tickets: true } } } }),
      prisma.panel.count({ where }),
    ]);
    res.json({ total, page: p, limit: take, panels: rows });
  } catch (err) { next(err); }
});

// GET /api/admin/support/forms?serverId=&q=&page=
router.get("/support/forms", async (req, res, next) => {
  try {
    const take = limit(req.query.limit), p = page(req.query.page);
    const serverId = SNOWFLAKE.test(String(req.query.serverId || "")) ? String(req.query.serverId) : null;
    const q = String(req.query.q || "").trim().slice(0, 64);
    const where = { ...(serverId && { serverId }), ...(q && { OR: [{ id: q }, { name: { contains: q, mode: "insensitive" } }] }) };
    const [rows, total] = await Promise.all([
      prisma.form.findMany({ where, orderBy: { createdAt: "desc" }, skip: (p - 1) * take, take,
        select: { id: true, serverId: true, name: true, createdAt: true, server: { select: { name: true } }, _count: { select: { questions: true, applications: true } } } }),
      prisma.form.count({ where }),
    ]);
    res.json({ total, page: p, limit: take, forms: rows });
  } catch (err) { next(err); }
});

// ═══ White-label ботове ══════════════════════════════════════════════════════

const BOT_URL = () => process.env.BOT_API_URL || "http://bot:3001";
async function botGet(path) {
  try {
    const r = await axios.get(`${BOT_URL()}${path}`, { timeout: 8000, headers: { "x-bot-secret": process.env.API_SECRET } });
    return { ok: true, data: r.data };
  } catch (err) { return { ok: false, error: err?.response?.data?.error || err.message }; }
}

async function whitelabelServer(res, serverId) {
  if (!SNOWFLAKE.test(String(serverId))) { res.status(400).json({ error: "Invalid server id" }); return null; }
  const s = await prisma.server.findUnique({ where: { id: serverId }, select: { id: true, name: true, customBotToken: true, customBotName: true, customBotAvatar: true, customBotPausedAt: true } });
  if (!s) { res.status(404).json({ error: "Server not found" }); return null; }
  if (!s.customBotToken) { res.status(409).json({ error: "This server has no white-label bot token", code: "NO_TOKEN" }); return null; }
  return s;
}

// GET /api/admin/fleet/bots — сървърите с токен + живият статус от бота.
router.get("/fleet/bots", async (_req, res, next) => {
  try {
    const rows = await prisma.server.findMany({
      where: { customBotToken: { not: null } },
      select: { id: true, name: true, plan: true, planSource: true, customBotName: true, customBotAvatar: true, customBotPausedAt: true, agencyId: true, accessUntil: true, updatedAt: true },
      orderBy: { name: "asc" }, take: 500,
    });
    const status = await botGet("/internal/whitelabel-status");
    const live = status.ok ? status.data?.bots || {} : {};
    res.json({
      botReachable: status.ok,
      botError: status.ok ? null : status.error,
      bots: rows.map((r) => ({ ...r, live: live[r.id] || null })),
    });
  } catch (err) { next(err); }
});

// POST /api/admin/fleet/:serverId/pause | resume | restart
router.post("/fleet/:serverId/:action(pause|resume|restart)", stepUp, async (req, res, next) => {
  try {
    const s = await whitelabelServer(res, req.params.serverId);
    if (!s) return;
    const action = req.params.action;
    if (action === "pause") await prisma.server.update({ where: { id: s.id }, data: { customBotPausedAt: new Date() } });
    if (action === "resume") await prisma.server.update({ where: { id: s.id }, data: { customBotPausedAt: null } });
    if (action === "restart" && s.customBotPausedAt) return res.status(409).json({ error: "The bot is paused — resume it first", code: "PAUSED" });
    // Един път към бота за трите: рестартът чете токена наново — при пауза
    // /token връща null и клиентът слиза; при resume/restart се вдига.
    const r = await notifyBotVerbose("WHITELABEL_UPDATE", { serverId: s.id });
    const botError = r?.botError || null;
    await writeAudit({ actorId: req.user.id, serverId: s.id, action: `WHITELABEL_${action.toUpperCase()}_BY_ADMIN`, targetId: s.id, metadata: { botError, started: r?.started ?? null } });
    // Паузата/възобновяването са записани в базата и важат дори при офлайн бот
    // (той чете токена при следващото вдигане) — затова 200, но с botError за UI.
    res.json({ ok: true, action, botError, started: r?.started ?? null });
  } catch (err) { next(err); }
});

// PATCH /api/admin/fleet/:serverId/branding  { name?, avatarUrl? }
router.patch("/fleet/:serverId/branding", stepUp, async (req, res, next) => {
  const body = z.object({
    name: z.string().trim().min(2).max(32).nullable().optional(),
    avatarUrl: z.string().trim().url().max(500).refine((u) => u.startsWith("https://"), "https only").nullable().optional(),
  }).safeParse(req.body || {});
  if (!body.success || (body.data.name === undefined && body.data.avatarUrl === undefined)) {
    return res.status(400).json({ error: "name (2–32 chars) and/or avatarUrl (https) are expected" });
  }
  try {
    const s = await whitelabelServer(res, req.params.serverId);
    if (!s) return;
    const data = {
      ...(body.data.name !== undefined && { customBotName: body.data.name || null }),
      ...(body.data.avatarUrl !== undefined && { customBotAvatar: body.data.avatarUrl || null }),
    };
    await prisma.server.update({ where: { id: s.id }, data });
    // Аватарът се прилага само при изричен рестарт (лимит ~2 смени/час в Discord).
    const r = s.customBotPausedAt ? null : await notifyBotVerbose("WHITELABEL_UPDATE", { serverId: s.id });
    await writeAudit({ actorId: req.user.id, serverId: s.id, action: "WHITELABEL_BRANDING_BY_ADMIN", targetId: s.id, metadata: { keys: Object.keys(data), botError: r?.botError || null } });
    res.json({ ok: true, botError: r?.botError || null, applied: !!r && !r.botError });
  } catch (err) { next(err); }
});

// DELETE /api/admin/fleet/:serverId/token?confirm=true  { reason }
// Трие шифрования токен: ботът слиза и не се вдига, докато клиентът не въведе нов.
router.delete("/fleet/:serverId/token", requireMainOwner, stepUp, async (req, res, next) => {
  if (req.query.confirm !== "true") return res.status(400).json({ error: "Destructive action requires confirmation", hint: "Add ?confirm=true to confirm" });
  const reason = z.string().trim().min(3).max(300).safeParse(req.body?.reason);
  if (!reason.success) return res.status(400).json({ error: "A reason (3–300 chars) is required" });
  try {
    const s = await whitelabelServer(res, req.params.serverId);
    if (!s) return;
    await prisma.server.update({ where: { id: s.id }, data: { customBotToken: null, customBotPausedAt: null } });
    const r = await notifyBotVerbose("WHITELABEL_UPDATE", { serverId: s.id });
    await writeAudit({ actorId: req.user.id, serverId: s.id, action: "WHITELABEL_TOKEN_REMOVED_BY_ADMIN", targetId: s.id, metadata: { reason: reason.data, botError: r?.botError || null } });
    res.json({ ok: true, botError: r?.botError || null });
  } catch (err) { next(err); }
});

// ═══ Потребители и достъп ════════════════════════════════════════════════════

// POST /api/admin/users/:userId/sessions/revoke — принудителен изход отвсякъде.
router.post("/users/:userId/sessions/revoke", requireMainOwner, stepUp, async (req, res, next) => {
  const id = snowflake.safeParse(req.params.userId);
  if (!id.success) return res.status(400).json({ error: "Invalid user id" });
  if (id.data === req.user.id) return res.status(400).json({ error: "Use Log out for your own sessions", code: "SELF" });
  try {
    const user = await prisma.user.findUnique({ where: { id: id.data }, select: { id: true, globalRole: true } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.globalRole === "MAIN_OWNER") return res.status(403).json({ error: "Cannot sign out the Main Owner" });
    // И двата вида: бисквитната сесия (express_sessions) и Discord OAuth токените
    // (sessions) — без вторите requireServerAdmin пак би стигал до Discord.
    const web = Number(await prisma.$executeRaw`DELETE FROM express_sessions WHERE sess->>'userId' = ${user.id}`.catch(() => 0)) || 0;
    const oauth = (await prisma.session.deleteMany({ where: { userId: user.id } })).count;
    await writeAudit({ actorId: req.user.id, action: "USER_SESSIONS_REVOKED", targetId: user.id, metadata: { web, oauth, ip: req.ip } });
    res.json({ ok: true, web, oauth });
  } catch (err) { next(err); }
});

// PATCH /api/admin/users/:userId/note  { note }
// Вътрешна бележка за staff. Лични данни → влиза в GDPR експорта; в одита
// отива само дължината, не текстът.
router.patch("/users/:userId/note", stepUp, async (req, res, next) => {
  const id = snowflake.safeParse(req.params.userId);
  if (!id.success) return res.status(400).json({ error: "Invalid user id" });
  const note = z.string().max(2000).nullable().safeParse(req.body?.note ?? null);
  if (!note.success) return res.status(400).json({ error: "note must be up to 2000 characters" });
  try {
    const exists = await prisma.user.findUnique({ where: { id: id.data }, select: { id: true } });
    if (!exists) return res.status(404).json({ error: "User not found" });
    const value = note.data?.trim() ? note.data.trim() : null;
    await prisma.user.update({ where: { id: id.data }, data: { adminNote: value } });
    await writeAudit({ actorId: req.user.id, action: "USER_NOTE_UPDATED", targetId: id.data, metadata: { length: value?.length || 0 } });
    res.json({ ok: true, adminNote: value });
  } catch (err) { next(err); }
});

// GET /api/admin/export/users.csv?role=&blacklisted=true
// Експорт без имейли (минимизация) — MAIN_OWNER + step-up + одит.
function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Защита от формули в Excel/Sheets (CSV injection).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export { csvCell };

router.get("/export/users.csv", requireMainOwner, stepUp, async (req, res, next) => {
  try {
    const role = ["MAIN_OWNER", "SUPER_USER", "SUPPORT_STAFF", "USER"].includes(String(req.query.role)) ? String(req.query.role) : null;
    const where = { ...(role && { globalRole: role }), ...(req.query.blacklisted === "true" && { isBlacklisted: true }) };
    const users = await prisma.user.findMany({
      where, orderBy: { createdAt: "asc" }, take: 50_000,
      select: { id: true, username: true, globalRole: true, language: true, isBlacklisted: true, blacklistedUntil: true, blacklistReason: true, mfaEnabledAt: true, createdAt: true,
        _count: { select: { tickets: true, applications: true, serverMembers: true } } },
    });
    const header = ["id", "username", "role", "language", "blacklisted", "blacklisted_until", "blacklist_reason", "mfa", "servers", "tickets", "applications", "created_at"];
    const now = new Date();
    const lines = [header.join(",")].concat(users.map((u) => [
      u.id, u.username, u.globalRole, u.language, isBlacklistActive(u, now) ? "yes" : "no", u.blacklistedUntil, u.blacklistReason,
      u.mfaEnabledAt ? "yes" : "no", u._count.serverMembers, u._count.tickets, u._count.applications, u.createdAt,
    ].map(csvCell).join(",")));
    await writeAudit({ actorId: req.user.id, action: "USERS_EXPORTED", targetId: "users", metadata: { rows: users.length, role, blacklisted: req.query.blacklisted === "true" } });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="supreme-users-${now.toISOString().slice(0, 10)}.csv"`);
    res.setHeader("Cache-Control", "no-store");
    res.send("﻿" + lines.join("\r\n") + "\r\n");
  } catch (err) { next(err); }
});

export default router;
