// bot/src/commands/stats.js
// v2.9 — In-Discord analytics snapshot. The dashboard's analytics.js routes
// require a session (requireAuth+loadUser), which the bot doesn't have — this
// calls the bot-secret mirror added at GET /api/bot/stats/:serverId.
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import api from "../utils/api.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show ticket + staff performance stats for this server")
    .setDescriptionLocalizations(CMD_DESC_L10N.stats)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let stats;
    try {
      const { data } = await api.get(`/bot/stats/${interaction.guildId}`);
      stats = data;
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction));
    }

    const topStaffLines = (stats.topStaff30d || []).length
      ? stats.topStaff30d.map((s, i) => `${i + 1}. <@${s.userId}> — **${s.closed}** closed`).join("\n")
      : "_No claimed/closed tickets in the last 30 days._";

    const avgFeedback = stats.avgFeedback30d != null
      ? `${stats.avgFeedback30d} / 5 ⭐ (${stats.feedbackCount30d} rating${stats.feedbackCount30d === 1 ? "" : "s"})`
      : "_No feedback ratings in the last 30 days._";

    const embed = new EmbedBuilder()
      .setTitle("📊 Server Stats")
      .setColor(BRAND)
      .addFields(
        { name: "Open tickets (now)", value: String(stats.open?.total ?? 0), inline: true },
        { name: "Opened (7d)", value: String(stats.tickets?.opened7d ?? 0), inline: true },
        { name: "Closed (7d)", value: String(stats.tickets?.closed7d ?? 0), inline: true },
        { name: "Opened (30d)", value: String(stats.tickets?.opened30d ?? 0), inline: true },
        { name: "Closed (30d)", value: String(stats.tickets?.closed30d ?? 0), inline: true },
        { name: "Avg. feedback (30d)", value: avgFeedback, inline: true },
        { name: "🏆 Top staff (30d, by tickets closed)", value: topStaffLines, inline: false },
      )
      .setTimestamp(new Date());

    await interaction.editReply({ embeds: [embed] });
  },
};
