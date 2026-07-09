// bot/src/events/interactionCreate.js
import { MessageFlags, ActionRowBuilder, ButtonBuilder, ChannelType } from "discord.js";
import api, { isBlacklisted, getPanel, createTicket } from "../utils/api.js";
import { buildTicketOpenEmbed, buildStatusEmbed } from "../utils/embed.js";
import { runFormSession } from "../utils/formSession.js";

// ─── Blacklist TTL кеш ──────────────────────────────────────────────────────
// Всяка slash команда проверява blacklist статуса срещу backend-а. Синхронният
// hop яде от 3-секундния бюджет за отговор на interaction. Кешираме резултата за
// кратко (както ticketChannelCache в index.js) — при промяна в dashboard-а
// ефектът се вижда след TTL-а. Кешираме и hit, и miss.
const blacklistCache = new Map(); // userId → { blacklisted, expiresAt }
const BLACKLIST_CACHE_TTL = 60 * 1000; // 1 минута

async function isBlacklistedCached(userId) {
  const now = Date.now();
  const cached = blacklistCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.blacklisted;
  const blacklisted = await isBlacklisted(userId);
  blacklistCache.set(userId, { blacklisted, expiresAt: now + BLACKLIST_CACHE_TTL });
  return blacklisted;
}

// Периодично почистване, за да не расте Map-ът безкрайно.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of blacklistCache) if (v.expiresAt <= now) blacklistCache.delete(k);
}, BLACKLIST_CACHE_TTL).unref();

export default {
  name: "interactionCreate",
  once: false,
  async execute(interaction) {
    try {
      // ── Slash Commands ──────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;

        // Fail-open: a backend outage must not disable every command.
        let blacklisted = false;
        try {
          blacklisted = await isBlacklistedCached(interaction.user.id);
        } catch { /* backend unreachable — allow the command */ }
        if (blacklisted) {
          return interaction.reply({
            content: "❌ You have been blacklisted from using this bot.",
            flags: MessageFlags.Ephemeral,
          });
        }

        await command.execute(interaction);
        return;
      }

      // ── Autocomplete ────────────────────────────────────────────────────────
      if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (command?.autocomplete) await command.autocomplete(interaction);
        return;
      }

      // ── Panel Buttons ───────────────────────────────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("panel_button:")) {
        const [, panelId, buttonId] = interaction.customId.split(":");
        await handlePanelButtonClick(interaction, panelId, buttonId);
        return;
      }

      // ── Panel Dropdown (v1.6 — DROPDOWN-style panels) ───────────────────────
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("panel_select:")) {
        const panelId = interaction.customId.split(":")[1];
        const buttonId = interaction.values[0];
        await handlePanelButtonClick(interaction, panelId, buttonId);
        return;
      }

      // ── Form Direct Buttons (from /form spawn) ─────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("form_direct:")) {
        const formId = interaction.customId.replace("form_direct:", "");
        await handleFormDirectClick(interaction, formId);
        return;
      }

      // ── Application Review Buttons ──────────────────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("app_review:")) {
        const [, appId, action] = interaction.customId.split(":");
        await handleAppReview(interaction, appId, action);
        return;
      }

      // ── Ticket Action Buttons (Close/Claim/Transcript/Confirm/Cancel/Reopen/Delete)
      if (interaction.isButton() && interaction.customId.startsWith("ticket:")) {
        const [, action, ticketId] = interaction.customId.split(":");
        await handleTicketAction(interaction, action, ticketId);
        return;
      }

      // ── Verification button (v1.7) ─────────────────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("verify:")) {
        const panelId = interaction.customId.split(":")[1];
        await handleVerificationStart(interaction, panelId);
        return;
      }

      // ── Poll vote (v1.8) ───────────────────────────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("poll:")) {
        const [, pollId, optionIdx] = interaction.customId.split(":");
        await handlePollVote(interaction, pollId, Number(optionIdx));
        return;
      }

      // ── Giveaway enter (v1.8) ──────────────────────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("giveaway:enter:")) {
        const giveawayId = interaction.customId.split(":")[2];
        await handleGiveawayEnter(interaction, giveawayId);
        return;
      }

      // ── /help category dropdown ────────────────────────────────────────────
      if (interaction.isStringSelectMenu() && interaction.customId === "help:category") {
        const { COMMAND_CATALOG } = await import("../utils/commandsCatalog.js");
        const selected = interaction.values[0];
        const cat = COMMAND_CATALOG.find((c) => c.category === selected);
        if (!cat) {
          return interaction.reply({ content: "❌ Category not found.", flags: MessageFlags.Ephemeral });
        }
        const { default: helpCmd } = await import("../commands/help.js");
        // Re-render the same embed the /help command would produce for this category
        const embed = {
          title: `${cat.icon} ${cat.category}`,
          description: cat.description,
          color: 0x00e5ff,
          fields: [],
        };
        (cat.commands || []).forEach((cmd) => {
          const body = [
            `**Usage**: \`${cmd.signature}\``,
            cmd.description,
            cmd.permission ? `_Permission: ${cmd.permission}_` : null,
            cmd.dashboard ? `🖥️ **Dashboard**: ${cmd.dashboard}` : null,
          ].filter(Boolean).join("\n");
          embed.fields.push({ name: cmd.name, value: body.slice(0, 1024), inline: false });
        });
        (cat.dashboardOnly || []).forEach((item) => {
          embed.fields.push({
            name: `🖥️ ${item.feature} (dashboard)`,
            value: `${item.description}\n_${item.dashboard}_`.slice(0, 1024),
            inline: false,
          });
        });
        // Keep the original select menu so user can pick another category
        await interaction.update({ embeds: [embed], components: interaction.message.components });
        return;
      }

      // ── Verification math modal submit ─────────────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith("verify_math:")) {
        const [, panelId] = interaction.customId.split(":");
        await handleVerificationMathSubmit(interaction, panelId);
        return;
      }

      // ── Feedback rating buttons (post-close DM) ─────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("feedback:")) {
        const [, ticketId, rating] = interaction.customId.split(":");
        await handleFeedback(interaction, ticketId, Number(rating));
        return;
      }

      // ── Modal Submissions ───────────────────────────────────────────────────
      // Note: формите минават през DM collectors (runFormSession), не през modal,
      // затова тук няма "form_modal:" клон. Ако стигне непознат modal submit, го
      // потвърждаваме ephemeral, за да не вижда потребителят „This interaction failed".
      if (interaction.isModalSubmit()) {
        await interaction.reply({
          content: "❌ This form is no longer active. Please start over.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }

    } catch (err) {
      console.error("Interaction error:", err);
      if (process.env.SENTRY_DSN) {
        const Sentry = await import("@sentry/node");
        Sentry.captureException(err);
      }
      const errMsg = { content: "❌ An error occurred. Please try again.", flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errMsg).catch(() => {});
      } else {
        await interaction.reply(errMsg).catch(() => {});
      }
    }
  },
};

