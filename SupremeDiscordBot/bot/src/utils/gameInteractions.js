// bot/src/utils/gameInteractions.js
// v50 — Server Season: компонентите с префикс "game:" (магазин: избор →
// потвърждение → покупка). Извиква се от events/interactionCreate.js.
import { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import api from "./api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "./friendlyError.js";
import { SUCCESS, WARNING } from "./colors.js";
import { grantShopRole } from "./game.js";
import { closeTriviaMessage, wyrVote, wyrMessage } from "./minigames.js";

export async function handleGameInteraction(interaction) {
  const id = interaction.customId;
  if (interaction.isButton() && id.startsWith("game:trivia:")) { const [, , roundId, opt] = id.split(":"); return answerTrivia(interaction, roundId, Number(opt)); }
  if (interaction.isButton() && id.startsWith("game:wyr:")) return voteWyr(interaction, id.split(":")[2]);
  if (interaction.isStringSelectMenu() && id === "game:shop") return confirmPurchase(interaction, interaction.values[0]);
  if (interaction.isButton() && id.startsWith("game:buy:")) return buyItem(interaction, id.split(":")[2]);
  if (interaction.isButton() && id.startsWith("game:catch:")) return catchSpawn(interaction, id.split(":")[2]);
  if (interaction.isButton() && id.startsWith("game:release:")) return releaseCompanion(interaction, id.split(":")[2]);
  if (interaction.isButton() && id.startsWith("game:trade:")) { const [, , action, tradeId] = id.split(":"); return resolveTrade(interaction, tradeId, action === "accept"); }
  if (interaction.isButton() && id === "game:cancel") {
    const lang = await resolveLang(interaction);
    return interaction.update({ content: t("game.shop.cancelled", lang), embeds: [], components: [] });
  }
  return false;
}

async function confirmPurchase(interaction, itemId) {
  const lang = await resolveLang(interaction);
  let item;
  try {
    const { data: items } = await api.get(`/bot/game/shop/${interaction.guildId}`);
    item = items.find((i) => i.id === itemId);
  } catch (err) {
    return interaction.reply({ ...friendlyError(err, interaction), flags: MessageFlags.Ephemeral });
  }
  if (!item) return interaction.reply({ content: t("game.shop.gone", lang), flags: MessageFlags.Ephemeral });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`game:buy:${item.id}`).setStyle(ButtonStyle.Success).setLabel(t("game.shop.confirm", lang, { sparks: item.priceSparks })),
    new ButtonBuilder().setCustomId("game:cancel").setStyle(ButtonStyle.Secondary).setLabel(t("game.shop.cancel", lang)),
  );
  const embed = new EmbedBuilder().setColor(WARNING).setTitle(item.name)
    .setDescription(`${item.description || ""}\n\n${t("game.shop.confirmBody", lang, { sparks: item.priceSparks })}`.trim());
  return interaction.update({ embeds: [embed], components: [row] });
}

async function buyItem(interaction, itemId) {
  const lang = await resolveLang(interaction);
  await interaction.deferUpdate();
  let out;
  try {
    ({ data: out } = await api.post(`/bot/game/shop/${interaction.guildId}/buy`, { userId: interaction.user.id, itemId }));
  } catch (err) {
    const d = err?.response?.data || {};
    const map = { NOT_ENOUGH_SPARKS: "game.shop.notEnough", SOLD_OUT: "game.shop.soldOut", ITEM_NOT_FOUND: "game.shop.gone", GAME_DISABLED: "game.disabled" };
    const key = map[d.code];
    return interaction.editReply({ content: key ? t(key, lang, { sparks: d.sparks ?? 0, price: d.price ?? 0 }) : friendlyError(err, interaction).content, embeds: [], components: [] });
  }
  let note = "";
  if (out.item.type === "ROLE" && out.item.roleId) {
    const reason = await grantShopRole(interaction.guild, interaction.member, out.item.roleId);
    if (reason) note = `\n\n${t("game.shop.roleFailed", lang, { reason })}`;
  } else if (out.item.type === "CUSTOM") {
    note = `\n\n${t("game.shop.customNote", lang)}`;
  }
  const embed = new EmbedBuilder().setColor(SUCCESS).setTitle(t("game.shop.boughtTitle", lang))
    .setDescription(t("game.shop.bought", lang, { item: out.item.name, sparks: out.item.priceSparks, left: out.sparksLeft }) + (out.purchase.expiresAt ? `\n${t("game.shop.expires", lang, { date: new Date(out.purchase.expiresAt).toISOString().slice(0, 10) })}` : "") + note);
  return interaction.editReply({ embeds: [embed], components: [] });
}

