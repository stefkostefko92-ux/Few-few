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
    const lang = await resolveLang(interaction);
    const settings = await getGameSettings(interaction.guildId);
    if (!settings?.enabled) return interaction.reply({ content: t("game.disabled", lang), flags: MessageFlags.Ephemeral });
    if (!settings.isPremium) return interaction.reply({ content: t("game.party.premium", lang), flags: MessageFlags.Ephemeral });
    const pair = WYR[Math.floor(Math.random() * WYR.length)];
    return interaction.reply(wyrMessage(pair, lang));
  },
};
