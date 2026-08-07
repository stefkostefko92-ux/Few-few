// bot/src/commands/debug.js
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { checkBotPermissions, reinviteUrl } from "../utils/permissionCheck.js";
import { SUCCESS, WARNING } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Check the bot's permissions and status in this server")
    .setDescriptionLocalizations(CMD_DESC_L10N.debug)
    // Нямаше НИКАКВА авторизация, а commandsCatalog.js твърдеше „Manage Server“.
    // Всеки член виждаше вътрешна диагностика: достижим ли е backend-ът, кои
    // права липсват и линк за повторна покана. Разминаването документация↔код е
    // и втори дефект: каталогът лъжеше (Изпитателят, 07.08.2026).
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const { me, results, missing } = checkBotPermissions(guild);
    const highestRolePos = me.roles.highest.position;

    // Backend reachability
    let backendOk = false;
    try {
      await api.get(`/bot/server/${guild.id}`);
      backendOk = true;
    } catch (err) {
      // 404 just means the server isn't registered yet — backend still reachable.
      // Anything else (network, 401, 500) is a real reachability problem.
      backendOk = err?.response?.status === 404;
    }

    const lines = [
      `**Bot user**: ${me.user.tag}`,
      `**Bot ID**: ${me.id}`,
      `**Highest role position**: ${highestRolePos}`,
      `**Backend reachable**: ${backendOk ? "✅" : "❌"}`,
      "",
      "**Permissions**:",
      ...results.map((r) => `${r.has ? "✅" : "❌"} ${r.name}`),
    ];

    if (missing.length > 0) {
      lines.push(
        "",
        `⚠️ **Missing ${missing.length} permission(s)**. The bot won't function correctly without them.`,
        `To fix: [re-invite the bot with the correct permissions](${reinviteUrl(interaction.client.user.id)}), OR edit its role in Server Settings → Roles.`
      );
    }

    await interaction.editReply({
      embeds: [{
        title: "🔧 Bot Debug Info",
        description: lines.join("\n"),
        color: missing.length === 0 ? SUCCESS : WARNING,
        timestamp: new Date().toISOString(),
      }],
    });
  },
};
