// bot/src/commands/daily.js
// v50 — Server Season: дневната награда (искри + малко XP). Streak: всеки
// следващ ден в 48-часовия прозорец го вдига; от 7 дни нагоре искрите са ×2.
import { MessageFlags, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND, MUTED } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { applyLevelUp } from "../utils/game.js";

export default {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily sparks (Server Season)")
    .setDescriptionLocalizations(CMD_DESC_L10N.daily)
    .setDMPermission(false),
  async execute(interaction) {
    const lang = await resolveLang(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let data;
    try {
      ({ data } = await api.post("/bot/game/daily", { serverId: interaction.guildId, userId: interaction.user.id }));
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === "GAME_DISABLED") return interaction.editReply({ content: t("game.disabled", lang) });
      if (code === "DAILY_COOLDOWN") {
        const ms = Number(err.response.data.retryInMs) || 0;
        const h = Math.floor(ms / 3600000), m = Math.ceil((ms % 3600000) / 60000);
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(MUTED).setDescription(t("game.daily.wait", lang, { hours: h, minutes: m, streak: err.response.data.streak ?? 0 }))],
        });
      }
      return interaction.editReply(friendlyError(err, interaction));
    }
    const embed = new EmbedBuilder()
      .setColor(BRAND)
      .setTitle(t("game.daily.title", lang))
      .setDescription(t(data.doubled ? "game.daily.claimedDoubled" : "game.daily.claimed", lang, { sparks: data.sparks, xp: data.xp, streak: data.streak, total: data.sparksTotal }));
    await interaction.editReply({ embeds: [embed] });
    if (data.levelUp) {
      applyLevelUp(interaction.client, interaction.guildId, data.levelUp, data.announceChannelId, data.levelUpMessage).catch(() => {});
    }
  },
};
