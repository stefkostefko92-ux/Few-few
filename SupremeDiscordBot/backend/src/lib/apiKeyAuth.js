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
import { getServerTier, planHasFeature } from "./premium.js";
import { check, recordFailure, recordSuccess } from "./bruteForce.js";

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
    // Дроселиране на НЕУСПЕШНИТЕ опити (виж lib/bruteForce.js). Тук е вторият
    // път за API ключове (/api/v1) — той е под глобалния лимитер, но 200/мин
    // пак е много за налучкване на тайна, а вече блокираните не бива да стигат
    // до базата изобщо.
    const blocked = await check("apikey", req.ip);
    if (blocked.blocked) {
      res.setHeader("Retry-After", String(blocked.retryAfterSec));
      return res.status(429).json({
        error: "Too many failed attempts. Try again later.",
        code: "TOO_MANY_FAILED_ATTEMPTS",
        retryAfterSeconds: blocked.retryAfterSec,
      });
    }
    const fail = async (status, body) => {
      await recordFailure("apikey", req.ip);
      return res.status(status).json(body);
    };

    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return fail(401, { error: "Missing or invalid Authorization header. Expected: Bearer bp_live_xxx" });
    }
    const token = auth.slice(7).trim();
    if (!token) return fail(401, { error: "Empty API key" });

    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const key = await prisma.apiKey.findUnique({ where: { keyHash: hash } });

    if (!key || key.revokedAt) {
      // Едно съобщение за „няма такъв" и „отнет" — разликата би издала на
      // налучкващия, че е познал съществуващ ключ.
      return fail(401, { error: "Invalid or revoked API key" });
    }
    if (key.expiresAt && key.expiresAt < new Date()) {
      return fail(401, { error: "API key expired" });
    }
    // Тарифен гейт при ПОЛЗВАНЕ (не само при издаване): ключ, издаден по време
    // на trial или преди downgrade, иначе работеше вечно — /api/v1/* сервираше
    // тикети и кандидатури на сървър БЕЗ активен план. publicApi.js (/public/v1)
    // вече пазеше това; тук липсваше. Проверка върху ЕФЕКТИВНИЯ tier. Одит 11.08.2026.
    const tier = await getServerTier(key.serverId);
    if (!planHasFeature(tier.plan, "integrations.restApi")) {
      return res.status(403).json({
        error: "The REST API requires an active Premium plan on this server.",
        code: "PREMIUM_REQUIRED",
      });
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

    // Валиден ключ → чистим историята на провалите за този подател.
    await recordSuccess("apikey", req.ip);
    req.apiKey = key;
    req.params.serverId = key.serverId;  // Force serverId from the key
    next();
  };
}
