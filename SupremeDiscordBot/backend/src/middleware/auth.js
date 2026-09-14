// backend/src/middleware/auth.js
import axios from "axios";
import { timingSafeEqual } from "crypto";
import { prisma } from "../lib/prisma.js";
import { encrypt, decryptSafe } from "../lib/crypto.js";
import { fetchUserGuilds } from "../lib/discordRest.js";
import { check, recordFailure, recordSuccess } from "../lib/bruteForce.js";

/**
 * Require the user to be logged in via Discord OAuth2 session.
 */
export function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Unauthorized — please log in" });
  }
  next();
}

/**
 * Load the full User record from DB and attach to req.user.
 * Also rejects blacklisted users.
 */
export async function loadUser(req, res, next) {
  if (!req.session?.userId) return next();
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });
    if (!user) {
      req.session.destroy();
      return res.status(401).json({ error: "User not found" });
    }
    if (user.isBlacklisted) {
      return res.status(403).json({ error: "You have been blacklisted from this platform" });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require the user to be at least a Support Staff member.
 */
export function requireStaff(req, res, next) {
  const allowed = ["MAIN_OWNER", "SUPER_USER", "SUPPORT_STAFF"];
  if (!req.user || !allowed.includes(req.user.globalRole)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  next();
}

/**
 * Require the user to be a Super User or higher.
 */
export function requireSuperUser(req, res, next) {
  const allowed = ["MAIN_OWNER", "SUPER_USER"];
  if (!req.user || !allowed.includes(req.user.globalRole)) {
    return res.status(403).json({ error: "Super User access required" });
  }
  next();
}

/**
 * Require the user to be the Main Owner.
 */
export function requireMainOwner(req, res, next) {
  if (!req.user || req.user.globalRole !== "MAIN_OWNER") {
    return res.status(403).json({ error: "Main Owner access required" });
  }
  next();
}

/**
 * Validate that the request comes from the internal bot service
 * using a shared API secret header.
 */
export async function requireBotSecret(req, res, next) {
  // Дроселиране на неуспешните опити (виж lib/bruteForce.js). Ботът знае
  // тайната си и НИКОГА не бърка — тоест всеки провал тук е или счупена
  // конфигурация, или налучкване. И в двата случая заслужава спирачка.
  try {
    const blocked = await check("botsecret", req.ip);
    if (blocked.blocked) {
      res.setHeader("Retry-After", String(blocked.retryAfterSec));
      return res.status(429).json({
        error: "Too many failed attempts. Try again later.",
        code: "TOO_MANY_FAILED_ATTEMPTS",
        retryAfterSeconds: blocked.retryAfterSec,
      });
    }
  } catch { /* защитата никога не сваля входа */ }

  const deny = async () => {
    await recordFailure("botsecret", req.ip).catch(() => {});
    return res.status(401).json({ error: "Invalid bot secret" });
  };

  const secret = req.headers["x-bot-secret"];
  const expected = process.env.API_SECRET;
  if (!secret || !expected) return deny();

  const a = Buffer.from(String(secret));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return deny();

  await recordSuccess("botsecret", req.ip).catch(() => {});
  next();
}

/**
 * Check if the user is an admin of the requested server.
 * Uses Discord API to verify ManageGuild permission (bit 0x20).
 * Main Owner and Super User bypass this check entirely.
 */
export async function requireServerAdmin(req, res, next) {
  const { serverId } = req.params;
  if (!serverId) return res.status(400).json({ error: "serverId required" });

  // Platform-level admins bypass server-level checks
  if (["MAIN_OWNER", "SUPER_USER"].includes(req.user?.globalRole)) {
    return next();
  }

  try {
    // Get user's Discord access token from most recent session
    const session = await prisma.session.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return res.status(401).json({ error: "Discord session expired — please log in again" });
    }

    // Check token expiry — attempt refresh before rejecting
    if (new Date() > new Date(session.expiresAt)) {
      if (session.refreshToken) {
        try {
          const tokenRes = await axios.post(
            "https://discord.com/api/v10/oauth2/token",
            new URLSearchParams({
              client_id: process.env.DISCORD_CLIENT_ID,
              client_secret: process.env.DISCORD_CLIENT_SECRET,
              grant_type: "refresh_token",
              refresh_token: decryptSafe(session.refreshToken),
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
          );
          const { access_token, refresh_token, expires_in } = tokenRes.data;

          // Update the session with fresh tokens
          await prisma.session.update({
            where: { id: session.id },
            data: {
              accessToken: encrypt(access_token),
              refreshToken: encrypt(refresh_token),
              expiresAt: new Date(Date.now() + expires_in * 1000),
            },
          });

          // Use the fresh (plaintext) token for this request; decryptSafe below
          // passes it through unchanged.
          session.accessToken = access_token;
        } catch (refreshErr) {
          // Refresh failed (token revoked, user changed password, etc.) — force re-login
          return res.status(401).json({ error: "Session expired — please log in again" });
        }
      } else {
        return res.status(401).json({ error: "Session expired — please log in again" });
      }
    }

    // Fetch user's guilds from Discord API (кеширано 30s + 429-aware — този
    // маршрут се бие при ВСЯКА заявка към дашборда и беше водещият източник на
    // rate limit).
    const guilds = await fetchUserGuilds(decryptSafe(session.accessToken));

    const guild = guilds.find((g) => g.id === serverId);

    if (!guild) {
      return res.status(403).json({ error: "You are not a member of this server" });
    }

    // Check ManageGuild permission (bit 0x20)
    const hasManageGuild = (BigInt(guild.permissions) & BigInt(0x20)) !== BigInt(0);

    if (!hasManageGuild) {
      return res.status(403).json({ error: "You need Manage Server permission to access this" });
    }

    req.discordGuild = guild;
    next();
  } catch (err) {
    // If Discord API fails, fall back to DB check
    if (err?.response?.status === 401) {
      return res.status(401).json({ error: "Discord token expired — please log in again" });
    }
    // Discord ни лимитира (след повторните опити в discordRest). 503 + Retry-After
    // е честният отговор — 500 би подсказал наш дефект, а клиентът не би знаел
    // кога да опита пак.
    if (err?.response?.status === 429) {
      const retry = Number(err.response.headers?.["retry-after"]) || 5;
      res.set("Retry-After", String(Math.ceil(retry)));
      return res.status(503).json({ error: "Discord is rate limiting us — try again shortly" });
    }
    next(err);
  }
}
