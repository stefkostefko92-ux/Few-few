// bot/src/events/interactionCreate.js
import {
  MessageFlags, ActionRowBuilder, ButtonBuilder, ChannelType, ThreadAutoArchiveDuration,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder,
} from "discord.js";
import api, {
  isBlacklisted, getPanel, createTicket, getTags, useTag, suggestKbArticle, sendKbFeedback,
} from "../utils/api.js";
import { buildTicketOpenEmbed, buildStatusEmbed } from "../utils/embed.js";
import { runFormSession, submitFormAnswers, validateAnswerAgainstRegex, rejectionText } from "../utils/formSession.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND, SUCCESS, DANGER, WARNING, INFO } from "../utils/colors.js";
import { priorityField } from "../utils/priority.js";
import { startSetupWizard, handleSetupComponent } from "../commands/setup.js";
import { isStaffMember } from "../utils/staffCheck.js";
import { t, resolveLang, resolveLangSync, resolveLangForGuild } from "../i18n/index.js";
import { roleAssignabilityReason } from "../utils/reactionRoles.js";
import { loadPanel, capped, TIMED_OUT, PRE_ACK_CAP_MS } from "../utils/panelCache.js";
import { closeTicket, reopenTicketChannel, CLOSE_REASON_MAX } from "../utils/ticketLifecycle.js";
import { logTicketEvent, parseColor } from "../utils/ticketLog.js";
import { describeTicketError, limitText, describeActionConflict } from "../utils/ticketErrors.js";
import { invalidateTicketChannel } from "../utils/ticketCaches.js";
import { loadVerificationPanelCapped } from "../utils/verificationPanelCache.js";

// ─── Blacklist TTL кеш ──────────────────────────────────────────────────────
// Всяка slash команда проверява blacklist статуса срещу backend-а. Синхронният
// hop яде от 3-секундния бюджет за отговор на interaction. Кешираме резултата за
// кратко (както ticketChannelCache в index.js) — при промяна в dashboard-а
// ефектът се вижда след TTL-а. Кешираме и hit, и miss.
const blacklistCache = new Map(); // userId → { blacklisted, expiresAt }
const BLACKLIST_CACHE_TTL = 60 * 1000; // 1 минута

// Т13: заявката пред първия отговор е с ТАВАН (2 s) — Discord дава 3 s, а axios
// чака 10. При изтичане пропада „отворено“ (както и при срив на бекенда), а
// заявката довършва и пълни кеша за следващия път.
async function isBlacklistedCached(userId) {
  const now = Date.now();
  const cached = blacklistCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.blacklisted;
  const lookup = isBlacklisted(userId).then((blacklisted) => {
    blacklistCache.set(userId, { blacklisted, expiresAt: Date.now() + BLACKLIST_CACHE_TTL });
    return blacklisted;
  });
  lookup.catch(() => {}); // късен отказ след тавана не бива да е unhandled
  return capped(lookup, PRE_ACK_CAP_MS, false).catch(() => false);
}

