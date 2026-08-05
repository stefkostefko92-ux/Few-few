// bot/src/events/interactionCreate.js
import {
  MessageFlags, ActionRowBuilder, ButtonBuilder, ChannelType, ThreadAutoArchiveDuration,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} from "discord.js";
import api, { isBlacklisted, getPanel, createTicket, getTags, useTag } from "../utils/api.js";
import { buildTicketOpenEmbed, buildStatusEmbed } from "../utils/embed.js";
import { runFormSession, submitFormAnswers, validateAnswerAgainstRegex } from "../utils/formSession.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND, SUCCESS, DANGER, WARNING, INFO } from "../utils/colors.js";
import { startSetupWizard, handleSetupComponent } from "../commands/setup.js";
import { isStaffMember } from "../utils/staffCheck.js";

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
      // ── Slash Commands + Context Menus (Message/User) ──────────────────────
      // v2.9: context menu commands share the exact same command.execute(interaction)
      // contract as slash commands (data + execute in commands/*.js), so the
      // existing loader (ready.js) needs no change — only the routing here does.
      if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
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

      // ── Setup wizard (v1.9) ────────────────────────────────────────────────
      if (interaction.isButton() && interaction.customId === "setup:start") {
        await startSetupWizard(interaction);
        return;
      }
      if (
        interaction.customId?.startsWith("setup:wizard:") &&
        (interaction.isButton() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu())
      ) {
        await handleSetupComponent(interaction);
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
          color: BRAND,
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

      // ── Form modal submit (v2.9 — ≤5 text questions, DM-closed users) ──────
      if (interaction.isModalSubmit() && interaction.customId.startsWith("form_modal:")) {
        await handleFormModalSubmit(interaction);
        return;
      }

      // ── "Reply with tag" context menu — tag pick (v2.9) ─────────────────────
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("tag_reply_select:")) {
        await handleTagReplySelect(interaction);
        return;
      }

      // ── Ticket context menus — panel pick when a server has >1 panel (v2.9) ─
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ctxticket_panel:")) {
        await handleCtxTicketPanelSelect(interaction);
        return;
      }

      // ── Feedback rating buttons (post-close DM) ─────────────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("feedback:")) {
        const [, ticketId, rating] = interaction.customId.split(":");
        await handleFeedback(interaction, ticketId, Number(rating));
        return;
      }

      // ── Modal Submissions ───────────────────────────────────────────────────
      // Note: обичайните форми минават през DM collectors (runFormSession);
      // "form_modal:" (по-горе) е единственото изключение. Ако стигне непознат
      // modal submit, го потвърждаваме ephemeral, за да не вижда потребителят
      // „This interaction failed".
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
      const errMsg = { ...friendlyError(err, interaction, "An error occurred. Please try again."), flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errMsg).catch(() => {});
      } else {
        await interaction.reply(errMsg).catch(() => {});
      }
    }
  },
};

// ─── Panel Button Click ───────────────────────────────────────────────────────

// v2.9: a modal (ModalBuilder.showModal) MUST be the FIRST response to an
// interaction — it can't follow a deferReply. So the panel/form lookup now
// happens BEFORE any ack, and only the non-modal paths defer afterwards.
// This trims part of the 3s budget for the network round-trip, same tradeoff
// every "decide-then-respond" flow in this file already accepts (e.g. the
// verification gate check before createTicketFromPanel's own defer upstream).
async function handlePanelButtonClick(interaction, panelId, buttonId) {
  let panel;
  try {
    panel = await getPanel(panelId);
  } catch (err) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    // 404 → the panel really is gone; anything else (timeout/5xx) is a
    // backend hiccup, not a missing panel — don't tell the user to re-spawn it.
    const notFound = err?.response?.status === 404;
    return interaction.editReply(
      friendlyError(err, interaction, notFound ? "Panel not found. Ask an admin to re-spawn it." : undefined)
    );
  }

  const button = panel.buttons.find((b) => b.id === buttonId);
  if (!button) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return interaction.editReply("❌ Button configuration not found.");
  }

  if (button.formId && button.form) {
    if (isModalEligibleForm(button.form)) {
      await interaction.showModal(buildFormModal(button.form, panelId, buttonId));
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply("📬 Check your DMs to complete the form!");
    await runFormSession(interaction, button.form, panel);
  } else {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await createTicketFromPanel(interaction, panel, null);
  }
}

