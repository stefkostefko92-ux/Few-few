// bot/src/commands/poll.js
import { MessageFlags, PermissionFlagsBits,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import api from "../utils/api.js";
import { checkCooldown } from "../utils/cooldowns.js";
import { friendlyError } from "../utils/friendlyError.js";
import { MUTED, BRAND } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

const COOLDOWN_SECONDS = 10;

export default {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Create a poll")
    .setDescriptionLocalizations(CMD_DESC_L10N.poll)
    // Анкетата кара БОТА да публикува съобщение — тоест текст на всеки член
    // излиза с авторитета на бота. Същата функция имаше ТРИ пътя и само този
    // беше отворен: таблото иска `requireServerAdmin`, сестринската
    // /giveaway иска ManageGuild, а /poll — само cooldown. Класът „едно
    // правило, N определения". (Одит етап 5, 12.08.2026)
    //
    // `setDefaultMemberPermissions` е ПО ПОДРАЗБИРАНЕ: собственикът може да го
    // отпусне за конкретни роли от Настройки → Интеграции, ако иска анкети от
    // модератори. Затворено по подразбиране, отваря се съзнателно.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("question").setDescription("Poll question").setRequired(true).setMaxLength(256))
    .addStringOption((o) => o.setName("options").setDescription("Comma-separated options (2-9)").setRequired(true))
    .addBooleanOption((o) => o.setName("multi_choice").setDescription("Allow voting for multiple options").setRequired(false))
    .addIntegerOption((o) => o.setName("duration_hours").setDescription("Auto-close after N hours").setRequired(false).setMinValue(1).setMaxValue(24 * 30)),

  async execute(interaction) {
    const remaining = checkCooldown("poll", interaction.user.id, COOLDOWN_SECONDS);
    if (remaining > 0) {
      return interaction.reply({ content: `⏳ Please wait ${remaining}s before creating another poll.`, flags: MessageFlags.Ephemeral });
    }

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
      return interaction.editReply(friendlyError(err, interaction));
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

  // При затворена анкета маркираме печелившата опция (най-много гласове, >0).
  // При равенство маркираме всички водачи.
  const maxCount = counts.length ? Math.max(...counts) : 0;
  const lines = poll.options.map((opt, i) => {
    const pct = total > 0 ? Math.round((counts[i] / total) * 100) : 0;
    const barLen = 20;
    const filled = Math.round((pct / 100) * barLen);
    const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
    const isWinner = poll.closedAt && maxCount > 0 && counts[i] === maxCount;
    const label = isWinner ? `👑 **${opt}**` : `**${opt}**`;
    return `${numberEmoji[i]} ${label}\n\`${bar}\` ${counts[i]} vote${counts[i] === 1 ? "" : "s"} (${pct}%)`;
  }).join("\n\n");

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${poll.question}`)
    .setDescription(lines + (poll.closesAt ? `\n\n⏰ Closes <t:${Math.floor(new Date(poll.closesAt).getTime() / 1000)}:R>` : ""))
    .setColor(poll.closedAt ? MUTED : BRAND)
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