// ─── Panel Button Click ───────────────────────────────────────────────────────

async function handlePanelButtonClick(interaction, panelId, buttonId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let panel;
  try {
    panel = await getPanel(panelId);
  } catch (err) {
    return interaction.editReply("❌ Panel not found. Ask an admin to re-spawn it.");
  }

  const button = panel.buttons.find((b) => b.id === buttonId);
  if (!button) return interaction.editReply("❌ Button configuration not found.");

  if (button.formId && button.form) {
    await interaction.editReply("📬 Check your DMs to complete the form!");
    await runFormSession(interaction, button.form, panel);
  } else {
    await createTicketFromPanel(interaction, panel, null);
  }
}

// ─── Form Direct Button (spawned by /form spawn) ─────────────────────────────

async function handleFormDirectClick(interaction, formId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let serverData;
  try {
    const { data } = await api.get(`/bot/server/${interaction.guildId}`);
    serverData = data;
  } catch (err) {
    return interaction.editReply("❌ Could not load server configuration.");
  }

  const form = serverData?.forms?.find((f) => f.id === formId);
  if (!form) return interaction.editReply("❌ Form not found.");

  await interaction.editReply("📬 Check your DMs to start the form!");
  await runFormSession(interaction, form, { id: null, name: form.name, supportRoleIds: [], categoryId: null });
}

// ─── Create Ticket from Panel ─────────────────────────────────────────────────