// ─── Modal forms (v2.9) — ≤5 text-type questions, no DM required ─────────────
// Discord-closed users (DMs disabled) previously couldn't open a ticket that
// required a form. Any longer form, or one using SELECT/MULTI_SELECT, keeps
// using the DM session above (modals don't support select menus).
const MODAL_TEXT_TYPES = new Set(["SHORT_TEXT", "PARAGRAPH", "NUMBER"]);
const MODAL_MAX_QUESTIONS = 5;

function isModalEligibleForm(form) {
  const questions = form?.questions || [];
  if (!questions.length || questions.length > MODAL_MAX_QUESTIONS) return false;
  return questions.every((q) => MODAL_TEXT_TYPES.has(q.type || "SHORT_TEXT"));
}

function buildFormModal(form, panelId, buttonId) {
  // customId ≤100 chars: "form_modal:" (11) + 3 cuids (~25 each) + separators
  // comfortably fits (~90).
  const modal = new ModalBuilder()
    .setCustomId(`form_modal:${panelId}:${buttonId}:${form.id}`)
    .setTitle((form.name || "Form").slice(0, 45));

  const questions = [...form.questions].sort((a, b) => a.order - b.order).slice(0, MODAL_MAX_QUESTIONS);
  for (const q of questions) {
    const isParagraph = q.type === "PARAGRAPH";
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel((q.label || "Answer").slice(0, 45))
      .setStyle(isParagraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(!!q.required)
      .setMaxLength(Math.min(q.maxLength || (isParagraph ? 1500 : 400), 4000));
    if (q.minLength) input.setMinLength(Math.min(q.minLength, 4000));
    if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

async function handleFormModalSubmit(interaction) {
  const [, panelId, buttonId, formId] = interaction.customId.split(":");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let panel;
  try {
    panel = await getPanel(panelId);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction, "Panel not found. Ask an admin to re-spawn it."));
  }

  const button = panel.buttons.find((b) => b.id === buttonId);
  const form = button?.form;
  if (!form || form.id !== formId) {
    return interaction.editReply("❌ This form is no longer available. Please try again.");
  }

  const questions = [...form.questions].sort((a, b) => a.order - b.order).slice(0, MODAL_MAX_QUESTIONS);
  const answers = {};
  const invalid = [];
  for (const q of questions) {
    try {
      answers[q.id] = interaction.fields.getTextInputValue(q.id);
    } catch { /* field wasn't rendered (shouldn't happen — same list built the modal) */ }
    // Същата guarded валидация като DM пътя (ReDoS-защитена) — modal-ът не
    // бива тихо да заобикаля validationRegex на формата.
    if (q.validationRegex && !validateAnswerAgainstRegex(q, answers[q.id] || "").ok) {
      invalid.push(q.label);
    }
  }
  if (invalid.length) {
    return interaction.editReply(
      `❌ Some answers don't match the expected format: **${invalid.slice(0, 3).join("**, **")}**. ` +
      "Please press the panel button and try again."
    );
  }

  // Same backend path as the DM session's finishSession() — submitApplication
  // for applications/no-category forms, createTicket + channel for the rest.
  const session = {
    form, panel, questions, answers,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    channelId: interaction.channelId,
  };

  try {
    await submitFormAnswers(interaction.client, session);
  } catch (err) {
    console.error("Failed to submit modal form:", err.message);
    return interaction.editReply("❌ Something went wrong submitting the form. Please try again.");
  }

  await interaction.editReply("✅ Submitted! Thank you.");
}

// ─── Context menus (v2.9) — ticket creation + tag reply ──────────────────────
// Short-TTL, in-memory state for the ">1 panel, pick one" step shared by both
// ticket context menus. Keyed by the ORIGINAL interaction.id (unique per
// invocation), never by user — two staff members picking concurrently can't
// collide. Not Redis-backed like formSession: this is a single ack round-trip
// (interaction token dies after 15 min anyway; TTL here is far shorter).
const pendingCtxTicket = new Map(); // interaction.id → { quotedMessage?, onBehalfOfId?, expiresAt }
const CTX_TICKET_TTL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingCtxTicket) if (v.expiresAt <= now) pendingCtxTicket.delete(k);
}, 60_000).unref();