// ─── Спътници (етап 2) ───────────────────────────────────────────────────────
async function catchSpawn(interaction, spawnId) {
  const lang = await resolveLang(interaction);
  let out;
  try {
    ({ data: out } = await api.post(`/bot/game/spawn/${spawnId}/catch`, { userId: interaction.user.id }));
  } catch (err) {
    const d = err?.response?.data || {};
    const map = { ALREADY_CAUGHT: "game.spawn.tooSlow", SPAWN_EXPIRED: "game.spawn.expired", SPAWN_NOT_FOUND: "game.spawn.expired", COLLECTION_FULL: "game.spawn.full" };
    const key = map[d.error || d.code];
    return interaction.reply({ content: key ? t(key, lang, { limit: d.limit ?? 1 }) : friendlyError(err, interaction).content, flags: MessageFlags.Ephemeral });
  }
  // Общото съобщение става „уловен от" — бутонът изчезва за всички.
  try {
    const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(SUCCESS)
      .setDescription(t("game.spawn.caught", lang, { user: `<@${interaction.user.id}>`, name: out.companion.name }));
    await interaction.update({ embeds: [embed], components: [] });
  } catch {
    await interaction.reply({ content: t("game.spawn.caught", lang, { user: `<@${interaction.user.id}>`, name: out.companion.name }), flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function releaseCompanion(interaction, ownedId) {
  const lang = await resolveLang(interaction);
  try {
    const { data } = await api.post(`/bot/game/companions/${interaction.guildId}/${interaction.user.id}/release`, { ownedId });
    return interaction.update({ content: t("game.companion.released", lang, { name: data.companion.name }), embeds: [], components: [] });
  } catch (err) {
    return interaction.update({ content: friendlyError(err, interaction).content, embeds: [], components: [] });
  }
}

// ─── Етап 3: trivia + would-you-rather ───────────────────────────────────────
async function answerTrivia(interaction, roundId, option) {
  const lang = await resolveLang(interaction);
  let out;
  try {
    ({ data: out } = await api.post(`/bot/game/trivia/${roundId}/answer`, { userId: interaction.user.id, option }));
  } catch (err) {
    const d = err?.response?.data || {};
    const map = { ALREADY_ANSWERED: "game.trivia.already", ROUND_CLOSED: "game.trivia.closed", ROUND_NOT_FOUND: "game.trivia.closed" };
    const key = map[d.error];
    return interaction.reply({ content: key ? t(key, lang) : friendlyError(err, interaction).content, flags: MessageFlags.Ephemeral });
  }
  const key = !out.correct ? "game.trivia.wrong" : out.winner ? "game.trivia.correctWinner" : "game.trivia.correctLate";
  await interaction.reply({ content: t(key, lang, { sparks: out.sparks ?? 0 }), flags: MessageFlags.Ephemeral });
  if (out.winner) {
    // Общото съобщение: отговорът + победителят, бутоните изчезват.
    const embed = interaction.message?.embeds?.[0];
    const options = (embed?.fields || []).map((f) => f.name.replace(/^\S+\s/, ""));
    await closeTriviaMessage(interaction.client, interaction.guildId, { channelId: interaction.channelId, messageId: interaction.message.id, options, answer: out.answer }, { winnerId: interaction.user.id, lang }).catch(() => {});
  }
}

async function voteWyr(interaction, choice) {
  const lang = await resolveLang(interaction);
  const votes = wyrVote(interaction.message.id, interaction.user.id, choice === "a" ? "a" : "b");
  const desc = interaction.message.embeds?.[0]?.description || "";
  // Двете опции стоят в описанието: „🅰️ …\n\n🅱️ …“ — вадим ги, за да не пазим двойка в паметта.
  const m = /🅰️\s*([\s\S]*?)\n\n🅱️\s*([\s\S]*)$/.exec(desc);
  const pair = m ? [m[1].trim(), m[2].trim()] : ["A", "B"];
  await interaction.update(wyrMessage(pair, lang, votes)).catch(() => {});
}

async function resolveTrade(interaction, tradeId, accept) {
  const lang = await resolveLang(interaction);
  let out;
  try {
    ({ data: out } = await api.post(`/bot/game/trade/${tradeId}/resolve`, { userId: interaction.user.id, accept }));
  } catch (err) {
    const d = err?.response?.data || {};
    const map = { NOT_RECIPIENT: "game.companion.tradeNotRecipient", TRADE_EXPIRED: "game.companion.tradeGone", TRADE_CLOSED: "game.companion.tradeGone", TRADE_NOT_FOUND: "game.companion.tradeGone", TRADE_STALE: "game.companion.tradeGone" };
    const key = map[d.error || d.code];
    return interaction.reply({ content: key ? t(key, lang) : friendlyError(err, interaction).content, flags: MessageFlags.Ephemeral });
  }
  const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(out.status === "ACCEPTED" ? SUCCESS : WARNING)
    .setFooter({ text: t(out.status === "ACCEPTED" ? "game.companion.tradeDone" : "game.companion.tradeDeclined", lang) });
  return interaction.update({ embeds: [embed], components: [] });
}
