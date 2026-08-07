// bot/src/index.js
import "dotenv/config";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
  });
  console.log("✅ Sentry error monitoring active (bot)");
}
import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
} from "discord.js";
import api, { getServer } from "./utils/api.js";
import { BRAND, SUCCESS, DANGER, WARNING, INFO, MUTED } from "./utils/colors.js";
import { getTranslator, SUPPORTED_LANGUAGES } from "./i18n/index.js";
import { readdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import express from "express";
import { requireBotSecret } from "./middleware/secret.js";
import { handlePanelSpawn, handlePanelUpdate, handleMultiPanelSpawn } from "./internal/panelHandler.js";
import { handleTicketClose, handleTicketClaim } from "./internal/ticketHandler.js";
import { handleApplicationReviewed } from "./internal/applicationHandler.js";
import { bootAllCustomClients, shutdownCustomClient } from "./services/clientManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Discord Client ───────────────────────────────────────────────────────────

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    // Привилегирован intent (1<<15). ТРИ употреби — този списък трябва да
    // съвпада ДУМА ПО ДУМА с обосновката в Dev Portal, защото ревюто сравнява
    // реалното поведение с декларираното:
    //   1. Тикет транскрипт — диалогът в тикет каналите се записва като одитен
    //      документ за собственика на сървъра.
    //   2. AI auto-reply — съдържанието на въпроса отива към LLM доставчик, за
    //      да се предложи отговор (разкрито в политиката за поверителност).
    //   3. Server Activity Logging, категория „messages“ — редакция/изтриване на
    //      съобщение се препраща в лог канала на СЪЩИЯ guild. Изборна е, НЕ е
    //      включена по подразбиране (v38) и се вдига само от администратор с
    //      Manage Server. Съдържанието не се пази в нашата база и не се показва
    //      в таблото.
    // Без intent-а content/attachments идват празни. Изисква включване в Dev
    // Portal; при 10 000+ уникални потребители — Discord review, който се
    // подновява всяка година.
    GatewayIntentBits.MessageContent,
    // Привилегирован intent (1<<1): нужен за разрешаване на ролите на члена при
    // authz проверки (supportRoleIds), verification (min account age / role assign)
    // и за GuildMember събития. Изисква включване в Dev Portal + review при 10000+.
    GatewayIntentBits.GuildMembers,
    // Непривилегирован intent (1<<7): нужен за Server Event Logging на гласови
    // действия (voiceStateUpdate → join/leave/move, server/self mute+deaf,
    // streaming, camera). Без него не получаваме VOICE_STATE_UPDATE събития.
    GatewayIntentBits.GuildVoiceStates,
    // Непривилегирован intent (1<<2): нужен за Server Event Logging на модерация
    // (guildBanAdd/guildBanRemove → member_ban/member_unban). Без него не
    // получаваме GUILD_BAN_* събития.
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    // Непривилегирован intent (1<<10): нужен за Reaction Roles (v33) —
    // messageReactionAdd/Remove събития. Без него react → роля не работи.
    GatewayIntentBits.GuildMessageReactions,
  ],
  // Message + Reaction + User partials: реакция върху съобщение отпреди
  // рестарта на бота идва partial — без Message/Reaction събитието изобщо не
  // се емитва за некеширани съобщения. Без Partials.User пък
  // messageReactionRemove НЕ се емитва за потребител извън кеша (discord.js
  // MessageReactionRemove.handle излиза с false) → ролята остава при махната
  // реакция след рестарт (находка на Кодаджията). Reaction Roles v33.
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

// ─── Commands Collection ──────────────────────────────────────────────────────

client.commands = new Collection();

const commandFiles = readdirSync(join(__dirname, "commands")).filter((f) => f.endsWith(".js"));

