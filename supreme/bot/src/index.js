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
} from "discord.js";
import api, { logTicketMessage, getServer } from "./utils/api.js";
import { getTranslator, SUPPORTED_LANGUAGES } from "./i18n/index.js";
import { readdirSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import express from "express";
import { requireBotSecret } from "./middleware/secret.js";
import { handlePanelSpawn, handlePanelUpdate } from "./internal/panelHandler.js";
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
    // Привилегирован intent (1<<15): нужен за четене на съдържанието на съобщения
    // в тикет каналите (логване на тикет диалога + AI auto-reply). Без него
    // content/attachments идват празни. Изисква включване в Dev Portal; при 10000+
    // уникални потребители — Discord review.
    GatewayIntentBits.MessageContent,
    // Привилегирован intent (1<<1): нужен за разрешаване на ролите на члена при
    // authz проверки (supportRoleIds), verification (min account age / role assign)
    // и за GuildMember събития. Изисква включване в Dev Portal + review при 10000+.
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
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

// ─── Message Logging (for ticket transcripts) ────────────────────────────────
// Log messages in ticket channels to the DB transcript

// Cache of Discord channel IDs that are active tickets (expires after 10 min)
const ticketChannelCache = new Map(); // channelId → { ticketId, expiresAt }
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Sticky lookups are cached too — without this every guild message triggers a
// backend GET, which hammers the API rate limiter at scale.
const stickyCache = new Map(); // channelId → { sticky, expiresAt }
const STICKY_CACHE_TTL = 60 * 1000; // 1 minute — dashboard edits propagate quickly

// Periodic sweep so entries for channels that never get another message don't
// accumulate forever (slow memory leak on large bots).
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of ticketChannelCache) if (v.expiresAt <= now) ticketChannelCache.delete(k);
  for (const [k, v] of stickyCache) if (v.expiresAt <= now) stickyCache.delete(k);
}, CACHE_TTL).unref();

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guildId) return;

  // ═══ v1.8 Sticky Messages ═══
  // Check if this channel has a sticky message. If so, delete previous
  // sticky post and re-send at the bottom of the channel.
  try {
    let sticky;
    const cachedSticky = stickyCache.get(message.channelId);
    if (cachedSticky && cachedSticky.expiresAt > Date.now()) {
      sticky = cachedSticky.sticky; // null = confirmed no sticky for this channel
    } else {
      ({ data: sticky } = await api.get(`/bot/sticky/channel/${message.channelId}`).catch(() => ({ data: null })));
      stickyCache.set(message.channelId, { sticky: sticky || null, expiresAt: Date.now() + STICKY_CACHE_TTL });
    }
    if (sticky && sticky.enabled && sticky.content) {
      // Delete previous sticky post
      if (sticky.currentMessageId) {
        try {
          const old = await message.channel.messages.fetch(sticky.currentMessageId);
          await old.delete();
        } catch { /* already gone */ }
      }
      // Post fresh sticky
      const embed = {
        description: sticky.content,
        color: parseInt((sticky.embedColor || "#00e5ff").replace("#", ""), 16),
      };
      if (sticky.embedTitle) embed.title = sticky.embedTitle;
      embed.footer = { text: "📌 Sticky" };
      const msg = await message.channel.send({ embeds: [embed] }).catch(() => null);
      if (msg) {
        sticky.currentMessageId = msg.id; // keep the cached copy in sync
        await api.patch(`/bot/sticky/channel/${message.channelId}`, { currentMessageId: msg.id }).catch(() => {});
      }
    }
  } catch { /* non-fatal */ }

  try {
    const now = Date.now();
    let ticketId;  // undefined = not yet resolved; null = confirmed not a ticket

    const cached = ticketChannelCache.get(message.channelId);
    if (cached && cached.expiresAt > now) {
      ticketId = cached.ticketId; // hit: null = not a ticket, string = ticket ID
    } else {
      if (cached) ticketChannelCache.delete(message.channelId); // expired entry

      // Cache miss — query API
      let ticket = null;
      let apiError = null;
      try {
        const res = await api.get(`/bot/ticket/by-channel/${message.channelId}`);
        ticket = res.data;
      } catch (err) {
        apiError = err?.response?.status || err.message;
        // 404 = not a ticket channel, that's expected for non-ticket channels
        // 401/500/network = real problem, should log
        if (apiError !== 404) {
          console.error(`[msg-log] API error looking up channel ${message.channelId}:`, apiError, err?.response?.data);
        }
      }

      ticketId = ticket?.id ?? null;
      // Cache both hits AND misses to prevent repeat queries for non-ticket channels
      // Cache misses for shorter time if there was a non-404 error (retry sooner)
      const ttl = (apiError && apiError !== 404) ? 30 * 1000 : CACHE_TTL;
      ticketChannelCache.set(message.channelId, { ticketId, expiresAt: now + ttl });
    }

    if (!ticketId) return; // null = confirmed not a ticket

    const attachments = [...message.attachments.values()].map((a) => a.url);
    const authorTag = message.author.discriminator && message.author.discriminator !== "0"
      ? `${message.author.username}#${message.author.discriminator}`
      : message.author.username;

    try {
      await logTicketMessage(
        ticketId,
        message.author.id,
        authorTag,
        message.content || "[attachment only]",
        attachments
      );
      // Uncomment for debugging: console.log(`[msg-log] ✓ ticket=${ticketId} by=${authorTag}`);
    } catch (err) {
      console.error(`[msg-log] ❌ Failed to log message for ticket ${ticketId}:`, err?.response?.status, err?.response?.data || err.message);
    }
  } catch (err) {
    console.error(`[msg-log] ❌ Unexpected error:`, err.message);
    if (process.env.SENTRY_DSN) Sentry.captureException(err);
  }
});

