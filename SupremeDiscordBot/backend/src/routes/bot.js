// backend/src/routes/bot.js
// Internal routes called BY the Discord bot to interact with the backend API
// (separate from the bot-notifier that calls the bot)
import { Router } from "express";
import { isBlacklistActive, BLACKLIST_SELECT } from "../lib/blacklist.js";
import { prisma } from "../lib/prisma.js";
import { awardTicketSlaXp } from "../lib/game/xp.js";
import { requireBotSecret } from "../middleware/auth.js";
import { generateHtmlTranscript } from "../utils/archive.js";
import { ensureArchiveToken, tokenizedArchiveUrl } from "../lib/archiveToken.js";
import { decrypt } from "../lib/crypto.js";
import { pickNextAssignee } from "../services/roundRobin.js";
import { generateAutoReply, aiRateLimitOk, AI_MODEL_NAME } from "../services/aiReply.js";
import { getServerTier, planHasFeature, sanitizePanelForTier, sanitizeFormForTier } from "../lib/premium.js";
import { buildTranscript } from "../lib/appTranscript.js";
import { submitApplication } from "../services/applicationSubmit.js";
import { claimApplicationReview, closeApplicationDiscussion, openApplicationDiscussion } from "../lib/applicationReview.js";
import { writeAudit } from "../lib/auditLog.js";
import { ensureUserStub, ensureUserStubs } from "../lib/ensureUser.js";
import { eraseDiscordUser, summarizeDiscordUser } from "../lib/dsr.js";
import { sealTranscript } from "../lib/transcriptAtRest.js";
import axios from "axios";
import { ssrfSafeAgent, validateWebhookUrl, fireWebhooks } from "../services/webhooks.js";
import { closeTicketIfOpen, archiveBase, CLOSE_REASON_MAX } from "../lib/ticketClose.js";
import { loadSanitizedPanel, withSanitizedPanel, withServerLogFallback } from "../lib/ticketPanel.js";
import { checkTicketLimits } from "../lib/ticketLimits.js";
import { fireApplicationReviewed } from "../lib/webhookEvents.js";

const router = Router();
const BOT_SNOWFLAKE = /^\d{17,20}$/;

router.use(requireBotSecret);

// Гейт за ПЛАТЕНА тикет функция по бот-пътя. Уеб-пътят (tickets.js) ползва
// requirePremium(featureKey) middleware, но там serverId е в path-а; тук е само
// :ticketId, затова резолвираме тарифата от самия тикет. Връща serverId при
// достъп, или изпраща 403 и връща null (извикващият прекратява).
async function gateTicketFeature(req, res, featureKey) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: req.params.ticketId },
    select: { serverId: true },
  });
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return null; }
  const tier = await getServerTier(ticket.serverId);
  if (!planHasFeature(tier.plan, featureKey)) {
    res.status(403).json({ error: "This action requires Premium", code: "PREMIUM_REQUIRED", feature: featureKey });
    return null;
  }
  return ticket.serverId;
}

// ─── GET /api/bot/server/:serverId ────────────────────────────────────────────
// Bot fetches server config to know which features are enabled

router.get("/server/:serverId", async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      include: {
        panels: {
          include: {
            buttons: { include: { form: { include: { questions: { orderBy: { order: "asc" } } } } } },
          },
        },
        forms: { include: { questions: { orderBy: { order: "asc" } } } },
      },
    });

    if (!server) {
      // Auto-register server on first bot join
      return res.json({ id: req.params.serverId, isPremium: false, panels: [], forms: [] });
    }

    // Ботът гейтва функциите на server.isPremium — суровата колона изпуска
    // agency-покритите (и trial) сървъри. Наложи ЕФЕКТИВНИЯ tier, за да
    // работят платените функции под бота при agency seat.
    const tier = await getServerTier(req.params.serverId);

    // Свалянето на плана трябва да СВАЛЯ и функциите. Досега тук формите и
    // панелите излизаха сурови: клиент, конфигурирал cooldown, таван на
    // подаванията, regex валидация и разклоняване, докато е плащал, продължаваше
    // да ги ползва след свалянето — гейтът стоеше само при ЗАПИС
    // (`routes/forms.js`). Ботът чете точно този отговор, значи тук е мястото,
    // където правилото или важи, или не. (Червен екип, одит 07.08.2026)
    for (const panel of server.panels || []) {
      sanitizePanelForTier(panel, tier.plan);
      withServerLogFallback(panel, server.logChannelId); // Т19
      for (const btn of panel.buttons || []) sanitizeFormForTier(btn.form, tier.plan);
    }
    for (const form of server.forms || []) sanitizeFormForTier(form, tier.plan);

    res.json({ ...server, isPremium: tier.isPremium, plan: tier.plan, hasWhiteLabel: tier.hasWhiteLabel });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/server/register ───────────────────────────────────────────
// Called when bot joins a new guild

router.post("/server/register", async (req, res, next) => {
  const { id, name, icon, ownerId } = req.body;
  if (!id || !name) return res.status(400).json({ error: "id and name required" });

  try {
    // Upsert clears botRemovedAt on re-join so the server reappears in user dashboards.
    const server = await prisma.server.upsert({
      where: { id },
      create: { id, name, icon: icon || null, ownerId: ownerId || "UNKNOWN" },
      update: { name, icon: icon || null, botRemovedAt: null },
    });

    await writeAudit({
      actorId: ownerId || null,
      actorTag: ownerId ? undefined : "SYSTEM",
      serverId: id,
      action: "BOT_JOINED",
      targetId: id,
    });

    res.json(server);
  } catch (err) {
    next(err);
  }
});


// ─── GET /api/bot/server/:serverId/token ─────────────────────────────────────
// Returns the decrypted custom bot token for white-label bots.
// Only accessible with the bot secret — never exposed to users.

router.get("/server/:serverId/token", async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { customBotToken: true, customBotPausedAt: true },
    });

    if (!server) return res.status(404).json({ error: "Server not found" });
    // v51: спрян от админ конзолата → като без токен (ботът сваля клиента и не го вдига).
    if (server.customBotPausedAt) return res.json({ token: null, paused: true });
    // White-label bot runs only while the server holds the White-label / Agency
    // tier (getServerTier resolves own plan, active trial and agency seats).
    const { hasWhiteLabel } = await getServerTier(req.params.serverId);
    if (!hasWhiteLabel || !server.customBotToken) {
      return res.json({ token: null });
    }

    try {
      const token = decrypt(server.customBotToken);
      res.json({ token });
    } catch {
      // Decryption failed — token may have been stored before encryption was added
      res.json({ token: null, warning: "Token could not be decrypted — please re-enter it" });
    }
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/server/:serverId/branding ──────────────────────────────────
// Брандирането на white-label бота: име + аватар, готови за прилагане.
//
// ЗАЩО СЪЩЕСТВУВА (одит 07.08.2026 — докладвано от собственика): полетата
// `customBotName`/`customBotAvatar` се ЗАПИСВАХА и се четяха САМО за брандиране
// на HTML транскрипта. Никъде — нито веднъж — не се пращаха към Discord. Тоест
// клиент плаща White-label, попълва име и снимка, интерфейсът казва „запазено“,
// а ботът в Discord си остава със старото име и аватар ЗАВИНАГИ. Главното
// обещание на тарифата не работеше.
//
// Discord приема аватара като data URI (base64), НЕ като адрес — затова
// свалянето е тук, а не в бота: сървърът вече носи втвърдения SSRF агент
// (потребителски URL, свален от НАШАТА машина, е точно тази повърхност).
router.get("/server/:serverId/branding", async (req, res, next) => {
  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { customBotName: true, customBotAvatar: true },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // Брандирането е част от White-label — гейтваме на ЕФЕКТИВНИЯ tier, същия
    // източник като `/token`. Паднал план → нула брандиране.
    const { hasWhiteLabel } = await getServerTier(req.params.serverId);
    if (!hasWhiteLabel) return res.json({ name: null, avatarDataUri: null });

    let avatarDataUri = null;
    if (server.customBotAvatar) {
      try {
        const urlError = await validateWebhookUrl(server.customBotAvatar);
        if (urlError) throw new Error(urlError);
        const img = await axios.get(server.customBotAvatar, {
          responseType: "arraybuffer",
          timeout: 10_000,
          maxRedirects: 0,          // редирект може да отскочи към вътрешен адрес
          httpsAgent: ssrfSafeAgent, // проверява РЕАЛНО свързвания IP (anti-rebinding)
          maxContentLength: 8 * 1024 * 1024, // Discord таван е 10MB; 8 стигат
        });
        const type = String(img.headers["content-type"] || "").split(";")[0].trim();
        if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(type)) {
          throw new Error(`неподдържан тип: ${type || "неизвестен"}`);
        }
        avatarDataUri = `data:${type};base64,${Buffer.from(img.data).toString("base64")}`;
      } catch (err) {
        // Свалянето е ПО ЖЕЛАНИЕ: счупен адрес не бива да спира смяната на името.
        console.warn(`[branding] ${req.params.serverId}: аватарът не се свали — ${err.message}`);
      }
    }

    res.json({ name: server.customBotName || null, avatarDataUri });
  } catch (err) {
    next(err);
  }
});

