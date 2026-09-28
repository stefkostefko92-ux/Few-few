// bot/src/commands/companion.js
// v50 — Server Season, етап 2: /companion list | info | feed | activate |
// release | trade. Спътниците се появяват в канала при активност
// (utils/game.js → maybeSpawn) и се улавят с бутон; тук е грижата за тях.
// Номерата (#1, #2…) са позицията в списъка на члена — стабилни, без ID-та.
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND, SUCCESS, WARNING } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

const STAGE_EMOJI = { 1: "🥚", 2: "✨", 3: "🌟" };

async function owned(interaction, userId = interaction.user.id) {
  const { data } = await api.get(`/bot/game/companions/${interaction.guildId}/${userId}`);
  return data;
}
function byIndex(list, n) {
  return list.companions[n - 1] || null;
}
function codeKey(code) {
  return { NOT_OWNED: "game.companion.notOwned", MAX_STAGE: "game.companion.maxStage", NOT_ENOUGH_SPARKS: "game.shop.notEnough", INVALID_AMOUNT: "game.companion.invalidAmount",
    SELF_TRADE: "game.companion.selfTrade", TRADE_PENDING: "game.companion.tradePending", GAME_DISABLED: "game.disabled" }[code];
}

export function companionCard(c, ownedRow, lang) {
  const e = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`${c.rarityEmoji} ${ownedRow?.nickname || c.name} · ${STAGE_EMOJI[ownedRow?.stage || 1]} ${t("game.profile.stage", lang, { stage: ownedRow?.stage || 1 })}`)
    .setDescription(c.blurb)
    .setThumbnail(c.imageUrl)
    .addFields(
      { name: t("game.companion.rarity", lang), value: `${c.rarityLabel}${c.seasonId ? ` · ${t("game.companion.seasonal", lang)}` : ""}`, inline: true },
      { name: t("game.companion.family", lang), value: c.family, inline: true },
    );
  if (ownedRow) {
    e.addFields({ name: t("game.companion.fed", lang), value: ownedRow.nextStageAt ? `✨ ${ownedRow.fed} / ${ownedRow.nextStageAt}` : `✨ ${ownedRow.fed} · ${t("game.companion.finalForm", lang)}`, inline: true });
  }
  return e;
}