// When a ticket channel is deleted from Discord, close the ticket in DB
// This handles the case where staff manually delete the channel instead of using /ticket close
client.on("channelDelete", async (channel) => {
  ticketChannelCache.delete(channel.id);
  stickyCache.delete(channel.id);

  // Always ask the API — the deleted channel may be a ticket we never cached
  try {
    await api.post(`/bot/ticket/by-channel/${channel.id}/close-if-open`, {
      reason: "Discord channel was deleted",
      closedById: null,
    });
  } catch {
    // Silently ignore — channel may not have been a ticket
  }
});

// ─── Internal HTTP Server (receives events from backend) ─────────────────────

const app = express();
app.use(express.json());

// Health check — no auth required (used by docker healthcheck)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use(requireBotSecret);

app.post("/internal/panel-spawn", async (req, res) => {
  try {
    const result = await handlePanelSpawn(client, req.body);
    res.json(result);
  } catch (err) {
    console.error("panel-spawn error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/internal/panel-update", async (req, res) => {
  try {
    await handlePanelUpdate(client, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Verification panel spawn / update (v1.7) ────────────────────────────────
app.post("/internal/verification-spawn", async (req, res) => {
  const { panelId, channelId } = req.body;
  if (!panelId || !channelId) return res.status(400).json({ error: "panelId and channelId required" });
  try {
    const { buildVerificationMessage } = await import("./utils/verificationEmbed.js");
    const { data: panel } = await api.get(`/verification/bot/${panelId}`);
    const channel = await client.channels.fetch(channelId);
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    const { embeds, components } = buildVerificationMessage(panel);
    const msg = await channel.send({ embeds, components });
    // Confirm spawn back to backend
    await api.patch(`/verification/bot/${panelId}/spawned`, { channelId, messageId: msg.id });
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

// v2.2 — Open a private discussion channel with applicant (pre-decision)
app.post("/internal/application-discuss", async (req, res) => {
  try {
    const {
      serverId, applicantId, applicantTag, reviewerId, reviewerTag,
      applicationId, formName, managerRoleIds = [], transcript,
    } = req.body;

    const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
    if (!guild) return res.status(404).json({ ok: false, error: "Guild not found" });

    // Look for an "applications" or "tickets" or "reviews" category
    const { ChannelType } = await import("discord.js");
    const category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory &&
        /applicat|review|ticket|staff/i.test(c.name)
    );

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
      reason: `Application discussion: ${formName} #${applicationId.slice(-8)}`,
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
        color: 0x00e5ff,
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
          color: 0x99aab5,
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
      approve: { title: "✅ Application Approved", color: 0x57f287 },
      deny:    { title: "❌ Application Denied",   color: 0xed4245 },
    };
    const cfg = statusConfig[action] || { title: "📋 Application Reviewed", color: 0x00e5ff };

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
          color: 0x5865f2,
          footer: { text: "You can claim or unclaim it with /ticket claim" },
        }],
      }).catch(() => {}); // User may have DMs disabled — not critical
    }

    // Also send a notification in the ticket channel
    if (channelId) {
      const channel = client.channels.cache.get(channelId);
      if (channel && assignee) {
        await channel.send({
          embeds: [{
            description: `🛡️ This ticket has been assigned to <@${assigneeId}> via round-robin.`,
            color: 0x5865f2,
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
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (channel) {
      await channel.send({
        embeds: [{
          title: "🔒 Ticket Auto-Closed",
          description: `This ticket has been automatically closed after **${hours}h** of inactivity.\n\nStaff can use the buttons above to reopen or delete.`,
          color: 0xef4444,
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {});
    }
    if (logChannelId) {
      const logCh = await client.channels.fetch(logChannelId).catch(() => null);
      if (logCh) {
        const pad = String(number ?? "").padStart(padding ?? 4, "0");
        await logCh.send({
          embeds: [{
            title: `🕛 Ticket Auto-Closed · #${pad}`,
            description: `**Channel**: <#${channelId}>\n**Reason**: ${hours}h inactivity`,
            color: 0xfbbf24,
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

  const result = { rolesAdded: [], rolesFailed: [], rolesRemoved: [], dmSent: false };

  try {
    const guild = await client.guilds.fetch(serverId).catch(() => null);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
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
          } catch { /* ignore silently — role may already be gone */ }
        }
      }
    }

    if (dmMessage) {
      try {
        const user = await client.users.fetch(userId);
        const color = action === "approve" ? 0x57f287 : action === "deny" ? 0xed4245 : 0x00e5ff;
        const title = action === "approve" ? "✅ Application Approved" : action === "deny" ? "❌ Application Denied" : "📋 Application Update";
        await user.send({
          embeds: [{
            title,
            description: dmMessage,
            color,
            footer: { text: guild?.name || "Application outcome" },
            timestamp: new Date().toISOString(),
          }],
        });
        result.dmSent = true;
      } catch { /* user has DMs disabled — not fatal */ }
    }

    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── v1.8 Giveaway ended by scheduler — update Discord message + announce winners
app.post("/internal/giveaway-ended", async (req, res) => {
  const { channelId, messageId, prize, winners, giveawayId } = req.body;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
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
  const { channelId, content, embedTitle, embedDescription, embedColor } = req.body;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return res.json({ ok: false });

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
    const channel = client.channels.cache.get(channelId);
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
    // Името на модела не се локализира (собствено име); по подразбиране Claude.
    const modelName = model || "Anthropic Claude";

    // EU AI Act Article 50 compliance — clear and prominent disclosure
    // that user is interacting with AI-generated content
    await channel.send({
      embeds: [{
        author: {
          name: tr("ai.disclosure.author"),
        },
        title: tr("ai.disclosure.title"),
        description: content,
        color: 0x5865f2,
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
  const { channelId, title, message, senderTag } = req.body;
  if (!channelId || !message) return res.status(400).json({ error: "channelId and message required" });

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return res.status(404).json({ error: "Channel not found or bot lacks access" });

    await channel.send({
      embeds: [{
        title: `📢 ${title || "Platform Notice"}`,
        description: message,
        color: 0x00e5ff,
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

const BOT_API_PORT = process.env.BOT_API_PORT || 3001;
app.listen(BOT_API_PORT, () => {
  console.log(`🤖 Bot internal API running on port ${BOT_API_PORT}`);
});

// ─── Login ────────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  // After main client is ready, boot white-label clients for Premium servers
  await bootAllCustomClients(client);
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

client.login(process.env.BOT_TOKEN);
