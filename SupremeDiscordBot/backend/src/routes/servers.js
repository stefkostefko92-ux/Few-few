// backend/src/routes/servers.js
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import axios from "axios";
import { requireAuth, loadUser, requireServerAdmin } from "../middleware/auth.js";
import { encrypt, decrypt, decryptSafe } from "../lib/crypto.js";
import { notifyBot } from "../services/botNotifier.js";
import { isSupportedLanguage } from "../lib/languages.js";
import { getServerTier } from "../lib/premium.js";

const router = Router();

// Strip sensitive credentials from server responses.
// customBotToken is write-only — never returned to the client.
function sanitizeServer(server) {
  if (!server) return server;
  const { customBotToken: _token, ...safe } = server;
  return safe;
}


// Apply auth middleware to all routes
router.use(requireAuth, loadUser);

// ─── GET /api/servers ─────────────────────────────────────────────────────────
// Return servers where the user is a member (fetched from Discord + cross-referenced DB)

router.get("/", async (req, res, next) => {
  try {
    // Get user's Discord guilds using their access token from DB session
    const session = await prisma.session.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    if (!session) return res.json([]);

    let guildsRes;
    try {
      guildsRes = await axios.get("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${decryptSafe(session.accessToken)}` },
      });
    } catch (discordErr) {
      if (discordErr?.response?.status === 401) {
        return res.status(401).json({ error: "Discord token expired — please log in again" });
      }
      throw discordErr;
    }

    const discordGuilds = guildsRes.data;

    // Filter to guilds where user is admin (has MANAGE_GUILD permission = bit 0x20)
    const adminGuilds = discordGuilds.filter((g) => {
      try {
        return g.permissions && (BigInt(g.permissions) & BigInt(0x20)) !== BigInt(0);
      } catch {
        return false; // malformed permissions value
      }
    });

    // Cross-reference with our DB to get premium status etc.
    // Exclude servers where the bot has been kicked (botRemovedAt != null).
    const serverIds = adminGuilds.map((g) => g.id);
    // Ефективно premium в списъка: собствен план ИЛИ активен trial ИЛИ активна
    // агенция (agency seat не сетва суровия isPremium — виж premium.js). Без
    // agency/trial проверката badge-ът липсваше на платени сървъри.
    const now = new Date();
    const dbServers = await prisma.server.findMany({
      where: { id: { in: serverIds }, botRemovedAt: null },
      select: {
        id: true, isPremium: true, stripeStatus: true, trialEndsAt: true,
        agencyId: true, agency: { select: { active: true } },
      },
    });
    const dbMap = Object.fromEntries(dbServers.map((s) => [s.id, s]));

    const effectivePremium = (s) =>
      !!s && (s.isPremium
        || (s.trialEndsAt && s.trialEndsAt > now)
        || (s.agencyId && s.agency?.active));

    const result = adminGuilds.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon
        ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith("a_") ? "gif" : "png"}`
        : null,
      botAdded: !!dbMap[g.id],
      isPremium: !!effectivePremium(dbMap[g.id]),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/servers/:serverId ───────────────────────────────────────────────

router.get("/:serverId", requireServerAdmin, async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      include: {
        _count: { select: { tickets: true, panels: true, forms: true } },
      },
    });

    if (!server) return res.status(404).json({ error: "Server not found" });

    // v2.0 — Enrich with computed tier state. getServerTier резолвира
    // собствен план + активен trial + AGENCY seat — суровият isPremium
    // изпускаше agency-покритите сървъри (dashboard ги показваше безплатни
    // дори платената функция да работи; при стара колона — обратното).
    const now = new Date();
    const trialActive = !!(server.trialEndsAt && server.trialEndsAt > now);
    const tier = await getServerTier(req.params.serverId);
    const trialDaysLeft = trialActive
      ? Math.ceil((server.trialEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    const response = sanitizeServer(server);
    response.isPremium = tier.isPremium;     // собствен план ИЛИ trial ИЛИ agency
    response.plan = tier.plan;
    response.hasWhiteLabel = tier.hasWhiteLabel;
    response.isTrial = trialActive;
    response.trialDaysLeft = trialDaysLeft;
    response.trialUsed = server.trialUsed;
    response.trialEndsAt = server.trialEndsAt;

    res.json(response);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/servers/:serverId ─────────────────────────────────────────────

router.patch("/:serverId", requireServerAdmin, async (req, res, next) => {
  const {
    logChannelId, archiveChannelId,
    customBotToken, customBotName, customBotAvatar,
    // AI auto-replies
    aiRepliesEnabled, aiRepliesPrompt,
    // Round-Robin
    roundRobinEnabled, roundRobinRoleId,
    // v1.6 — appy.bot parity
    welcomerEnabled, welcomerChannelId, welcomerMessage, welcomerEmbedColor,
    welcomerDmEnabled, welcomerDmMessage,
    autoroleIds, autoroleBotIds,
    stickyMessagesEnabled,
    // Server event logging
    eventLogEnabled, eventLogChannelId, eventLogCategories,
    // Език на бота за ТОЗИ сървър — резервен, когато Discord клиентският
    // locale на потребителя не е сред поддържаните (виж bot/src/i18n).
    language,
  } = req.body;

  try {
    const server = await prisma.server.findUnique({ where: { id: req.params.serverId } });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // Tier guards — uses getServerTier() which honors active trial + agency.
    // White-label (custom bot) needs the White-label/Agency tier; AI + round-robin
    // need Premium or above.
    const tier = await getServerTier(req.params.serverId);
    const whiteLabelFields = [customBotToken, customBotName, customBotAvatar];
    if (whiteLabelFields.some((v) => v !== undefined) && !tier.hasWhiteLabel) {
      return res.status(403).json({
        error: "White-label custom bot requires the White-label or Agency plan.",
        code: "PREMIUM_REQUIRED", requiredPlan: "whitelabel", currentPlan: tier.plan,
      });
    }
    const premiumFields = [aiRepliesEnabled, roundRobinEnabled];
    if (premiumFields.some((v) => v !== undefined) && !tier.isPremium) {
      return res.status(403).json({
        error: "This feature requires Premium.",
        code: "PREMIUM_REQUIRED", requiredPlan: "premium", currentPlan: tier.plan,
      });
    }

    // The AI prompt is injected into the model's system prompt — cap its size
    // so a stored prompt can't inflate token spend.
    if (aiRepliesPrompt !== undefined && aiRepliesPrompt && String(aiRepliesPrompt).length > 2000) {
      return res.status(400).json({ error: "AI reply prompt must be 2000 characters or fewer" });
    }

    const updated = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        ...(logChannelId !== undefined && { logChannelId: logChannelId || null }),
        ...(archiveChannelId !== undefined && { archiveChannelId: archiveChannelId || null }),
        ...(customBotToken !== undefined && { customBotToken: customBotToken ? encrypt(customBotToken) : null }),
        ...(customBotName !== undefined && { customBotName: customBotName || null }),
        ...(customBotAvatar !== undefined && { customBotAvatar: customBotAvatar || null }),
        ...(aiRepliesEnabled !== undefined && { aiRepliesEnabled: Boolean(aiRepliesEnabled) }),
        ...(aiRepliesPrompt !== undefined && { aiRepliesPrompt: aiRepliesPrompt || null }),
        ...(roundRobinEnabled !== undefined && { roundRobinEnabled: Boolean(roundRobinEnabled) }),
        ...(roundRobinRoleId !== undefined && { roundRobinRoleId: roundRobinRoleId || null }),
        // v1.6 appy.bot fields
        ...(welcomerEnabled !== undefined && { welcomerEnabled: Boolean(welcomerEnabled) }),
        ...(welcomerChannelId !== undefined && { welcomerChannelId: welcomerChannelId || null }),
        ...(welcomerMessage !== undefined && { welcomerMessage: welcomerMessage || null }),
        ...(welcomerEmbedColor !== undefined && { welcomerEmbedColor: welcomerEmbedColor || null }),
        ...(welcomerDmEnabled !== undefined && { welcomerDmEnabled: Boolean(welcomerDmEnabled) }),
        ...(welcomerDmMessage !== undefined && { welcomerDmMessage: welcomerDmMessage || null }),
        ...(Array.isArray(autoroleIds) && { autoroleIds }),
        ...(Array.isArray(autoroleBotIds) && { autoroleBotIds }),
        ...(stickyMessagesEnabled !== undefined && { stickyMessagesEnabled: Boolean(stickyMessagesEnabled) }),
        // Server event logging (free feature — no premium gate)
        ...(eventLogEnabled !== undefined && { eventLogEnabled: Boolean(eventLogEnabled) }),
        ...(eventLogChannelId !== undefined && { eventLogChannelId: eventLogChannelId || null }),
        ...(Array.isArray(eventLogCategories) && {
          eventLogCategories: eventLogCategories.filter((c) => ["voice", "members", "moderation", "messages"].includes(c)),
        }),
        // Език на бота за сървъра — валидиран срещу поддържаните; невалиден се
        // игнорира тихо, вместо да записва боклук.
        ...(language !== undefined && isSupportedLanguage(language) && { language }),
      },
    });

    // If custom bot token was updated, tell the bot to restart the white-label client
    if (customBotToken !== undefined) {
      notifyBot("WHITELABEL_UPDATE", { serverId: req.params.serverId }).catch(() => {});
    }

    res.json(sanitizeServer(updated));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/servers/:serverId/stats ─────────────────────────────────────────

router.get("/:serverId/stats", requireServerAdmin, async (req, res, next) => {
  try {
    const [ticketCount, openTickets, applications, closedThisWeek] = await Promise.all([
      prisma.ticket.count({ where: { serverId: req.params.serverId } }),
      prisma.ticket.count({ where: { serverId: req.params.serverId, status: "OPEN" } }),
      prisma.application.count({ where: { serverId: req.params.serverId } }),
      prisma.ticket.count({
        where: {
          serverId: req.params.serverId,
          status: "CLOSED",
          closedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    res.json({ ticketCount, openTickets, applications, closedThisWeek });
  } catch (err) {
    next(err);
  }
});

export default router;