export default {
  data: new SlashCommandBuilder()
    .setName("companion")
    .setDescription("Your Server Season companions: list, feed, activate, trade")
    .setDescriptionLocalizations(CMD_DESC_L10N.companion)
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("list").setDescription("Show your companions"))
    .addSubcommand((s) => s.setName("info").setDescription("Details about one of your companions")
      .addIntegerOption((o) => o.setName("number").setDescription("Its number from /companion list").setRequired(true).setMinValue(1).setMaxValue(1000)))
    .addSubcommand((s) => s.setName("feed").setDescription("Feed sparks to a companion so it evolves")
      .addIntegerOption((o) => o.setName("number").setDescription("Its number from /companion list").setRequired(true).setMinValue(1).setMaxValue(1000))
      .addIntegerOption((o) => o.setName("sparks").setDescription("How many sparks").setRequired(true).setMinValue(1).setMaxValue(100000)))
    .addSubcommand((s) => s.setName("activate").setDescription("Show this companion on your profile")
      .addIntegerOption((o) => o.setName("number").setDescription("Its number from /companion list").setRequired(true).setMinValue(1).setMaxValue(1000)))
    .addSubcommand((s) => s.setName("release").setDescription("Release a companion (frees a slot)")
      .addIntegerOption((o) => o.setName("number").setDescription("Its number from /companion list").setRequired(true).setMinValue(1).setMaxValue(1000)))
    .addSubcommand((s) => s.setName("trade").setDescription("Offer a trade to another member")
      .addUserOption((o) => o.setName("user").setDescription("Who you want to trade with").setRequired(true))
      .addIntegerOption((o) => o.setName("mine").setDescription("Number of YOUR companion to give").setRequired(true).setMinValue(1).setMaxValue(1000))
      .addIntegerOption((o) => o.setName("theirs").setDescription("Number of THEIR companion you want").setRequired(true).setMinValue(1).setMaxValue(1000))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const ephemeral = sub !== "trade";
    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
    // Езикът може да иска бекенда (en-US + празен кеш) — след defer, не преди:
    // 3-секундният прозорец на Discord не чака мрежата (одит на Дискорджията 25.09.2026).
    const lang = await resolveLang(interaction);
    try {
      if (sub === "list") {
        const mine = await owned(interaction);
        if (!mine.companions.length) return interaction.editReply({ content: t("game.companion.none", lang) });
        const lines = mine.companions.map((c) => `**#${c.index}** ${c.rarityEmoji} ${c.nickname || c.name} · ${STAGE_EMOJI[c.stage]} ${t("game.profile.stage", lang, { stage: c.stage })}${mine.activeId === c.id ? ` · ${t("game.companion.active", lang)}` : ""}`);
        // Лимит на Discord: описание ≤ 4096 знака. Premium има до 1000 слота — над ~80
        // спътника списъкът чупеше командата (одит 25.09.2026). Показваме колкото
        // влизат; номерата остават валидни за /companion info|feed|… <номер>.
        let text = "";
        let shown = 0;
        for (const l of lines) {
          const next = text ? `${text}\n${l}` : l;
          if (next.length > 3900) break;
          text = next; shown++;
        }
        if (shown < lines.length) text += `\n${t("game.companion.more", lang, { n: lines.length - shown })}`;
        const e = new EmbedBuilder().setColor(BRAND).setTitle(t("game.companion.listTitle", lang, { n: mine.companions.length })).setDescription(text).setFooter({ text: t("game.shop.balance", lang, { sparks: mine.sparks }) });
        return interaction.editReply({ embeds: [e] });
      }
      const n = interaction.options.getInteger("number") ?? interaction.options.getInteger("mine");
      if (sub === "info") {
        const mine = await owned(interaction);
        const c = byIndex(mine, n);
        if (!c) return interaction.editReply({ content: t("game.companion.notOwned", lang) });
        return interaction.editReply({ embeds: [companionCard(c, c, lang)] });
      }
      if (sub === "feed") {
        const mine = await owned(interaction);
        const c = byIndex(mine, n);
        if (!c) return interaction.editReply({ content: t("game.companion.notOwned", lang) });
        const sparks = interaction.options.getInteger("sparks");
        const { data } = await api.post(`/bot/game/companions/${interaction.guildId}/${interaction.user.id}/feed`, { ownedId: c.id, sparks });
        const e = new EmbedBuilder().setColor(data.evolved ? SUCCESS : BRAND)
          .setTitle(data.evolved ? t("game.companion.evolved", lang, { name: c.nickname || c.name, stage: data.stage }) : t("game.companion.fedTitle", lang, { name: c.nickname || c.name }))
          .setDescription(t("game.companion.fedBody", lang, { sparks, fed: data.owned.fed, left: data.sparksLeft }))
          .setThumbnail(data.companion.imageUrl);
        return interaction.editReply({ embeds: [e] });
      }
      if (sub === "activate") {
        const mine = await owned(interaction);
        const c = byIndex(mine, n);
        if (!c) return interaction.editReply({ content: t("game.companion.notOwned", lang) });
        await api.post(`/bot/game/companions/${interaction.guildId}/${interaction.user.id}/activate`, { ownedId: c.id });
        return interaction.editReply({ content: t("game.companion.activated", lang, { name: c.nickname || c.name }) });
      }
      if (sub === "release") {
        const mine = await owned(interaction);
        const c = byIndex(mine, n);
        if (!c) return interaction.editReply({ content: t("game.companion.notOwned", lang) });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`game:release:${c.id}`).setStyle(ButtonStyle.Danger).setLabel(t("game.companion.releaseConfirm", lang)),
          new ButtonBuilder().setCustomId("game:cancel").setStyle(ButtonStyle.Secondary).setLabel(t("game.shop.cancel", lang)),
        );
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(WARNING).setDescription(t("game.companion.releaseAsk", lang, { name: c.nickname || c.name }))], components: [row] });
      }
      if (sub === "trade") {
        const target = interaction.options.getUser("user");
        if (target.bot) return interaction.editReply({ content: t("game.profile.noBots", lang) });
        const [mine, theirs] = await Promise.all([owned(interaction), owned(interaction, target.id)]);
        const give = byIndex(mine, interaction.options.getInteger("mine"));
        const want = byIndex(theirs, interaction.options.getInteger("theirs"));
        if (!give) return interaction.editReply({ content: t("game.companion.notOwned", lang) });
        if (!want) return interaction.editReply({ content: t("game.companion.theirsNotFound", lang, { user: target.username }) });
        const { data } = await api.post("/bot/game/trade", { serverId: interaction.guildId, fromUserId: interaction.user.id, toUserId: target.id, fromOwnedId: give.id, toOwnedId: want.id });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`game:trade:accept:${data.trade.id}`).setStyle(ButtonStyle.Success).setLabel(t("game.companion.tradeAccept", lang)),
          new ButtonBuilder().setCustomId(`game:trade:decline:${data.trade.id}`).setStyle(ButtonStyle.Secondary).setLabel(t("game.companion.tradeDecline", lang)),
        );
        const e = new EmbedBuilder().setColor(WARNING).setTitle(t("game.companion.tradeTitle", lang))
          .setDescription(t("game.companion.tradeBody", lang, { from: `<@${interaction.user.id}>`, to: `<@${target.id}>`, give: `${data.mine.rarityEmoji} ${data.mine.name} (${t("game.profile.stage", lang, { stage: give.stage })})`, want: `${data.theirs.rarityEmoji} ${data.theirs.name} (${t("game.profile.stage", lang, { stage: want.stage })})` }))
          .setThumbnail(data.mine.imageUrl).setFooter({ text: t("game.companion.tradeExpires", lang) });
        return interaction.editReply({ content: `<@${target.id}>`, embeds: [e], components: [row], allowedMentions: { users: [target.id] } });
      }
    } catch (err) {
      // „price“ е опитаната сума при /companion feed (беше твърдо 0 → „струва ✨ 0“).
      const key = codeKey(err?.response?.data?.error || err?.response?.data?.code);
      const d = err?.response?.data || {};
      return interaction.editReply({ content: key ? t(key, lang, { sparks: d.sparks ?? 0, price: interaction.options.getInteger("sparks") ?? 0 }) : friendlyError(err, interaction).content, embeds: [], components: [] });
    }
  },
};
