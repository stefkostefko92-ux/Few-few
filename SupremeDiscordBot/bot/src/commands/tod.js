// bot/src/commands/tod.js
// v50 — Server Season, етап 3: /tod truth | dare — SFW банки (data/partyBanks.js),
// 13+; нищо извън стаята/Discord, нищо лично. Premium.
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { t, resolveLang } from "../i18n/index.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { getGameSettings } from "../utils/game.js";
import { WARNING, INFO } from "../utils/colors.js";
import { TRUTH, DARE } from "../data/partyBanks.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tod")
    .setDescription("Truth or dare — a random prompt for you")
    .setDescriptionLocalizations(CMD_DESC_L10N.tod)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("truth").setDescription("A question you answer honestly"))
    .addSubcommand((s) => s.setName("dare").setDescription("A small challenge in the channel")),
  async execute(interaction) {
    // Две мрежови стъпки (език + настройки) не се побират надеждно в 3-секундния
    // прозорец на Discord → първо публичен defer; при отказ публичният отговор се
    // маха и остава лична бележка (одит на Дискорджията 25.09.2026).
    await interaction.deferReply();
    const [lang, settings] = await Promise.all([resolveLang(interaction), getGameSettings(interaction.guildId)]);
    const refuse = async (key) => {
      await interaction.deleteReply().catch(() => {});
      return interaction.followUp({ content: t(key, lang), flags: MessageFlags.Ephemeral });
    };
    if (!settings?.enabled) return refuse("game.disabled");
    if (!settings.isPremium) return refuse("game.party.premium");
    const dare = interaction.options.getSubcommand() === "dare";
    const bank = dare ? DARE : TRUTH;
    const prompt = bank[Math.floor(Math.random() * bank.length)];
    const embed = new EmbedBuilder().setColor(dare ? WARNING : INFO)
      .setTitle(t(dare ? "game.tod.dare" : "game.tod.truth", lang, { user: interaction.user.displayName || interaction.user.username }))
      .setDescription(prompt);
    return interaction.editReply({ embeds: [embed] });
  },
};