async function fetchGuildPanels(guildId) {
  const { data } = await api.get(`/bot/guild/${guildId}/panels`);
  return data || [];
}

function panelPickerRow(interactionId, panels) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`ctxticket_panel:${interactionId}`)
    .setPlaceholder("Choose a panel...")
    .addOptions(panels.slice(0, 25).map((p) => ({ label: p.name.slice(0, 100), value: p.id })));
  return new ActionRowBuilder().addComponents(menu);
}

// Message context menu: "Create ticket from message" — opens a ticket via the
// same createTicketFromPanel path as a panel button, seeded with the quoted
// message's content. If the server has >1 panel, asks which one first.
export async function handleCreateTicketFromMessageContextMenu(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let panels;
  try {
    panels = await fetchGuildPanels(interaction.guildId);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction));
  }
  if (!panels.length) {
    return interaction.editReply("❌ No panels are configured for this server. Ask an admin to create one via the dashboard.");
  }

  const target = interaction.targetMessage;
  const quotedMessage = `**${target.author?.tag || "Unknown user"}**: ${target.content || "*[no text content]*"}`;

  if (panels.length === 1) {
    const panel = await getPanel(panels[0].id).catch(() => panels[0]);
    return createTicketFromPanel(interaction, panel, null, { quotedMessage });
  }

  pendingCtxTicket.set(interaction.id, { quotedMessage, expiresAt: Date.now() + CTX_TICKET_TTL });
  await interaction.editReply({
    content: "Which panel should this ticket use?",
    components: [panelPickerRow(interaction.id, panels)],
  });
}

// User context menu: "Open ticket for user" — staff-only. Opens a ticket AS
// the target user (creator identity), noting who actually opened it.
export async function handleOpenTicketForUserContextMenu(interaction) {
  if (!(await isStaffMember(interaction))) {
    return interaction.reply({
      content: "❌ You need Manage Messages permission (or a support role) to open a ticket for someone else.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let panels;
  try {
    panels = await fetchGuildPanels(interaction.guildId);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction));
  }
  if (!panels.length) {
    return interaction.editReply("❌ No panels are configured for this server. Ask an admin to create one via the dashboard.");
  }

  const onBehalfOf = interaction.targetUser;

  if (panels.length === 1) {
    const panel = await getPanel(panels[0].id).catch(() => panels[0]);
    return createTicketFromPanel(interaction, panel, null, { onBehalfOf });
  }

  pendingCtxTicket.set(interaction.id, { onBehalfOfId: onBehalfOf.id, expiresAt: Date.now() + CTX_TICKET_TTL });
  await interaction.editReply({
    content: `Which panel should this ticket use? (opening for ${onBehalfOf.tag})`,
    components: [panelPickerRow(interaction.id, panels)],
  });
}

async function handleCtxTicketPanelSelect(interaction) {
  const originId = interaction.customId.split(":")[1];
  const pending = pendingCtxTicket.get(originId);
  pendingCtxTicket.delete(originId);

  if (!pending) {
    return interaction.update({ content: "⏰ This selection expired. Please run the command again.", components: [] }).catch(() => {});
  }

  await interaction.deferUpdate();

  let panel;
  try {
    panel = await getPanel(interaction.values[0]);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction, "Panel not found."));
  }

  if (pending.onBehalfOfId) {
    const onBehalfOf = await interaction.client.users.fetch(pending.onBehalfOfId).catch(() => null);
    if (!onBehalfOf) return interaction.editReply("❌ That user could not be found anymore.");
    return createTicketFromPanel(interaction, panel, null, { onBehalfOf });
  }

  return createTicketFromPanel(interaction, panel, null, { quotedMessage: pending.quotedMessage });
}

