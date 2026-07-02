// bot/src/commands/poll.js
import { MessageFlags,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import api from "../utils/api.js";

export default {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll")
    .addStringOption((o) => o.setName("question").setDescription("Poll question").setRequired(true).setMaxLength(256))
    .addStringOption((o) => o.setName("options").setDescription("Comma-separated options (2-9)").setRequired(true))
    .addBooleanOption((o) => o.setName("multi_choice").setDescription("Allow voting for multiple options").setRequired(false))
    .addIntegerOption((o) => o.setName("duration_hours").setDescription("Auto-close after N hours").setRequired(false).setMinValue(1).setMaxValue(24 * 30)),

  async execute(interaction) {
    const question = interaction.options.getString("question");
    const optionsRaw = interaction.options.getString("options");
    const multiChoice = interaction.options.getBoolean("multi_choice") || false;
    const durationHours = interaction.options.getInteger("duration_hours");

    const options = optionsRaw.split(",").map((o) => o.trim()).filter(Boolean).slice(0, 9);
    if (options.length < 2) {
      return interaction.reply({ content: "❌ Provide at least 2 options separated by commas.", flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    const closesAt = durationHours ? new Date(Date.now() + durationHours * 3600 * 1000) : null;

    let poll;
    try {
      const { data } = await api.post(`/bot/poll/create`, {
        serverId: interaction.guildId,
        creatorId: interaction.user.id,
        channelId: interaction.channelId,
        question, options, multiChoice, closesAt,
      });
      poll = data;
    } catch (err) {
      return interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
    }

    const { embeds, components } = buildPollMessage(poll, options.map(() => 0));
    const msg = await interaction.editReply({ embeds, components });

    // Save Discord message ID back to backend
    await api.patch(`/bot/poll/${poll.id}/spawned`, { messageId: msg.id }).catch(() => {});
  },
};

export function buildPollMessage(poll, counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  const numberEmoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

  const lines = poll.options.map((opt, i) => {
    const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
    const barLen = 20;
    const filled = Math.round((pct / 100) * barLen);
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
    return `${numberEmoji[i]} **${opt}**\n\`${bar}\` ${counts[i]} vote${counts[i] === 1 ? "" : "s"} (${pct}%)`;
  }).join("\n\n");

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.question}`)
    .setDescription(lines + (poll.closesAt ? `\n\n⏰ Closes <t:${Math.floor(new Date(poll.closesAt).getTime() / 1000)}:R>` : ""))
    .setColor(poll.closedAt ? 0x9ca3af : 0x00e5ff)
    .setFooter({ text: poll.closedAt ? "Poll closed" : poll.multiChoice ? "Multiple choice" : "Single choice" })
    .setTimestamp();

  if (poll.closedAt) {
    return { embeds: [embed], components: [] };
  }

  // Buttons — max 5 per row, max 2 rows for 9 options
  const rows = [];
  for (let i = 0; i < poll.options.length; i += 5) {
    const row = new ActionRowBuilder().addComponents(
      poll.options.slice(i, i + 5).map((_, localI) =>
        new ButtonBuilder()
          .setCustomId(`poll:${poll.id}:${i + localI}`)
          .setLabel(numberEmoji[i + localI])
          .setStyle(ButtonStyle.Secondary)
      )
    );
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}
