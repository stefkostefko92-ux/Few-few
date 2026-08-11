// backend/src/routes/publicApi.js
// Public REST API for third-party integrations.
// Authenticated via `Authorization: Bearer bpk_live_...` header.
// Rate-limited separately from the session-based dashboard API.

import { Router } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { requirePremium, getServerTier, planHasFeature } from "../lib/premium.js";
import { withIconUrl } from "../lib/discordCdn.js";

const router = Router();

// Едно определение — lib/apiKeyAuth.js (одит 09.08.2026: двата дрейфнали
// списъка направиха /api/v1/server вечно 403). Оттам идва и server:read;
// *:write отпаднаха — маршрути за тях няма никъде.
export { VALID_SCOPES } from "../lib/apiKeyAuth.js";
import { VALID_SCOPES } from "../lib/apiKeyAuth.js";
import { bruteForceGuard, recordFailure, recordSuccess } from "../lib/bruteForce.js";

// ═══════════════════════════════════════════════════════════════════════════
// API KEY MANAGEMENT (dashboard-authed)
// ═══════════════════════════════════════════════════════════════════════════

const mgmt = Router();
mgmt.use(requireAuth, loadUser);

mgmt.get("/:serverId/api-keys", requireServerAdmin, async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { serverId: req.params.serverId, revokedAt: null },
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        lastUsedAt: true, expiresAt: true, createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(keys);
  } catch (err) { next(err); }
});

mgmt.post("/:serverId/api-keys", requireServerAdmin, requirePremium("integrations.restApi"), async (req, res, next) => {
  const { name, scopes, expiresInDays } = req.body;
  if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return res.status(400).json({ error: "At least one scope required" });
  }
  const invalid = scopes.filter((s) => !VALID_SCOPES.includes(s));
  if (invalid.length) return res.status(400).json({ error: `Invalid scopes: ${invalid.join(", ")}` });

  try {
    // Generate key: bpk_live_<32 random chars>
    const rawSecret = crypto.randomBytes(24).toString("base64url");
    const fullKey = `bpk_live_${rawSecret}`;
    const keyHash = crypto.createHash("sha256").update(fullKey).digest("hex");
    const keyPrefix = fullKey.slice(0, 20); // "bpk_live_abc123..." preview

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await prisma.apiKey.create({
      data: {
        serverId: req.params.serverId,
        userId: req.user.id,
        name, scopes, keyHash, keyPrefix, expiresAt,
        createdBy: req.user.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "API_KEY_CREATED",
        targetId: apiKey.id,
        metadata: { name, scopes, expiresAt },
      },
    });

    // Return full key ONCE — never stored or retrievable again
    res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key: fullKey, // Only shown here
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      warning: "Save this key now. It will not be shown again.",
    });
  } catch (err) { next(err); }
});

mgmt.delete("/:serverId/api-keys/:id", requireServerAdmin, async (req, res, next) => {
  try {
    // Scope to the authorized server — the key id alone must not be enough
    const { count } = await prisma.apiKey.updateMany({
      where: { id: req.params.id, serverId: req.params.serverId },
      data: { revokedAt: new Date() },
    });
    if (!count) return res.status(404).json({ error: "API key not found" });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "API_KEY_REVOKED",
        targetId: req.params.id,
      },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

mgmt.get("/scopes", (req, res) => {
  res.json({ scopes: VALID_SCOPES });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API (bearer-token auth)
// ═══════════════════════════════════════════════════════════════════════════

// Dedicated rate limit for API key traffic (per key, 300/min)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.apiKey?.id || req.ip,
  message: { error: "API rate limit exceeded" },
});

async function authenticateApiKey(req, res, next) {
  // Всеки провал по този път се брои срещу подателя (виж lib/bruteForce.js).
  // Ключовете са 192 бита ентропия, тоест налучкването е математически
  // безнадеждно — но дроселирането е задължителният втори слой: спира и
  // безплатния DoS (всеки опит е sha256 + заявка към базата), и разузнаването.
  const fail = async (status, body) => {
    await recordFailure("apikey", req.ip);
    return res.status(status).json(body);
  };

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return fail(401, { error: "Missing Bearer token" });
  }
  const token = auth.slice(7);
  if (!token.startsWith("bpk_live_")) {
    return fail(401, { error: "Invalid API key format" });
  }

  const keyHash = crypto.createHash("sha256").update(token).digest("hex");
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, serverId: true, scopes: true, revokedAt: true, expiresAt: true },
  });

  if (!apiKey || apiKey.revokedAt) {
    // Едно и също съобщение за „няма такъв ключ" и „ключът е отнет" — разликата
    // би казала на налучкващия, че е познал съществуващ ключ.
    return fail(401, { error: "Invalid or revoked API key" });
  }
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return fail(401, { error: "API key expired" });
  }

  // Тарифен гейт при ПОЛЗВАНЕ, не само при издаване: ключ, издаден по време на
  // 14-дневния trial (или преди изтичане на абонамента), иначе продължаваше да
  // работи вечно — платена функция, раздавана безплатно. Проверката е върху
  // ЕФЕКТИВНИЯ tier (собствен план + активен trial + agency seat).
  const tier = await getServerTier(apiKey.serverId);
  if (!planHasFeature(tier.plan, "integrations.restApi")) {
    return res.status(403).json({
      error: "The REST API requires an active Premium plan on this server.",
      code: "PREMIUM_REQUIRED",
    });
  }

  // Async update lastUsedAt + requestCount — don't block
  prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
  }).catch(() => {});

  // Валиден ключ → историята на провалите се чисти, за да не носи наказание
  // човек, който веднъж е сбъркал.
  await recordSuccess("apikey", req.ip);
  req.apiKey = apiKey;
  req.serverId = apiKey.serverId;
  next();
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey?.scopes?.includes(scope)) {
      return res.status(403).json({ error: `Missing scope: ${scope}` });
    }
    next();
  };
}