// Message context menu: "Reply with tag" — staff-only. Posts a saved canned
// response (top 25 by usageCount) into the channel the target message is in.
export async function handleReplyWithTagContextMenu(interaction) {
  if (!(await isStaffMember(interaction))) {
    return interaction.reply({
      content: "❌ You need Manage Messages permission (or a support role) to use canned responses.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let tags;
  try {
    tags = await getTags(interaction.guildId);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction));
  }
  if (!tags?.length) {
    return interaction.editReply("No canned responses yet. Add one with `/tag add`.");
  }

  const top = [...tags].sort((a, b) => b.usageCount - a.usageCount).slice(0, 25);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`tag_reply_select:${interaction.channelId}`)
    .setPlaceholder("Choose a tag...")
    .addOptions(top.map((t) => ({ label: `${t.name} (used ${t.usageCount}×)`.slice(0, 100), value: t.name })));

  await interaction.editReply({
    content: "Which canned response should I post here?",
    components: [new ActionRowBuilder().addComponents(menu)],
  });
}

async function handleTagReplySelect(interaction) {
  const channelId = interaction.customId.split(":")[1];
  const name = interaction.values[0];

  await interaction.deferUpdate();

  let tag;
  try {
    tag = await useTag(interaction.guildId, name);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction, `Tag "${name}" not found.`));
  }

  const channel = interaction.guild?.channels.cache.get(channelId) || interaction.channel;
  try {
    await channel.send({ content: tag.content });
  } catch (err) {
    return interaction.editReply(`❌ Failed to post the tag: ${err.message}`);
  }

  await interaction.editReply({ content: `✅ Posted tag \`${name}\`.`, components: [] });
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
// v2.9: also reused by the two ticket context-menu commands (Message → "Create
// ticket from message", User → "Open ticket for user") via `opts` — kept
// optional/backward-compatible so the panel-button and form-direct call sites
// above don't need to change.
//
// @param {object} [opts]
// @param {import('discord.js').User} [opts.onBehalfOf] - open the ticket as this
//   user instead of the invoker (creator identity, DM-on-open target, channel
//   name); the invoker is still recorded as "opened by" in a note.
// @param {string} [opts.quotedMessage] - message content to post as context
//   right after the welcome embed (Message context-menu path).

