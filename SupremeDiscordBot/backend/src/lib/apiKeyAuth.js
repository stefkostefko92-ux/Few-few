// backend/src/lib/apiKeyAuth.js
// ЕДНОТО определение за автентикация с публичен API ключ + списъкът scope-ове.
//
// ЗАЩО (одит 09.08.2026): дотук имаше ДВА списъка VALID_SCOPES — в монтирания
// издател (publicApi.js) и в НЕМОНТИРАНИЯ apikeys.js, от който v1.js внасяше
// requireApiKey. Списъците дрейфнаха: v1 изискваше `server:read`, който
// издателят не предлагаше → GET /api/v1/server беше ВЕЧНО 403 за всеки ключ.
// Файлът-примамка е изтрит; и издателят, и консуматорите внасят оттук.
import crypto from "node:crypto";
import { prisma } from "./prisma.js";

export const VALID_SCOPES = [
  "server:read",
  "tickets:read",
  "forms:read",
  "applications:read",
  "panels:read",
  "polls:read",
  "giveaways:read",
  "analytics:read",
  // ЗАБЕЛЕЖКА: *:write scope-ове НЕ се издават — нито /public/v1, нито /api/v1
  // има пишещ маршрут. Издаден scope без маршрут е продадена възможност,
  // която не съществува; връщат се тук заедно с маршрутите си.
];

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