// ─── „Лепкави роли" (v45) ────────────────────────────────────────────────────
// Ролите на напусналия се пазят и се връщат, ако се присъедини отново.
//
// Разделението е нарочно: ботът решава КОИ роли са безопасни за връщане (само
// той вижда йерархията и правата в Discord), а backend-ът само пази списъка.
// Тук се пази и гейтът на настройката — сървър с изключена функция не бива да
// трупа снимки на роли изобщо (минимизация на данните, GDPR чл. 5(1)(в)).

// POST /api/bot/member-roles/:serverId/:userId — записва снимка при напускане
router.post("/member-roles/:serverId/:userId", async (req, res, next) => {
  const { serverId, userId } = req.params;
  const roleIds = Array.isArray(req.body?.roleIds) ? req.body.roleIds : null;
  if (!roleIds) return res.status(400).json({ error: "roleIds array required" });

  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { stickyRolesEnabled: true },
    });
    // Изключена функция → нищо не се пази. Отговорът е ok, за да не гърми ботът.
    if (!server?.stickyRolesEnabled) return res.json({ ok: true, skipped: "disabled" });

    // Таван: Discord позволява до 250 роли на гилдия; ограничаваме и дължината
    // на всеки ID, за да не пишем произволен обем от чужд вход.
    const clean = roleIds
      .filter((r) => typeof r === "string" && /^\d{17,20}$/.test(r))
      .slice(0, 250);

    if (clean.length === 0) {
      // Член без роли: чистим стара снимка, вместо да пазим празна.
      await prisma.memberRoleSnapshot.deleteMany({ where: { serverId, userId } });
      return res.json({ ok: true, saved: 0 });
    }

    await prisma.memberRoleSnapshot.upsert({
      where: { serverId_userId: { serverId, userId } },
      create: { serverId, userId, roleIds: clean },
      update: { roleIds: clean, capturedAt: new Date() },
    });
    res.json({ ok: true, saved: clean.length });
  } catch (err) { next(err); }
});

// GET /api/bot/member-roles/:serverId/:userId — чете снимката при връщане
router.get("/member-roles/:serverId/:userId", async (req, res, next) => {
  const { serverId, userId } = req.params;
  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { stickyRolesEnabled: true },
    });
    if (!server?.stickyRolesEnabled) return res.json({ roleIds: [], enabled: false });

    const snap = await prisma.memberRoleSnapshot.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { roleIds: true, capturedAt: true },
    });
    res.json({ roleIds: snap?.roleIds || [], capturedAt: snap?.capturedAt || null, enabled: true });
  } catch (err) { next(err); }
});