async function createTicketFromPanel(interaction, panel, formAnswers) {
  const guild = interaction.guild;
  let channel;

  // ─── v1.7 Verification gate ───────────────────────────────────────────────
  // Check user has all required verification roles before doing anything else.
  const gate = checkVerificationGate(interaction, panel);
  if (!gate.allowed) {
    return interaction.editReply({ content: gate.message });
  }

  // ─── Per-user ticket limit check (server-level) ───────────────────────────
  // Backend enforces the final limit on createTicket call, but pre-check saves
  // a wasted channel creation if the user is clearly over.
  // (Real enforcement happens atomically in the API.)

  const channelNamePrefix   = (panel.channelNamePrefix || "ticket").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const padding             = panel.counterPadding ?? 4;

  // Helper — build final channel name using ticket number
  function buildChannelName(number) {
    const uname = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) || "user";
    const pad   = String(number ?? 0).padStart(padding, "0");
    return `${channelNamePrefix}-${pad}-${uname}`.slice(0, 100);
  }

  // Tickets are always created as proper channels (not threads).
  // If no category configured, create at guild root.
  const openCategory = panel.categoryOpenId || panel.categoryId || null;

  // Full channel mode with proper permission overwrites
  const permissionOverwrites = [
    { id: guild.id, deny: ["ViewChannel"] },
    { id: interaction.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"] },
    ...(panel.supportRoleIds || []).map((roleId) => ({
      id: roleId,
      allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages", "AttachFiles", "EmbedLinks"],
    })),
    // Observer roles — can see but not talk
    ...(panel.observerRoleIds || []).map((roleId) => ({
      id: roleId,
      allow: ["ViewChannel", "ReadMessageHistory"],
      deny: ["SendMessages"],
    })),
  ];

  try {
    channel = await guild.channels.create({
      name: buildChannelName(Date.now().toString().slice(-5)), // temp name, renamed below
      parent: openCategory,  // null = guild root if no category set
      permissionOverwrites,
    });
  } catch (err) {
    console.error("Failed to create ticket channel:", err.message);
    return interaction.editReply(
      `❌ Failed to create ticket channel: ${err.message}\n` +
      `Ensure the bot has **Manage Channels** permission` +
      (openCategory ? ` on the category <#${openCategory}>.` : ` in this server, or configure a category in the panel settings.`)
    );
  }

  // ─── Register ticket in DB (gets the atomic counter number) ─────────────────
  const ticketResult = await createTicket(
    guild.id,
    panel.id,
    interaction.user.id,
    channel.id,
    null
  );

  // Backend may refuse due to limits
  if (ticketResult?.code === "MAX_TICKETS_REACHED" || ticketResult?.code === "PANEL_LIMIT_REACHED") {
    await channel.delete().catch(() => {});
    await interaction.editReply(`⚠️ ${ticketResult.error}`);
    return;
  }

  const ticketNumber = ticketResult?.number;

  // Rename channel with proper number now that we have it from the API
  if (ticketNumber != null) {
    await channel.setName(buildChannelName(ticketNumber)).catch(() => {});
  }

  // ─── Build welcome embed with variables ─────────────────────────────────────
  const { interpolate, defaultWelcomeMessage } = await import("../utils/variables.js");
  const ctx = {
    user:   { id: interaction.user.id, username: interaction.user.username, tag: interaction.user.tag },
    ticket: { id: ticketResult?.id, channelId: channel.id, number: ticketNumber, padding, channelName: channel.name },
    server: { id: guild.id, name: guild.name },
    panel:  { name: panel.name },
    supportRoleIds: panel.supportRoleIds || [],
  };

  const welcomeContent = interpolate(panel.welcomeMessage || defaultWelcomeMessage(), ctx);
  const welcomeColor   = parseColor(panel.welcomeEmbedColor || "#00e5ff");

  // Staff mention above the embed (so they get notified)
  const staffMention = (panel.supportRoleIds || []).map((r) => `<@&${r}>`).join(" ");

  // Action buttons (Close, Claim, Transcript)
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketResult.id}`)
      .setLabel("Close")
      .setStyle(4) // Danger
      .setEmoji("🔒"),
    new ButtonBuilder()
      .setCustomId(`ticket:claim:${ticketResult.id}`)
      .setLabel("Claim")
      .setStyle(2) // Secondary
      .setEmoji("👋"),
    new ButtonBuilder()
      .setCustomId(`ticket:transcript:${ticketResult.id}`)
      .setLabel("Transcript")
      .setStyle(2)
      .setEmoji("📜"),
  );

  const welcomeMessage = await channel.send({
    content: staffMention || undefined,
    allowedMentions: { parse: ["roles"] },
    embeds: [{
      title: `Ticket #${String(ticketNumber ?? "").padStart(padding, "0")}`,
      description: welcomeContent,
      color: welcomeColor,
      footer: { text: `${panel.name} · Ticket ID: ${ticketResult.id.slice(0, 8)}` },
      timestamp: new Date().toISOString(),
    }],
    components: [actionRow],
  });

  // Pin the welcome message so it's always easy to find
  welcomeMessage.pin().catch(() => {});

  // ─── Form answers (if this panel button opened a form first) ───────────────
  if (formAnswers) {
    const transcript = Object.entries(formAnswers)
      .map(([question, answer]) => `**${question}**\n${answer}`)
      .join("\n\n");

    await channel.send({
      embeds: [{
        title: "📋 Form Submission",
        description: transcript.slice(0, 4096),
        color: welcomeColor,
      }],
    });
  }

  // ─── DM on open ────────────────────────────────────────────────────────────
  if (panel.dmOnOpen && panel.dmOnOpenMessage) {
    try {
      const dmContent = interpolate(panel.dmOnOpenMessage, ctx);
      await interaction.user.send({
        embeds: [{
          description: dmContent,
          color: welcomeColor,
          footer: { text: guild.name },
        }],
      });
    } catch { /* DMs disabled — not fatal */ }
  }

  // ─── Log to log channel ────────────────────────────────────────────────────
  if (panel.logChannelId) {
    await logTicketEvent(guild, panel.logChannelId, "OPEN", {
      ticketNumber, padding,
      channel, user: interaction.user, color: welcomeColor,
    }).catch(() => {});
  }

  await interaction.editReply(`✅ Your ticket has been created: ${channel}`);
}

function parseColor(hex) {
  if (!hex) return 0x00e5ff;
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return Number.isFinite(n) ? n : 0x00e5ff;
}

async function logTicketEvent(guild, logChannelId, eventType, data) {
  const logChannel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
  if (!logChannel) return;

  const { ticketNumber, padding = 4, channel, user, actor, reason, color, extra } = data;
  const ticketTag = `#${String(ticketNumber ?? "").padStart(padding, "0")}`;

  const icons = {
    OPEN:       "🎫",
    CLOSE:      "🔒",
    REOPEN:     "🔓",
    CLAIM:      "👋",
    UNCLAIM:    "✋",
    DELETE:     "🗑️",
    RENAME:     "✏️",
    TRANSCRIPT: "📜",
  };

  const lines = [
    channel ? `**Channel**: ${channel}` : null,
    user ? `**User**: <@${user.id}> (${user.username})` : null,
    actor && (!user || actor.id !== user.id) ? `**By**: <@${actor.id}>` : null,
    reason ? `**Reason**: ${reason}` : null,
    extra ? `**Info**: ${extra}` : null,
  ].filter(Boolean).join("\n");

  await logChannel.send({
    embeds: [{
      title: `${icons[eventType] || "ℹ️"} Ticket ${eventType} · ${ticketTag}`,
      description: lines,
      color: color ?? 0x00e5ff,
      timestamp: new Date().toISOString(),
    }],
  }).catch(() => {});
}