// ПРЕДИ автентикацията: лимит по IP, който хваща и НЕУСПЕШНИТЕ опити.
//
// ДЕФЕКТЪТ (одит 11.08.2026): `apiLimiter` е монтиран СЛЕД `authenticateApiKey`
// (нарочно — за да брои per-key), а `/public/v1` е извън `/api`, значи и
// глобалният лимитер не го покрива. Резултат: невалиден ключ получаваше 401
// преди който и да е лимитер да се е изпълнил → налучкването на API ключове
// беше НАПЪЛНО НЕДРОСЕЛИРАНО. Двата слоя се допълват: този пази ВХОДА по IP,
// долният пази квотата per-key.
const preAuthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
  message: { error: "Too many requests — please slow down" },
});

const api = Router();
// 1) вече блокираните не стигат до базата изобщо
api.use(bruteForceGuard("apikey"));
// 2) таван по IP ПРЕДИ автентикацията (покрива неуспешните опити)
api.use(preAuthLimiter);
// 3) автентикация — брои провалите си в bruteForce
api.use(authenticateApiKey);
// 4) щедрата per-key квота за РЕАЛНИТЕ клиенти (keyGenerator иска req.apiKey,
//    затова стои след автентикацията — това беше и оригиналната причина за реда)
api.use(apiLimiter);

// GET /public/v1/me — server info about the key's owner
api.get("/me", async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.serverId },
      select: { id: true, name: true, icon: true },
    });
    // Ефективен tier (agency/trial не са в суровата колона).
    const { isPremium, plan } = await getServerTier(req.serverId);
    res.json({
      // `icon` е адрес, не суров хеш — виж lib/discordCdn.js.
      server: server ? { ...withIconUrl(server), isPremium, plan } : null,
      keyId: req.apiKey.id,
      scopes: req.apiKey.scopes,
    });
  } catch (err) { next(err); }
});

// GET /public/v1/tickets
api.get("/tickets", requireScope("tickets:read"), async (req, res, next) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const where = { serverId: req.serverId };
    if (status) where.status = String(status);

    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        take: Math.min(Number(limit), 100),
        skip: Number(offset),
        orderBy: { createdAt: "desc" },
        select: {
          id: true, panelId: true, creatorId: true, channelId: true,
          status: true, assigneeId: true, number: true,
          createdAt: true, closedAt: true,
        },
      }),
      prisma.ticket.count({ where }),
    ]);
    res.json({ data: items, total, limit: Number(limit), offset: Number(offset) });
  } catch (err) { next(err); }
});

// GET /public/v1/tickets/:id
api.get("/tickets/:id", requireScope("tickets:read"), async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, serverId: req.serverId },
    });
    if (!ticket) return res.status(404).json({ error: "Not found" });
    res.json(ticket);
  } catch (err) { next(err); }
});

// GET /public/v1/forms
api.get("/forms", requireScope("forms:read"), async (req, res, next) => {
  try {
    const forms = await prisma.form.findMany({
      where: { serverId: req.serverId },
      include: { _count: { select: { applications: true } } },
    });
    res.json({ data: forms });
  } catch (err) { next(err); }
});

// GET /public/v1/applications
api.get("/applications", requireScope("applications:read"), async (req, res, next) => {
  try {
    const { status, limit = 20, offset = 0 } = req.query;
    const where = { serverId: req.serverId };
    if (status) where.status = String(status);
    const [items, total] = await Promise.all([
      prisma.application.findMany({
        where, take: Math.min(Number(limit), 100), skip: Number(offset),
        orderBy: { createdAt: "desc" },
      }),
      prisma.application.count({ where }),
    ]);
    res.json({ data: items, total, limit: Number(limit), offset: Number(offset) });
  } catch (err) { next(err); }
});

// GET /public/v1/analytics/daily?from=2026-04-01&to=2026-04-30
api.get("/analytics/daily", requireScope("analytics:read"), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const where = { serverId: req.serverId };
    if (from) where.date = { ...where.date, gte: new Date(String(from)) };
    if (to)   where.date = { ...where.date, lte: new Date(String(to)) };

    const metrics = await prisma.dailyMetric.findMany({
      where,
      orderBy: { date: "asc" },
      take: 365,
    });
    res.json({ data: metrics });
  } catch (err) { next(err); }
});

export { mgmt as apiKeyManagementRouter };
export default api;
