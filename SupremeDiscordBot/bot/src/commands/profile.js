// bot/src/commands/profile.js
// v50 — Server Season: профил на член (ниво, XP лента, искри, streak, ранг,
// активен спътник). Embed, не картинка: няма нативна зависимост за рендер и
// текстът остава достъпен за екранни четци.
import { MessageFlags, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export function progressBar(pct, width = 12) {
  const filled = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

export default {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show a member's Server Season profile")
    .setDescriptionLocalizations(CMD_DESC_L10N.profile)
    .setDMPermission(false)
    .addUserOption((o) => o.setName("user").setDescription("Whose profile (default: you)").setRequired(false)),
  async execute(interaction) {
    const lang = await resolveLang(interaction);
    const target = interaction.options.getUser("user") || interaction.user;
    if (target.bot) return interaction.reply({ content: t("game.profile.noBots", lang), flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    let p;
    try {
      ({ data: p } = await api.get(`/bot/game/profile/${interaction.guildId}/${target.id}`));
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction));
    }
    if (!p.enabled) return interaction.editReply({ content: t("game.disabled", lang) });
    const pr = p.progress;
    const embed = new EmbedBuilder()
      .setColor(BRAND)
      .setAuthor({ name: target.displayName || target.username, iconURL: target.displayAvatarURL({ size: 64 }) })
      .setTitle(t("game.profile.title", lang, { level: pr.level }))
      .setDescription(`${progressBar(pr.pct)} ${pr.into}/${pr.need} XP`)
      .addFields(
        { name: t("game.profile.rank", lang), value: p.rank ? `#${p.rank} / ${p.players}` : "—", inline: true },
        { name: t("game.profile.sparks", lang), value: `✨ ${p.sparks}`, inline: true },
        { name: t("game.profile.streak", lang), value: `🔥 ${p.streak}`, inline: true },
        { name: t("game.profile.activity", lang), value: t("game.profile.activityValue", lang, { messages: p.messages, minutes: p.voiceMinutes }), inline: false },
      );
    if (p.activeCompanion) {
      const c = p.activeCompanion;
      embed.addFields({ name: t("game.profile.companion", lang), value: `${c.rarityEmoji ? `${c.rarityEmoji} ` : ""}${c.nickname || c.name || c.companionId} · ${t("game.profile.stage", lang, { stage: c.stage })}`, inline: false });
      if (c.imageUrl) embed.setThumbnail(c.imageUrl);
    } else if (p.companions > 0) {
      embed.addFields({ name: t("game.profile.companion", lang), value: t("game.profile.companionsCount", lang, { n: p.companions }), inline: false });
    }
    if (p.nextDailyAt && new Date(p.nextDailyAt) > new Date()) {
      embed.setFooter({ text: t("game.profile.nextDaily", lang, { time: new Date(p.nextDailyAt).toISOString().slice(11, 16) + " UTC" }) });
    } else {
      embed.setFooter({ text: t("game.profile.dailyReady", lang) });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};
