// bot/src/commands/leaderboard.js
// v50 — Server Season: топ 10 по XP (по подразбиране), искри или сезонно XP.
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export default {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Top members of this server's Season")
    .setDescriptionLocalizations(CMD_DESC_L10N.leaderboard)
    .setDMPermission(false)
    .addStringOption((o) => o.setName("by").setDescription("Ranking").setRequired(false)
      .addChoices({ name: "XP (all time)", value: "xp" }, { name: "Season XP", value: "seasonXp" }, { name: "Sparks", value: "sparks" })),
  async execute(interaction) {
    const by = interaction.options.getString("by") || "xp";
    await interaction.deferReply();
    // Езикът може да иска бекенда (en-US + празен кеш) — след defer, не преди:
    // 3-секундният прозорец на Discord не чака мрежата (одит на Дискорджията 25.09.2026).
    const lang = await resolveLang(interaction);
    let data;
    try {
      ({ data } = await api.get(`/bot/game/leaderboard/${interaction.guildId}`, { params: { by, limit: 10 } }));
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction));
    }
    if (!data.rows?.length) return interaction.editReply({ content: t("game.leaderboard.empty", lang) }); // defer е публичен — editReply не може да го направи личен
    const lines = data.rows.map((r, i) => {
      const value = by === "sparks" ? `✨ ${r.sparks}` : by === "seasonXp" ? `${r.seasonXp} XP` : `${t("game.leaderboard.level", lang, { level: r.level })} · ${r.xp} XP`;
      return `${MEDALS[i] || `**${i + 1}.**`} <@${r.userId}> — ${value}`;
    });
    const embed = new EmbedBuilder()
      .setColor(BRAND)
      .setTitle(t(`game.leaderboard.title.${by}`, lang))
      .setDescription(lines.join("\n"));
    await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};
