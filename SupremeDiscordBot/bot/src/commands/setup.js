// bot/src/commands/setup.js
import {
  MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  RoleSelectMenuBuilder, ChannelSelectMenuBuilder,
} from "discord.js";
import api from "../utils/api.js";
import { buildPanelMessage } from "../utils/embed.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND, SUCCESS } from "../utils/colors.js";
import { t, resolveLang } from "../i18n/index.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://supreme.carbonstealth.eu";

export default {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Server setup commands")
    .setDescriptionLocalizations(CMD_DESC_L10N.setup)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("sync")
        .setDescription("Force-sync all panels and forms from the dashboard")
    )
    .addSubcommand((sub) =>
      sub.setName("wizard")
        .setDescription("Interactive quick-start wizard — support roles, ticket category, log channel")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "wizard") {
      return startSetupWizard(interaction);
    }

    // sub === "sync"
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      // Fetch fresh server config from API
      const { data: server } = await api.get(`/bot/server/${interaction.guildId}`);

      // Re-post all spawned panels
      let updated = 0;
      for (const panel of server.panels || []) {
        if (panel.channelId && panel.messageId) {
          try {
            const channel = interaction.guild.channels.cache.get(panel.channelId);
            if (!channel) continue;
            const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
            if (!msg) continue;

            const { embeds, components } = buildPanelMessage(panel);
            await msg.edit({ embeds, components });
            updated++;
          } catch (e) {
            console.error(`Failed to update panel ${panel.id}:`, e.message);
          }
        }
      }

      const lang = await resolveLang(interaction);
      await interaction.editReply(t("setup.syncComplete", lang, { count: updated }));
    } catch (err) {
      await interaction.editReply(friendlyError(err, interaction));
    }
  },
};

// ─── Quick Setup wizard (4 steps, all ephemeral) ──────────────────────────────
// Session state lives in-memory keyed by `${guildId}:${userId}` — the wizard is
// a short-lived, single-user flow, so no Redis needed (form sessions use Redis
// because they cross DM/bot-restart boundaries; this doesn't).
const wizardSessions = new Map(); // key → { roleIds, categoryId, logChannelId, expiresAt }
const WIZARD_TTL = 10 * 60 * 1000; // 10 минути

function sessionKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function getSession(interaction) {
  const key = sessionKey(interaction);
  const s = wizardSessions.get(key);
  if (s && s.expiresAt > Date.now()) return s;
  const fresh = { roleIds: [], categoryId: null, logChannelId: null, expiresAt: Date.now() + WIZARD_TTL };
  wizardSessions.set(key, fresh);
  return fresh;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of wizardSessions) if (v.expiresAt <= now) wizardSessions.delete(k);
}, 60_000).unref();

/**
 * Entry point — triggered by `/setup wizard` AND the `setup:start` button
 * posted in the guildCreate welcome message. Both paths need the same
 * server-side ManageGuild check: the button isn't gated by
 * setDefaultMemberPermissions the way the slash subcommand is.
 */
export async function startSetupWizard(interaction) {
  const lang = await resolveLang(interaction);
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    const payload = { content: t("setup.noPermission", lang), flags: MessageFlags.Ephemeral };
    return interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
  }

  wizardSessions.delete(sessionKey(interaction));
  const step1 = buildStep1(lang);
  return interaction.reply({ ...step1, flags: MessageFlags.Ephemeral });
}

/**
 * Routes every `setup:wizard:*` component interaction (role select, channel
 * selects, skip/finish buttons) to the right step.
 */
export async function handleSetupComponent(interaction) {
  const lang = await resolveLang(interaction);
  if (!interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: t("setup.noPermissionShort", lang), flags: MessageFlags.Ephemeral });
  }

  const session = getSession(interaction);
  const id = interaction.customId;

  if (id === "setup:wizard:roles") {
    session.roleIds = interaction.values || [];
    return interaction.update(buildStep2(lang));
  }

  if (id === "setup:wizard:category") {
    session.categoryId = interaction.values?.[0] || null;
    return interaction.update(buildStep3(lang));
  }
  if (id === "setup:wizard:category:skip") {
    return interaction.update(buildStep3(lang));
  }

  if (id === "setup:wizard:log") {
    session.logChannelId = interaction.values?.[0] || null;
    return interaction.update(buildStep4(interaction, session, lang));
  }
  if (id === "setup:wizard:log:skip") {
    return interaction.update(buildStep4(interaction, session, lang));
  }

  if (id === "setup:wizard:finish") {
    wizardSessions.delete(sessionKey(interaction));
    return interaction.update({
      embeds: [{
        title: t("setup.done.title", lang),
        description: t("setup.done.body", lang),
        color: SUCCESS,
      }],
      components: [],
    });
  }
}

function progressFooter(step) {
  return { text: `Quick Setup · Step ${step}/4` };
}

function buildStep1(lang) {
  const select = new RoleSelectMenuBuilder()
    .setCustomId("setup:wizard:roles")
    .setPlaceholder("Select support role(s) — leave empty to skip")
    .setMinValues(0)
    .setMaxValues(5);

  return {
    embeds: [{
      title: t("setup.step1.title", lang),
      description: t("setup.step1.desc", lang),
      color: BRAND,
      footer: progressFooter(1),
    }],
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

function buildStep2(lang) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId("setup:wizard:category")
    .setPlaceholder("Select a category for open tickets")
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(1)
    .setMaxValues(1);

  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup:wizard:category:skip").setLabel(t("setup.skipButton", lang)).setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [{
      title: t("setup.step1.title", lang),
      description: t("setup.step2.desc", lang),
      color: BRAND,
      footer: progressFooter(2),
    }],
    components: [new ActionRowBuilder().addComponents(select), skipRow],
  };
}

function buildStep3(lang) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId("setup:wizard:log")
    .setPlaceholder("Select a log channel (optional)")
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(0)
    .setMaxValues(1);

  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("setup:wizard:log:skip").setLabel(t("setup.skipButton", lang)).setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [{
      title: t("setup.step1.title", lang),
      description: t("setup.step3.desc", lang),
      color: BRAND,
      footer: progressFooter(3),
    }],
    components: [new ActionRowBuilder().addComponents(select), skipRow],
  };
}

function buildStep4(interaction, session, lang) {
  const summary = [
    `**Support roles**: ${session.roleIds.length ? session.roleIds.map((r) => `<@&${r}>`).join(", ") : "_none selected_"}`,
    `**Ticket category**: ${session.categoryId ? `<#${session.categoryId}>` : "_none selected_"}`,
    `**Log channel**: ${session.logChannelId ? `<#${session.logChannelId}>` : "_none selected_"}`,
  ].join("\n");

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Create Panel on Dashboard")
      .setURL(`${DASHBOARD_URL}/dashboard/${interaction.guildId}/panels`),
    new ButtonBuilder().setCustomId("setup:wizard:finish").setLabel(t("setup.doneButton", lang)).setStyle(ButtonStyle.Success),
  );

  return {
    embeds: [{
      title: t("setup.step4.title", lang),
      description: `${summary}\n\n${t("setup.step4.body", lang)}`,
      color: BRAND,
      footer: progressFooter(4),
    }],
    components: [row],
  };
}