async function createTicketFromPanel(interaction, panel, formAnswers, opts = {}) {
  const { onBehalfOf, quotedMessage } = opts;
  const creator = onBehalfOf || interaction.user;
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
    const uname = creator.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) || "user";
    const pad   = String(number ?? 0).padStart(padding, "0");
    return `${channelNamePrefix}-${pad}-${uname}`.slice(0, 100);
  }

  const isThreadMode = (panel.buttonStyle || "").toUpperCase() === "THREAD";
  const openCategory = panel.categoryOpenId || panel.categoryId || null;

  if (isThreadMode) {
    // ─── THREAD mode — spawn a private thread off the panel's channel instead
    // of a whole new channel. Private threads have no permission overwrites of
    // their own (unlike channels), so access is controlled purely by thread
    // membership: the creator + cached members of the support roles.
    const parentChannel = interaction.channel;
    if (!parentChannel?.threads) {
      return interaction.editReply("❌ This channel doesn't support threads. Ask an admin to switch the panel to channel mode or re-spawn it in a text channel.");
    }
    try {
      channel = await parentChannel.threads.create({
        name: buildChannelName(Date.now().toString().slice(-5)), // temp name, renamed below
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        type: 12, // GuildPrivateThread — avoid extra import just for the enum
        invitable: false,
        reason: `Ticket opened by ${creator.tag}`,
      });
      await channel.members.add(creator.id).catch(() => {});
      for (const roleId of panel.supportRoleIds || []) {
        const role = guild.roles.cache.get(roleId);
        if (!role) continue;
        // Best-effort — role.members needs GUILD_MEMBERS cache; skip silently if empty.
        for (const member of role.members.values()) {
          await channel.members.add(member.id).catch(() => {});
        }
      }
    } catch (err) {
      console.error("Failed to create ticket thread:", err.message);
      return interaction.editReply(
        `❌ Failed to create ticket thread: ${err.message}\n` +
        `Ensure the bot has **Create Private Threads** and **Manage Threads** permission in this channel.`
      );
    }
  } else {
    // Full channel mode with proper permission overwrites
    const permissionOverwrites = [
      { id: guild.id, deny: ["ViewChannel"] },
      { id: creator.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles", "EmbedLinks"] },
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
  }

  // ─── Register ticket in DB (gets the atomic counter number) ─────────────────
  const ticketResult = await createTicket(
    guild.id,
    panel.id,
    creator.id,
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
    user:   { id: creator.id, username: creator.username, tag: creator.tag },
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

  // ─── On-behalf-of note (User context menu "Open ticket for user") ─────────
  if (onBehalfOf) {
    await channel.send({
      embeds: [{
        description: `ℹ️ Opened by <@${interaction.user.id}> on behalf of <@${creator.id}>.`,
        color: welcomeColor,
      }],
    }).catch(() => {});
  }

  // ─── Quoted message (Message context menu "Create ticket from message") ──
  if (quotedMessage) {
    await channel.send({
      embeds: [{
        title: "💬 Quoted Message",
        description: quotedMessage.slice(0, 4096),
        color: welcomeColor,
      }],
    }).catch(() => {});
  }

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
      await creator.send({
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
      channel, user: creator,
      actor: onBehalfOf ? interaction.user : undefined,
      color: welcomeColor,
    }).catch(() => {});
  }

  await interaction.editReply(`✅ Your ticket has been created: ${channel}`);
}

function parseColor(hex) {
  if (!hex) return BRAND;
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return Number.isFinite(n) ? n : BRAND;
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
      color: color ?? BRAND,
      timestamp: new Date().toISOString(),
    }],
  }).catch(() => {});
}

// Export so ticketHandler can use it too
export { logTicketEvent, parseColor, createTicketFromPanel };

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
        action === "approve" ? SUCCESS : action === "deny" ? DANGER : INFO
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
      case "delete":
        if (!isStaff) return denyTicketAction(interaction);
        return handleTicketDeletePrompt(interaction, ticket, panel);
      case "delete-confirm":
        if (!isStaff) return denyTicketAction(interaction);
        return handleTicketDelete(interaction, ticket, panel);
      case "delete-cancel": return interaction.update({ components: [] }).catch(() => {});
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
    embeds: [{ description: askMsg, color: WARNING }],
    components: [row],
  });
}

