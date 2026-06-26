// bot/src/commands/help.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { COMMAND_CATALOG } from "../utils/commandsCatalog.js";

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show every command the bot supports and what it does.")
    .addStringOption((o) =>
      o.setName("category")
        .setDescription("Filter by category")
        .setRequired(false)
        .addChoices(
          ...COMMAND_CATALOG.map((c) => ({ name: c.category, value: c.category }))
        )
    ),

  async execute(interaction) {
    const filterCategory = interaction.options.getString("category");

    if (filterCategory) {
      const cat = COMMAND_CATALOG.find((c) => c.category === filterCategory);
      if (!cat) {
        return interaction.reply({ content: "❌ Category not found.", ephemeral: true });
      }
      return interaction.reply({ embeds: [buildCategoryEmbed(cat)], components: [buildSelect(filterCategory)], ephemeral: true });
    }

    // Default: overview embed with all categories
    return interaction.reply({ embeds: [buildOverviewEmbed()], components: [buildSelect()], ephemeral: true });
  },
};

function buildOverviewEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("📖 Command Reference")
    .setColor(0x00e5ff)
    .setDescription(
      "Select a category below to see commands, or use `/help category:<name>`.\n\n" +
      "Everything you can do with slash commands is **also available via the dashboard** at your server's control panel."
    );

  COMMAND_CATALOG.forEach((cat) => {
    const cmdCount = (cat.commands || []).length;
    const dashCount = (cat.dashboardOnly || []).length;
    const lines = [];
    if (cmdCount) lines.push(`${cmdCount} command${cmdCount === 1 ? "" : "s"}`);
    if (dashCount) lines.push(`${dashCount} dashboard-only feature${dashCount === 1 ? "" : "s"}`);
    embed.addFields({
      name: `${cat.icon} ${cat.category}`,
      value: `${cat.description}\n_${lines.join(" · ") || "Dashboard only"}_`,
      inline: false,
    });
  });

  embed.setFooter({ text: "Tip: use the dropdown below or /help category:<name>" });
  return embed;
}

function buildCategoryEmbed(cat) {
  const embed = new EmbedBuilder()
    .setTitle(`${cat.icon} ${cat.category}`)
    .setColor(0x00e5ff)
    .setDescription(cat.description);

  (cat.commands || []).forEach((cmd) => {
    const body = [
      `**Usage**: \`${cmd.signature}\``,
      cmd.description,
      cmd.permission ? `_Permission: ${cmd.permission}_` : null,
      cmd.dashboard ? `🖥️ **Dashboard**: ${cmd.dashboard}` : null,
    ].filter(Boolean).join("\n");
    embed.addFields({ name: cmd.name, value: body, inline: false });
  });

  (cat.dashboardOnly || []).forEach((item) => {
    embed.addFields({
      name: `🖥️ ${item.feature} (dashboard)`,
      value: `${item.description}\n_${item.dashboard}_`,
      inline: false,
    });
  });

  if (!(cat.commands || []).length && !(cat.dashboardOnly || []).length) {
    embed.addFields({ name: "—", value: "No commands in this category yet.", inline: false });
  }

  return embed;
}

function buildSelect(current) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("help:category")
    .setPlaceholder(current ? `Current: ${current}` : "Browse by category…")
    .addOptions(
      COMMAND_CATALOG.slice(0, 25).map((c) => ({
        label: c.category,
        value: c.category,
        description: c.description.slice(0, 100),
        emoji: c.icon,
        default: c.category === current,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}