// Т9: черният списък важи за ВСЕКИ път на отваряне на тикет/кандидатура — не само
// за slash и контекстни команди. Бутон, меню, формуляр на бутон и модал го
// заобикаляха (основният път за отваряне). Връща false след ephemeral отказ.
const OPENING_PREFIXES = ["panel_button:", "panel_select:", "form_direct:", "form_modal:", "ctxticket_panel:"];
function isOpeningComponent(interaction) {
  const id = interaction.customId;
  if (!id || !(interaction.isMessageComponent?.() || interaction.isModalSubmit?.())) return false;
  return id === "panel_select_multi" || OPENING_PREFIXES.some((p) => id.startsWith(p));
}
export async function preflight(interaction) {
  if (!(await isBlacklistedCached(interaction.user.id))) return true;
  await interaction.reply({
    content: t("error.blacklisted", resolveLangSync(interaction)),
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
  return false;
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
          const lang = resolveLangSync(interaction); // пред първия отговор — без мрежа
          return interaction.reply({
            content: t("error.blacklisted", lang),
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

      // ── Т9: един preflight за всеки път на отваряне (blacklist) ────────────
      if (isOpeningComponent(interaction) && !(await preflight(interaction))) return;

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

      // Слято ГРУПОВО меню: опциите идват от няколко панела, затова панелът е
      // в самата стойност (`<panelId>:<btnId>`), а не в customId. Оттам нататък
      // е същият път — тикетът пази настройките на СВОЯ панел.
      if (interaction.isStringSelectMenu() && interaction.customId === "panel_select_multi") {
        const [panelId, buttonId] = String(interaction.values[0] || "").split(":");
        if (!panelId || !buttonId) {
          return interaction.reply({ content: "❌ This option is no longer valid.", flags: MessageFlags.Ephemeral });
        }
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

      // ── Application Review Modal Submit (reason for approve/deny) ───────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith("app_review_modal:")) {
        const [, appId, action] = interaction.customId.split(":");
        await handleAppReviewModalSubmit(interaction, appId, action);
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

      // ── Server Season (v50): магазин и другите "game:" компоненти ──────────
      if ((interaction.isButton() || interaction.isStringSelectMenu()) && interaction.customId.startsWith("game:")) {
        const { handleGameInteraction } = await import("../utils/gameInteractions.js");
        await handleGameInteraction(interaction);
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
        // Същият embed като /help category:… — на езика на човека (един builder в help.js).
        const lang = await resolveLang(interaction);
        const { catalogFor } = await import("../utils/commandsCatalogL10n/index.js");
        const { buildCategoryEmbed, buildSelect, buildLinkRow } = await import("../commands/help.js");
        const catalog = catalogFor(lang);
        const cat = catalog.find((c) => c.key === interaction.values[0]);
        if (!cat) {
          return interaction.reply({ content: t("error.categoryNotFound", lang), flags: MessageFlags.Ephemeral });
        }
        await interaction.update({ embeds: [buildCategoryEmbed(cat, lang)], components: [buildSelect(catalog, lang, cat.key), buildLinkRow(lang)] });
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

      // ── Knowledge Base suggestion feedback (👍/👎, v32) ─────────────────────
      if (interaction.isButton() && interaction.customId.startsWith("kb_fb:")) {
        const [, articleId, helpfulFlag] = interaction.customId.split(":");
        await handleKbFeedback(interaction, articleId, helpfulFlag === "1");
        return;
      }

      // ── Modal Submissions ───────────────────────────────────────────────────
      // Note: обичайните форми минават през DM collectors (runFormSession);
      // "form_modal:" (по-горе) е единственото изключение. Ако стигне непознат
      // modal submit, го потвърждаваме ephemeral, за да не вижда потребителят
      // „This interaction failed“.
      if (interaction.isModalSubmit()) {
        const lang = await resolveLang(interaction);
        await interaction.reply({
          content: t("error.formExpired", lang),
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
        return;
      }

      // ── Резервен отговор за НЕПОЗНАТ бутон / select ─────────────────────────
      // Дотук е верига от startsWith проверки. Modal submit имаше резервен
      // клон, компонентите — НЕ: непознат customId просто излизаше от try-а без
      // никакъв отговор, Discord показваше „This interaction failed“ след 3
      // секунди, а в логовете нямаше нищо. Това не е хипотетично: панел,
      // публикуван преди месеци, после изтрит или преконфигуриран, оставя живи
      // бутони с customId, който вече не се разпознава — всяко натискане тихо
      // се проваля. (Дискорджията, 07.08.2026)
      if (interaction.isMessageComponent()) {
        console.warn(
          `[interaction] непознат ${interaction.isButton() ? "бутон" : "компонент"} customId=${interaction.customId} guild=${interaction.guildId}`,
        );
        const lang = await resolveLang(interaction);
        await interaction.reply({
          content: t("error.componentExpired", lang),
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
  // Т13: заявката за панела е с таван 2 s. Кешираният панел е мигновен; при
  // студен кеш и бавен бекенд отговаряме с defer (не с „interaction failed“) и
  // довършваме по СЪЩАТА заявка — без втора.
  const pending = loadPanel(panelId, interaction.guildId);
  pending.catch(() => {});
  let loaded = await capped(pending.then((p) => ({ panel: p }), (error) => ({ error })), PRE_ACK_CAP_MS, TIMED_OUT);
  let deferred = false;
  if (loaded === TIMED_OUT) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    deferred = true;
    loaded = await pending.then((p) => ({ panel: p }), (error) => ({ error }));
  }

  const ack = async () => {
    if (!deferred) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;
    }
  };
  const lang = resolveLangSync(interaction);

  if (loaded.error) {
    await ack().catch(() => {});
    // 404 → the panel really is gone; anything else (timeout/5xx) is a
    // backend hiccup, not a missing panel — don't tell the user to re-spawn it.
    const notFound = loaded.error?.response?.status === 404;
    return interaction.editReply(
      friendlyError(loaded.error, interaction, notFound ? t("tkt.panelGone", lang) : undefined)
    );
  }
  const panel = loaded.panel;

  const button = panel.buttons.find((b) => b.id === buttonId);
  if (!button) {
    await ack();
    return interaction.editReply(t("tkt.buttonNotFound", lang));
  }

  // Т9: верификационната врата и за бутон с формуляр (синхронна — няма мрежа),
  // ПРЕДИ modal/DM сесия; не само в createTicketFromPanel.
  const gate = checkVerificationGate(interaction, panel);
  if (!gate.allowed) {
    if (deferred) return interaction.editReply({ content: gate.message });
    return interaction.reply({ content: gate.message, flags: MessageFlags.Ephemeral });
  }

  if (button.formId && button.form) {
    if (!deferred && isModalEligibleForm(button.form)) {
      await interaction.showModal(buildFormModal(button.form, panelId, buttonId));
      return;
    }
    await ack();
    await interaction.editReply(t("form.dmCheck", await resolveLang(interaction)));
    await runFormSession(interaction, button.form, panel);
  } else {
    await ack();
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
  const lang = await resolveLang(interaction);

  let panel;
  try {
    panel = await getPanel(panelId, { serverId: interaction.guildId });
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction, "Panel not found. Ask an admin to re-spawn it."));
  }

  const button = panel.buttons.find((b) => b.id === buttonId);
  const form = button?.form;
  if (!form || form.id !== formId) {
    return interaction.editReply(t("form.notAvailable", lang));
  }

  // Т9: верификационната врата и тук (клиентът може да е изпратил модала със
  // стара версия на панела, а правата му да са се променили между двата клика).
  const gate = checkVerificationGate(interaction, panel);
  if (!gate.allowed) return interaction.editReply({ content: gate.message });

  const questions = [...form.questions].sort((a, b) => a.order - b.order).slice(0, MODAL_MAX_QUESTIONS);
  const answers = {};
  const invalid = [];
  for (const q of questions) {
    try {
      answers[q.id] = interaction.fields.getTextInputValue(q.id);
    } catch { /* field wasn't rendered (shouldn't happen — same list built the modal) */ }
    // Същата guarded валидация като DM пътя (ReDoS-защитена) — modal-ът не
    // бива тихо да заобикаля validationRegex на формата.
    if (q.validationRegex && !(await validateAnswerAgainstRegex(q, answers[q.id] || "")).ok) {
      invalid.push(q.label);
    }
  }
  if (invalid.length) {
    return interaction.editReply(
      t("form.invalidAnswersModal", lang, { fields: invalid.slice(0, 3).join("**, **") })
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

  let result;
  try {
    // `interaction` е и контекстът на тикета: същият път като бутон без формуляр
    // (ред в базата, номер, Close/Claim, отговорите вътре), а отказът му е ephemeral.
    result = await submitFormAnswers(interaction.client, session, interaction);
  } catch (err) {
    console.error("Failed to submit modal form:", err.message);
    return interaction.editReply(t("form.submitFailed", lang));
  }

  // Отказът по правило на формата (затворена · таван · cooldown) НЕ е успех.
  // Дотук се потвърждаваше безусловно и кандидатът виждаше зелена отметка за
  // кандидатура, която сървърът е отхвърлил. (Кодаджията, одит кръг 2)
  if (result && !result.ok) {
    return interaction.editReply(rejectionText(result, lang));
  }

  // Тикетът сам отговаря (`ticket.opened` с канала или обяснение за отказа).
  if (result?.kind === "ticket") return;
  await interaction.editReply(t("form.submittedConfirm", lang));
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
    const panel = await getPanel(panels[0].id, { serverId: interaction.guildId }).catch(() => panels[0]);
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
    const panel = await getPanel(panels[0].id, { serverId: interaction.guildId }).catch(() => panels[0]);
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
    panel = await getPanel(interaction.values[0], { serverId: interaction.guildId });
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
    // allowedMentions гард: съдържанието на тага е свободен текст, писан от
    // персонала (или през таблото). Без този гард един таг с „@everyone“ прави
    // бота машина за масов пинг — точно поведението, за което Discord сваля
    // приложения. Потребители и роли остават позволени: отговорът на поддръжката
    // често трябва да спомене човека или екипа.
    await channel.send({ content: tag.content, allowedMentions: { parse: ["users", "roles"] } });
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

  await interaction.editReply(t("form.dmCheck", await resolveLang(interaction)));
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
  const { onBehalfOf, quotedMessage, reason: openReason } = opts;
  const creator = onBehalfOf || interaction.user;
  const guild = interaction.guild;
  let channel;
  // `lang` — към човека (неговия клиент → сървъра); `guildLang` — видимото в канала.
  const lang = await resolveLang(interaction);
  const guildLang = await resolveLangForGuild(guild.id);
  // Отказ: показва се на човека и върнатият резултат казва на викача (DM сесията)
  // да не твърди „подадено“.
  const refuse = async (payload) => { await interaction.editReply(payload); return { ok: false }; };

  // ─── v1.7 Verification gate ───────────────────────────────────────────────
  // Check user has all required verification roles before doing anything else.
  // (Не при „от името на“: проверката би гледала ролите на персонала, не на създателя.)
  const gate = onBehalfOf ? { allowed: true } : checkVerificationGate(interaction, panel);
  if (!gate.allowed) {
    return refuse({ content: gate.message });
  }

  // ─── Т12: лимитът на тикети ПРЕДИ създаването на канал ──────────────────────
  // Преди: каналът се създаваше и се трие при всеки отказ (rate limit + шум в
  // одитния дневник). Авторитетната проверка остава в `POST /ticket/create`
  // (advisory lock) — тук е само бърза предварителна; при срив на проверката
  // продължаваме (fail-open), бекендът пак ще откаже.
  const limit = await api
    .get("/bot/ticket/precheck", { params: { serverId: guild.id, panelId: panel.id, creatorId: creator.id }, timeout: 4000 })
    .then((r) => r.data)
    .catch(() => ({ allowed: true }));
  if (limit && limit.allowed === false) {
    return refuse(limitText(limit, lang));
  }

  const channelNamePrefix   = (panel.channelNamePrefix || "ticket").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const padding             = panel.counterPadding ?? 4;

  // Helper — build final channel name using ticket number
  //
  // `namingTemplate` е настройка в таблото („Шаблон за име на тикет“), преведена
  // на 8 езика и валидирана в backend-а — но досега ботът НЕ я четеше и строеше
  // името само от префикса. Тоест клиент пишеше `support-{username}` и получаваше
  // `ticket-0001-username`. Видима настройка, която не прави нищо. (Одит 07.08.2026)
  //
  // Discord иска: малки букви, без интервали, ≤100 знака. Затова резултатът се
  // санитизира ЗАДЪЛЖИТЕЛНО — шаблонът е потребителски вход.
  function buildChannelName(number) {
    const uname = creator.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) || "user";
    const pad   = String(number ?? 0).padStart(padding, "0");

    const tpl = (panel.namingTemplate || "").trim();
    if (tpl) {
      const filled = tpl
        .replace(/\{username\}/gi, uname)
        .replace(/\{number\}/gi, pad)
        .replace(/\{count\}/gi, pad)
        .replace(/\{userid\}/gi, creator.id)
        .replace(/\{prefix\}/gi, channelNamePrefix);
      const safe = filled
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100);
      // Празен резултат (шаблон само от забранени знаци) → падаме на познатото
      // име, вместо да пуснем невалидно към Discord.
      if (safe) return safe;
    }

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
      return refuse(t("tkt.err.noThreads", lang));
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
      console.error("Failed to create ticket thread:", err?.code, err?.message);
      return refuse(describeTicketError(err, lang, { thread: true }));
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
      // Т12: 30013 (пълна категория/сървър), 50013 (права), 10003/10011 (изтрит
      // канал/роля), 50035 (невалидни данни) → преведено обяснение за админа.
      console.error("Failed to create ticket channel:", err?.code, err?.message);
      return refuse(describeTicketError(err, lang));
    }
  }

  // ─── Register ticket in DB (gets the atomic counter number) ─────────────────
  // Каналът/thread-ът ВЕЧЕ съществува в Discord. Ако регистрацията се провали с
  // ИЗКЛЮЧЕНИЕ (мрежа, 5xx, timeout — всичко без познат `code` в тялото), досега
  // то излиташе нагоре и каналът оставаше осиротял ЗАВИНАГИ: празен тикет канал,
  // който никой не поддържа и никой не може да затвори през бота. Познатите
  // кодове (MAX_TICKETS_REACHED) вече чистеха — сега чисти и изключението.
  // (Дискорджията, 07.08.2026)
  let ticketResult;
  try {
    ticketResult = await createTicket(
      guild.id,
      panel.id,
      creator.id,
      channel.id,
      openReason || null
    );
  } catch (err) {
    console.error(`[ticket] регистрацията се провали за guild=${guild.id} panel=${panel.id}: ${err?.message}`);
    await channel.delete().catch((delErr) => {
      // Ако и чистенето не мине, поне оставяме следа — иначе каналът виси нямо.
      console.error(`[ticket] осиротял канал ${channel.id} НЕ можа да бъде изтрит: ${delErr?.message}`);
    });
    return refuse(t("error.ticketCreateFailed", lang));
  }

  // Backend may refuse due to limits (race между precheck и създаването) —
  // каналът не остава; текстът е преведен (не суровият английски на бекенда).
  if (ticketResult?.code === "MAX_TICKETS_REACHED" || ticketResult?.code === "PANEL_LIMIT_REACHED") {
    await channel.delete().catch(() => {});
    return refuse(limitText(ticketResult, lang));
  }
  if (!ticketResult?.id) {
    await channel.delete().catch(() => {});
    return refuse(t("error.ticketCreateFailed", lang));
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
    // Т18: `{ticket.reason}` и `{server.members}` бяха празни.
    reason: openReason || "",
    memberCount: guild.memberCount,
  };

  const welcomeContent = interpolate(panel.welcomeMessage || defaultWelcomeMessage(), ctx);
  const welcomeColor   = parseColor(panel.welcomeEmbedColor || "#00e5ff");

  // Staff mention above the embed (so they get notified)
  const staffMention = (panel.supportRoleIds || []).map((r) => `<@&${r}>`).join(" ");

  // Action buttons (Close, Claim, Transcript) — на езика на сървъра (Т17)
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${ticketResult.id}`)
      .setLabel(t("tkt.btnClose", guildLang))
      .setStyle(4) // Danger
      .setEmoji("🔒"),
    new ButtonBuilder()
      .setCustomId(`ticket:claim:${ticketResult.id}`)
      .setLabel(t("tkt.btnClaim", guildLang))
      .setStyle(2) // Secondary
      .setEmoji("👋"),
    new ButtonBuilder()
      .setCustomId(`ticket:transcript:${ticketResult.id}`)
      .setLabel(t("tkt.btnTranscript", guildLang))
      .setStyle(2)
      .setEmoji("📜"),
  );

  const openField = priorityField(ticketResult?.priority);

  const welcomeMessage = await channel.send({
    content: staffMention || undefined,
    allowedMentions: { parse: ["roles"] },
    embeds: [{
      title: `Ticket #${String(ticketNumber ?? "").padStart(padding, "0")}`,
      description: welcomeContent,
      color: welcomeColor,
      fields: openField ? [openField] : undefined,
      footer: { text: `${panel.name} · Ticket ID: ${ticketResult.id.slice(0, 8)}` },
      timestamp: new Date().toISOString(),
    }],
    components: [actionRow],
  });

  // Закачване на приветствието: тих провал. От 2026 закачането иска правото
  // PinMessages (не Manage Messages) — добавя се в поканата/проверката от З12.
  welcomeMessage?.pin?.()?.catch?.(() => {});

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
  if (formAnswers && Object.keys(formAnswers).length) {
    const transcript = Object.entries(formAnswers)
      .map(([question, answer]) => `**${question}**\n${answer}`)
      .join("\n\n");

    await channel.send({
      embeds: [{
        title: t("tkt.formSubmission", guildLang),
        description: transcript.slice(0, 4096),
        color: welcomeColor,
      }],
    }).catch(() => {});
  }

  // ─── Knowledge Base auto-suggestion (v32, Premium/Free — gated by article count,
  // not this feature) ─────────────────────────────────────────────────────────
  // Fire-and-forget: never blocks/slows ticket creation on a KB lookup hiccup.
  // Query text = whatever context we have for "what is this ticket about":
  // quoted message > form answers > panel name (always available as a last resort).
  const kbQuery = quotedMessage
    || (formAnswers ? Object.values(formAnswers).join(" ") : null)
    || openReason
    || panel.name
    || "";
  suggestAndPostKbArticle(channel, guild.id, kbQuery).catch(() => {});

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

  invalidateTicketChannel(channel.id);
  await interaction.editReply(t("ticket.opened", lang, { channel: String(channel) }));
  return { ok: true, channel, ticket: ticketResult };
}

// ─── Knowledge Base auto-suggestion (v32) ──────────────────────────────────
// Called fire-and-forget from createTicketFromPanel — a backend hiccup here
// must never affect ticket creation, hence the caller wraps us in .catch(()=>{}).
const KB_SNIPPET_MAX = 600;

async function suggestAndPostKbArticle(channel, guildId, query) {
  if (!query) return;
  const article = await suggestKbArticle(guildId, query);
  if (!article) return;

  const lang = await resolveLangForGuild(guildId);
  const snippet = article.content.length > KB_SNIPPET_MAX
    ? `${article.content.slice(0, KB_SNIPPET_MAX)}…`
    : article.content;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`kb_fb:${article.id}:1`)
      .setLabel(t("kb.suggest.helpfulButton", lang))
      .setStyle(3) // Success
      .setEmoji("👍"),
    new ButtonBuilder()
      .setCustomId(`kb_fb:${article.id}:0`)
      .setLabel(t("kb.suggest.notHelpfulButton", lang))
      .setStyle(4) // Danger
      .setEmoji("👎"),
  );

  await channel.send({
    embeds: [{
      title: t("kb.suggest.title", lang, { title: article.title }),
      description: `${snippet}\n\n${t("kb.suggest.disclaimer", lang)}`,
      footer: { text: t("kb.suggest.footer", lang) },
      color: INFO,
    }],
    components: [row],
  }).catch(() => {});
}

// ── Knowledge Base suggestion feedback (👍/👎 on the suggested-article embed) ─
async function handleKbFeedback(interaction, articleId, helpful) {
  // deferUpdate acks the button immediately (no visible "thinking" state) —
  // same pattern as handleFeedback below.
  await interaction.deferUpdate().catch(() => {});
  const lang = await resolveLang(interaction);
  try {
    await sendKbFeedback(articleId, helpful);
    // Disable both buttons after a successful vote so the counters can't be
    // trivially inflated by repeat-clicking the same message.
    const row = interaction.message.components?.[0];
    if (row) {
      const disabledRow = new ActionRowBuilder().addComponents(
        row.components.map((c) => ButtonBuilder.from(c).setDisabled(true))
      );
      await interaction.editReply({ components: [disabledRow] }).catch(() => {});
    }
    await interaction.followUp({
      content: t(helpful ? "kb.feedback.thanksHelpful" : "kb.feedback.thanksNotHelpful", lang),
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  } catch {
    await interaction.followUp({
      content: t("kb.feedback.error", lang),
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

// Export so ticketHandler can use it too
export { logTicketEvent, parseColor, createTicketFromPanel };

// ─── Application Review Buttons ───────────────────────────────────────────────

// Т11: „мениджърите на кандидатури“ (ролите от формуляра, „can review alongside admins“) ревюират
// редом с хората с Manage Server. Админът минава без заявка; за останалите ботът пита бекенда кои са
// ролите на формуляра (скоуп по serverId, таван 2 s пред първия отговор) — при мълчание: отказ.
async function canReviewApplications(interaction, appId) {
  if (interaction.member?.permissions?.has("ManageGuild")) return true;
  try {
    const res = await capped(
      api.get(`/bot/application/${appId}/reviewers`, { params: { serverId: interaction.guildId } }),
      PRE_ACK_CAP_MS,
      null,
    );
    const managers = res?.data?.managerRoleIds || [];
    const mine = interaction.member?.roles?.cache;
    return managers.some((r) => mine?.has?.(String(r)));
  } catch {
    return false;
  }
}

export async function handleAppReview(interaction, appId, action) {
  const lang = await capped(resolveLang(interaction), 800, resolveLangSync(interaction));

  // ── Open a ticket (discussion канал с кандидата, решението остава PENDING) ──
  if (action === "discuss") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!(await canReviewApplications(interaction, appId))) {
      return interaction.editReply(t("app.review.noPermission", lang));
    }
    try {
      const { data } = await api.post(`/bot/application/${appId}/discuss`, {
        serverId: interaction.guildId,
        reviewerId: interaction.user.id,
        reviewerTag: interaction.user.username,
      });
      await interaction.editReply(
        t(data.alreadyExists ? "app.review.discussExists" : "app.review.discussOpened", lang, { channel: `<#${data.channelId}>` })
      );
    } catch (err) {
      await interaction.editReply(t(err?.response?.status === 409 ? "app.review.alreadyReviewed" : "app.review.error", lang)).catch(() => {});
    }
    return;
  }

  if (!(await canReviewApplications(interaction, appId))) {
    return interaction.reply({ content: t("app.review.noPermission", lang), flags: MessageFlags.Ephemeral });
  }

  // ── Approve / Deny → модал с причина, решението пада в modal submit-а ───────
  // (стари review embeds без discuss бутон ползват същите customId-та → и те
  // получават новия поток без миграция на съобщенията)
  const isApprove = action === "approve";
  const modal = new ModalBuilder()
    .setCustomId(`app_review_modal:${appId}:${action}`)
    .setTitle(t(isApprove ? "app.review.approveTitle" : "app.review.denyTitle", lang));

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel(t(isApprove ? "app.review.approveLabel" : "app.review.denyLabel", lang))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder(t(isApprove ? "app.review.approvePlaceholder" : "app.review.denyPlaceholder", lang));

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  await interaction.showModal(modal);
}

export async function handleAppReviewModalSubmit(interaction, appId, action) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const lang = await resolveLang(interaction);
  if (!(await canReviewApplications(interaction, appId))) {
    return interaction.editReply(t("app.review.noPermission", lang));
  }
  const note = interaction.fields.getTextInputValue("reason")?.trim() || null;

  try {
    await api.post(`/bot/application/${appId}/review`, {
      action,
      note,
      serverId: interaction.guildId,
      reviewerId: interaction.user.id,
      reviewerTag: interaction.user.username,
    });

    // Disable all buttons on the review embed. Модалът е отворен от бутон на
    // съобщение → interaction.message е наличен на ModalSubmitInteraction.
    // Must use ButtonBuilder.from() — message components are read-only ButtonComponent, not ButtonBuilder
    if (interaction.message) {
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
          t(action === "approve" ? "app.review.approvedTitle" : "app.review.deniedTitle", lang),
          t(action === "approve" ? "app.review.approvedBy" : "app.review.deniedBy", lang, { user: interaction.user.username }) +
            (note ? `\n${t("app.review.reasonLine", lang, { note: note.slice(0, 900) })}` : ""),
          action === "approve" ? SUCCESS : action === "deny" ? DANGER : INFO,
          { client: interaction.client }
        )],
      }).catch(() => {});
    }

    await interaction.editReply(t("app.review.done", lang));
  } catch (err) {
    // Т6: вторият ревюър (409) чува ясно „вече е прегледана“; суровото съобщение не стига до човека.
    await interaction.editReply(t(err?.response?.status === 409 ? "app.review.alreadyReviewed" : "app.review.error", lang)).catch(() => {});
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
// Пред първия отговор → синхронен език (без мрежа, Т13).
async function denyTicketAction(interaction) {
  return interaction.reply({
    content: t("ticket.staffOnly", resolveLangSync(interaction)),
    flags: MessageFlags.Ephemeral,
  });
}

// Отговор, който е валиден във всяко състояние на interaction-а: преди ack →
// reply, след defer → editReply, след reply → followUp. (Преди: `reply` след
// defer хвърляше и грешката се глътваше — човекът виждаше само „thinking“.)
async function answer(interaction, payload) {
  const p = typeof payload === "string" ? { content: payload } : payload;
  if (interaction.deferred) return interaction.editReply({ ...p, components: p.components ?? [] });
  if (interaction.replied) return interaction.followUp({ ...p, flags: MessageFlags.Ephemeral });
  return interaction.reply({ ...p, flags: MessageFlags.Ephemeral });
}

async function handleTicketAction(interaction, action, ticketId) {
  try {
    const syncLang = resolveLangSync(interaction);
    // Т13: заявката пред първия отговор е с таван 2.5 s (Discord: 3 s).
    let ticket;
    try {
      ({ data: ticket } = await api.get(`/bot/ticket/${ticketId}`, { timeout: 2500 }));
    } catch (err) {
      const notFound = err?.response?.status === 404;
      return interaction.reply({
        content: t(notFound ? "ticket.notFound" : "tkt.slow", syncLang),
        flags: MessageFlags.Ephemeral,
      });
    }
    // Изолация: бутон от друг сървър (или копиран customId) не пипа чужд тикет.
    if (!ticket || (ticket.serverId && ticket.serverId !== interaction.guildId)) {
      return interaction.reply({ content: t("ticket.notFound", syncLang), flags: MessageFlags.Ephemeral });
    }
    // Т5: панелът идва изчистен по план от бекенда (един `getPanel` за всички пътища).
    const panel = ticket.panel || null;

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
        return interaction.reply({ content: t("ticket.unknownAction", syncLang), flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error("[ticket-action]", action, err?.response?.data || err?.message);
    // Сурово `err.message`/английски текст на бекенда не стига до човека (Т17).
    const lang = resolveLangSync(interaction);
    const code = err?.response?.data?.code;
    const text = code ? describeActionConflict(code, lang) : t("tkt.err.generic", lang);
    return answer(interaction, text).catch(() => {});
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
  const lang = resolveLangSync(interaction);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:close-confirm:${ticket.id}`).setLabel(t("ticket.closeConfirmYes", lang)).setStyle(4).setEmoji("🔒"),
    new ButtonBuilder().setCustomId(`ticket:close-cancel:${ticket.id}`).setLabel(t("ticket.closeConfirmCancel", lang)).setStyle(2)
  );

  return interaction.reply({
    embeds: [{ description: askMsg, color: WARNING }],
    components: [row],
  });
}

// Т2: бутонът Close, `/ticket close` и (през `closeTicket`) таблото, неактивността
// и напусналият създател минават през ЕДНАТА функция в utils/ticketLifecycle.js.
// Тук е само обвивката за interaction: defer → затваряне → отговор.
export async function handleTicketCloseFinalize(interaction, ticket, panel, reason = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  const lang = await resolveLang(interaction);
  const safeReason = reason ? String(reason).slice(0, CLOSE_REASON_MAX) : null;

  let result;
  try {
    result = await closeTicket(interaction.client, {
      ticketId: ticket.id,
      guildId: interaction.guildId,
      closedById: interaction.user.id,
      reason: safeReason,
      source: "manual",
      channel: interaction.channel,
      lang: await resolveLangForGuild(interaction.guildId),
    });
  } catch (err) {
    console.error(`[ticket:close] backend failed:`, err?.response?.data || err?.message);
    return interaction.editReply(friendlyError(err, interaction));
  }

  if (!result.ok) {
    return interaction.editReply({ content: describeActionConflict(result.code, lang), components: [] });
  }
  const warn = result.warnings?.length ? `\n${t("tkt.closedWithWarnings", lang)}` : "";
  await interaction.editReply({ content: `${t("ticket.closedConfirm", lang)}${warn}`, components: [] });
}

async function handleTicketClaim(interaction, ticket, panel) {
  // Проверката за права остава ПРЕДИ defer (ephemeral отказ).
  if (!isTicketStaff(interaction, panel)) {
    return interaction.reply({ content: t("ticket.claimStaffOnly", resolveLangSync(interaction)), flags: MessageFlags.Ephemeral });
  }

  // Т4: defer е ЕФИМЕРЕН — отказ („Premium“, „вече е поет“, „затворен“) се вижда
  // само на персонала, не в канала на клиента. Успехът се обявява публично долу.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const lang = await resolveLang(interaction);

  try {
    await api.post(`/bot/ticket/${ticket.id}/claim`, { userId: interaction.user.id });
  } catch (err) {
    const code = err?.response?.data?.code;
    return interaction.editReply({ content: code ? describeActionConflict(code, lang) : t("tkt.err.generic", lang) });
  }

  const announce = {
    embeds: [{
      description: t("ticket.claimedConfirm", await resolveLangForGuild(interaction.guildId), { user: `<@${interaction.user.id}>` }),
      color: BRAND,
    }],
    allowedMentions: { parse: [] },
  };
  await interaction.channel.send(announce).catch(() => {});
  await interaction.editReply({ content: t("tkt.claimedAck", lang) });

  if (panel?.logChannelId) {
    await logTicketEvent(interaction.guild, panel.logChannelId, "CLAIM", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel: interaction.channel, actor: interaction.user, color: BRAND,
    }).catch(() => {});
  }
}

async function handleTicketTranscript(interaction, ticket, panel) {
  await interaction.deferReply();
  const lang = await resolveLang(interaction);
  try {
    const res = await api.post(`/bot/ticket/${ticket.id}/transcript`, {});
    if (res.data?.url) {
      await interaction.editReply(t("ticket.transcriptLink", lang, { url: res.data.url }));
    } else {
      await interaction.editReply(t("ticket.transcriptSaved", lang));
    }
  } catch (err) {
    await interaction.editReply(t("tkt.err.generic", lang));
  }
}

// Т3: нишката се отключва/разархивира с setLocked/setArchived — БЕЗ setParent и
// permissionOverwrites (ThreadChannel ги няма: синхронен TypeError, който .catch
// не хваща). Съществената стъпка за нишка е ПРЕДИ записа в базата: при провал
// базата и Discord не се разминават.
async function handleTicketReopen(interaction, ticket, panel) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const lang = await resolveLang(interaction);
  const channel = interaction.channel;

  if (ticket.status && ticket.status !== "CLOSED") {
    return interaction.editReply(describeActionConflict("NOT_CLOSED", lang));
  }

  let discordStep;
  try {
    discordStep = await reopenTicketChannel(channel, panel, ticket);
  } catch (err) {
    console.error(`[ticket:reopen] Discord step failed: ${err?.code} ${err?.message}`);
    return interaction.editReply(describeTicketError(err, lang, { thread: true }));
  }

  try {
    await api.post(`/bot/ticket/${ticket.id}/reopen`, { reopenerId: interaction.user.id });
  } catch (err) {
    // Базата отказа (напр. вече е отворен) → връщаме нишката в затворено състояние.
    if (typeof channel?.isThread === "function" && channel.isThread()) {
      await channel.setLocked(true).catch(() => {});
      await channel.setArchived(true).catch(() => {});
    }
    const code = err?.response?.data?.code;
    return interaction.editReply(code ? describeActionConflict(code, lang) : t("tkt.err.generic", lang));
  }

  invalidateTicketChannel(channel?.id || ticket.channelId);

  await channel.send({
    embeds: [{
      title: t("ticket.reopenedTitle", await resolveLangForGuild(interaction.guildId)),
      description: t("ticket.reopenedBody", await resolveLangForGuild(interaction.guildId), { user: `<@${interaction.user.id}>` }),
      color: SUCCESS,
      timestamp: new Date().toISOString(),
    }],
  }).catch(() => {});

  if (panel?.logChannelId) {
    await logTicketEvent(interaction.guild, panel.logChannelId, "REOPEN", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel, actor: interaction.user, color: SUCCESS,
    }).catch(() => {});
  }

  const warn = discordStep?.warnings?.length ? `\n${t("tkt.closedWithWarnings", lang)}` : "";
  await interaction.editReply(`${t("ticket.reopenedConfirm", lang)}${warn}`);
}

// Deletion is destructive and irreversible — same two-step confirm pattern as
// close (handleTicketClosePrompt/Finalize above), so a stray click can't wipe
// a ticket channel.
async function handleTicketDeletePrompt(interaction, ticket, panel) {
  const lang = resolveLangSync(interaction);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket:delete-confirm:${ticket.id}`).setLabel(t("ticket.deleteConfirmYes", lang)).setStyle(4).setEmoji("🗑️"),
    new ButtonBuilder().setCustomId(`ticket:delete-cancel:${ticket.id}`).setLabel(t("ticket.closeConfirmCancel", lang)).setStyle(2)
  );

  return interaction.reply({
    embeds: [{ description: t("ticket.deleteConfirmPrompt", lang), color: DANGER }],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTicketDelete(interaction, ticket, panel) {
  const lang = await resolveLang(interaction);
  await interaction.update({
    embeds: [{ description: t("ticket.deleteScheduled", lang), color: DANGER }],
    components: [],
  }).catch(() => {});

  // Generate transcript before delete (fire-and-forget)
  api.post(`/bot/ticket/${ticket.id}/transcript`, {}).catch(() => {});

  // Backend soft-delete (ARCHIVED) + webhook TICKET_DELETE
  try {
    await api.post(`/bot/ticket/${ticket.id}/delete`, { deleterId: interaction.user.id });
  } catch { /* ignore — delete channel anyway */ }

  invalidateTicketChannel(interaction.channelId);
  setTimeout(async () => {
    await interaction.channel.delete("Ticket deleted by staff").catch(() => {});
  }, 5000);

  if (panel?.logChannelId) {
    await logTicketEvent(interaction.guild, panel.logChannelId, "DELETE", {
      ticketNumber: ticket.number, padding: panel?.counterPadding ?? 4,
      channel: interaction.channel, actor: interaction.user, color: DANGER,
    }).catch(() => {});
  }
}

// ─── Feedback rating (post-close DM) ──────────────────────────────────────────
async function handleFeedback(interaction, ticketId, rating) {
  // Гол `return` тук значеше НУЛЕВ ack: Discord показва „This interaction
  // failed" след 3 секунди, а в логовете няма нищо. Стойността идва от нашия
  // собствен customId, значи извън диапазона = наш дефект, не потребителски
  // вход — затова го логваме, вместо да го гълтаме. (Дискорджията, 07.08.2026)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    console.warn(`[feedback] невалидна оценка ${rating} за тикет ${ticketId} (customId=${interaction.customId})`);
    await interaction.deferUpdate().catch(() => {});
    return;
  }
  // deferUpdate ack-ва компонента веднага (type 6, без "loading" визуализация),
  // за да не изтече 3-секундният бюджет преди backend заявката. После editReply
  // редактира съобщението с бутоните.
  await interaction.deferUpdate().catch(() => {});
  const lang = resolveLangSync(interaction);
  try {
    await api.post(`/bot/ticket/${ticketId}/feedback`, {
      rating,
      userId: interaction.user.id,
    });
    await interaction.editReply({
      embeds: [{
        description: t("tkt.feedbackThanks", lang, { rating, stars: "⭐".repeat(rating) }),
        color: SUCCESS,
      }],
      components: [],
    });
  } catch (err) {
    await interaction.followUp({ content: t("tkt.err.generic", lang), flags: MessageFlags.Ephemeral });
  }
}

// ─── Verification handlers (v1.7) ─────────────────────────────────────────────

// Pending math challenges, kept server-side so the expected answer never
// leaves the bot (a customId is visible to the user's client).
const pendingMathChallenges = new Map(); // `${userId}:${panelId}` → { answer, expiresAt }
const MATH_CHALLENGE_TTL = 5 * 60 * 1000;

export async function handleVerificationStart(interaction, panelId) {
  // В3: нито един hop без таван пред първия отговор. Езикът е от локала на човека (синхронно),
  // панелът — от кеш с таван 2 s; при изтичане честно „опитай пак“ вместо „interaction failed“.
  const lang = resolveLangSync(interaction);
  const panel = await loadVerificationPanelCapped(panelId);
  if (!panel) {
    return interaction.reply({ content: t(panel === false ? "verify.panelNotFound" : "verify.error", lang), flags: MessageFlags.Ephemeral });
  }

  // Anti-bot: minimum account age
  if (panel.minAccountAgeDays) {
    const accountAge = Date.now() - interaction.user.createdTimestamp;
    const requiredMs = panel.minAccountAgeDays * 24 * 60 * 60 * 1000;
    if (accountAge < requiredMs) {
      return interaction.reply({
        content: t("verify.accountTooNewHere", lang, { days: panel.minAccountAgeDays }),
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
      .setTitle(t("verify.modalTitle", lang));
    const input = new TextInputBuilder()
      .setCustomId("answer")
      .setLabel(t("verify.modalQuestionLabel", lang, { question }))
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
  // Модалът вече е отговорен; defer първо, после всичко останало (В3).
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  const lang = await resolveLang(interaction);
  const challengeKey = `${interaction.user.id}:${panelId}`;
  const challenge = pendingMathChallenges.get(challengeKey);
  pendingMathChallenges.delete(challengeKey);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    return interaction.editReply({ content: t("verify.challengeExpired", lang) });
  }

  const userAnswer = interaction.fields.getTextInputValue("answer").trim();
  const correct = userAnswer === challenge.answer;

  const panel = await loadVerificationPanelCapped(panelId, 8000);
  if (!panel) return interaction.editReply({ content: t(panel === false ? "verify.panelNotFound" : "verify.error", lang) });

  await completeVerification(interaction, panel, correct, userAnswer);
}

export async function completeVerification(interaction, panel, success, answer) {
  // Defer преди backend заявката + прилагането на ролите (може да отнеме >3s).
  // Извиква се от бутон (BUTTON/REACTION) и от modal submit (MATH) — и двата
  // очакват отговор до 3s, затова ack-ваме ephemeral веднага, после editReply.
  const lang = await resolveLang(interaction);
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
    // З11: суровото err.message / текстът на бекенда не стига до човека.
    if (err?.response?.status === 429) {
      return interaction.editReply({ content: t("verify.cooldown", lang, { minutes: err.response.data?.cooldownMinutes ?? panel.cooldownMinutes ?? 5 }) });
    }
    return interaction.editReply({ content: t("verify.error", lang) });
  }

  if (!success) {
    return interaction.editReply({
      content: result.failureMessage || t("verify.wrongAnswer", lang),
    });
  }

  // Success — apply roles
  const member = interaction.member;
  // В2: вече държи всички роли за даване → нищо не се пипа. Без това свалена „Verified“ или
  // наказателна роля от `removeRoleIds` се връщаше с един клик.
  const grant = result.grantRoleIds || [];
  if (grant.length > 0 && grant.every((r) => member.roles.cache.has(r))) {
    return interaction.editReply({ content: t("verify.alreadyVerified", lang) });
  }
  const added = [];
  const failed = [];
  const botMember = interaction.guild?.members?.me;
  for (const roleId of (result.grantRoleIds || [])) {
    // Същият гард като autorole, лепкавите роли, реакциите и играта: опасна,
    // управлявана или над бота роля НЕ се дава. Без него човек само с Manage
    // Server слагаше роля с Administrator в панела и се верифицираше сам
    // (червен екип, 10.10.2026).
    const role = interaction.guild?.roles?.cache?.get(roleId)
      || await interaction.guild?.roles?.fetch(roleId).catch(() => null);
    const unsafe = roleAssignabilityReason(role, botMember);
    if (unsafe) { failed.push({ roleId, reason: unsafe }); continue; }
    try {
      await member.roles.add(roleId, "Verified via Supreme Bot");
      added.push(roleId);
    } catch (err) {
      failed.push({ roleId, reason: err.message });
    }
  }
  // В1: имаше роли за даване, а нито една не е дадена → НЕ е успех. Човекът остава заключен,
  // затова му казваме истината, а екипът получава предупреждение в лог канала.
  if (grant.length > 0 && added.length === 0) {
    await interaction.editReply({ content: t("verify.noRolesGiven", lang) });
    await postVerifyLog(interaction, result.logChannelId, {
      description: t("verify.logNoRoles", lang, { user: `<@${interaction.user.id}>`, panel: panel.name }),
      color: WARNING,
    });
    return;
  }
  for (const roleId of (result.removeRoleIds || [])) {
    await member.roles.remove(roleId, "Verified via Supreme Bot").catch(() => {});
  }

  const successMsg = result.successMessage
    || `${t("verify.defaultSuccess", lang, { user: `<@${interaction.user.id}>` })}${added.length ? t("verify.rolesGrantedSuffix", lang, { count: added.length }) : ""}`;

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

async function postVerifyLog(interaction, logChannelId, { description, color }) {
  if (!logChannelId) return;
  try {
    const logCh = await interaction.guild.channels.fetch(logChannelId).catch(() => null);
    if (logCh) await logCh.send({ embeds: [{ description, color, timestamp: new Date().toISOString() }] });
  } catch { /* лог каналът е само сигнал */ }
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
    // Sync-only locale guess (interaction.locale) — this check runs before
    // any defer, so it must stay synchronous to not eat into the 3s budget.
    message: panel.verificationDeniedMessage || t("verify.gateBlocked", resolveLangSync(interaction)),
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

export async function handleGiveawayEnter(interaction, giveawayId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const lang = await resolveLang(interaction);
  try {
    // Р1 / А4: ролите на човека се пращат ПРЕДИ записа — бекендът решава (403 ROLE_REQUIRED,
    // fail closed). Преди това записът ставаше първо и се „връщаше“ с втори toggle.
    const { data } = await api.post(`/bot/giveaway/${giveawayId}/enter`, {
      serverId: interaction.guildId,
      userId: interaction.user.id,
      memberRoleIds: [...(interaction.member?.roles?.cache?.keys?.() ?? [])].map(String),
    });

    // Refresh the giveaway message
    const { data: g } = await api.get(`/bot/giveaway/${giveawayId}`, { params: { serverId: interaction.guildId } });
    const { buildGiveawayMessage } = await import("../commands/giveaway.js");
    const { embeds, components } = buildGiveawayMessage(g, g.entryCount);
    await interaction.message.edit({ embeds, components }).catch(() => {});

    await interaction.editReply(data.entered ? t("giveaway.entered", lang) : t("giveaway.left", lang));
  } catch (err) {
    const body = err?.response?.data;
    if (err?.response?.status === 403 && body?.error === "ROLE_REQUIRED") {
      const roles = (body.missingRoleIds || body.requiredRoleIds || []).filter((r) => /^\d{17,20}$/.test(String(r))).map((r) => `<@&${r}>`).join(", ");
      return interaction.editReply(t("giveaway.rolesRequired", lang, { roles }));
    }
    await interaction.editReply(t("giveaway.error", lang)).catch(() => {});
  }
}
