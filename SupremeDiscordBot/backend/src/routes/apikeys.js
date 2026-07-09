// backend/src/routes/apikeys.js
// Dashboard-side CRUD for API keys, plus the middleware public API endpoints use
// to authenticate incoming requests.
import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { requirePremium } from "../lib/premium.js";

const router = Router();

export const VALID_SCOPES = [
  "tickets:read",       "tickets:write",
  "panels:read",        "panels:write",
  "forms:read",         "forms:write",
  "applications:read",  "applications:write",
  "polls:read",         "polls:write",
  "giveaways:read",     "giveaways:write",
  "server:read",        "server:write",
];

/**
 * Middleware for public API routes (/api/v1/*).
 * Validates Bearer token against hashed api_keys.keyHash,
 * attaches req.apiKey with scopes + serverId, increments requestCount.
 *
 * Usage:
 *   router.get("/tickets", requireApiKey("tickets:read"), handler);
 */
export function requireApiKey(...requiredScopes) {
  return async function apiKeyAuth(req, res, next) {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header. Expected: Bearer bp_live_xxx" });
    }
    const token = auth.slice(7).trim();
    if (!token) return res.status(401).json({ error: "Empty API key" });

    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });

    if (!key || key.revokedAt) {
      return res.status(401).json({ error: "Invalid or revoked API key" });
    }
    if (key.expiresAt && key.expiresAt < new Date()) {
      return res.status(401).json({ error: "API key expired" });
    }
    // Scope check
    for (const scope of requiredScopes) {
      if (!key.scopes.includes(scope)) {
        return res.status(403).json({ error: `Missing scope: ${scope}`, requiredScopes });
      }
    }

    // Fire-and-forget usage tracking
    prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
    }).catch(() => {});

    req.apiKey = key;
    req.params.serverId = key.serverId;  // Force serverId from the key
    next();
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD CRUD (session-authed)
// ══════════════════════════════════════════════════════════════════════════════

router.use(requireAuth, loadUser);

router.get("/:serverId/keys", requireServerAdmin, async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { serverId: req.params.serverId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        lastUsedAt: true, expiresAt: true, revokedAt: true, requestCount: true, createdAt: true,
      },
    });
    res.json(keys);
  } catch (err) { next(err); }
});

const createSchema = z.object({
  name:      z.string().min(1).max(100),
  scopes:    z.array(z.enum(VALID_SCOPES)).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

router.post("/:serverId/keys", requireServerAdmin, requirePremium("integrations.webhooks"), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Generate "bp_live_" + 32 random hex chars
    const rawToken = "bp_live_" + crypto.randomBytes(24).toString("hex");
    const keyHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const keyPrefix = rawToken.slice(0, 16);

    const key = await prisma.apiKey.create({
      data: {
        userId: req.user.id,
        serverId: req.params.serverId,
        name: parsed.data.name,
        keyHash, keyPrefix,
        scopes: parsed.data.scopes,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      },
      select: {
        id: true, name: true, keyPrefix: true, scopes: true,
        expiresAt: true, createdAt: true,
      },
    });

    // Plaintext token is ONLY returned here — cannot be retrieved later
    res.status(201).json({ ...key, token: rawToken });
  } catch (err) { next(err); }
});

router.post("/:serverId/keys/:id/revoke", requireServerAdmin, async (req, res, next) => {
  try {
    // Scope to the authorized server — the key id alone must not be enough
    const existing = await prisma.apiKey.findFirst({
      where: { id: req.params.id, serverId: req.params.serverId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "API key not found" });
    const key = await prisma.apiKey.update({
      where: { id: req.params.id },
      data: { revokedAt: new Date() },
      select: { id: true, name: true, revokedAt: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "API_KEY_REVOKED",
        targetId: req.params.id,
      },
    });
    res.json(key);
  } catch (err) { next(err); }
});

router.delete("/:serverId/keys/:id", requireServerAdmin, async (req, res, next) => {
  try {
    const { count } = await prisma.apiKey.deleteMany({
      where: { id: req.params.id, serverId: req.params.serverId },
    });
    if (!count) return res.status(404).json({ error: "API key not found" });
    await prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        serverId: req.params.serverId,
        action: "API_KEY_DELETED",
        targetId: req.params.id,
      },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.get("/scopes", (_req, res) => {
  res.json({ scopes: VALID_SCOPES });
});

export default router;