// Export so ticketHandler can use it too
export { logTicketEvent, parseColor };

// ─── Application Review Buttons ───────────────────────────────────────────────

async function handleAppReview(interaction, appId, action) {
  if (!interaction.member.permissions.has("ManageGuild")) {
    return interaction.reply({
      content: "❌ You need Manage Server permission to review applications.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await api.post(`/bot/application/${appId}/review`, {
      action,
      serverId: interaction.guildId,
      reviewerId: interaction.user.id,
      reviewerTag: interaction.user.username,
    });

    const actionLabels = {
      approve: "✅ Approved",
      deny: "❌ Denied",
    };

    // Disable all buttons on the review embed
    // Must use ButtonBuilder.from() — message components are read-only ButtonComponent, not ButtonBuilder
    const disabledRows = interaction.message.components.map((row) => {
      const newRow = new ActionRowBuilder();
      newRow.addComponents(
        row.components.map((btn) => ButtonBuilder.from(btn).setDisabled(true))
      );
      return newRow;
    });

    await interaction.message.edit({ components: disabledRows }).catch(() => {});
    await interaction.message.reply({
      embeds: [buildStatusEmbed(
        actionLabels[action] || action,
        `Application ${action}d by **${interaction.user.username}**`,
        action === "approve" ? 0x57f287 : action === "deny" ? 0xed4245 : 0x5865f2
      )],
    });

    await interaction.editReply("✅ Done!");
  } catch (err) {
    await interaction.editReply(`❌ Error: ${err?.response?.data?.error || err.message}`);
  }
}

// ─── Ticket Action Buttons ────────────────────────────────────────────────────
// Handles: close, claim, transcript, close-confirm, close-cancel, reopen, delete

// Дали извикалият е член на support екипа (роля от supportRoleIds или ManageGuild).
function isTicketStaff(interaction, panel) {
  const hasSupportRole = (panel?.supportRoleIds || []).some((r) =>
    interaction.member?.roles?.cache?.has(r)
  );
  return hasSupportRole || interaction.member?.permissions?.has("ManageGuild");
}

