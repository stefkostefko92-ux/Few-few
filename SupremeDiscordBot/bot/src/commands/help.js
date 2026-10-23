// bot/src/commands/help.js
// /help на езика на човека (23.10.2026): езикът е като навсякъде в бота —
// клиентът на Discord, после езикът на сървъра, после английски (resolveLang).
// Каталогът е един (utils/commandsCatalog.js); преводите са речници по
// английските имена (utils/commandsCatalogL10n/) — същите като в таблото.
// Стойностите на изборите и на падащото меню остават английските имена:
// по тях се намира категорията, независимо от езика.
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { COMMAND_CATALOG } from "../utils/commandsCatalog.js";
import { BRAND } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { catalogFor, CATALOG_DICTS, DISCORD_LOCALE } from "../utils/commandsCatalogL10n/index.js";
import { t, resolveLang } from "../i18n/index.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://supremebot.carbonstealth.eu";
const SUPPORT_URL = process.env.SUPPORT_URL || "https://supremebot.carbonstealth.eu/support";
const STATUS_URL = process.env.STATUS_URL || "https://supremebot.carbonstealth.eu/status";

// Имената на изборите в Discord — преведени (name_localizations), стойността е английското име.
const choiceL10n = (category) => Object.fromEntries(
  Object.entries(CATALOG_DICTS).map(([lang, d]) => [DISCORD_LOCALE[lang], (d.categories[category]?.[0] || category).slice(0, 100)]),
);

export default {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show every command the bot supports and what it does.")
    .setDescriptionLocalizations(CMD_DESC_L10N.help)
    .addStringOption((o) =>
      o.setName("category")
        .setDescription("Filter by category")
        .setRequired(false)
        .addChoices(
          ...COMMAND_CATALOG.map((c) => ({ name: c.category, value: c.category, name_localizations: choiceL10n(c.category) }))
        )
    ),

  async execute(interaction) {
    const lang = await resolveLang(interaction);
    const catalog = catalogFor(lang);
    const filterCategory = interaction.options.getString("category");

    if (filterCategory) {
      const cat = catalog.find((c) => c.key === filterCategory);
      if (!cat) {
        return interaction.reply({ content: t("error.categoryNotFound", lang), flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ embeds: [buildCategoryEmbed(cat, lang)], components: [buildSelect(catalog, lang, cat.key), buildLinkRow(lang)], flags: MessageFlags.Ephemeral });
    }

    // Default: overview embed with all categories
    return interaction.reply({ embeds: [buildOverviewEmbed(catalog, lang)], components: [buildSelect(catalog, lang), buildLinkRow(lang)], flags: MessageFlags.Ephemeral });
  },
};

export function buildLinkRow(lang) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("help.btnDashboard", lang)).setURL(DASHBOARD_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("help.btnSupport", lang)).setURL(SUPPORT_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t("help.btnStatus", lang)).setURL(STATUS_URL),
  );
}

export function buildOverviewEmbed(catalog, lang) {
  const embed = new EmbedBuilder()
    .setTitle(t("help.title", lang))
    .setColor(BRAND)
    .setDescription(t("help.intro", lang));

  catalog.forEach((cat) => {
    const cmdCount = cat.commands.length;
    const dashCount = cat.dashboardOnly.length;
    // Етикет отпред — без множествено число („3 commands“), което не се превежда.
    const lines = [];
    if (cmdCount) lines.push(t("help.countCommands", lang, { n: cmdCount }));
    if (dashCount) lines.push(t("help.countDashboard", lang, { n: dashCount }));
    embed.addFields({
      name: `${cat.icon} ${cat.category}`,
      value: `${cat.description}\n_${lines.join(" · ") || t("help.dashboardOnlyCat", lang)}_`.slice(0, 1024),
      inline: false,
    });
  });

  embed.setFooter({ text: t("help.tip", lang) });
  return embed;
}

/** Embed за една категория — същият за /help category:… и за падащото меню. */
export function buildCategoryEmbed(cat, lang) {
  const embed = new EmbedBuilder()
    .setTitle(`${cat.icon} ${cat.category}`)
    .setColor(BRAND)
    .setDescription(cat.description);

  cat.commands.forEach((cmd) => {
    const body = [
      `**${t("help.usage", lang)}**: \`${cmd.signature}\``,
      cmd.description,
      cmd.permission ? `_${t("help.permission", lang)}: ${cmd.permission}_` : null,
      cmd.dashboard ? `🖥️ **${t("help.dashboard", lang)}**: ${cmd.dashboard}` : null,
    ].filter(Boolean).join("\n");
    embed.addFields({ name: cmd.name, value: body.slice(0, 1024), inline: false });
  });

  cat.dashboardOnly.forEach((item) => {
    embed.addFields({
      name: `🖥️ ${item.feature} (${t("help.dashboard", lang)})`.slice(0, 256),
      value: `${item.description}\n_${item.dashboard}_`.slice(0, 1024),
      inline: false,
    });
  });

  if (!cat.commands.length && !cat.dashboardOnly.length) {
    embed.addFields({ name: "—", value: t("help.noCommands", lang), inline: false });
  }

  return embed;
}

export function buildSelect(catalog, lang, current) {
  const currentName = catalog.find((c) => c.key === current)?.category;
  const menu = new StringSelectMenuBuilder()
    .setCustomId("help:category")
    .setPlaceholder(currentName ? t("help.current", lang, { name: currentName }).slice(0, 150) : t("help.browse", lang))
    .addOptions(
      catalog.slice(0, 25).map((c) => ({
        label: c.category.slice(0, 100),
        value: c.key,
        description: c.description.slice(0, 100),
        emoji: c.icon,
        default: c.key === current,
      }))
    );
  return new ActionRowBuilder().addComponents(menu);
}
