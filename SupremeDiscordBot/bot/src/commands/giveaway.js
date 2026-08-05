// bot/src/commands/giveaway.js
import { MessageFlags,
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import api from "../utils/api.js";
import { checkCooldown } from "../utils/cooldowns.js";
import { friendlyError } from "../utils/friendlyError.js";
import { WARNING, MUTED } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

const COOLDOWN_SECONDS = 10;

export default {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Manage giveaways")
    .setDescriptionLocalizations(CMD_DESC_L10N.giveaway)
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
        .addStringOption((o) => o.setName("giveaway_id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s.setName("reroll")
        .setDescription("Pick new winner(s) for an ended giveaway")
        .addStringOption((o) => o.setName("giveaway_id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true))
    ),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused().toLowerCase();
    try {
      const { data } = await api.get(`/bot/guild/${interaction.guildId}/giveaways`);
      let giveaways = data || [];
      // /giveaway end пита за активни, /giveaway reroll — за приключили.
      giveaways = giveaways.filter((g) => (sub === "end" ? !g.endedAt : !!g.endedAt));
      const filtered = giveaways
        .filter((g) => g.prize.toLowerCase().includes(focused) || g.id.includes(focused))
        .slice(0, 25);
      await interaction.respond(filtered.map((g) => ({
        // label = четимо резюме, value = ПЪЛНИЯТ cuid (никога не съкращаваме value-то).
        name: `${g.prize.slice(0, 60)} — ${new Date(g.endsAt).toLocaleString()}`.slice(0, 100),
        value: g.id,
      })));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (!interaction.member.permissions.has("ManageGuild")) {
      return interaction.reply({ content: "❌ You need Manage Server permission.", flags: MessageFlags.Ephemeral });
    }

    if (sub === "start") {
      const remaining = checkCooldown("giveaway-start", interaction.user.id, COOLDOWN_SECONDS);
      if (remaining > 0) {
        return interaction.reply({ content: `⏳ Please wait ${remaining}s before starting another giveaway.`, flags: MessageFlags.Ephemeral });
      }
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
        return interaction.editReply(friendlyError(err, interaction));
      }

      const { embeds, components } = buildGiveawayMessage(giveaway, 0);
      const msg = await interaction.editReply({ embeds, components });
      await api.patch(`/bot/giveaway/${giveaway.id}/spawned`, { messageId: msg.id }).catch(() => {});
    }

    else if (sub === "end" || sub === "reroll") {
      const giveawayId = interaction.options.getString("giveaway_id");
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
        await interaction.editReply(friendlyError(err, interaction));
      }
    }
  },
};

export function buildGiveawayMessage(giveaway, entryCount) {
  const ended = !!giveaway.endedAt;
  const endsTs = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${giveaway.prize}`)
    .setColor(ended ? MUTED : WARNING);

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
