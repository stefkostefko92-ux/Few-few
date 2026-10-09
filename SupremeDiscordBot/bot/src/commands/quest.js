// bot/src/commands/quest.js
// v50 — Server Season, етап 3: /quest — живите сървърни куестове и твоят принос.
// Куестовете се създават от scheduler-а (седмично) или от таблото; тук само се четат.
import { MessageFlags, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new SlashCommandBuilder()
    .setName("quest")
    .setDescription("Show the active server quests and your contribution")
    .setDescriptionLocalizations(CMD_DESC_L10N.quest)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // Езикът може да иска бекенда (en-US + празен кеш) — след defer, не преди:
    // 3-секундният прозорец на Discord не чака мрежата (одит на Дискорджията 25.09.2026).
    const lang = await resolveLang(interaction);
    let quests;
    try {
      ({ data: quests } = await api.get(`/bot/game/quests/${interaction.guildId}`, { params: { userId: interaction.user.id } }));
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction));
    }
    if (!quests?.length) return interaction.editReply({ content: t("game.quest.none", lang) });
    const embed = new EmbedBuilder().setColor(BRAND).setTitle(t("game.quest.listTitle", lang));
    for (const q of quests) {
      const goal = t(`game.quest.goal.${q.type}`, lang, { target: q.target });
      embed.addFields({
        name: `${q.emoji} ${goal}`,
        value: `${q.bar}\n${q.progress} / ${q.target} · <t:${Math.floor(new Date(q.endsAt).getTime() / 1000)}:R>\n${t("game.quest.yours", lang, { amount: q.mine || 0 })} · ${t("game.quest.reward", lang, { sparks: q.rewardSparks })}`,
      });
    }
    return interaction.editReply({ embeds: [embed] });
  },
};
