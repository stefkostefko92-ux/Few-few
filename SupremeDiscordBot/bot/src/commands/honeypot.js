// bot/src/commands/honeypot.js
// /honeypot setup|disable|status — капан за спам ботове (utils/honeypot.js).
// Manage Server: платформено (default permissions) И runtime — операторът може
// да е отворил командата за всички през Integrations.
import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { syncHoneypotWarning, getHoneypot, invalidateHoneypot, actionLabel, permLabel, TRAP_CHANNEL_PERMS } from "../utils/honeypot.js";

const ACTIONS = [
  { name: "Kick (soft-ban, deletes their last hour of messages)", value: "softban" },
  { name: "Ban (deletes their last hour of messages)", value: "ban" },
  { name: "Timeout for 24 hours", value: "timeout" },
];

export default {
  data: new SlashCommandBuilder()
    .setName("honeypot")
    .setDescription("Trap channel that removes spam bots (Manage Server)")
    .setDescriptionLocalizations(CMD_DESC_L10N.honeypot)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("setup").setDescription("Turn the honeypot on (creates #honeypot if no channel is given)")
      .addChannelOption((o) => o.setName("channel").setDescription("Existing channel to use as the trap").addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName("action").setDescription("What happens to whoever writes there (default: kick)").addChoices(...ACTIONS))
      .addChannelOption((o) => o.setName("log_channel").setDescription("Where to report who was caught").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addBooleanOption((o) => o.setName("dm").setDescription("Tell the caught user why by DM (default: on)")))
    .addSubcommand((s) => s.setName("disable").setDescription("Turn the honeypot off (the channel stays)"))
    .addSubcommand((s) => s.setName("status").setDescription("Show the honeypot settings and how many were caught")),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lang = await resolveLang(interaction);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.editReply({ content: t("honeypot.cmd.noPermission", lang) });
    const sub = interaction.options.getSubcommand();
    const serverId = interaction.guildId;
    try {
      if (sub === "status") return await status(interaction, lang);
      if (sub === "disable") {
        const cur = await getHoneypot(serverId);
        if (!cur?.channelId) return interaction.editReply({ content: t("honeypot.cmd.notConfigured", lang) });
        await api.put(`/bot/honeypot/${serverId}`, { enabled: false, actorId: interaction.user.id });
        await syncHoneypotWarning(interaction.client, serverId);
        return interaction.editReply({ content: t("honeypot.cmd.disabled", lang) });
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
  if (channel && (channel.guildId !== serverId || !channel.isTextBased?.())) return interaction.editReply({ content: t("honeypot.cmd.badChannel", lang) });
  if (log && (log.guildId !== serverId || !log.isTextBased?.())) return interaction.editReply({ content: t("honeypot.cmd.badChannel", lang) });
  if (channel && log && channel.id === log.id) return interaction.editReply({ content: t("honeypot.cmd.logIsTrap", lang) });

  // Без избран канал — предишният, ако още съществува; иначе нов #honeypot най-горе.
  if (!channel) {
    const cur = await getHoneypot(serverId);
    channel = cur?.channelId ? guild.channels.cache.get(cur.channelId) || null : null;
  }
  if (!channel) {
    try {
      channel = await guild.channels.create({ name: "honeypot", type: ChannelType.GuildText, position: 0, topic: t("honeypot.channelTopic", lang), reason: t("honeypot.reason", lang) });
    } catch {
      return interaction.editReply({ content: t("honeypot.cmd.createFailed", lang) });
    }
  }
  if (log && log.id === channel.id) return interaction.editReply({ content: t("honeypot.cmd.logIsTrap", lang) });
  const me = guild.members?.me;
  if (!me || !channel.permissionsFor(me)?.has(TRAP_CHANNEL_PERMS)) return interaction.editReply({ content: t("honeypot.cmd.postFailed", lang, { channel: `<#${channel.id}>` }) });

  const body = { enabled: true, channelId: channel.id, actorId: interaction.user.id };
  if (action) body.action = action;
  if (log) body.logChannelId = log.id;
  if (dm !== null && dm !== undefined) body.dmUser = dm;
  let saved;
  try {
    ({ data: saved } = await api.put(`/bot/honeypot/${serverId}`, body));
  } catch (err) {
    if (err?.response?.data?.error === "LOG_IS_TRAP") return interaction.editReply({ content: t("honeypot.cmd.logIsTrap", lang) });
    throw err;
  }
  const sync = await syncHoneypotWarning(interaction.client, serverId, saved.previous);
  if (!sync.ok) return interaction.editReply({ content: t("honeypot.cmd.postFailed", lang, { channel: `<#${channel.id}>` }) });
  const lines = [
    t("honeypot.cmd.enabled", lang, { channel: `<#${channel.id}>`, action: actionLabel(saved.config.action, lang) }),
    t("honeypot.cmd.tip", lang),
  ];
  if (sync.actionPermMissing) lines.push(t("honeypot.cmd.missingPerm", lang, { perm: permLabel(saved.config.action, lang) }));
  return interaction.editReply({ content: lines.join("\n\n") });
}

async function status(interaction, lang) {
  invalidateHoneypot(interaction.guildId);
  const c = await getHoneypot(interaction.guildId);
  if (!c?.channelId) return interaction.editReply({ content: t("honeypot.cmd.notConfigured", lang) });
  const none = t("honeypot.none", lang);
  return interaction.editReply({
    content: t("honeypot.cmd.status", lang, {
      state: t(c.enabled ? "honeypot.state.on" : "honeypot.state.off", lang),
      channel: `<#${c.channelId}>`,
      action: actionLabel(c.action, lang),
      log: c.logChannelId ? `<#${c.logChannelId}>` : none,
      dm: t(c.dmUser ? "honeypot.yes" : "honeypot.no", lang),
      count: c.caughtCount || 0,
    }),
    allowedMentions: { parse: [] },
  });
}
