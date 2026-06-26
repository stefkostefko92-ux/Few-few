// bot/src/commands/giveaway.js
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import api from "../utils/api.js";

export default {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .addSubcommand((s) =>
      s.setName("start")
        .setDescription("Start a new giveaway")
        .addStringOption((o) => o.setName("prize").setDescription("What's being given away").setRequired(true).setMaxLength(256))
        .addIntegerOption((o) => o.setName("duration_minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(60 * 24 * 30))
        .addIntegerOption((o) => o.setName("winners").setDescription("Number of winners").setRequired(false).setMinValue(1).setMaxValue(20))
        .addStringOption((o) => o.setName("required_roles").setDescription("Comma-separated role IDs required to enter").setRequired(false))
        .addStringOption((o) => o.setName("description").setDescription("Description shown in embed").setRequired(false).setMaxLength(2000))
    )
    .addSubcommand((s) =>
      s.setName("end")
        .setDescription("End a giveaway early")
        .addStringOption((o) => o.setName("giveaway_id").setDescription("Giveaway ID").setRequired(true))
    )
    .addSubcommand((s) =>
      s.setName("reroll")
        .setDescription("Pick new winner(s) for an ended giveaway")
        .addStringOption((o) => o.setName("giveaway_id").setDescription("Giveaway ID").setRequired(true))
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (!interaction.member.permissions.has("ManageGuild")) {
      return interaction.reply({ content: "❌ You need Manage Server permission.", ephemeral: true });
    }

    if (sub === "start") {
      const prize = interaction.options.getString("prize");
      const durationMinutes = interaction.options.getInteger("duration_minutes");
      const winnerCount = interaction.options.getInteger("winners") || 1;
      const requiredRolesRaw = interaction.options.getString("required_roles") || "";
      const description = interaction.options.getString("description");
      const requiredRoleIds = requiredRolesRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000);

      await interaction.deferReply();

      let giveaway;
      try {
        const { data } = await api.post(`/bot/giveaway/create`, {
          serverId: interaction.guildId,
          creatorId: interaction.user.id,
          channelId: interaction.channelId,
          prize, description, winnerCount, endsAt, requiredRoleIds,
        });
        giveaway = data;
      } catch (err) {
        return interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }

      const { embeds, components } = buildGiveawayMessage(giveaway, 0);
      const msg = await interaction.editReply({ embeds, components });
      await api.patch(`/bot/giveaway/${giveaway.id}/spawned`, { messageId: msg.id }).catch(() => {});
    }

    else if (sub === "end" || sub === "reroll") {
      const giveawayId = interaction.options.getString("giveaway_id");
      await interaction.deferReply({ ephemeral: true });
      try {
        const { data } = await api.post(`/bot/giveaway/${giveawayId}/${sub}`, {
          actorId: interaction.user.id,
        });
        if (data.winners?.length) {
          await interaction.editReply(`✅ Winner(s): ${data.winners.map((id) => `<@${id}>`).join(", ")}`);
        } else {
          await interaction.editReply("✅ Done (no eligible entrants).");
        }
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }
  },
};

export function buildGiveawayMessage(giveaway, entryCount) {
  const ended = !!giveaway.endedAt;
  const endsTs = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(ended ? 0x9ca3af : 0xfbbf24);

  const lines = [];
  if (giveaway.description) lines.push(giveaway.description, "");

  if (ended) {
    if (giveaway.winnerIds?.length) {
      lines.push(`🏆 **Winner${giveaway.winnerIds.length > 1 ? "s" : ""}**: ${giveaway.winnerIds.map((id) => `<@${id}>`).join(", ")}`);
    } else {
      lines.push("_No eligible entrants._");
    }
  } else {
    lines.push(`⏰ Ends <t:${endsTs}:R> (<t:${endsTs}:F>)`);
    lines.push(`👥 **${entryCount}** ${entryCount === 1 ? "entry" : "entries"}`);
    lines.push(`🎯 **${giveaway.winnerCount}** winner${giveaway.winnerCount > 1 ? "s" : ""}`);
    if (giveaway.requiredRoleIds?.length) {
      lines.push(`🔒 Required roles: ${giveaway.requiredRoleIds.map((r) => `<@&${r}>`).join(" ")}`);
    }
    lines.push("", "Click **Enter** below to participate.");
  }

  embed.setDescription(lines.join("\n"));
  embed.setFooter({ text: `Giveaway ID: ${giveaway.id}` });
  embed.setTimestamp(new Date(giveaway.endsAt));

  if (ended) return { embeds: [embed], components: [] };

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:enter:${giveaway.id}`)
      .setLabel(`Enter (${entryCount})`)
      .setEmoji("🎉")
      .setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row] };
}