// DELETE /api/bot/member-roles/:serverId/:userId — след успешно връщане
router.delete("/member-roles/:serverId/:userId", async (req, res, next) => {
  try {
    await prisma.memberRoleSnapshot.deleteMany({
      where: { serverId: req.params.serverId, userId: req.params.userId },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── DELETE /api/bot/server/:serverId ─────────────────────────────────────────
// Called by bot's guildDelete event when the bot is kicked/removed from a guild.
// Soft-delete: mark botRemovedAt timestamp instead of hard-deleting so that:
//   - Stripe subscription remains intact (customer may re-invite)
//   - Payment history is preserved for audit/financial records
//   - Ticket archives stay viewable
// The server is hidden from user dashboards via botRemovedAt IS NULL filter.
// guildCreate event clears botRemovedAt on re-invite.

router.delete("/server/:serverId", async (req, res, next) => {
  try {
    await prisma.server.updateMany({
      where: { id: req.params.serverId, botRemovedAt: null },
      data:  { botRemovedAt: new Date() },
    });

    await writeAudit({
      actorId: null,
      actorTag: "SYSTEM",
      serverId: req.params.serverId,
      action: "BOT_REMOVED",
      targetId: req.params.serverId,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// ─── POST /api/bot/ticket/by-channel/:channelId/close-if-open ────────────────
// Called when Discord channel is deleted — closes ticket if one exists for it.
// Silently no-ops if no open ticket for this channel.

router.post("/ticket/by-channel/:channelId/close-if-open", async (req, res, next) => {
  const { reason } = req.body || {};

  try {
    const ticket = await prisma.ticket.findFirst({
      where: {
        channelId: req.params.channelId,
        status: { in: ["OPEN", "CLAIMED"] },
      },
      select: { id: true },
    });

    if (!ticket) return res.json({ ok: true, closed: false });

    // Т2: същото условно затваряне като навсякъде (одит, webhook, транскрипт).
    const r = await closeTicketIfOpen(ticket.id, {
      reason: reason || "Channel deleted",
      source: "channel_deleted",
    });
    if (!r.ok) return res.json({ ok: true, closed: false });

    res.json({ ok: true, closed: true, ticketId: ticket.id });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/ticket/by-channel/:channelId ───────────────────────────────

router.get("/ticket/by-channel/:channelId", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { channelId: req.params.channelId, status: { notIn: ["CLOSED", "ARCHIVED"] } },
      // panel (supportRoleIds за „staff“ проверките и пълната конфигурация за
      // затваряне/escalate) се добавя долу от withSanitizedPanel.
    });
    if (!ticket) return res.status(404).json({ error: "No active ticket for this channel" });
    // Т5: пълен, изчистен по план панел (не само supportRoleIds).
    res.json(await withSanitizedPanel(ticket));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/ticket/precheck?serverId&panelId&creatorId (Т12) ───────────
// Лимитът се проверява ПРЕДИ ботът да създаде Discord канал — иначе всеки отказ
// беше „създай канал, после го изтрий“ (rate limit + шум в одитния дневник).
// Авторитетната проверка остава в POST /ticket/create (advisory lock).
router.get("/ticket/precheck", async (req, res, next) => {
  const serverId = String(req.query.serverId || "");
  const creatorId = String(req.query.creatorId || "");
  const panelId = req.query.panelId ? String(req.query.panelId) : null;
  if (!BOT_SNOWFLAKE.test(serverId) || !BOT_SNOWFLAKE.test(creatorId)) {
    return res.status(400).json({ error: "serverId and creatorId required" });
  }
  try {
    const panel = panelId
      ? await prisma.panel.findFirst({
          where: { id: panelId, serverId },
          select: { id: true, name: true, maxOpenPerUser: true, maxOpenPerUserPanel: true },
        })
      : null;
    if (panelId && !panel) return res.status(404).json({ error: "Panel not found", code: "PANEL_NOT_FOUND" });
    const limit = await checkTicketLimits(prisma, { serverId, panelId, creatorId, panel });
    res.json(limit);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/create ─────────────────────────────────────────────
// Bot creates a ticket record after creating the Discord channel.
// Handles: maxOpenPerUser enforcement, round-robin assignment, AI auto-reply trigger.

router.post("/ticket/create", async (req, res, next) => {
  const { serverId, panelId, creatorId, channelId, firstMessage } = req.body;

  if (typeof serverId !== "string" || typeof creatorId !== "string" || !serverId || !creatorId) {
    return res.status(400).json({ error: "serverId and creatorId are required" });
  }

  try {
    // Load full panel config (v1.5 — we need many more fields now).
    // Скоуп по serverId: panelId идва от тялото и не се вярва (изолация).
    const panel = panelId
      ? await prisma.panel.findFirst({
          where: { id: panelId, serverId },
          select: {
            id: true, name: true,
            maxOpenPerUser: true, maxOpenPerUserPanel: true,
            supportRoleIds: true, counterPadding: true, defaultPriority: true,
          },
        })
      : null;
    if (panelId && !panel) return res.status(404).json({ error: "Panel not found", code: "PANEL_NOT_FOUND" });

    // ── 1. Лимити на отворени тикети (сървър + панел) ───────────────────────
    const maxOpen = panel?.maxOpenPerUser ?? 1;
    const limit = await checkTicketLimits(prisma, { serverId, panelId, creatorId, panel });
    if (!limit.allowed) {
      return res.status(429).json({
        error: limit.code === "PANEL_LIMIT_REACHED"
          ? `You already have ${limit.count} open ticket(s) for panel "${limit.panelName}".`
          : `You already have ${limit.count} open ticket(s). Please wait for them to be resolved before opening a new one.`,
        code: limit.code,
        count: limit.count,
        max: limit.max,
      });
    }

    // ── 2. Round-robin assignment (Premium) ────────────────────────────────
    const botToken = process.env.BOT_TOKEN;
    const assigneeId = await pickNextAssignee(serverId, botToken);

    // ── 3. Atomic counter increment + ticket create (v1.5) ──────────────────
    // Use a transaction to ensure counter is never duplicated under concurrency.
    let ticket, updatedPanel;
    try {
      [ticket, updatedPanel] = await prisma.$transaction(async (tx) => {
      // Race-safe open-limit: the count above is a fast path — two concurrent
      // panel clicks could both pass it. Take a per-(server,user) advisory lock
      // so concurrent creates serialize, then re-count inside the lock (the lock
      // is held until this tx commits, so the waiter sees the committed ticket).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serverId + ":" + creatorId}))`;
      const openNow = await tx.ticket.count({
        where: { serverId, creatorId, status: { in: ["OPEN", "CLAIMED"] } },
    });
      if (openNow >= maxOpen) {
        const e = new Error("MAX_TICKETS_REACHED"); e.code = "MAX_TICKETS_REACHED"; throw e;
      }
      // `tickets.creatorId` и `tickets.assigneeId` сочат към `users` с истински
      // външен ключ, а и двете ID-та идват от Discord. Член, който никога не е
      // влизал в таблото (тоест мнозинството), иначе НЕ МОЖЕ да отвори тикет.
      // Stub-ът е в СЪЩАТА транзакция — откат не оставя сирак.
      await ensureUserStubs(tx, [creatorId, assigneeId]);

      let nextNumber = null;
      if (panelId) {
        const bumped = await tx.panel.update({
          where: { id: panelId },
          data: { ticketCounter: { increment: 1 } },
          select: { ticketCounter: true, counterPadding: true },
        });
        nextNumber = bumped.ticketCounter;
      }
      const created = await tx.ticket.create({
        data: {
          serverId,
          panelId: panelId || null,
          creatorId,
          channelId: channelId || null,
          status: assigneeId ? "CLAIMED" : "OPEN",
          assigneeId: assigneeId || null,
          priority: panel?.defaultPriority || "NORMAL",
          number: nextNumber,
          lastActivityAt: new Date(),
        },
    });
      return [created, { ticketCounter: nextNumber }];
    });
    } catch (e) {
      if (e.code === "MAX_TICKETS_REACHED") {
        return res.status(429).json({
          error: "You already have the maximum number of open tickets. Please wait for one to be resolved.",
          code: "MAX_TICKETS_REACHED",
        });
      }
      throw e;
    }

    // ── 4. AI auto-reply (Premium, async — don't block the response) ───────
    if (channelId) {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { aiRepliesEnabled: true, aiRepliesPrompt: true, name: true },
    });
      // getServerTier покрива собствен план + trial + agency seat — суровият
      // isPremium изпускаше agency-покрити сървъри (платена функция не работи).
      const { isPremium: isEffectivePremium } = await getServerTier(serverId);
      if (isEffectivePremium && server?.aiRepliesEnabled && aiRateLimitOk(serverId)) {
        generateAutoReply({
          userMessage: firstMessage || "",
          serverName: server.name,
          customPrompt: server.aiRepliesPrompt,
          customApiKey: null,
        }).then((reply) => {
          if (reply) {
            import("../services/botNotifier.js").then(({ notifyBot }) => {
              notifyBot("AI_REPLY", { serverId, channelId, content: reply, ticketId: ticket.id, model: AI_MODEL_NAME });
            });
          }
        }).catch(() => {});
      }
    }

    const serverTicketCount = await prisma.ticket.count({ where: { serverId } });

    res.json({
      ...ticket,
      assigneeId,
      ticketCount: serverTicketCount,
      number: ticket.number,
    });

    // А2: webhook TICKET_OPEN на всеки път на отваряне (бутон, меню, форма, /new).
    fireWebhooks(serverId, "TICKET_OPEN", {
      ticketId: ticket.id,
      number: ticket.number,
      creatorId,
      panelId: panelId || null,
      channelId: channelId || null,
    })?.catch?.(() => {});

    // Notify the assigned staff member asynchronously
    if (assigneeId) {
      import("../services/botNotifier.js").then(({ notifyBot }) => {
        notifyBot("TICKET_ASSIGNED", { serverId, channelId: channelId || null, assigneeId, ticketId: ticket.id });
    });
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/ticket/:ticketId/message ───────────────────────────────────
// Bot logs a message to the ticket transcript

router.post("/ticket/:ticketId/message", async (req, res, next) => {
  const { authorId, authorTag, content, attachments, messageId } = req.body;

  if (!authorId || !authorTag) {
    return res.status(400).json({ error: "authorId and authorTag are required" });
  }

  try {
    const message = await prisma.ticketMessage.create({
      data: {
        ticketId: req.params.ticketId,
        authorId,
        authorTag,
        content: content || "",
        attachments: attachments || [],
        // v36 — без Discord ID-то не можем да намерим реда при редакция/изтриване.
        messageId: messageId || null,
      },
    });

    // v31 — SLA first-response marker. Приближение: първото съобщение от
    // НЕ-създателя на тикета се брои за "първи отговор" (не различаваме
    // staff от друг потребител, добавен по-късно в канала — известно
    // ограничение, приемливо за целите на SLA известяването).
    const ticketForSla = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { creatorId: true, firstResponseAt: true },
    });
    if (ticketForSla) {
      const firstResponse =
        !ticketForSla.firstResponseAt && authorId !== ticketForSla.creatorId;
      // `lastActivityAt` се вдига при ВСЯКО съобщение.
      //
      // Досега се пипаше само при създаване, claim/unclaim и смяна на приоритет
      // — а авто-затварянето по неактивност (scheduler.js) съди точно по него.
      // Резултат: тикет, в който хората активно си пишат, се брои за „мъртъв“ и
      // Premium функцията го затваря НАСРЕД разговора. Точно обратното на това,
      // за което клиентът плаща. (Одит 07.08.2026)
      await prisma.ticket
        .update({
          where: { id: req.params.ticketId },
          data: {
            lastActivityAt: new Date(),
            ...(firstResponse && { firstResponseAt: new Date() }),
          },
        })
        .catch(() => {});
    }

    res.json(message);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/ticket/:ticketId/close ────────────────────────────────────
// Bot closes a ticket (from slash command in Discord)

router.post("/ticket/:ticketId/close", async (req, res, next) => {
  const { closedById, reason, serverId, inactiveBeforeMs, source } = req.body || {};

  try {
    // Т2: условно затваряне (`status in OPEN, CLAIMED`; при неактивност и
    // `lastActivityAt < cutoff`). Две едновременни затваряния → едно успява.
    const inactiveBefore = Number.isFinite(Number(inactiveBeforeMs)) && Number(inactiveBeforeMs) > 0
      ? new Date(Number(inactiveBeforeMs))
      : null;
    const r = await closeTicketIfOpen(req.params.ticketId, {
      serverId: typeof serverId === "string" ? serverId : undefined,
      closedById: closedById || null,
      reason,
      inactiveBefore,
      source: inactiveBefore ? "inactivity" : (["creator_left", "channel_deleted"].includes(source) ? source : "manual"),
    });
    if (!r.ok) {
      if (r.code === "NOT_FOUND") return res.status(404).json({ error: "Ticket not found", code: r.code });
      return res.status(409).json({
        error: r.code === "ACTIVE_AGAIN" ? "Ticket has new activity" : "Ticket is already closed",
        code: r.code,
      });
    }
    const { ticket, archiveUrl } = r;
    const base = archiveBase(req);

    // Изчистеният по план панел — ботът затваря по НЕГО (ЛС, оценка, лог, категория).
    const panel = ticket.panelId ? await loadSanitizedPanel(ticket.panelId, ticket.serverId) : null;

    console.log(`[ticket:close] Saved transcript for ${ticket.id}, source=${source || "manual"}`);

    res.json({
      ...ticket,
      panel,
      archiveHtml: undefined, // don't send full HTML over the wire
      archiveUrl,
      fullArchiveUrl: base ? `${base}${archiveUrl}` : archiveUrl,
      transcriptChannelId: panel?.transcriptChannelId || ticket.server?.archiveChannelId || null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/ticket/:ticketId (v1.5) ─────────────────────────────────────
// Lightweight lookup for bot interaction handlers — includes panel config.

router.get("/ticket/:ticketId", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    // Т5: същият изчистен по план панел като `by-channel` (преди: суров панел).
    res.json(await withSanitizedPanel(ticket));
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/claim (v1.5 — rewired) ───────────────────

router.post("/ticket/:ticketId/claim", async (req, res, next) => {
  const { userId } = req.body || {};
  try {
    if (!(await gateTicketFeature(req, res, "ticket.claim"))) return;
    // `tickets.assigneeId` е външен ключ към `users`. Персонал, който работи
    // само през Discord и никога не е отварял таблото, иначе не може да поеме
    // тикет — точно хората, които го правят най-често.
    await ensureUserStub(prisma, userId);
    // Т4: claim САМО на OPEN тикет (условен запис). Затворен тикет не става
    // CLAIMED (брои се в лимитите, SLA и авто-затварянето), а чужд claim не се краде.
    const won = await prisma.ticket.updateMany({
      where: { id: req.params.ticketId, status: "OPEN" },
      data: { assigneeId: userId, status: "CLAIMED", lastActivityAt: new Date() },
    });
    if (won.count === 0) {
      const cur = await prisma.ticket.findUnique({
        where: { id: req.params.ticketId },
        select: { status: true, assigneeId: true },
      });
      if (!cur) return res.status(404).json({ error: "Ticket not found" });
      if (cur.status === "CLAIMED") {
        return res.status(409).json({
          error: "Ticket is already claimed", code: "ALREADY_CLAIMED", assigneeId: cur.assigneeId,
        });
      }
      return res.status(409).json({ error: "Ticket is not open", code: "NOT_OPEN", status: cur.status });
    }
    res.json(await prisma.ticket.findUnique({ where: { id: req.params.ticketId } }));
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/unclaim ──────────────────────────────────

router.post("/ticket/:ticketId/unclaim", async (req, res, next) => {
  try {
    // Само CLAIMED → OPEN: иначе unclaim „съживяваше“ затворен тикет.
    const won = await prisma.ticket.updateMany({
      where: { id: req.params.ticketId, status: "CLAIMED" },
      data: { assigneeId: null, status: "OPEN", lastActivityAt: new Date() },
    });
    if (won.count === 0) {
      const cur = await prisma.ticket.findUnique({ where: { id: req.params.ticketId }, select: { status: true } });
      if (!cur) return res.status(404).json({ error: "Ticket not found" });
      return res.status(409).json({ error: "Ticket is not claimed", code: "NOT_CLAIMED", status: cur.status });
    }
    res.json(await prisma.ticket.findUnique({ where: { id: req.params.ticketId } }));
  } catch (err) { next(err); }
});

// ─── PATCH /api/bot/ticket/:ticketId/priority (v30) ───────────────────────────
// Bot sets a ticket's priority from `/ticket priority`. Staff-only check
// happens bot-side (same pattern as /ticket close/claim) before this call;
// the enum is still re-validated server-side — never trust the client value.

const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

router.patch("/ticket/:ticketId/priority", async (req, res, next) => {
  const { priority, actorId } = req.body;
  if (!TICKET_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of ${TICKET_PRIORITIES.join(", ")}` });
  }
  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { serverId: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });

    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { priority, lastActivityAt: new Date() },
    });

    await writeAudit({
      actorId: actorId || null,
      actorTag: actorId ? undefined : "SYSTEM",
      serverId: existing.serverId,
      action: "TICKET_PRIORITY_CHANGED",
      targetId: req.params.ticketId,
      metadata: { priority },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/reopen (v1.5) ────────────────────────────

router.post("/ticket/:ticketId/reopen", async (req, res, next) => {
  const { reopenerId } = req.body || {};
  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { status: true, serverId: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });

    // Условно: само CLOSED → OPEN (две едновременни отваряния дават едно).
    const won = await prisma.ticket.updateMany({
      where: { id: req.params.ticketId, status: "CLOSED" },
      data: {
        status: "OPEN",
        reopenedAt: new Date(),
        reopenCount: { increment: 1 },
        closedAt: null,
        lastActivityAt: new Date(),
      },
    });
    if (won.count === 0) {
      return res.status(409).json({ error: "Only closed tickets can be reopened", code: "NOT_CLOSED" });
    }
    const updated = await prisma.ticket.findUnique({ where: { id: req.params.ticketId } });

    await writeAudit({
      actorId: reopenerId || null,
      actorTag: reopenerId ? undefined : "SYSTEM",
      serverId: existing.serverId,
      action: "TICKET_REOPENED",
      targetId: req.params.ticketId,
    });

    // А2: webhook на всеки път на отваряне наново.
    fireWebhooks(existing.serverId, "TICKET_REOPEN", {
      ticketId: updated?.id ?? req.params.ticketId,
      number: updated?.number ?? null,
      creatorId: updated?.creatorId ?? null,
      reopenedBy: reopenerId || null,
    })?.catch?.(() => {});

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/delete (v1.5) ────────────────────────────
// Soft-delete: marks ticket as ARCHIVED, preserves archiveHtml + archiveUrl
// forever so transcript remains accessible even after Discord channel is deleted.
// The Discord channel itself is deleted separately by the bot (interactionCreate).

router.post("/ticket/:ticketId/delete", async (req, res, next) => {
  const { deleterId } = req.body;
  try {
    const existing = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { serverId: true, status: true, archiveHtml: true, archiveToken: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });

    // If no transcript exists yet, generate one now from any logged messages
    // BEFORE archiving (in case ticket was force-deleted without proper close)
    let archiveHtml = existing.archiveHtml;
    const token = await ensureArchiveToken(req.params.ticketId, existing.archiveToken);
    const archiveUrl = tokenizedArchiveUrl(req.params.ticketId, token);

    if (!archiveHtml) {
      const fullTicket = await prisma.ticket.findUnique({
        where: { id: req.params.ticketId },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
          creator: true,
          assignee: true,
        },
    });
      // Само новогенерираният се шифрира — заварен archiveHtml вече е във
      // формата при покой и повторно sealTranscript би го шифрирал двойно.
      if (fullTicket) {
        archiveHtml = sealTranscript(generateHtmlTranscript(fullTicket));
      }
    }

    await writeAudit({
      actorId: deleterId || null,
      actorTag: deleterId ? undefined : "SYSTEM",
      serverId: existing.serverId,
      action: "TICKET_DELETED",
      targetId: req.params.ticketId,
    });

    // Soft-delete: ARCHIVED status keeps the row + transcript forever.
    // channelId is cleared since the Discord channel will be deleted.
    await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: {
        status: "ARCHIVED",
        channelId: null,
        closedAt: existing.status === "CLOSED" ? undefined : new Date(),
        archiveHtml,
        archiveUrl,
      },
    });

    // А2: webhook на всеки път на изтриване.
    fireWebhooks(existing.serverId, "TICKET_DELETE", {
      ticketId: req.params.ticketId,
      deletedBy: deleterId || null,
    })?.catch?.(() => {});

    res.json({ ok: true, archived: true });
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/transcript (v1.5) ────────────────────────
// Regenerate HTML transcript on demand. Returns archive URL if available.

router.post("/ticket/:ticketId/transcript", async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      include: { messages: { orderBy: { createdAt: "asc" } }, creator: true, assignee: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const html = generateHtmlTranscript(ticket);
    const token = await ensureArchiveToken(ticket.id, ticket.archiveToken);
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { archiveHtml: sealTranscript(html), archiveUrl: tokenizedArchiveUrl(ticket.id, token) },
    });

    const url = `${process.env.FRONTEND_URL || ""}${tokenizedArchiveUrl(ticket.id, token)}`;
    res.json({ ok: true, url });
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/feedback (v1.5) ──────────────────────────

router.post("/ticket/:ticketId/feedback", async (req, res, next) => {
  const { rating, comment, userId } = req.body;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: "rating must be an integer between 1 and 5" });
  }
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { creatorId: true, serverId: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    if (userId && ticket.creatorId !== userId) {
      return res.status(403).json({ error: "Only the ticket creator can leave feedback" });
    }

    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: {
        feedbackRating: rating,
        feedbackComment: comment || null,
        feedbackAt: new Date(),
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/ticket/:ticketId/rename (v1.5) ────────────────────────────

router.post("/ticket/:ticketId/rename", async (req, res, next) => {
  const { newName, actorId } = req.body;
  if (!newName) return res.status(400).json({ error: "newName required" });
  try {
    if (!(await gateTicketFeature(req, res, "ticket.rename"))) return;
    const existing = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { channelId: true, serverId: true },
    });
    if (!existing) return res.status(404).json({ error: "Ticket not found" });

    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { renamedFrom: newName, lastActivityAt: new Date() },
    });

    await writeAudit({
      actorId: actorId || null,
      serverId: existing.serverId,
      action: "TICKET_RENAMED",
      targetId: req.params.ticketId,
      metadata: { newName },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── GET /api/bot/panel/:panelId (v1.5 — augmented with v1.5 fields) ─────────
// Already exists below, but the new one returns full config including v1.5 fields

// ─── POST /api/bot/ticket/:ticketId/escalate (v1.6) ──────────────────────────
// Move a ticket to a different panel. Keeps all history.

router.post("/ticket/:ticketId/escalate", async (req, res, next) => {
  const { newPanelId, actorId, reason } = req.body;
  if (!newPanelId) return res.status(400).json({ error: "newPanelId required" });

  try {
    if (!(await gateTicketFeature(req, res, "ticket.escalate"))) return;
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.ticketId },
      select: { serverId: true, panelId: true },
    });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const newPanel = await prisma.panel.findUnique({
      where: { id: newPanelId },
      select: { serverId: true },
    });
    if (!newPanel) return res.status(404).json({ error: "Target panel not found" });
    if (newPanel.serverId !== ticket.serverId) {
      return res.status(400).json({ error: "Cannot escalate to a panel in a different server" });
    }

    const updated = await prisma.ticket.update({
      where: { id: req.params.ticketId },
      data: { panelId: newPanelId, lastActivityAt: new Date() },
    });

    await writeAudit({
      actorId: actorId || null,
      serverId: ticket.serverId,
      action: "TICKET_ESCALATED",
      targetId: req.params.ticketId,
      metadata: { fromPanelId: ticket.panelId, toPanelId: newPanelId, reason },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── GET /api/bot/guild/:guildId/panels (v1.6) ───────────────────────────────
// Simple panel list for autocomplete in /new and /escalate commands.

router.get("/guild/:guildId/panels", async (req, res, next) => {
  try {
    const panels = await prisma.panel.findMany({
      where: { serverId: req.params.guildId },
      select: {
        id: true, name: true,
        categoryOpenId: true, categoryId: true,
        supportRoleIds: true,
        counterPadding: true,
        channelNamePrefix: true,
      },
      orderBy: { name: "asc" },
    });
    res.json(panels);
  } catch (err) { next(err); }
});

// ─── POST /api/bot/application/submit ────────────────────────────────────────

router.post("/application/submit", async (req, res, next) => {
  try {
    // Правилата на формата (затворена · cooldown · таван на подаванията) живеят
    // в ЕДИН модул и важат за ВСЕКИ път. Досега тук стоеше гол `create` без нито
    // една проверка — а формата се попълва ПРЕЗ БОТА, значи единственият реален
    // път беше и единственият незащитен: „максимум 1 кандидатура“ и cooldown-ът
    // (Premium функция) не правеха нищо, а затворена форма продължаваше да
    // приема. (Одит 07.08.2026)
    const r = await submitApplication(req.body);
    if (!r.ok) {
      return res.status(r.status).json({
        error: r.error,
        ...(r.code && { code: r.code }),
        ...(r.remainingSeconds != null && { remainingSeconds: r.remainingSeconds }),
    });
    }
    // Формата на отговора остава каквато ботът вече чака (`application`), плюс
    // `pingRoleIds` — същото като по уеб пътя.
    res.json({ ...r.application, pingRoleIds: r.pingRoleIds });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/user/:userId/blacklisted ────────────────────────────────────

router.get("/user/:userId/blacklisted", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: BLACKLIST_SELECT,
    });
    res.json({ blacklisted: isBlacklistActive(user) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/user/:userId/open-tickets/:guildId (v1.5) ──────────────────
// Used by guildMemberRemove event to find tickets that may need auto-close

router.get("/user/:userId/open-tickets/:guildId", async (req, res, next) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: {
        serverId: req.params.guildId,
        creatorId: req.params.userId,
        status: { in: ["OPEN", "CLAIMED"] },
      },
      include: { panel: { select: { autoCloseOnLeave: true, counterPadding: true } } },
    });
    // autoCloseOnLeave е premium — ботът затваря тикета, когато създателят
    // напусне. Без tier проверка запазеният флаг работеше на free сървър.
    const tier = await getServerTier(req.params.guildId);
    if (!planHasFeature(tier.plan, "panel.autoCloseOnLeave")) {
      for (const t of tickets) if (t.panel) t.panel.autoCloseOnLeave = false;
    }
    res.json(tickets);
  } catch (err) { next(err); }
});

// ─── GET /api/bot/panel/:panelId?serverId= ───────────────────────────────────
// serverId е ЗАДЪЛЖИТЕЛЕН и търсенето е по (id, serverId). Без него `/panel spawn`
// приемаше свободно въведен id: панелът на чужд сървър (id-то се вижда в
// custom_id на бутоните му) се публикуваше у нападателя, а записът му се
// презаписваше (червен екип, 10.10.2026). Чужд id → 404, както несъществуващ.
router.get("/panel/:panelId", async (req, res, next) => {
  const serverId = String(req.query.serverId || "");
  if (!BOT_SNOWFLAKE.test(serverId)) return res.status(400).json({ error: "serverId required" });
  try {
    const panel = await prisma.panel.findFirst({
      where: { id: req.params.panelId, serverId },
      include: {
        buttons: { include: { form: { include: { questions: { orderBy: { order: "asc" } } } } } },
        server: { select: { id: true, isPremium: true, logChannelId: true } },
      },
    });
    if (!panel) return res.status(404).json({ error: "Panel not found" });
    // Ефективен tier (agency/trial не са в суровата колона) — панелните
    // функции се гейтват на panel.server.isPremium.
    // `null` = НЕ знаем плана (сървърът не е резолвнат). Различава се от "free":
    // с "free" по подразбиране един неуспял резолв би ОКАСТРИЛ панелите на
    // платен клиент. Санитизация се прави само при ЗНАЕН план.
    let effectivePlan = null;
    if (panel.server?.id) {
      const tier = await getServerTier(panel.server.id);
      effectivePlan = tier.plan;
      panel.server.isPremium = tier.isPremium;
      // Нулирай premium полетата, които планът не покрива — иначе ботът
      // изпълнява запазените стойности (DM при отваряне, observer роли, SLA,
      // авто-затваряне) на сървър, който вече не плаща за тях.
      sanitizePanelForTier(panel, effectivePlan);
      // Формите ЗАД бутоните също. Санитизираше се само панелът, а това е
      // ГОРЕЩИЯТ път: ботът чете оттук точно преди да покаже формата, значи
      // `validationRegex` и условното разклоняване (платени функции) работеха
      // на свален план. (Червен екип, кръг 2, 07.08.2026)
      for (const btn of panel.buttons || []) sanitizeFormForTier(btn.form, effectivePlan);
    }
    withServerLogFallback(panel, panel.server?.logChannelId); // Т19

    // Групово съобщение: няколко панела делят един messageId. Редакцията на
    // ЕДИН панел трябва да пресглоби ЦЯЛОТО съобщение, иначе останалите
    // изчезват от него.
    // ВАЖНО: само по ИЗРИЧНА заявка (?siblings=1). Този маршрут е и на ГОРЕЩИЯ
    // път — вика се при всеки клик на бутон/меню, преди 3-секундния ack бюджет
    // на Discord. Безусловната втора заявка там е чиста загуба.
    if (req.query.siblings === "1" && panel.channelId && panel.messageId) {
      const siblings = await prisma.panel.findMany({
        where: { serverId, channelId: panel.channelId, messageId: panel.messageId },
        include: { buttons: { include: { form: { include: { questions: { orderBy: { order: "asc" } } } } } } },
        // Редът, избран от потребителя при публикуване (groupOrder); createdAt
        // е само резервен за заварени групи отпреди полето.
        orderBy: [{ groupOrder: "asc" }, { createdAt: "asc" }],
    });
      // Същият сървър (messageId е уникален за канал, каналът — за една гилдия)
      // → същият план. Санитизираме само при ЗНАЕН план (виж по-горе защо).
      if (siblings.length > 1) {
        panel.siblings = effectivePlan
          ? siblings.map((sib) => {
              sanitizePanelForTier(sib, effectivePlan);
              // И формите зад бутоните им — иначе групираните панели са дупка,
              // еднаква с тази в основния. (Червен екип, кръг 2)
              for (const btn of sib.buttons || []) sanitizeFormForTier(btn.form, effectivePlan);
              return sib;
            })
          : siblings;
      }
    }

    res.json(panel);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/bot/panel/:panelId/spawned ───────────────────────────────────
// Bot reports back the Discord message/channel IDs after spawning a panel

router.patch("/panel/:panelId/spawned", async (req, res, next) => {
  const { channelId, messageId, serverId } = req.body || {};
  if (!BOT_SNOWFLAKE.test(String(serverId))) return res.status(400).json({ error: "serverId required" });
  if (!BOT_SNOWFLAKE.test(String(channelId)) || !BOT_SNOWFLAKE.test(String(messageId))) return res.status(400).json({ error: "channelId and messageId required" });

  try {
    // Условно по сървъра: чужд панел не се презаписва (виж GET по-горе).
    const r = await prisma.panel.updateMany({
      where: { id: req.params.panelId, serverId: String(serverId) },
      data: { channelId: String(channelId), messageId: String(messageId) },
    });
    if (r.count !== 1) return res.status(404).json({ error: "Panel not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// ─── PATCH /api/bot/server/:serverId ─────────────────────────────────────────
// Bot updates white-label settings (premium only).
// Only allows safe fields: customBotName, customBotAvatar (NOT the token — tokens
// must be set via the web dashboard where users can review what they're submitting).

router.patch("/server/:serverId", async (req, res, next) => {
  const { customBotName, customBotAvatar } = req.body;

  if (!customBotName && !customBotAvatar) {
    return res.status(400).json({ error: "Provide customBotName and/or customBotAvatar" });
  }

  try {
    const server = await prisma.server.findUnique({
      where: { id: req.params.serverId },
      select: { id: true },
    });
    if (!server) return res.status(404).json({ error: "Server not found" });

    // White-label е ОТДЕЛЕН tier (White-label/Agency), не „Premium или trial“.
    // Дотук гейтът пускаше обикновен Premium (и trial) да сетва custom bot —
    // платена White-label функция, раздавана под цената си (premium bypass).
    const { hasWhiteLabel } = await getServerTier(req.params.serverId);
    if (!hasWhiteLabel) {
      return res.status(403).json({ error: "Custom bot settings require the White-label tier" });
    }

    const updated = await prisma.server.update({
      where: { id: req.params.serverId },
      data: {
        ...(customBotName !== undefined && { customBotName }),
        ...(customBotAvatar !== undefined && { customBotAvatar }),
      },
      select: { id: true, customBotName: true, customBotAvatar: true },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/bot/application/:id ──────────────────────────────────────────
// Bot updates reviewMessageId + reviewChannelId after posting the review embed

router.patch("/application/:id", async (req, res, next) => {
  const { reviewMessageId, reviewChannelId } = req.body;
  if (!reviewMessageId || !reviewChannelId) {
    return res.status(400).json({ error: "reviewMessageId and reviewChannelId required" });
  }
  try {
    const application = await prisma.application.update({
      where: { id: req.params.id },
      data: { reviewMessageId, reviewChannelId },
    });
    res.json(application);
  } catch (err) {
    next(err);
  }
});


// ─── DSR от Discord (/privacy) — Developer Terms §5(b): лесно достъпен път за
// изтриване ЗА ВСЕКИ Discord потребител, не само за влязъл в таблото.
router.get("/dsr/:userId", async (req, res, next) => {
  if (!/^\d{5,25}$/.test(req.params.userId)) return res.status(400).json({ error: "Invalid user id" });
  try { res.json(await summarizeDiscordUser(req.params.userId)); } catch (err) { next(err); }
});

const DSR_COOLDOWN_MS = 5 * 60 * 1000;
const dsrRecent = new Map(); // userId → последно изтриване (дросел срещу спам в одита)
router.post("/dsr/erase", async (req, res, next) => {
  const { userId, guildId } = req.body || {};
  if (!/^\d{5,25}$/.test(String(userId || ""))) return res.status(400).json({ error: "userId required" });
  const last = dsrRecent.get(String(userId)) || 0;
  if (Date.now() - last < DSR_COOLDOWN_MS) {
    return res.status(429).json({ error: "An erasure for this user was just processed. Try again in a few minutes.", code: "DSR_COOLDOWN", retryAfterSeconds: Math.ceil((DSR_COOLDOWN_MS - (Date.now() - last)) / 1000) });
  }
  try {
    // Самообслужване = обхват identity (съдържанието на тикетите е запис на
    // оператора; за пълно изтриване → заявка към нас, админ конзола).
    const result = await eraseDiscordUser(String(userId), { scope: "identity", via: "bot", requestedBy: String(userId), guildId: guildId ? String(guildId) : null });
    if (!result.ok) return res.status(result.code === "ERASE_FAILED" ? 503 : 409).json(result);
    dsrRecent.set(String(userId), Date.now());
    if (dsrRecent.size > 10000) dsrRecent.clear();
    res.json(result);
  } catch (err) { next(err); }
});

// ─── GET /api/bot/servers/with-custom-tokens ─────────────────────────────────
// Returns all Premium servers that have a custom bot token configured.
// Used by ClientManager to boot white-label clients on startup.

router.get("/servers/with-custom-tokens", async (req, res, next) => {
  try {
    // ЕДИН източник на истина за „кой има право на бранд бот“.
    //
    // Тук стоеше ВТОРА, паралелна дефиниция на white-label правото (Prisma
    // `where` с планове/агенция/гратис), докато `/token` гейтваше на
    // `getServerTier().hasWhiteLabel`. Две дефиниции на едно правило дрейфват —
    // и цената е кръстосана: метлата на бота сваля клиенти по СВОЯ списък, тоест
    // разминаване по ЕДИН сървър можеше да свали бранд бота на ДРУГИ наематели
    // (или вечно да ги вдига и сваля в цикъл).
    //
    // Затова: филтрираме кандидатите (имат токен) през СЪЩАТА функция, която
    // решава и при `/token`. Множеството е малко по конструкция — токен имат
    // само white-label/agency клиенти. (Одит 07.08.2026)
    const candidates = await prisma.server.findMany({
      where: { customBotToken: { not: null }, customBotPausedAt: null },
      select: { id: true, name: true },
    });

    const servers = [];
    for (const c of candidates) {
      const { hasWhiteLabel } = await getServerTier(c.id);
      if (hasWhiteLabel) servers.push(c);
    }

    res.json(servers);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/application/:appId/review ─────────────────────────────────
// Called by the bot when a staff member clicks Approve/Deny button
// in Discord. Mirrors the logic of /api/applications/:serverId/:appId/review
// but authenticated via bot secret instead of user session.

router.post("/application/:appId/review", async (req, res, next) => {
  const { action, note, reviewerId, reviewerTag, serverId } = req.body;
  // Ботът казва дали ревюърът има Manage Server (той вижда правата в Discord).
  const reviewerIsAdmin = req.body.reviewerIsAdmin === true;

  if (!["approve", "deny"].includes(action)) {
    return res.status(400).json({ error: "action must be approve or deny" });
  }
  // Prisma маха филтъра при undefined -> без тази проверка скоупът се губи.
  if (typeof serverId !== "string" || !serverId) {
    return res.status(400).json({ error: "serverId required" });
  }

  try {
    const application = await prisma.application.findFirst({
      // Скоупът е ЗАДЪЛЖИТЕЛЕН, не по желание: и двата викащи в бота пращат
      // `serverId` (`events/interactionCreate.js`, `commands/form.js`), затова
      // условният вариант само отваряше врата за объркан/компрометиран бот да
      // ревюира чужда кандидатура. (Качествения, кръг 2)
      where: { id: req.params.appId, serverId },
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
    if (!reviewerIsAdmin && reviewerId && String(reviewerId) === String(application.userId)) {
      return res.status(403).json({ error: "You cannot review your own application", code: "SELF_REVIEW" });
    }
    const statusMap = { approve: "APPROVED", deny: "DENIED" };

    // Т6: условен запис по PENDING — вторият ревюър/двоен клик получава 409, роли и ЛС веднъж.
    const won = application.status === "PENDING" && await claimApplicationReview({
      id: application.id, serverId: application.serverId, status: statusMap[action], reviewerId, note,
    });
    if (!won) {
      return res.status(409).json({ error: "Application already reviewed", code: "ALREADY_REVIEWED" });
    }
    const updated = { ...application, status: statusMap[action], reviewerId: reviewerId || null, reviewNote: note || null };
    delete updated.form; delete updated.user;
    closeApplicationDiscussion({ applicationId: application.id, serverId: application.serverId, outcome: action }).catch(() => {});

    await writeAudit({
      actorId: reviewerId || null,
      actorTag: reviewerTag || "BOT",
      serverId: application.serverId,
      action: `APPLICATION_${statusMap[action]}`,
      targetId: application.id,
      metadata: { note: note || null, via: "discord_button" },
    });
    // Webhook — същият помощник като при решение от таблото (А2). Преди решение от
    // бутон в Discord не пращаше нищо.
    fireApplicationReviewed(application, action, { reviewerId: reviewerId || null, note });

    // Grant/remove roles + DM the applicant. The Discord-button path previously
    // only changed status, so approvals granted no role and sent no notification —
    // this mirrors the dashboard review path (applications.js APPLICATION_APPLY_OUTCOME).
    // Платените действия при преглед (авто-роли `form.autoRoleOnReview`,
    // персонализиран DM `form.customDmMessages`) се четяха СУРОВИ от базата и
    // се изпълняваха независимо от тарифата: свален сървър продължаваше да
    // раздава Discord роли и да праща свой текст. Гейтът стоеше само при запис.
    // (Червен екип, кръг 2, 07.08.2026)
    const { plan } = await getServerTier(application.serverId);
    const form = sanitizeFormForTier(application.form, plan);
    const rolesToAdd    = action === "approve" ? (form.acceptRoleIds || []) : (form.denyRoleIds || []);
    const rolesToRemove = action === "approve" ? (form.removeRoleIds || []) : [];
    const customMessage = action === "approve" ? form.acceptMessage : form.denyMessage;
    let dmMessage;
    if (customMessage) {
      // Т18: `{server}` е ИМЕТО на сървъра, не суровият snowflake.
      const serverRow = await prisma.server.findUnique({ where: { id: application.serverId }, select: { name: true } });
      const vars = {
        user: application.user?.id ? `<@${application.user.id}>` : "",
        username: application.user?.username || "",
        server: serverRow?.name || "",
        note: note || "",
      };
      // Един проход: подменен текст (напр. име „{note}“) не се тълкува повторно.
      dmMessage = customMessage.replace(/\{(user|username|server|note)\}/g, (_, k) => vars[k]);
    } else {
      const statusEmoji = action === "approve" ? "✅" : "❌";
      const statusWord  = action === "approve" ? "approved" : "denied";
      dmMessage = `${statusEmoji} Your application to **${form.name}** has been ${statusWord}.`;
      if (note) dmMessage += `\n\n**Reason from staff:**\n> ${note.split("\n").join("\n> ")}`;
    }
    import("../services/botNotifier.js").then(({ notifyBot }) => {
      notifyBot("APPLICATION_APPLY_OUTCOME", {
        serverId: application.serverId,
        userId: application.userId,
        rolesToAdd,
        rolesToRemove,
        dmMessage,
        action,
      }).catch((e) => console.warn("[bot review] apply-outcome failed:", e.message));
    });

    // Транскрипт в конфигурирания канал — паритет с dashboard review пътя
    // (applications.js APPLICATION_TRANSCRIPT); Discord-бутонният път досега
    // не постваше транскрипт.
    if (form.transcriptChannelId) {
      const transcript = buildTranscript(form.questions, application.answers);
      import("../services/botNotifier.js").then(({ notifyBot }) => {
        notifyBot("APPLICATION_TRANSCRIPT", {
          serverId: application.serverId,
          channelId: form.transcriptChannelId,
          applicationId: application.id,
          formName: form.name,
          applicantId: application.userId,
          applicantTag: application.user?.username || "Unknown",
          action,
          reviewerTag: reviewerTag || "staff",
          reviewerId: reviewerId || null,
          note: note || null,
          transcript,
        }).catch((e) => console.warn("[bot review] transcript post failed:", e.message));
    });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/bot/ticket-message/:messageId ────────────────────────────────
// v36 — одитна следа: съобщение в тикет канал беше РЕДАКТИРАНО или ИЗТРИТО.
// Ботът вика това от messageUpdate/messageDelete. Ако съобщението не е част от
// тикет (или е отпреди v36, тоест без записан messageId) — тихо 204: това е
// нормалният случай за всяко съобщение в сървъра, не грешка.
router.patch("/ticket-message/:messageId", async (req, res, next) => {
  const { action, content } = req.body || {};
  if (!["edit", "delete"].includes(action)) {
    return res.status(400).json({ error: "action must be edit or delete" });
  }

  try {
    const existing = await prisma.ticketMessage.findFirst({
      where: { messageId: req.params.messageId },
      orderBy: { createdAt: "desc" },
    });
    if (!existing) return res.status(204).end();

    if (action === "delete") {
      // Съдържанието се ЗАПАЗВА — транскриптът трябва да показва какво е било
      // казано и че после е изтрито (иначе изтриването е начин да изчистиш
      // следите си от одитния запис).
      const updated = await prisma.ticketMessage.update({
        where: { id: existing.id },
        data: { deletedAt: existing.deletedAt || new Date() },
    });
      return res.json({ ok: true, id: updated.id });
    }

    // edit: пазим ПЪРВОНАЧАЛНИЯ текст само при първата редакция.
    const updated = await prisma.ticketMessage.update({
      where: { id: existing.id },
      data: {
        originalContent: existing.originalContent ?? existing.content,
        content: String(content ?? "").slice(0, 4000),
        editedAt: new Date(),
      },
    });
    res.json({ ok: true, id: updated.id });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/reaction-roles/message/:messageId/deleted ─────────────────
// З9: изтрито в Discord съобщение с роли по реакция → непубликувано в таблото (иначе остава
// „публикувано“ и се брои в лимита). serverId е ЗАДЪЛЖИТЕЛЕН низ (Prisma маха филтъра при undefined).
// Чуждо/непознато съобщение е нормален случай (всяко ботско съобщение минава оттук) → count 0 не е грешка.
router.post("/reaction-roles/message/:messageId/deleted", async (req, res, next) => {
  const serverId = req.body?.serverId;
  if (typeof serverId !== "string" || !/^\d{17,20}$/.test(serverId)) return res.status(400).json({ error: "serverId required" });
  try {
    const r = await prisma.reactionRoleMessage.updateMany({
      where: { messageId: req.params.messageId, serverId },
      data: { messageId: null, channelId: null },
    });
    res.json({ ok: true, updated: r.count });
  } catch (err) { next(err); }
});

// ─── GET /api/bot/sticky-roles/servers ───────────────────────────────────────
// В5: кои сървъри имат включено запазване на роли — ботът затопля кеша на членовете САМО за тях.
router.get("/sticky-roles/servers", async (_req, res, next) => {
  try {
    const rows = await prisma.server.findMany({ where: { stickyRolesEnabled: true }, select: { id: true }, take: 20000 });
    res.json({ serverIds: rows.map((r) => r.id) });
  } catch (err) { next(err); }
});

// ─── GET /api/bot/reaction-roles/message/:messageId ──────────────────────────
// Ботът резолвва Discord messageId → reaction-role mapping (при реакция).
router.get("/reaction-roles/message/:messageId", async (req, res, next) => {
  try {
    const rrm = await prisma.reactionRoleMessage.findUnique({
      where: { messageId: req.params.messageId },
      include: { pairs: true },
    });
    if (!rrm) return res.status(404).json({ error: "Not a reaction role message" });
    res.json(rrm);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/reaction-roles/:rrmId ──────────────────────────────────────
// Ботът зарежда конфигурацията при spawn/update (вика се от internal handler-а).
router.get("/reaction-roles/:rrmId", async (req, res, next) => {
  try {
    const rrm = await prisma.reactionRoleMessage.findUnique({
      where: { id: req.params.rrmId },
      include: { pairs: true },
    });
    if (!rrm) return res.status(404).json({ error: "Reaction role message not found" });
    res.json(rrm);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/bot/application/:appId/discuss ────────────────────────────────
// Called by the bot when staff clicks "Open a ticket" on the review embed.
// Mirrors /api/applications/:serverId/:appId/discuss (dashboard) — opens a
// private discussion channel with the applicant, status stays PENDING.
router.post("/application/:appId/discuss", async (req, res, next) => {
  const { serverId, reviewerId, reviewerTag } = req.body;
  if (!serverId || !reviewerId) {
    return res.status(400).json({ error: "serverId and reviewerId are required" });
  }

  try {
    const app = await prisma.application.findFirst({
      where: { id: req.params.appId, serverId },
      include: {
        form: { include: { questions: { orderBy: { order: "asc" } } } },
        user: true,
      },
    });
    if (!app) return res.status(404).json({ error: "Application not found" });
    if (app.status !== "PENDING") {
      return res.status(400).json({ error: "Application already reviewed — discussion is for pending applications." });
    }

    // Идемпотентност: Ticket.applicationId е @unique → може да има само ЕДИН
    // тикет за кандидатурата. Търсим БЕЗ статус филтър — иначе затворен тикет
    // не се хваща тук, ботът създава Discord канал, а ticket.create гърми с
    // P2002 (осиротял канал + 500). Активен → връщаме канала; затворен →
    // 409 (дискусията вече е водена — не пресъздаваме нов канал). (Кодаджията)
    const transcript = buildTranscript(app.form.questions, app.answers);
    // Т6: мястото се заема ПРЕДИ каналът да бъде създаден (lib/applicationReview.js).
    const r = await openApplicationDiscussion({ app, serverId, reviewerId, reviewerTag, transcript });
    if (r.status === 200 && r.body.ticketId && !r.body.alreadyExists) {
      await writeAudit({
        actorId: reviewerId,
        actorTag: reviewerTag || "BOT",
        serverId,
        action: "APPLICATION_DISCUSSION_STARTED",
        targetId: app.id,
        metadata: { channelId: r.body.channelId, ticketId: r.body.ticketId, via: "discord_button" },
      });
    }
    res.status(r.status).json(r.body);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/bot/application/:appId/reviewers?serverId= ─────────────────────
// Т11: ботът пита кои роли са „мениджъри на кандидатури“ на формата (скоуп по serverId).
router.get("/application/:appId/reviewers", async (req, res, next) => {
  const serverId = req.query.serverId;
  if (typeof serverId !== "string" || !/^\d{17,20}$/.test(serverId)) return res.status(400).json({ error: "serverId required" });
  try {
    const row = await prisma.application.findFirst({
      where: { id: req.params.appId, serverId },
      select: { form: { select: { managerRoleIds: true } } },
    });
    if (!row) return res.status(404).json({ error: "Application not found" });
    res.json({ managerRoleIds: row.form?.managerRoleIds || [] });
  } catch (err) { next(err); }
});

// ─── GET /api/bot/application/:appId ─────────────────────────────────────────
// Bot fetches application details
router.get("/application/:appId", async (req, res, next) => {
  try {
    const application = await prisma.application.findUnique({
      where: { id: req.params.appId },
      include: {
        form: { include: { questions: { orderBy: { order: "asc" } } } },
        user: true,
      },
    });
    if (!application) return res.status(404).json({ error: "Application not found" });
    res.json(application);
  } catch (err) {
    next(err);
  }
});

export default router;
