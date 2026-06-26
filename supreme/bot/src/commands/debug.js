// bot/src/commands/debug.js
import { SlashCommandBuilder, PermissionsBitField } from "discord.js";
import api from "../utils/api.js";

export default {
  data: new SlashCommandBuilder()
    .setName("debug")
    .setDescription("Check the bot's permissions and status in this server"),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const me = guild.members.me;

    // Required permissions for ticket operations
    const required = [
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.ManageMessages,
      PermissionsBitField.Flags.EmbedLinks,
      PermissionsBitField.Flags.AttachFiles,
      PermissionsBitField.Flags.ReadMessageHistory,
      PermissionsBitField.Flags.CreatePrivateThreads,
      PermissionsBitField.Flags.ManageThreads,
    ];

    const requiredNames = [
      "View Channels", "Send Messages", "Manage Channels", "Manage Roles",
      "Manage Messages", "Embed Links", "Attach Files", "Read Message History",
      "Create Private Threads", "Manage Threads",
    ];

    const perms = me.permissions;
    const results = required.map((p, i) => ({
      name: requiredNames[i],
      has: perms.has(p),
    }));

    const missing = results.filter((r) => !r.has);
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
        "To fix: re-invite the bot from the dashboard, OR edit its role in Server Settings → Roles."
      );
    }

    await interaction.editReply({
      embeds: [{
        title: "🔧 Bot Debug Info",
        description: lines.join("\n"),
        color: missing.length === 0 ? 0x4ade80 : 0xfbbf24,
        timestamp: new Date().toISOString(),
      }],
    });
  },
};
