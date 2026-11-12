// bot/src/commands/bait.js
// /bait setup|disable|status — канал-стръв за спам ботове (utils/bait.js).
// Вътрешните пътища към backend-а остават /bot/honeypot/* (таблицата
// honeypot_configs е от миграция v52, вече приложена на сървъра).
// Manage Server: платформено (default permissions) И runtime — операторът може
// да е отворил командата за всички през Integrations.
import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { syncBaitWarning, getBait, invalidateBait, actionLabel, permLabel, TRAP_CHANNEL_PERMS } from "../utils/bait.js";

const ACTIONS = [
  { name: "Kick (soft-ban, deletes their last hour of messages)", value: "softban" },
  { name: "Ban (deletes their last hour of messages)", value: "ban" },
  { name: "Timeout for 24 hours", value: "timeout" },
];

export default {
  data: new SlashCommandBuilder()
    .setName("bait")
    .setDescription("Bait channel that removes spam bots (Manage Server)")
    .setDescriptionLocalizations(CMD_DESC_L10N.bait)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("setup").setDescription("Set the bait (creates #bait if no channel is given)")
      .addChannelOption((o) => o.setName("channel").setDescription("Existing channel to use as bait").addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName("action").setDescription("What happens to whoever writes there (default: kick)").addChoices(...ACTIONS))
      .addChannelOption((o) => o.setName("log_channel").setDescription("Where to report who was caught").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((o) => o.setName("dm").setDescription("Tell the caught user why by DM (default: on)")))
    .addSubcommand((s) => s.setName("disable").setDescription("Turn the bait off (the channel stays)"))
    .addSubcommand((s) => s.setName("status").setDescription("Show the bait settings and how many spam bots bit")),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lang = await resolveLang(interaction);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.editReply({ content: t("bait.cmd.noPermission", lang) });
    const sub = interaction.options.getSubcommand();
    const serverId = interaction.guildId;
    try {
      if (sub === "status") return await status(interaction, lang);
      if (sub === "disable") {
        const cur = await getBait(serverId);
        if (!cur?.channelId) return interaction.editReply({ content: t("bait.cmd.notConfigured", lang) });
        await api.put(`/bot/honeypot/${serverId}`, { enabled: false, actorId: interaction.user.id });
        await syncBaitWarning(interaction.client, serverId);
        return interaction.editReply({ content: t("bait.cmd.disabled", lang) });
      }
      return await setup(interaction, lang);
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction));
    }
  },
};

async function setup(interaction, lang) {
  const guild = interaction.guild;
  const serverId = interaction.guildId;
  let channel = interaction.options.getChannel("channel");
  const log = interaction.options.getChannel("log_channel");
  const action = interaction.options.getString("action") || undefined;
  const dm = interaction.options.getBoolean("dm");
  if (channel && (channel.guildId !== serverId || !channel.isTextBased?.())) return interaction.editReply({ content: t("bait.cmd.badChannel", lang) });
  if (log && (log.guildId !== serverId || !log.isTextBased?.())) return interaction.editReply({ content: t("bait.cmd.badChannel", lang) });
  if (channel && log && channel.id === log.id) return interaction.editReply({ content: t("bait.cmd.logIsTrap", lang) });

  // Без избран канал — предишният, ако още съществува; иначе нов #bait най-горе.
  if (!channel) {
    const cur = await getBait(serverId);
    channel = cur?.channelId ? guild.channels.cache.get(cur.channelId) || null : null;
  }
  if (!channel) {
    try {
      channel = await guild.channels.create({ name: "bait", type: ChannelType.GuildText, position: 0, topic: t("bait.channelTopic", lang), reason: t("bait.reason", lang) });
    } catch {
      return interaction.editReply({ content: t("bait.cmd.createFailed", lang) });
    }
  }
  if (log && log.id === channel.id) return interaction.editReply({ content: t("bait.cmd.logIsTrap", lang) });
  const me = guild.members?.me;
  if (!me || !channel.permissionsFor(me)?.has(TRAP_CHANNEL_PERMS)) return interaction.editReply({ content: t("bait.cmd.postFailed", lang, { channel: `<#${channel.id}>` }) });

  const body = { enabled: true, channelId: channel.id, actorId: interaction.user.id };
  if (action) body.action = action;
  if (log) body.logChannelId = log.id;
  if (dm !== null && dm !== undefined) body.dmUser = dm;
  let saved;
  try {
    ({ data: saved } = await api.put(`/bot/honeypot/${serverId}`, body));
  } catch (err) {
    if (err?.response?.data?.error === "LOG_IS_TRAP") return interaction.editReply({ content: t("bait.cmd.logIsTrap", lang) });
    throw err;
  }
  const sync = await syncBaitWarning(interaction.client, serverId, saved.previous);
  if (!sync.ok) return interaction.editReply({ content: t("bait.cmd.postFailed", lang, { channel: `<#${channel.id}>` }) });
  const lines = [
    t("bait.cmd.enabled", lang, { channel: `<#${channel.id}>`, action: actionLabel(saved.config.action, lang) }),
    t("bait.cmd.tip", lang),
  ];
  if (sync.actionPermMissing) lines.push(t("bait.cmd.missingPerm", lang, { perm: permLabel(saved.config.action, lang) }));
  return interaction.editReply({ content: lines.join("\n\n") });
}

async function status(interaction, lang) {
  invalidateBait(interaction.guildId);
  const c = await getBait(interaction.guildId);
  if (!c?.channelId) return interaction.editReply({ content: t("bait.cmd.notConfigured", lang) });
  const none = t("bait.none", lang);
  return interaction.editReply({
    content: t("bait.cmd.status", lang, {
      state: t(c.enabled ? "bait.state.on" : "bait.state.off", lang),
      channel: `<#${c.channelId}>`,
      action: actionLabel(c.action, lang),
      log: c.logChannelId ? `<#${c.logChannelId}>` : none,
      dm: t(c.dmUser ? "bait.yes" : "bait.no", lang),
      count: c.caughtCount || 0,
    }),
    allowedMentions: { parse: [] },
  });
}