// Единен ephemeral отказ за тикет действия без права.
function denyTicketAction(interaction) {
  return interaction.reply({
    content: "❌ Only support team members can perform this action.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTicketAction(interaction, action, ticketId) {
  try {
    // Look up the ticket + its panel (for config)
    const { data: ticket } = await api.get(`/bot/ticket/${ticketId}`).catch(() => ({ data: null }));
    if (!ticket) {
      return interaction.reply({ content: "❌ This ticket no longer exists.", flags: MessageFlags.Ephemeral });
    }
    const panel = ticket.panel || (ticket.panelId ? await api.get(`/bot/panel/${ticket.panelId}`).then(r => r.data).catch(() => null) : null);

    // ── Authz (OWASP A01) ────────────────────────────────────────────────
    // Всяко действие, което променя/чете тикета, изисква права на support
    // екипа. Изключение: създателят на тикета може да затвори СОБСТВЕНИЯ си
    // тикет, но не чужди (reopen/transcript/delete остават само за екипа).
    const isStaff = isTicketStaff(interaction, panel);
    const isCreator = ticket.creatorId && interaction.user.id === ticket.creatorId;

    switch (action) {
      case "close":
        if (!isStaff && !isCreator) return denyTicketAction(interaction);
        return handleTicketClosePrompt(interaction, ticket, panel);
      case "close-confirm":
        if (!isStaff && !isCreator) return denyTicketAction(interaction);
        return handleTicketCloseFinalize(interaction, ticket, panel);
      case "close-cancel":  return interaction.update({ components: [] }).catch(() => {});
      case "claim":         return handleTicketClaim(interaction, ticket, panel);
      case "transcript":
        if (!isStaff) return denyTicketAction(interaction);
        return handleTicketTranscript(interaction, ticket, panel);
      case "reopen":
        if (!isStaff) return denyTicketAction(interaction);
        return handleTicketReopen(interaction, ticket, panel);
      case "delete":        return handleTicketDelete(interaction, ticket, panel);
      default:
        return interaction.reply({ content: "❌ Unknown ticket action.", flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error("[ticket-action]", action, err?.response?.data || err?.message);
    return interaction.reply({
      content: `❌ Error: ${err?.response?.data?.error || err.message}`,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

async function handleTicketClosePrompt(interaction, ticket, panel) {
  // If two-step close disabled → go straight to finalize
  if (panel && panel.closeAskEnabled === false) {
    return handleTicketCloseFinalize(interaction, ticket, panel);
  }

  const { interpolate, defaultCloseAskMessage } = await import("../utils/variables.js");
  const ctx = {
    user:   { id: interaction.user.id, username: interaction.user.username },
    ticket: { id: ticket.id, channelId: ticket.channelId, number: ticket.number, padding: panel?.counterPadding ?? 4, channelName: interaction.channel?.name },
    server: { id: interaction.guildId, name: interaction.guild?.name },
    panel:  { name: panel?.name },
  };
  const askMsg = interpolate(panel?.closeAskMessage || defaultCloseAskMessage(), ctx);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:close-confirm:${ticket.id}`).setLabel("Yes, close").setStyle(4).setEmoji("🔒"),
    new ButtonBuilder().setCustomId(`ticket:close-cancel:${ticket.id}`).setLabel("Cancel").setStyle(2)
  );

  return interaction.reply({
    embeds: [{ description: askMsg, color: 0xfbbf24 }],
    components: [row],
    ephemeral: false,
  });
}

async function handleTicketCloseFinalize(interaction, ticket, panel) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  console.log(`[ticket:close] 🔵 START — ticketId=${ticket.id}`);

  // Call backend to close (sets status=CLOSED, closedAt, closeReason, generates transcript)
  let closeResult;
  try {
    const { data } = await api.post(`/bot/ticket/${ticket.id}/close`, {
      closedById: interaction.user.id,
      reason: null,
    });
    closeResult = data;
    console.log(`[ticket:close] ✅ Backend OK — archiveUrl=${data?.archiveUrl}, fullArchiveUrl=${data?.fullArchiveUrl}, transcriptChannelId=${data?.transcriptChannelId}`);
  } catch (err) {
    console.error(`[ticket:close] ❌ Backend FAILED:`, err?.response?.data || err.message);
    return interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
  }

  const channel = interaction.channel;
  const guild = interaction.guild;

  // Move to closed category (if configured)
  if (panel?.categoryClosedId && channel?.parent?.id !== panel.categoryClosedId) {
    await channel.setParent(panel.categoryClosedId, { lockPermissions: false }).catch(() => {});
  }

  // Revoke send permissions for the ticket creator (so they can't spam after close)
  if (ticket.creatorId && channel?.permissionOverwrites) {
    await channel.permissionOverwrites.edit(ticket.creatorId, {
      SendMessages: false,
    }).catch(() => {});
  }

  // ─── Auto-post transcript link to transcriptChannelId ──────────────────────
  const transcriptChannelId = panel?.transcriptChannelId || closeResult?.transcriptChannelId;
  let transcriptUrl = closeResult?.fullArchiveUrl;

  // Ensure transcriptUrl is absolute — Discord embed URL field requires http(s)://
  if (transcriptUrl && !transcriptUrl.startsWith("http")) {
    console.warn(`[ticket:close] ⚠️ transcriptUrl is relative (${transcriptUrl}) — Discord will reject embed URL. Skipping embed URL field.`);
    transcriptUrl = null;
  }

  console.log(`[ticket:close] Transcript post — channelId=${transcriptChannelId}, url=${transcriptUrl}`);

  if (transcriptChannelId && transcriptUrl) {
    try {
      const transcriptChannel = await guild.channels.fetch(transcriptChannelId).catch((e) => {
        console.error(`[ticket:close] ❌ Cannot fetch transcript channel ${transcriptChannelId}:`, e.message);
        return null;
      });
      if (!transcriptChannel) {
        console.warn(`[ticket:close] ⚠️ Transcript channel ${transcriptChannelId} not found in guild ${guild.id}`);
      } else if (!transcriptChannel.isTextBased?.()) {
        console.warn(`[ticket:close] ⚠️ Channel ${transcriptChannelId} is not text-based (type=${transcriptChannel.type})`);
      } else {
        // Verify bot has SendMessages permission
        const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
        const perms = me ? transcriptChannel.permissionsFor(me) : null;
        if (perms && !perms.has("SendMessages")) {
          console.error(`[ticket:close] ❌ Bot missing SendMessages permission in transcript channel ${transcriptChannelId}`);
        } else {
          const creatorMention = ticket.creatorId ? `<@${ticket.creatorId}>` : "unknown";
          const ticketLabel = ticket.number != null
            ? `#${String(ticket.number).padStart(panel?.counterPadding ?? 4, "0")}`
            : ticket.id.slice(-8);

          const sent = await transcriptChannel.send({
            embeds: [{
              title: `📜 Ticket Transcript — ${ticketLabel}`,
              description:
                `**Channel:** ${channel.name}\n` +
                `**Creator:** ${creatorMention}\n` +
                `**Closed by:** <@${interaction.user.id}>\n` +
                `**Panel:** ${panel?.name || "Unknown"}`,
              color: 0x00e5ff,
              url: transcriptUrl,
              timestamp: new Date().toISOString(),
              footer: { text: `Ticket ID: ${ticket.id}` },
            }],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setStyle(5) // LINK
                .setLabel("📜 View Transcript")
                .setURL(transcriptUrl)
            )],
          });
          console.log(`[ticket:close] ✅ Transcript embed posted — messageId=${sent.id}`);
        }
      }
    } catch (err) {
      console.error(`[ticket:close] ❌ Failed to post transcript:`, err.message, err.code);
    }
  } else {
    console.log(`[ticket:close] ℹ️ No transcript post — channelId=${transcriptChannelId ? "set" : "missing"}, url=${transcriptUrl ? "set" : "missing"}`);
  }

  // Post "moderator message" with Reopen / Delete / Transcript buttons
  const modRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:reopen:${ticket.id}`).setLabel("Reopen").setStyle(3).setEmoji("🔓"),
    new ButtonBuilder().setCustomId(`ticket:delete:${ticket.id}`).setLabel("Delete").setStyle(4).setEmoji("🗑️"),
    new ButtonBuilder().setCustomId(`ticket:transcript:${ticket.id}`).setLabel("View Transcript").setStyle(2).setEmoji("📜"),
  );
  const closeEmbedDesc = transcriptUrl
    ? `Closed by <@${interaction.user.id}>.\n\n[📜 View Full Transcript](${transcriptUrl})\n\nModerators: use the buttons below.`
    : `Closed by <@${interaction.user.id}>.\n\nModerators: use the buttons below.`;

  await channel.send({
    embeds: [{
      title: "🔒 Ticket Closed",
      description: closeEmbedDesc,
      color: 0xef4444,
      timestamp: new Date().toISOString(),
    }],
    components: [modRow],
  }).catch((e) => console.error(`[ticket:close] ❌ Failed to post close message in channel:`, e.message));

  // DM the creator
  if (panel?.dmOnClose && panel?.dmOnCloseMessage) {
    try {
      const creator = await interaction.client.users.fetch(ticket.creatorId).catch(() => null);
      if (creator) {
        const { interpolate } = await import("../utils/variables.js");
        const ctx = {
          user:   { id: ticket.creatorId },
          ticket: { id: ticket.id, number: ticket.number, padding: panel?.counterPadding ?? 4 },
          server: { id: interaction.guildId, name: guild?.name },
          panel:  { name: panel?.name },
        };
        await creator.send({
          embeds: [{
            description: interpolate(panel.dmOnCloseMessage, ctx),
            color: 0x00e5ff,
            footer: { text: guild?.name },
          }],
        });
      }
    } catch { /* DMs disabled */ }
  }

  // Feedback prompt (if enabled)
  if (panel?.feedbackEnabled && ticket.creatorId) {
    try {
      const creator = await interaction.client.users.fetch(ticket.creatorId).catch(() => null);
      if (creator) {
        const row = new ActionRowBuilder().addComponents(
          [1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
            .setCustomId(`feedback:${ticket.id}:${n}`)
            .setLabel(`${n} ${"⭐".repeat(n)}`)
            .setStyle(2))
        );
        await creator.send({
          embeds: [{
            title: "How was your support experience?",
            description: `Please rate the service you received in ticket **#${String(ticket.number ?? "").padStart(panel?.counterPadding ?? 4, "0")}**.`,
            color: 0x00e5ff,
            footer: { text: guild?.name },
          }],
          components: [row],
        });
      }
    } catch { /* DMs disabled */ }
  }

  // Log event
  if (panel?.logChannelId) {
    await logTicketEvent?.(guild, panel.logChannelId, "CLOSE", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel, user: { id: ticket.creatorId, username: "user" }, actor: interaction.user,
      color: 0xef4444,
    }).catch(() => {});
  }

  await interaction.editReply("✅ Ticket closed.");
}

