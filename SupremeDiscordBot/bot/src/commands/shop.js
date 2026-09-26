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

// Лимити на Discord: embed description ≤ 4096 знака, select меню ≤ 25 опции,
// ≤ 5 реда компоненти. Premium позволява 50 артикула (premium.js) — затова до ДВЕ
// менюта (2 × 25) и описание, отрязано под лимита (одит 25.09.2026: при 50
// артикула с описания /shop връщаше грешка от Discord, а 26–50 не се купуваха).
export const SHOP_DESC_MAX = 3900;
export function buildShopMessage(items, sparks, lang) {
  const embed = new EmbedBuilder().setColor(BRAND).setTitle(t("game.shop.title", lang));
  if (!items.length) {
    embed.setDescription(t("game.shop.empty", lang));
    return { embeds: [embed], components: [] };
  }
  const blocks = items.map((i) => {
    const bits = [`**${i.name}** — ✨ ${i.priceSparks}`];
    if (i.durationDays) bits.push(t("game.shop.days", lang, { days: i.durationDays }));
    if (i.stockLeft != null) bits.push(t("game.shop.left", lang, { n: i.stockLeft }));
    const desc = i.description ? `\n${i.description.length > 160 ? `${i.description.slice(0, 159)}…` : i.description}` : "";
    return `${bits.join(" · ")}${desc}`;
  });
  let text = "";
  let shown = 0;
  for (const b of blocks) {
    const next = text ? `${text}\n\n${b}` : b;
    if (next.length > SHOP_DESC_MAX) break;
    text = next; shown++;
  }
  if (shown < blocks.length) text += `\n\n${t("game.shop.more", lang, { n: blocks.length - shown })}`;
  embed.setDescription(text);
  embed.setFooter({ text: t("game.shop.balance", lang, { sparks }) });
  const rows = [];
  for (let page = 0; page * 25 < Math.min(items.length, 50); page++) {
    const chunk = items.slice(page * 25, page * 25 + 25);
    const menu = new StringSelectMenuBuilder()
      .setCustomId(page === 0 ? "game:shop" : `game:shop:${page + 1}`)
      .setPlaceholder(page === 0 ? t("game.shop.pick", lang) : `${t("game.shop.pick", lang)} (${page * 25 + 1}–${page * 25 + chunk.length})`)
      .addOptions(chunk.map((i) => ({
        label: i.name.slice(0, 100),
        description: `✨ ${i.priceSparks}${i.durationDays ? ` · ${i.durationDays}d` : ""}`.slice(0, 100),
        value: i.id,
      })));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return { embeds: [embed], components: rows };
}

export default {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Spend your sparks in the server shop")
    .setDescriptionLocalizations(CMD_DESC_L10N.shop)
    .setDMPermission(false),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // Езикът може да иска бекенда (en-US + празен кеш) — след defer, не преди:
    // 3-секундният прозорец на Discord не чака мрежата (одит на Дискорджията 25.09.2026).
    const lang = await resolveLang(interaction);
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
