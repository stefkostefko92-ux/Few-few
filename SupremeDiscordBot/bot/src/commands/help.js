// bot/src/commands/help.js
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { COMMAND_CATALOG } from "../utils/commandsCatalog.js";
import { BRAND } from "../utils/colors.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://supreme.carbonstealth.eu";
const SUPPORT_URL = process.env.SUPPORT_URL || "https://supreme.carbonstealth.eu/support";
const STATUS_URL = process.env.STATUS_URL || "https://supreme.carbonstealth.eu/status";

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
        return interaction.reply({ content: "❌ Category not found.", flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [buildCategoryEmbed(cat)], components: [buildSelect(filterCategory), buildLinkRow()], flags: MessageFlags.Ephemeral });
    }

    // Default: overview embed with all categories
    return interaction.reply({ embeds: [buildOverviewEmbed()], components: [buildSelect(), buildLinkRow()], flags: MessageFlags.Ephemeral });
  },
};

function buildLinkRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Dashboard").setURL(DASHBOARD_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Support").setURL(SUPPORT_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Status").setURL(STATUS_URL),
  );
}

function buildOverviewEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("📖 Command Reference")
    .setColor(BRAND)
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
    .setColor(BRAND)
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