async function handleTicketClaim(interaction, ticket, panel) {
  // Проверката за права остава ПРЕДИ defer (ephemeral отказ).
  if (!isTicketStaff(interaction, panel)) {
    return interaction.reply({ content: "❌ Only support team members can claim tickets.", flags: MessageFlags.Ephemeral });
  }

  // Defer преди backend заявката — claim обявата е публична, затова defer публичен.
  await interaction.deferReply().catch(() => {});

  try {
    await api.post(`/bot/ticket/${ticket.id}/claim`, { userId: interaction.user.id });
  } catch (err) {
    return interaction.editReply({ content: `❌ ${err?.response?.data?.error || err.message}` });
  }

  await interaction.editReply({
    embeds: [{
      description: `👋 Ticket claimed by <@${interaction.user.id}>`,
      color: 0x00e5ff,
    }],
  });

  if (panel?.logChannelId) {
    const { logTicketEvent } = await import("./interactionCreate.js").catch(() => ({}));
    await logTicketEvent?.(interaction.guild, panel.logChannelId, "CLAIM", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel: interaction.channel, actor: interaction.user, color: 0x00e5ff,
    }).catch(() => {});
  }
}

async function handleTicketTranscript(interaction, ticket, panel) {
  await interaction.deferReply({ ephemeral: false });
  try {
    const res = await api.post(`/bot/ticket/${ticket.id}/transcript`, {});
    if (res.data?.url) {
      await interaction.editReply(`📜 Transcript: ${res.data.url}`);
    } else {
      await interaction.editReply("📜 Transcript saved to archive channel.");
    }
  } catch (err) {
    await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
  }
}

async function handleTicketReopen(interaction, ticket, panel) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    await api.post(`/bot/ticket/${ticket.id}/reopen`, { reopenerId: interaction.user.id });
  } catch (err) {
    return interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
  }

  const channel = interaction.channel;

  // Move back to open category
  const openCategory = panel?.categoryOpenId || panel?.categoryId;
  if (openCategory && channel?.parent?.id !== openCategory) {
    await channel.setParent(openCategory, { lockPermissions: false }).catch(() => {});
  }

  // Restore creator's SendMessages
  if (ticket.creatorId && channel?.permissionOverwrites) {
    await channel.permissionOverwrites.edit(ticket.creatorId, {
      SendMessages: true,
    }).catch(() => {});
  }

  await channel.send({
    embeds: [{
      title: "🔓 Ticket Reopened",
      description: `Reopened by <@${interaction.user.id}>.`,
      color: 0x4ade80,
      timestamp: new Date().toISOString(),
    }],
  });

  if (panel?.logChannelId) {
    const { logTicketEvent } = await import("./interactionCreate.js").catch(() => ({}));
    await logTicketEvent?.(interaction.guild, panel.logChannelId, "REOPEN", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel, actor: interaction.user, color: 0x4ade80,
    }).catch(() => {});
  }

  await interaction.editReply("✅ Ticket reopened.");
}