// Exported so /ticket close (ticket.js) shares the exact same close behavior
// as the Close button — archive + mod buttons, never an outright delete.
export async function handleTicketCloseFinalize(interaction, ticket, panel, reason = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  console.log(`[ticket:close] 🔵 START — ticketId=${ticket.id}`);

  // Call backend to close (sets status=CLOSED, closedAt, closeReason, generates transcript)
  let closeResult;
  try {
    const { data } = await api.post(`/bot/ticket/${ticket.id}/close`, {
      closedById: interaction.user.id,
      reason,
    });
    closeResult = data;
    console.log(`[ticket:close] ✅ Backend OK — archiveUrl=${data?.archiveUrl}, fullArchiveUrl=${data?.fullArchiveUrl}, transcriptChannelId=${data?.transcriptChannelId}`);
  } catch (err) {
    console.error(`[ticket:close] ❌ Backend FAILED:`, err?.response?.data || err.message);
    return interaction.editReply(friendlyError(err, interaction));
  }

  const channel = interaction.channel;
  const guild = interaction.guild;
  const isThread = typeof channel?.isThread === "function" && channel.isThread();

  // Move to closed category (if configured). Threads have no setParent — their
  // "closed" state is archive+lock instead (done at the end of this function,
  // after the close message has been posted into the thread).
  if (!isThread && panel?.categoryClosedId && channel?.parent?.id !== panel.categoryClosedId) {
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
              color: BRAND,
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
  const closeHeader = reason ? `Closed by <@${interaction.user.id}>.\n**Reason:** ${reason}` : `Closed by <@${interaction.user.id}>.`;
  const closeEmbedDesc = transcriptUrl
    ? `${closeHeader}\n\n[📜 View Full Transcript](${transcriptUrl})\n\nModerators: use the buttons below.`
    : `${closeHeader}\n\nModerators: use the buttons below.`;

  await channel.send({
    embeds: [{
      title: "🔒 Ticket Closed",
      description: closeEmbedDesc,
      color: DANGER,
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
            color: BRAND,
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
            color: BRAND,
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
      color: DANGER,
    }).catch(() => {});
  }

  // Threads have no category/permission-overwrite based "closed" state —
  // lock + archive instead, done LAST so the close/transcript messages above
  // still land while the thread is open.
  if (isThread) {
    await channel.setLocked(true).catch(() => {});
    await channel.setArchived(true).catch(() => {});
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
      color: BRAND,
    }],
  });

  if (panel?.logChannelId) {
    const { logTicketEvent } = await import("./interactionCreate.js").catch(() => ({}));
    await logTicketEvent?.(interaction.guild, panel.logChannelId, "CLAIM", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel: interaction.channel, actor: interaction.user, color: BRAND,
    }).catch(() => {});
  }
}

async function handleTicketTranscript(interaction, ticket, panel) {
  await interaction.deferReply();
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
      color: SUCCESS,
      timestamp: new Date().toISOString(),
    }],
  });

  if (panel?.logChannelId) {
    const { logTicketEvent } = await import("./interactionCreate.js").catch(() => ({}));
    await logTicketEvent?.(interaction.guild, panel.logChannelId, "REOPEN", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel, actor: interaction.user, color: SUCCESS,
    }).catch(() => {});
  }

  await interaction.editReply("✅ Ticket reopened.");
}

// Deletion is destructive and irreversible — same two-step confirm pattern as
// close (handleTicketClosePrompt/Finalize above), so a stray click can't wipe
// a ticket channel.
async function handleTicketDeletePrompt(interaction, ticket, panel) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:delete-confirm:${ticket.id}`).setLabel("Yes, delete").setStyle(4).setEmoji("🗑️"),
    new ButtonBuilder().setCustomId(`ticket:delete-cancel:${ticket.id}`).setLabel("Cancel").setStyle(2)
  );

  return interaction.reply({
    embeds: [{ description: "🗑️ This will permanently delete the channel and its transcript reference. Are you sure?", color: DANGER }],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTicketDelete(interaction, ticket, panel) {
  await interaction.update({
    embeds: [{ description: "🗑️ This channel will be deleted in 5 seconds.", color: DANGER }],
    components: [],
  }).catch(() => {});

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
      channel: interaction.channel, actor: interaction.user, color: DANGER,
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
        color: SUCCESS,
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
          color: SUCCESS,
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
            color: SUCCESS,
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
