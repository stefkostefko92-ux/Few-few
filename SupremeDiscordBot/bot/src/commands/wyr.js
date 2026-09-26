// bot/src/commands/wyr.js
// v50 — Server Season, етап 3: /wyr — „Would you rather“ с два бутона; гласовете
// се броят в паметта (utils/minigames.js). SFW банк (data/partyBanks.js). Premium.
import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { t, resolveLang } from "../i18n/index.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { getGameSettings } from "../utils/game.js";
import { wyrMessage } from "../utils/minigames.js";
import { WYR } from "../data/partyBanks.js";

export default {
  data: new SlashCommandBuilder()
    .setName("wyr")
    .setDescription("Would you rather… — a quick two-choice question for the channel")
    .setDescriptionLocalizations(CMD_DESC_L10N.wyr)
    .setDMPermission(false),
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
    const pair = WYR[Math.floor(Math.random() * WYR.length)];
    return interaction.editReply(wyrMessage(pair, lang));
  },
};