async function handleTicketDelete(interaction, ticket, panel) {
  // Only staff can delete
  if (!isTicketStaff(interaction, panel)) {
    return interaction.reply({ content: "❌ Only support team members can delete tickets.", flags: MessageFlags.Ephemeral });
  }

  await interaction.reply({
    embeds: [{ description: "🗑️ This channel will be deleted in 5 seconds.", color: 0xef4444 }],
  });

  // Generate transcript before delete (fire-and-forget)
  api.post(`/bot/ticket/${ticket.id}/transcript`, {}).catch(() => {});

  // Backend hard-delete + event logging
  try {
    await api.post(`/bot/ticket/${ticket.id}/delete`, { deleterId: interaction.user.id });
  } catch { /* ignore — delete channel anyway */ }

  setTimeout(async () => {
    await interaction.channel.delete("Ticket deleted by staff").catch(() => {});
  }, 5000);

  if (panel?.logChannelId) {
    const { logTicketEvent } = await import("./interactionCreate.js").catch(() => ({}));
    await logTicketEvent?.(interaction.guild, panel.logChannelId, "DELETE", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel: interaction.channel, actor: interaction.user, color: 0xef4444,
    }).catch(() => {});
  }
}

// ─── Feedback rating (post-close DM) ──────────────────────────────────────────
async function handleFeedback(interaction, ticketId, rating) {
  if (rating < 1 || rating > 5) return;
  // deferUpdate ack-ва компонента веднага (type 6, без "loading" визуализация),
  // за да не изтече 3-секундният бюджет преди backend заявката. После editReply
  // редактира съобщението с бутоните.
  await interaction.deferUpdate().catch(() => {});
  try {
    await api.post(`/bot/ticket/${ticketId}/feedback`, {
      rating,
      userId: interaction.user.id,
    });
    await interaction.editReply({
      embeds: [{
        description: `Thanks for your feedback! You rated **${rating} / 5** ${"⭐".repeat(rating)}`,
        color: 0x4ade80,
      }],
      components: [],
    });
  } catch (err) {
    await interaction.followUp({ content: `❌ ${err?.response?.data?.error || err.message}`, flags: MessageFlags.Ephemeral });
  }
}

// ─── Verification handlers (v1.7) ─────────────────────────────────────────────

// Pending math challenges, kept server-side so the expected answer never
// leaves the bot (a customId is visible to the user's client).
const pendingMathChallenges = new Map(); // `${userId}:${panelId}` → { answer, expiresAt }
const MATH_CHALLENGE_TTL = 5 * 60 * 1000;

