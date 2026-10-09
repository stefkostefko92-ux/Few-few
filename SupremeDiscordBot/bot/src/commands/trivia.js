// bot/src/commands/trivia.js
// v50 — Server Season, етап 3: /trivia — пуска кръг СЕГА в текущия канал
// (насрочените идват от scheduler-а). Manage Server: платформено (default
// permissions) И runtime — операторът може да е разширил командата на всички.
import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { postTrivia } from "../utils/minigames.js";

export default {
  data: new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Start a trivia round in this channel now (Manage Server)")
    .setDescriptionLocalizations(CMD_DESC_L10N.trivia)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("source").setDescription("Question source").addChoices({ name: "Question bank", value: "BANK" }, { name: "Knowledge base (Premium)", value: "KB" })),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // Езикът може да иска бекенда (en-US + празен кеш) — след defer, не преди:
    // 3-секундният прозорец на Discord не чака мрежата (одит на Дискорджията 25.09.2026).
    const lang = await resolveLang(interaction);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.editReply({ content: t("game.trivia.noPermission", lang) });
    let out;
    try {
      ({ data: out } = await api.post("/bot/game/trivia/start", { serverId: interaction.guildId, channelId: interaction.channelId, source: interaction.options.getString("source") || "BANK" }));
    } catch (err) {
      const code = err?.response?.data?.error;
      if (code === "ROUND_OPEN") return interaction.editReply({ content: t("game.trivia.open", lang) });
      if (code === "GAME_DISABLED") return interaction.editReply({ content: t("game.disabled", lang) });
      return interaction.editReply(friendlyError(err, interaction));
    }
    const posted = await postTrivia(interaction.client, interaction.guildId, out.round);
    if (!posted.ok) return interaction.editReply({ content: t("game.trivia.postFailed", lang) });
    return interaction.editReply({ content: t("game.trivia.started", lang, { channel: `<#${interaction.channelId}>` }) });
  },
};
