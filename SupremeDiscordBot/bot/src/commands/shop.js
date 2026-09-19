// bot/src/commands/shop.js
// v50 — Server Season: магазинът на сървъра. Списъкът е embed; покупката е
// през select меню (customId "game:shop") → бутон за потвърждение
// ("game:buy:<itemId>") в utils/gameInteractions.js. Искрите се вадят в ЕДНА
// транзакция в backend-а; ботът дава ролята след успешен запис.
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export function buildShopMessage(items, sparks, lang) {
  const embed = new EmbedBuilder().setColor(BRAND).setTitle(t("game.shop.title", lang));
  if (!items.length) {
    embed.setDescription(t("game.shop.empty", lang));
    return { embeds: [embed], components: [] };
  }
  embed.setDescription(items.map((i) => {
    const bits = [`**${i.name}** — ✨ ${i.priceSparks}`];
    if (i.durationDays) bits.push(t("game.shop.days", lang, { days: i.durationDays }));
    if (i.stockLeft != null) bits.push(t("game.shop.left", lang, { n: i.stockLeft }));
    return `${bits.join(" · ")}${i.description ? `\n${i.description}` : ""}`;
  }).join("\n\n"));
  embed.setFooter({ text: t("game.shop.balance", lang, { sparks }) });
  const menu = new StringSelectMenuBuilder()
    .setCustomId("game:shop")
    .setPlaceholder(t("game.shop.pick", lang))
    .addOptions(items.slice(0, 25).map((i) => ({
      label: i.name.slice(0, 100),
      description: `✨ ${i.priceSparks}${i.durationDays ? ` · ${i.durationDays}d` : ""}`.slice(0, 100),
      value: i.id,
    })));
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

export default {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Spend your sparks in the server shop")
    .setDescriptionLocalizations(CMD_DESC_L10N.shop)
    .setDMPermission(false),
  async execute(interaction) {
    const lang = await resolveLang(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const [{ data: items }, { data: profile }] = await Promise.all([
        api.get(`/bot/game/shop/${interaction.guildId}`),
        api.get(`/bot/game/profile/${interaction.guildId}/${interaction.user.id}`),
      ]);
      if (!profile.enabled) return interaction.editReply({ content: t("game.disabled", lang) });
      await interaction.editReply(buildShopMessage(items, profile.sparks, lang));
    } catch (err) {
      await interaction.editReply(friendlyError(err, interaction));
    }
  },
};