async function handleVerificationStart(interaction, panelId) {
  let panel;
  try {
    const { data } = await api.get(`/verification/bot/${panelId}`);
    panel = data;
  } catch {
    return interaction.reply({ content: "❌ Verification panel not found.", flags: MessageFlags.Ephemeral });
  }

  // Anti-bot: minimum account age
  if (panel.minAccountAgeDays) {
    const accountAge = Date.now() - interaction.user.createdTimestamp;
    const requiredMs = panel.minAccountAgeDays * 24 * 60 * 60 * 1000;
    if (accountAge < requiredMs) {
      return interaction.reply({
        content: `❌ Your account must be at least **${panel.minAccountAgeDays} days old** to verify here.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  if (panel.type === "BUTTON") {
    // Instant success — apply role + DM
    await completeVerification(interaction, panel, true, null);
    return;
  }

  if (panel.type === "MATH") {
    // Show modal with math question
    const { generateMathChallenge } = await import("../utils/verificationEmbed.js");
    const { question, answer } = generateMathChallenge(panel.mathDifficulty);
    for (const [key, val] of pendingMathChallenges) {
      if (val.expiresAt <= Date.now()) pendingMathChallenges.delete(key);
    }
    pendingMathChallenges.set(`${interaction.user.id}:${panel.id}`, {
      answer: String(answer),
      expiresAt: Date.now() + MATH_CHALLENGE_TTL,
    });
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder: Row } = await import("discord.js");
    const modal = new ModalBuilder()
      .setCustomId(`verify_math:${panel.id}`)
      .setTitle("Verification Challenge");
    const input = new TextInputBuilder()
      .setCustomId("answer")
      .setLabel(`What is ${question}?`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);
    modal.addComponents(new Row().addComponents(input));
    await interaction.showModal(modal);
    return;
  }

  if (panel.type === "REACTION") {
    // Already verified by reaction elsewhere — this path is unusual
    await completeVerification(interaction, panel, true, null);
    return;
  }
}

async function handleVerificationMathSubmit(interaction, panelId) {
  const challengeKey = `${interaction.user.id}:${panelId}`;
  const challenge = pendingMathChallenges.get(challengeKey);
  pendingMathChallenges.delete(challengeKey);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    return interaction.reply({
      content: "⏰ Verification challenge expired. Please click Verify again.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const userAnswer = interaction.fields.getTextInputValue("answer").trim();
  const correct = userAnswer === challenge.answer;

  let panel;
  try {
    const { data } = await api.get(`/verification/bot/${panelId}`);
    panel = data;
  } catch {
    return interaction.reply({ content: "❌ Verification panel not found.", flags: MessageFlags.Ephemeral });
  }

  await completeVerification(interaction, panel, correct, userAnswer);
}

async function completeVerification(interaction, panel, success, answer) {
  // Defer преди backend заявката + прилагането на ролите (може да отнеме >3s).
  // Извиква се от бутон (BUTTON/REACTION) и от modal submit (MATH) — и двата
  // очакват отговор до 3s, затова ack-ваме ephemeral веднага, после editReply.
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  // Log attempt to backend + fetch role instructions
  let result;
  try {
    const { data } = await api.post(`/verification/bot/${panel.id}/attempt`, {
      userId: interaction.user.id,
      success,
      answer,
    });
    result = data;
  } catch (err) {
    if (err?.response?.status === 429) {
      return interaction.editReply({ content: `❌ ${err.response.data.error}` });
    }
    return interaction.editReply({ content: `❌ ${err?.message || "Error"}` });
  }

  if (!success) {
    return interaction.editReply({
      content: result.failureMessage || "❌ Incorrect answer. Please try again.",
    });
  }

  // Success — apply roles
  const member = interaction.member;
  const added = [];
  const failed = [];
  for (const roleId of (result.grantRoleIds || [])) {
    try {
      await member.roles.add(roleId, "Verified via Supreme Bot");
      added.push(roleId);
    } catch (err) {
      failed.push({ roleId, reason: err.message });
    }
  }
  for (const roleId of (result.removeRoleIds || [])) {
    await member.roles.remove(roleId, "Verified via Supreme Bot").catch(() => {});
  }

  const successMsg = result.successMessage
    || `✅ You're verified, <@${interaction.user.id}>!${added.length ? ` Roles granted: ${added.length}` : ""}`;

  await interaction.editReply({ content: successMsg });

  // DM
  if (result.dmSuccess) {
    try {
      await interaction.user.send({
        embeds: [{
          title: "✅ Verification Successful",
          description: result.dmSuccess,
          color: 0x4ade80,
          footer: { text: interaction.guild?.name || "" },
        }],
      });
    } catch { /* DMs disabled */ }
  }

  // Log channel
  if (result.logChannelId) {
    try {
      const logCh = await interaction.guild.channels.fetch(result.logChannelId).catch(() => null);
      if (logCh) {
        await logCh.send({
          embeds: [{
            title: "✅ User Verified",
            description: `<@${interaction.user.id}> (${interaction.user.tag}) passed verification on panel **${panel.name}**.`,
            color: 0x4ade80,
            footer: failed.length ? { text: `⚠️ ${failed.length} role(s) failed to apply — check hierarchy` } : undefined,
            timestamp: new Date().toISOString(),
          }],
        });
      }
    } catch {}
  }
}

// ─── Panel handler: verification gate (v1.7) ─────────────────────────────────
// Called from createTicketFromPanel — checks user has required verification roles.
// Exported so createTicketFromPanel can call it before attempting channel creation.
export function checkVerificationGate(interaction, panel) {
  const required = panel.requireVerifiedRoleIds || [];
  if (!required.length) return { allowed: true };

  const member = interaction.member;
  const missing = required.filter((r) => !member.roles.cache.has(r));
  if (missing.length === 0) return { allowed: true };

  return {
    allowed: false,
    missing,
    message: panel.verificationDeniedMessage
      || `❌ You need to verify first before opening a ticket. Please visit the verification channel and complete the challenge.`,
  };
}

// ─── Internal: VERIFICATION_SPAWN / VERIFICATION_UPDATE handlers ─────────────
// (exposed via bot/src/index.js express endpoints)

// ─── Poll + Giveaway handlers (v1.8) ─────────────────────────────────────────

async function handlePollVote(interaction, pollId, optionIdx) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const { data } = await api.post(`/bot/poll/${pollId}/vote`, {
      userId: interaction.user.id,
      option: optionIdx,
    });

    // Refresh the poll message with new counts
    const { data: poll } = await api.get(`/bot/poll/${pollId}`);
    const { buildPollMessage } = await import("../commands/poll.js");
    const { embeds, components } = buildPollMessage(poll, data.counts);
    await interaction.message.edit({ embeds, components }).catch(() => {});

    await interaction.editReply(`✅ Vote ${data.toggled === "on" ? "recorded" : "removed"}.`);
  } catch (err) {
    await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
  }
}

async function handleGiveawayEnter(interaction, giveawayId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const { data } = await api.post(`/bot/giveaway/${giveawayId}/enter`, {
      userId: interaction.user.id,
    });

    // Check required roles AFTER entry — simpler than pre-check; backend allows entry
    // then bot verifies here and removes if missing roles
    if (data.entered && data.requiredRoleIds?.length > 0) {
      const missing = data.requiredRoleIds.filter((r) => !interaction.member.roles.cache.has(r));
      if (missing.length > 0) {
        // Remove the entry and tell the user
        await api.post(`/bot/giveaway/${giveawayId}/enter`, { userId: interaction.user.id }).catch(() => {});
        return interaction.editReply(`❌ You need these roles to enter: ${missing.map((r) => `<@&${r}>`).join(", ")}`);
      }
    }

    // Refresh the giveaway message
    const { data: g } = await api.get(`/bot/giveaway/${giveawayId}`);
    const { buildGiveawayMessage } = await import("../commands/giveaway.js");
    const { embeds, components } = buildGiveawayMessage(g, g.entryCount);
    await interaction.message.edit({ embeds, components }).catch(() => {});

    await interaction.editReply(data.entered ? "🎉 You're entered! Good luck!" : "You left the giveaway.");
  } catch (err) {
    await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
  }
}