for (const file of commandFiles) {
  const command = await import(pathToFileURL(join(__dirname, "commands", file)).href);
  if (command.default?.data && command.default?.execute) {
    client.commands.set(command.default.data.name, command.default);
    console.log(`✅ Loaded command: ${command.default.data.name}`);
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

const eventFiles = readdirSync(join(__dirname, "events")).filter((f) => f.endsWith(".js"));

for (const file of eventFiles) {
  const event = await import(pathToFileURL(join(__dirname, "events", file)).href);
  if (event.default?.once) {
    client.once(event.default.name, (...args) => event.default.execute(...args));
  } else {
    client.on(event.default.name, (...args) => event.default.execute(...args));
  }
}

// ─── Message Logging & channel cleanup ───────────────────────────────────────
// Логиката на messageCreate (тикет transcript + sticky repost) и channelDelete
// (auto-close на тикет при изтрит канал) е изнесена в event модули под
// bot/src/events/ (messageCreate.js, channelDelete.js), за да се закачат И на
// главния клиент (event-loop-а по-горе), И на всеки white-label клиент през
// clientManager.loadEventModules. Споделените кешове живеят в
// utils/ticketCaches.js. Затова тук няма inline handler-и.

// ─── Internal HTTP Server (receives events from backend) ─────────────────────

const app = express();
// 1mb вместо дефолтните 100kb: груповото публикуване праща до 10 панела с
// вградените им форми и въпроси в едно тяло — при по-големи конфигурации
// дефолтът връщаше 413 и UI-ят показваше подвеждащото „Bot is offline“.
app.use(express.json({ limit: "1mb" }));

// Health check — no auth required (used by docker healthcheck + status page).
// Liveness трябва да отразява РЕАЛНАТА зависимост (Discord gateway), не само
// че HTTP сървърът слуша — иначе паднал gateway се води "operational" и
// docker restart политиката никога не рестартира бота.
app.get("/health", (_req, res) => {
  const gatewayReady = client.isReady();
  res.status(gatewayReady ? 200 : 503).json({
    status: gatewayReady ? "ok" : "degraded",
    gateway: gatewayReady ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

app.use(requireBotSecret);

// ─── Резолвиране на канал В РАМКИТЕ на guild-а ───────────────────────────────
// `client.channels.fetch(id)` търси през ВСИЧКИ guild-ове, в които е ботът —
// това е споделен бот, значи чужди сървъри. Маршрутите приемаха `serverId`
// именно за да го сверят, но го подминаваха: админ на сървър A можеше да зададе
// channelId от сървър B и нашите съобщения отиваха там (Кодаджията, 07.08.2026).
//
// `guild.channels.fetch` хвърля GuildChannelUnowned за чужд канал — точно
// гардът, който липсваше. Кешът се пробва пръв, за да не плащаме REST.
async function guildChannel(serverId, channelId) {
  if (!serverId || !channelId) return null;
  const guild = client.guilds.cache.get(serverId)
    || await client.guilds.fetch(serverId).catch(() => null);
  if (!guild) return null;
  return guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
}

app.post("/internal/panel-spawn", async (req, res) => {
  try {
    const result = await handlePanelSpawn(client, req.body);
    res.json(result);
  } catch (err) {
    console.error("panel-spawn error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Няколко панела в ЕДНО съобщение. customId-тата вече носят panelId, затова
// съществуващите interaction handler-и работят без промяна.
app.post("/internal/multi-panel-spawn", async (req, res) => {
  try {
    const result = await handleMultiPanelSpawn(client, req.body);
    res.json(result);
  } catch (err) {
    console.error("multi-panel-spawn error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/internal/panel-update", async (req, res) => {
  try {
    await handlePanelUpdate(client, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error("panel-update error:", err?.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Form spawn от dashboard-а ────────────────────────────────────────────────
// Постът е идентичен с /form spawn (commands/form.js) — същият customId
// `form_direct:<formId>`, така че бутонът се обработва от съществуващия
// handler в interactionCreate.js. Данните за формата идват в payload-а от
// backend-а (той вече я е заредил и валидирал ownership-а), без втори
// round-trip. Вика се от backend/src/routes/forms.js → notifyBot("FORM_SPAWN").
app.post("/internal/form-spawn", async (req, res) => {
  const { serverId, formId, channelId, formName, formDescription, buttonLabel } = req.body || {};
  if (!serverId || !formId || !channelId) {
    return res.status(400).json({ error: "serverId, formId and channelId required" });
  }
  try {
    // Fallback към REST fetch — кешът може да е студен след рестарт/sharding.
    const channel = await guildChannel(serverId, channelId);
    if (!channel?.isTextBased?.()) {
      return res.status(404).json({ error: "Channel not found or not text-based" });
    }
    // Cross-tenant guard: channelId е потребителски вход от dashboard-а —
    // админ на сървър A не бива да може да пости в канал на сървър B.
    if ((channel.guildId || channel.guild?.id) !== serverId) {
      return res.status(403).json({ error: "Channel belongs to a different server" });
    }

    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import("discord.js");
    const { INFO } = await import("./utils/colors.js");

    const btn = new ButtonBuilder()
      .setCustomId(`form_direct:${formId}`)
      .setLabel(String(buttonLabel || "Apply Now").slice(0, 80)) // Discord button label limit
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📋");

    const msg = await channel.send({
      embeds: [{
        title: formName || "Application",
        description: formDescription || "Click the button below to apply.",
        color: INFO,
      }],
      components: [new ActionRowBuilder().addComponents(btn)],
    });

    res.json({ ok: true, channelId, messageId: msg.id });
  } catch (err) {
    console.error("form-spawn error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

// ── Poll / Giveaway spawn от dashboard-а ─────────────────────────────────────
// Постват СЪЩИТЕ embeds като /poll и /giveaway (преизползваме builder-ите от
// командите), така че vote/enter бутоните минават през съществуващите
// interaction handler-и. Записът вече е създаден от backend-а; тук само
// пращаме съобщението и връщаме messageId.
app.post("/internal/poll-spawn", async (req, res) => {
  const { serverId, channelId, poll } = req.body || {};
  if (!serverId || !channelId || !poll?.id) {
    return res.status(400).json({ error: "serverId, channelId and poll required" });
  }
  try {
    const channel = await guildChannel(serverId, channelId);
    if (!channel?.isTextBased?.()) {
      return res.status(404).json({ error: "Channel not found or not text-based" });
    }
    // Cross-tenant guard: channelId е потребителски вход от dashboard-а.
    if ((channel.guildId || channel.guild?.id) !== serverId) {
      return res.status(403).json({ error: "Channel belongs to a different server" });
    }

    const { buildPollMessage } = await import("./commands/poll.js");
    const { embeds, components } = buildPollMessage(poll, poll.options.map(() => 0));
    const msg = await channel.send({ embeds, components });
    res.json({ ok: true, channelId, messageId: msg.id });
  } catch (err) {
    console.error("poll-spawn error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

app.post("/internal/giveaway-spawn", async (req, res) => {
  const { serverId, channelId, giveaway } = req.body || {};
  if (!serverId || !channelId || !giveaway?.id) {
    return res.status(400).json({ error: "serverId, channelId and giveaway required" });
  }
  try {
    const channel = await guildChannel(serverId, channelId);
    if (!channel?.isTextBased?.()) {
      return res.status(404).json({ error: "Channel not found or not text-based" });
    }
    if ((channel.guildId || channel.guild?.id) !== serverId) {
      return res.status(403).json({ error: "Channel belongs to a different server" });
    }

    const { buildGiveawayMessage } = await import("./commands/giveaway.js");
    const { embeds, components } = buildGiveawayMessage(giveaway, 0);
    const msg = await channel.send({ embeds, components });
    res.json({ ok: true, channelId, messageId: msg.id });
  } catch (err) {
    console.error("giveaway-spawn error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

// ── Reaction Roles spawn / update / delete (v33) ─────────────────────────────
// Постанова embed с двойките emoji → роля и слага началните реакции, така че
// членовете само да кликат. Update редактира embed-а и синхронизира реакциите;
// delete маха съобщението. Вика се от backend/src/routes/reactionroles.js.
app.post("/internal/reaction-role-spawn", async (req, res) => {
  const { rrmId, serverId, channelId } = req.body || {};
  if (!rrmId || !serverId || !channelId) {
    return res.status(400).json({ error: "rrmId, serverId and channelId required" });
  }
  try {
    const { buildReactionRoleEmbed, clearRrmCache } = await import("./utils/reactionRoles.js");
    const { data: rrm } = await api.get(`/bot/reaction-roles/${rrmId}`);

    const channel = await guildChannel(serverId, channelId);
    if (!channel?.isTextBased?.()) {
      return res.status(404).json({ error: "Channel not found or not text-based" });
    }
    // Cross-tenant guard: channelId е потребителски вход от dashboard-а.
    if ((channel.guildId || channel.guild?.id) !== serverId) {
      return res.status(403).json({ error: "Channel belongs to a different server" });
    }

    const msg = await channel.send({ embeds: [buildReactionRoleEmbed(rrm)] });

    // Отговори с messageId ВЕДНАГА — до 20 msg.react() последователно могат да
    // надхвърлят 10s timeout на notifyBot и backend-ът да не запише messageId,
    // докато съобщението е живо (находка на Кодаджията). Реакциите се слагат
    // след отговора (fire-and-forget, best-effort: чуждо/невалидно emoji не
    // бива да събаря spawn-а).
    res.json({ ok: true, channelId, messageId: msg.id });

    (async () => {
      for (const p of rrm.pairs) {
        await msg.react(p.emoji).catch((err) =>
          console.warn(`[ReactionRoles] react ${p.emoji} failed: ${err?.message}`)
        );
      }
      clearRrmCache(rrm.messageId);
    })().catch(() => {});
  } catch (err) {
    console.error("reaction-role-spawn error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

app.post("/internal/reaction-role-update", async (req, res) => {
  const { rrmId } = req.body || {};
  if (!rrmId) return res.status(400).json({ error: "rrmId required" });
  try {
    const { buildReactionRoleEmbed, emojiKey, clearRrmCache } = await import("./utils/reactionRoles.js");
    const { data: rrm } = await api.get(`/bot/reaction-roles/${rrmId}`);
    if (!rrm.channelId || !rrm.messageId) return res.json({ ok: true, skipped: "not yet spawned" });

    const channel = client.channels.cache.get(rrm.channelId)
      || await client.channels.fetch(rrm.channelId).catch(() => null);
    if (!channel) return res.status(404).json({ error: "Channel no longer exists" });

    const msg = await channel.messages.fetch(rrm.messageId).catch(() => null);
    if (!msg) return res.status(404).json({ error: "Message no longer exists" });

    await msg.edit({ embeds: [buildReactionRoleEmbed(rrm)] });

    // Синхронизирай реакциите: добави липсващите, махни вече несъществуващите.
    const wanted = new Set(rrm.pairs.map((p) => p.emoji));
    for (const p of rrm.pairs) {
      const existing = msg.reactions.cache.find((r) => emojiKey(r.emoji) === p.emoji);
      if (!existing) await msg.react(p.emoji).catch(() => {});
    }
    for (const r of msg.reactions.cache.values()) {
      if (!wanted.has(emojiKey(r.emoji))) {
        // Маха реакцията за ВСИЧКИ (изисква Manage Messages) — best-effort.
        await r.remove().catch(() => {});
      }
    }

    clearRrmCache(rrm.messageId);
    res.json({ ok: true });
  } catch (err) {
    console.error("reaction-role-update error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

app.post("/internal/reaction-role-delete", async (req, res) => {
  const { serverId, channelId, messageId } = req.body || {};
  if (!channelId || !messageId) return res.status(400).json({ error: "channelId and messageId required" });
  try {
    const { clearRrmCache } = await import("./utils/reactionRoles.js");
    const channel = await guildChannel(serverId, channelId);
    if (channel && serverId && (channel.guildId || channel.guild?.id) !== serverId) {
      return res.status(403).json({ error: "Channel belongs to a different server" });
    }
    const msg = channel ? await channel.messages.fetch(messageId).catch(() => null) : null;
    if (msg) await msg.delete().catch(() => {});
    clearRrmCache(messageId);
    res.json({ ok: true, deleted: !!msg });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Verification panel spawn / update (v1.7) ────────────────────────────────
app.post("/internal/verification-spawn", async (req, res) => {
  const { panelId, serverId, channelId } = req.body;
  if (!panelId || !channelId) return res.status(400).json({ error: "panelId and channelId required" });
  try {
    const { buildVerificationMessage } = await import("./utils/verificationEmbed.js");
    const { data: panel } = await api.get(`/verification/bot/${panelId}`);
    const channel = await guildChannel(serverId, channelId);
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    // Cross-tenant guard: channelId е потребителски вход от dashboard-а.
    if (serverId && (channel.guildId || channel.guild?.id) !== serverId) {
      return res.status(403).json({ error: "Channel belongs to a different server" });
    }
    const { embeds, components } = buildVerificationMessage(panel);
    const msg = await channel.send({ embeds, components });
    // Панелът ВЕЧЕ е публикуван в Discord. Ако това потвърждение хвърли, целият
    // маршрут връщаше 500 → backend-ът показва „Bot did not respond" → админът
    // натиска пак → ВТОРИ жив панел в канала. Извикването е и излишно:
    // routes/verification.js записва същото след успешен отговор.
    // (Кодаджията, 07.08.2026)
    await api.patch(`/verification/bot/${panelId}/spawned`, { channelId, messageId: msg.id })
      .catch((err) => console.warn(`[verification-spawn] потвърждението към backend-а се провали: ${err?.message}`));
    res.json({ ok: true, channelId, messageId: msg.id });
  } catch (err) {
    console.error("verification-spawn error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

app.post("/internal/verification-update", async (req, res) => {
  const { panelId } = req.body;
  if (!panelId) return res.status(400).json({ error: "panelId required" });
  try {
    const { buildVerificationMessage } = await import("./utils/verificationEmbed.js");
    const { data: panel } = await api.get(`/verification/bot/${panelId}`);
    if (!panel.channelId || !panel.messageId) return res.json({ ok: true, skipped: "not yet spawned" });
    const channel = await client.channels.fetch(panel.channelId).catch(() => null);
    if (!channel) return res.status(404).json({ error: "Channel no longer exists" });
    const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
    if (!msg) return res.status(404).json({ error: "Message no longer exists" });
    const { embeds, components } = buildVerificationMessage(panel);
    await msg.edit({ embeds, components });
    res.json({ ok: true });
  } catch (err) {
    console.error("verification-update error:", err?.message);
    res.status(500).json({ error: err?.message });
  }
});

app.post("/internal/ticket-close", async (req, res) => {
  try {
    await handleTicketClose(client, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/internal/ticket-claimed", async (req, res) => {
  try {
    await handleTicketClaim(client, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Отговор на тикет от dashboard-а — ботът публикува embed в тикет канала от
// името на staff члена („Име · via dashboard“), без staff-ът да влиза в Discord.
// Вика се от backend/src/services/botNotifier.js → sendTicketReply().
app.post("/internal/ticket-reply", async (req, res) => {
  const { channelId, content, authorName, ticketId, number } = req.body || {};
  if (!channelId || typeof channelId !== "string" || !content || typeof content !== "string") {
    return res.status(400).json({ ok: false, reason: "channelId (string) and content (string) required" });
  }

  try {
    const { INFO } = await import("./utils/colors.js");

    // Fallback към REST fetch — кешът може да е студен след рестарт/sharding;
    // работи и за thread-базирани тикети (channels.fetch връща и threads).
    const channel = client.channels.cache.get(channelId)
      || await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
      return res.status(502).json({ ok: false, reason: "Ticket channel not found or not text-based" });
    }

    const pad = number != null ? `#${String(number).padStart(4, "0")}` : ticketId ? `· ${ticketId.slice(-8)}` : "";
    const sent = await channel
      .send({
        embeds: [{
          author: { name: `${authorName || "Staff"} · via dashboard` },
          description: content.slice(0, 1500),
          color: INFO,
          footer: { text: `Ticket ${pad}`.trim() },
          timestamp: new Date().toISOString(),
        }],
        // allowedMentions guard: съдържанието идва от dashboard вход — никакви
        // пингове (вкл. @everyone/@here), backend-ът вече чисти, но defense in depth.
        allowedMentions: { parse: [] },
      })
      .catch((err) => {
        console.error(`[ticket-reply] ${ticketId ?? channelId}: ${err?.code ?? "?"} ${err?.message ?? err}`);
        return null;
      });

    if (!sent) return res.status(502).json({ ok: false, reason: "Failed to send the reply to Discord" });
    res.json({ ok: true, messageId: sent.id });
  } catch (err) {
    res.status(502).json({ ok: false, reason: err.message });
  }
});

// v2.2 — Open a private discussion channel with applicant (pre-decision)
app.post("/internal/application-discuss", async (req, res) => {
  try {
    const {
      serverId, applicantId, applicantTag, reviewerId, reviewerTag,
      applicationId, formName, managerRoleIds = [], discussCategoryId, transcript,
    } = req.body;

    const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
    if (!guild) return res.status(404).json({ ok: false, error: "Guild not found" });

    const { ChannelType } = await import("discord.js");

    // v34 — формата може да фиксира категорията (Form.discussCategoryId).
    // Cross-tenant guard: ID-то е потребителски вход от dashboard-а — трябва
    // да е КАТЕГОРИЯ в СЪЩИЯ guild, иначе го игнорираме и падаме на авто-избор.
    let category = null;
    if (discussCategoryId) {
      const fixed = guild.channels.cache.get(discussCategoryId)
        || await guild.channels.fetch(discussCategoryId).catch(() => null);
      if (fixed?.type === ChannelType.GuildCategory && fixed.guildId === guild.id) {
        category = fixed;
      } else {
        console.warn(`[application-discuss] discussCategoryId ${discussCategoryId} не е категория в guild ${guild.id} — авто-избор`);
      }
    }

    // Fallback: „applications“ / „tickets“ / „reviews“ / „staff“ категория по име
    if (!category) {
      category = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildCategory &&
          /applicat|review|ticket|staff/i.test(c.name)
      );
    }

    const applicantUser = await client.users.fetch(applicantId).catch(() => null);
    const cleanName = (applicantTag || "applicant").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || "applicant";

    const permissionOverwrites = [
      { id: guild.id, deny: ["ViewChannel"] },
      { id: applicantId, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"] },
      { id: reviewerId,  allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"] },
      ...managerRoleIds.map((roleId) => ({
        id: roleId,
        allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"],
      })),
    ];

    const channel = await guild.channels.create({
      name: `discuss-${cleanName}`,
      type: ChannelType.GuildText,
      parent: category?.id || null,
      permissionOverwrites,
      // Discord audit reason лимит: 512 знака — режем потребителското име на формата
      reason: `Application discussion: ${String(formName || "").slice(0, 400)} #${applicationId.slice(-8)}`,
    });

    // Welcome embed with context
    await channel.send({
      content: `<@${applicantId}> <@${reviewerId}>`,
      allowedMentions: { parse: ["users", "roles"] }, // само споменатите users/roles, без @everyone
      embeds: [{
        title: `📋 Application Discussion — ${formName}`,
        description:
          `Hi ${applicantUser ? `<@${applicantId}>` : "applicant"}! ` +
          `Staff (<@${reviewerId}>${managerRoleIds.length ? ` + ${managerRoleIds.map((r) => `<@&${r}>`).join(" ")}` : ""}) ` +
          `want to discuss your application before making a decision.\n\n` +
          `Feel free to answer any follow-up questions here. This channel will be closed once a decision is made.`,
        color: BRAND,
        footer: { text: `Application ID: ${applicationId}` },
        timestamp: new Date().toISOString(),
      }],
    });

    // Application transcript for context
    if (transcript) {
      await channel.send({
        embeds: [{
          title: "📝 Original Application",
          description: transcript.slice(0, 4000),
          color: MUTED,
        }],
      });
    }

    res.json({ ok: true, channelId: channel.id });
  } catch (err) {
    console.error("[application-discuss]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/internal/whitelabel-update", async (req, res) => {
  // Called when a server's custom bot token or settings change
  const { serverId } = req.body;
  if (!serverId) return res.status(400).json({ error: "serverId required" });

  try {
    const { restartCustomClient } = await import("./services/clientManager.js");
    const newClient = await restartCustomClient(serverId, client);
    res.json({ ok: true, started: !!newClient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Извиква се, когато tier на сървър може да е паднал БЕЗ смяна на токена: махане
// от agency seat, отмяна/refund/dispute на агенцията, дунинг деактивация. Пълната
// реконсилиация привежда работещите бранд ботове към ЕФЕКТИВНИЯ tier — сваля тези
// без право, вдига новите. Нарочно НЕ ползваме per-server `restartCustomClient`:
// той е за смяна на ТОКЕН (пази стария клиент при неуспех) и би изтекъл gateway
// сесия за все още валиден сървър. Метлата е идемпотентна и евтина (един GET).
app.post("/internal/whitelabel-reconcile", async (req, res) => {
  try {
    const { reconcileCustomClients } = await import("./services/clientManager.js");
    const result = await reconcileCustomClients(client);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/internal/application-reviewed", async (req, res) => {
  try {
    await handleApplicationReviewed(client, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// v2.2 — Post application transcript to configured channel
app.post("/internal/application-transcript", async (req, res) => {
  try {
    const { serverId, channelId, applicationId, formName, applicantId, applicantTag, action, reviewerTag, reviewerId, note, transcript } = req.body;
    const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
    if (!guild) return res.status(404).json({ error: "Guild not found" });

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return res.status(404).json({ error: "Transcript channel not found or not text-based" });

    const statusConfig = {
      approve: { title: "✅ Application Approved", color: SUCCESS },
      deny:    { title: "❌ Application Denied",   color: DANGER },
    };
    const cfg = statusConfig[action] || { title: "📋 Application Reviewed", color: BRAND };

    const embed = {
      title: `${cfg.title} — ${formName}`,
      description: transcript.slice(0, 4000),
      color: cfg.color,
      fields: [
        { name: "Applicant", value: `<@${applicantId}> (${applicantTag})`, inline: true },
        { name: "Reviewed by", value: `<@${reviewerId}> (${reviewerTag})`, inline: true },
      ],
      footer: { text: `Application ID: ${applicationId}` },
      timestamp: new Date().toISOString(),
    };
    if (note) embed.fields.push({ name: "Review Note", value: note.slice(0, 1000), inline: false });

    await channel.send({ embeds: [embed] });
    res.json({ ok: true });
  } catch (err) {
    console.error("[application-transcript]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/internal/ticket-assigned", async (req, res) => {
  const { channelId, assigneeId, ticketId } = req.body;
  if (!assigneeId) return res.json({ ok: true });

  try {
    // Send DM to the assigned staff member
    const assignee = await client.users.fetch(assigneeId).catch(() => null);
    if (assignee) {
      await assignee.send({
        embeds: [{
          title: "🎫 New Ticket Assigned",
          description: `You have been automatically assigned a new support ticket.`,
          fields: [
            { name: "Ticket ID", value: ticketId, inline: true },
            ...(channelId ? [{ name: "Channel", value: `<#${channelId}>`, inline: true }] : []),
          ],
          color: INFO,
          footer: { text: "You can claim or unclaim it with /ticket claim" },
        }],
      }).catch(() => {}); // User may have DMs disabled — not critical
    }

    // Also send a notification in the ticket channel
    if (channelId) {
      // Единственият маршрут без REST fallback: архивиран thread-тикет не е в
      // кеша → известието мълчеше, а маршрутът връщаше ok:true.
      const channel = client.channels.cache.get(channelId)
        || await client.channels.fetch(channelId).catch(() => null);
      // Текстът ползва assigneeId, не обекта `assignee` — да връзваме
      // известието за успешен users.fetch беше излишна причина да мълчи.
      if (channel) {
        await channel.send({
          embeds: [{
            description: `🛡️ This ticket has been assigned to <@${assigneeId}> via round-robin.`,
            color: INFO,
          }],
        }).catch(() => {});
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Appy.bot-style: apply roles and send DM to applicant after review
// Inactivity auto-close notice — posted by scheduler
app.post("/internal/ticket-auto-closed", async (req, res) => {
  const { channelId, serverId, hours, logChannelId, number, padding } = req.body;
  try {
    const channel = await guildChannel(serverId, channelId);
    if (channel) {
      await channel.send({
        embeds: [{
          title: "🔒 Ticket Auto-Closed",
          description: `This ticket has been automatically closed after **${hours}h** of inactivity.\n\nStaff can use the buttons above to reopen or delete.`,
          color: DANGER,
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {});
    }
    if (logChannelId) {
      const logCh = await guildChannel(serverId, logChannelId);
      if (logCh) {
        const pad = String(number ?? "").padStart(padding ?? 4, "0");
        await logCh.send({
          embeds: [{
            title: `🕛 Ticket Auto-Closed · #${pad}`,
            description: `**Channel**: <#${channelId}>\n**Reason**: ${hours}h inactivity`,
            color: WARNING,
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => {});
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/internal/application-apply-outcome", async (req, res) => {
  const { serverId, userId, rolesToAdd = [], rolesToRemove = [], dmMessage, action } = req.body;
  if (!serverId || !userId) return res.status(400).json({ error: "serverId and userId required" });

  const result = {
    rolesAdded: [], rolesFailed: [], rolesRemoved: [], rolesRemoveFailed: [],
    dmSent: false, guildFound: false, memberFound: false,
  };

  try {
    const guild = await client.guilds.fetch(serverId).catch(() => null);
    result.guildFound = !!guild;
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      result.memberFound = !!member;
      if (member) {
        for (const roleId of rolesToAdd) {
          try {
            await member.roles.add(roleId, "Application approved");
            result.rolesAdded.push(roleId);
          } catch (err) {
            result.rolesFailed.push({ roleId, reason: err.message });
          }
        }
        for (const roleId of rolesToRemove) {
          try {
            await member.roles.remove(roleId, "Application approved");
            result.rolesRemoved.push(roleId);
          } catch (err) {
            // Досега този провал изчезваше напълно. Ролята може наистина вече
            // да я няма (нормално), но може и ботът да няма права — а това
            // трябва да се вижда.
            result.rolesRemoveFailed.push({ roleId, reason: err.message });
          }
        }
      } else {
        // Кандидатът е напуснал сървъра между подаването и решението — рутинно.
        // Досега блокът просто се прескачаше, маршрутът връщаше ok:true с празен
        // rolesAdded, а DM-ът въпреки това казваше „✅ Application Approved“.
        // Кандидатът чете „одобрен“ и няма ролята; никой не научава.
        console.warn(`[apply-outcome] членът ${userId} не е в guild ${serverId} — ${rolesToAdd.length} роли НЕ са раздадени`);
      }
    } else {
      console.warn(`[apply-outcome] guild ${serverId} е недостъпен — ${rolesToAdd.length} роли НЕ са раздадени`);
    }

    if (dmMessage) {
      try {
        const user = await client.users.fetch(userId);
        const color = action === "approve" ? SUCCESS : action === "deny" ? DANGER : BRAND;
        const title = action === "approve" ? "✅ Application Approved" : action === "deny" ? "❌ Application Denied" : "📋 Application Update";
        await user.send({
          embeds: [{
            title,
            description: dmMessage,
            color,
            // Иконата на сървъра — това е най-важното DM-съобщение, което
            // изпращаме (одобрен/отказан кандидат); получателят трябва да
            // вижда веднага от кой сървър идва.
            thumbnail: guild?.iconURL?.({ size: 128 }) ? { url: guild.iconURL({ size: 128 }) } : undefined,
            footer: { text: guild?.name || "Application outcome" },
            timestamp: new Date().toISOString(),
          }],
        });
        result.dmSent = true;
      } catch { /* user has DMs disabled — not fatal */ }
    }

    // `ok` вече отразява РЕАЛНОСТТА, не факта, че не е хвърлено изключение:
    // поискани роли, нито една раздадена → не е наред, колкото и да е рутинна
    // причината. Иначе таблото и одитът записват успех, какъвто няма.
    const rolesRequested = rolesToAdd.length > 0;
    result.ok = !rolesRequested || result.rolesAdded.length > 0;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Poll closed (scheduler auto-close или ръчно затваряне през dashboard) ─────
// Backend праща крайните бройки; ботът пресъздава poll embed-а в ЗАТВОРЕНО
// състояние (финални проценти, highlight на печелившата опция) и маха vote
// бутоните. requireBotSecret е закачен и глобално по-горе (app.use) — тук е
// повторен изрично, за да е самодокументиращо, че route-ът е авторизиран.
app.post("/internal/poll-update", requireBotSecret, async (req, res) => {
  const { channelId, messageId, question, options, multiChoice } = req.body;
  if (!channelId || !messageId || !question || !Array.isArray(options)) {
    return res.status(400).json({ error: "channelId, messageId, question, options[] required" });
  }
  try {
    // Fallback към REST fetch — кешът може да е студен след рестарт/sharding.
    const channel = client.channels.cache.get(channelId)
      || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.warn(`[poll-update] channel ${channelId} not found`);
      return res.status(404).json({ error: "Channel not found" });
    }

    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (!msg) {
      // Fail-safe: 404 от Discord (изтрито съобщение) → логни, не крашвай.
      console.warn(`[poll-update] message ${messageId} not found in channel ${channelId}`);
      return res.status(404).json({ error: "Message not found" });
    }

    // ПРЕизползваме poll-embed builder-а от /poll (commands/poll.js) за
    // консистентен стил. Адаптираме payload-а към очаквания формат:
    //   options: [{ label, votes }] → poll.options (string[]) + counts (number[]).
    // `closedAt` (truthy) кара builder-а да рендира closed състояние (сив цвят,
    // "Poll closed" footer, highlight на печелившата) и да върне components: []
    // → vote бутоните изчезват.
    const { buildPollMessage } = await import("./commands/poll.js");
    const pollLike = {
      question,
      options: options.map((o) => o.label),
      multiChoice: !!multiChoice,
      closesAt: null,                      // без "Closes in ..." при затворена анкета
      closedAt: new Date().toISOString(),  // маркира closed → маха бутоните
    };
    const counts = options.map((o) => Number(o.votes) || 0);
    const { embeds, components } = buildPollMessage(pollLike, counts);
    await msg.edit({ embeds, components });

    res.json({ ok: true });
  } catch (err) {
    console.error("[poll-update]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── v1.8 Giveaway ended by scheduler — update Discord message + announce winners
app.post("/internal/giveaway-ended", async (req, res) => {
  const { serverId, channelId, messageId, prize, winners, giveawayId } = req.body;
  try {
    const channel = await guildChannel(serverId, channelId);
    if (!channel) return res.json({ ok: false, reason: "channel not found" });

    // Update the giveaway message
    if (messageId) {
      try {
        const { data: g } = await api.get(`/bot/giveaway/${giveawayId}`);
        const { buildGiveawayMessage } = await import("./commands/giveaway.js");
        const { embeds, components } = buildGiveawayMessage(g, g.entryCount || 0);
        const msg = await channel.messages.fetch(messageId).catch(() => null);
        if (msg) await msg.edit({ embeds, components });
      } catch {}
    }

    // Announce
    // allowedMentions guard: пингваме само победителите (реални user ID-та),
    // никога @everyone/@here — `prize` идва от dashboard вход и не бива да
    // позволява масов пинг.
    if (winners?.length) {
      await channel.send({
        content: `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(", ")}! You won **${prize}**!`,
        allowedMentions: { parse: ["users"] },
      });
    } else {
      await channel.send({
        content: `😔 Giveaway for **${prize}** ended with no eligible entrants.`,
        allowedMentions: { parse: [] },
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── v1.8 Scheduled message sending
app.post("/internal/scheduled-message-send", async (req, res) => {
  const { channelId, content, embedTitle, embedDescription, embedColor, serverId } = req.body;
  try {
    const channel = await guildChannel(serverId, channelId);
    // 502, НЕ 200. При 200 планировчикът смяташе заявката за успешна и маркираше
    // съобщението като изпратено — еднократно насрочено съобщение, чийто канал е
    // изтрит, се губеше безвъзвратно, а таблото показваше „изпратено“.
    // (Кодаджията, 07.08.2026)
    if (!channel) {
      return res.status(502).json({ ok: false, reason: "channel not found or not in this guild" });
    }

    // Cross-tenant guard (F2): каналът ТРЯБВА да е в guild-а на сървъра, който
    // е насрочил съобщението — иначе чужд channelId в записа би инжектирал
    // съдържание в друг сървър. Огледало на sticky/panel sender-ите по-горе.
    if (serverId && (channel.guildId || channel.guild?.id) !== serverId) {
      return res.status(403).json({ ok: false, error: "channel not in server guild" });
    }

    if (embedTitle || embedDescription) {
      await channel.send({
        embeds: [{
          title: embedTitle || undefined,
          description: embedDescription || content,
          color: parseInt((embedColor || "#00e5ff").replace("#", ""), 16),
        }],
        // allowedMentions guard: scheduled съдържание идва от dashboard вход —
        // забраняваме всякакви пингове (вкл. @everyone/@here).
        allowedMentions: { parse: [] },
      });
    } else {
      await channel.send({ content, allowedMentions: { parse: [] } });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/internal/ai-reply", async (req, res) => {
  const { channelId, content, ticketId, language, model } = req.body;
  if (!channelId || !content) return res.status(400).json({ error: "channelId and content required" });

  try {
    // Fallback към REST fetch — кешът може да е студен след рестарт/sharding.
    const channel = client.channels.cache.get(channelId)
      || await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return res.status(404).json({ error: "Channel not found" });

    // EU AI Act Article 50 — разкритието трябва да е на езика на сървъра.
    // Език по приоритет: (1) `language` подаден от backend-а (без round-trip),
    // (2) `server.language` за guild-а на канала (best-effort), (3) "en".
    let lang = SUPPORTED_LANGUAGES.includes(language) ? language : null;
    if (!lang) {
      try {
        const server = await getServer(channel.guildId || channel.guild?.id);
        if (SUPPORTED_LANGUAGES.includes(server?.language)) lang = server.language;
      } catch {
        // backend недостъпен / guild не е намерен → fallback на en
      }
    }
    const tr = getTranslator(lang || "en");
    // Името на модела не се локализира (собствено име). Идва от backend-а
    // (AI_MODEL_NAME) — fallback за стари payload-и без поле model.
    const modelName = model || "Google Gemini Flash";

    // EU AI Act Article 50 compliance — clear and prominent disclosure
    // that user is interacting with AI-generated content
    await channel.send({
      embeds: [{
        author: {
          name: tr("ai.disclosure.author"),
        },
        title: tr("ai.disclosure.title"),
        description: content,
        color: INFO,
        fields: [
          {
            name: tr("ai.disclosure.fieldName"),
            value: tr("ai.disclosure.body", { model: modelName }),
            inline: false,
          },
        ],
        footer: {
          text: tr("ai.disclosure.footer"),
        },
        timestamp: new Date().toISOString(),
      }],
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin broadcast — send a system message to a specific server channel
app.post("/internal/admin-broadcast", async (req, res) => {
  const { serverId, channelId, title, message, senderTag } = req.body;
  if (!channelId || !message) return res.status(400).json({ error: "channelId and message required" });

  try {
    const channel = await guildChannel(serverId, channelId);
    if (!channel) return res.status(404).json({ error: "Channel not found or bot lacks access" });

    await channel.send({
      embeds: [{
        title: `📢 ${title || "Platform Notice"}`,
        description: message,
        color: BRAND,
        footer: { text: `— Supreme Bot admin${senderTag ? ` (${senderTag})` : ""}` },
        timestamp: new Date().toISOString(),
      }],
      // allowedMentions guard: broadcast съдържанието идва от admin dashboard
      // вход — забраняваме всякакви пингове (вкл. @everyone/@here).
      allowedMentions: { parse: [] },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Direct message to a user (транзакционни известия от backend-а) ───────────
// Продуктът няма имейл инфраструктура → каналът за известия по абонамента
// (изтичащ пробен период, провалено плащане) е Discord DM. Вика се от
// backend/src/services/botNotifier.js → dmUser().
// requireBotSecret е закачен и глобално по-горе (app.use) — тук е повторен
// изрично, за да е самодокументиращо, че route-ът е авторизиран.
//
// Затворени DM-и НЕ са грешка на сървъра: Discord връща 50007 („Cannot send
// messages to this user"), когато получателят е спрял DM от сървъри или е
// блокирал бота. Отговаряме 200 с { ok:false, reason } — иначе backend-ът би
// го отчел като провал и би ретрайвал известие, което никога няма да мине.
app.post("/internal/dm-user", requireBotSecret, async (req, res) => {
  const { userId, embed } = req.body || {};
  if (!userId || typeof userId !== "string" || !embed || typeof embed !== "object") {
    return res.status(400).json({ error: "userId (string) and embed (object) required" });
  }

  try {
    const sent = await client.users
      .send(userId, {
        embeds: [embed],
        // allowedMentions guard: съдържанието се сглобява от backend-а, но
        // забраняваме всякакви пингове по презумпция (defense in depth).
        allowedMentions: { parse: [] },
      })
      .catch((err) => {
        // 50007 = DM затворен/блокиран бот; 10013 = непознат потребител.
        console.warn(`[dm-user] ${userId}: ${err?.code ?? "?"} ${err?.message ?? err}`);
        return null;
      });

    if (!sent) return res.json({ ok: false, reason: "dm_unreachable" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const BOT_API_PORT = process.env.BOT_API_PORT || 3001;
app.listen(BOT_API_PORT, () => {
  console.log(`🤖 Bot internal API running on port ${BOT_API_PORT}`);
});

// ─── Login ────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, async () => {
  // After main client is ready, boot white-label clients for Premium servers
  // (Events.ClientReady — forward-compatible за discord.js v15).
  await bootAllCustomClients(client);

  // Native monetization: reconcile the FULL active entitlement list against the
  // backend. Discord never redelivers entitlement gateway events, so this sweep
  // is what catches grants/expiries missed while the bot was offline.
  const { runEntitlementReconcile } = await import("./utils/entitlementReconcile.js");
  await runEntitlementReconcile(client);

  // ...И ПЕРИОДИЧНО. Само при старт не е достатъчно: Discord не преизпраща
  // entitlement събития, а естественият край на абонамент идва като едно
  // ENTITLEMENT_UPDATE с минал ends_at. Изпуснем ли го (мрежов трепет, кратко
  // прекъсване на gateway-а без рестарт на процеса), сървърът остава платен
  // ЗАВИНАГИ — до следващия рестарт, който при стабилен контейнер може да е
  // след месеци. Дневната проверка затваря прозореца.
  // (Разбивача, 07.08.2026)
  const RECONCILE_INTERVAL_MS = Number(process.env.ENTITLEMENT_RECONCILE_MS || 6 * 60 * 60 * 1000);
  setInterval(() => {
    runEntitlementReconcile(client).catch((err) =>
      console.error(`[entitlements] периодичната реконсилиация се провали: ${err?.message}`),
    );
  }, RECONCILE_INTERVAL_MS).unref?.();
  console.log(`✅ Entitlement реконсилиация на всеки ${Math.round(RECONCILE_INTERVAL_MS / 3600000)}ч`);

  // White-label реконсилиация — същата доктрина за БРАНД БОТОВЕТЕ. `bootAll`
  // горе е само старт; tier може да падне по пътища, които не пипат токена
  // (agency seat detach, отмяна/refund на агенцията, дунинг, изтичане на grace).
  // Незабавното сваляне идва през WHITELABEL_UPDATE, но тази метла е застраховката
  // срещу пропуснато известие — привежда работещите клиенти към ефективния tier.
  const { reconcileCustomClients } = await import("./services/clientManager.js");
  const WL_RECONCILE_MS = Number(process.env.WHITELABEL_RECONCILE_MS || 6 * 60 * 60 * 1000);
  setInterval(() => {
    reconcileCustomClients(client).catch((err) =>
      console.error(`[ClientManager] периодичната white-label реконсилиация се провали: ${err?.message}`),
    );
  }, WL_RECONCILE_MS).unref?.();
  console.log(`✅ White-label реконсилиация на всеки ${Math.round(WL_RECONCILE_MS / 3600000)}ч`);
});

// Graceful shutdown — destroy white-label sessions and the main client so
// Discord doesn't keep zombie gateway sessions after a container stop.
async function shutdown(signal) {
  console.log(`Received ${signal} — shutting down...`);
  try {
    const { shutdownAllCustomClients } = await import("./services/clientManager.js");
    await shutdownAllCustomClients();
  } catch (err) {
    console.error("Error shutting down custom clients:", err.message);
  }
  client.destroy();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Process-level предпазна мрежа: неуловен rejection/exception в СПОДЕЛЕНИЯ бот
// не бива да сваля процеса за всички наематели тихо. Логваме (+ Sentry, ако е
// конфигуриран) и оставаме живи при unhandledRejection; при uncaughtException
// правим грациозен shutdown (състоянието е неизвестно — процес-мениджърът ще
// рестартира чисто).
process.on("unhandledRejection", (reason) => {
  console.error("[bot] Unhandled promise rejection:", reason);
  try { Sentry.captureException(reason); } catch { /* Sentry optional */ }
});
process.on("uncaughtException", (err) => {
  console.error("[bot] Uncaught exception:", err);
  try { Sentry.captureException(err); } catch { /* Sentry optional */ }
  shutdown("uncaughtException");
});

// Без .catch отказът на login (невалиден токен, DisallowedIntents, мрежа) се
// поглъщаше от unhandledRejection handler-а по-горе, който НАРОЧНО оставя
// процеса жив. Резултат: контейнерът стои `Up (unhealthy)` завинаги — Docker не
// рестартира по health, а само по изход на процеса. Ботът никога не влиза, а
// нищо не го поправя. (Наблюдателят, 07.08.2026)
client.login(process.env.BOT_TOKEN).catch((err) => {
  console.error(`[bot] LOGIN се провали: ${err?.code || ""} ${err?.message}`);
  try { Sentry.captureException(err); } catch { /* Sentry optional */ }
  // Излизаме с грешка, за да сработи restart политиката на Docker.
  process.exit(1);
});
