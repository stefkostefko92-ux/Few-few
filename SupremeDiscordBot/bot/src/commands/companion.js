// bot/src/commands/companion.js
// v50 — Server Season, етап 2: /companion list | info | feed | activate |
// release | trade. Спътниците се появяват в канала при активност
// (utils/game.js → maybeSpawn) и се улавят с бутон; тук е грижата за тях.
// Номерата (#1, #2…) са позицията в списъка на члена — стабилни, без ID-та.
// v53 — /companion train | attack | pvp: четири статистики, които се тренират
// с искри, и битки срещу активния спътник на друг член. Битката се смята на
// backend-а (lib/game/battles.js); тук само се разиграва в канала на 3 кадъра.
// v54 — загубилият губи 1–3 % от искрите си; последният кадър казва колко.
import { MessageFlags, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang, resolveLangSync } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND, SUCCESS, WARNING } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { rarityName, familyName, companionBlurb } from "../utils/companionText.js";

const STAGE_EMOJI = { 1: "🥚", 2: "✨", 3: "🌟" };
export const STAT_KEYS = ["atk", "def", "spd", "hp"];
export const STAT_EMOJI = { atk: "⚔️", def: "🛡️", spd: "💨", hp: "❤️" };
/** Пауза между кадрите на битката; тестовете я свеждат до 0. */
export const replay = { delayMs: 1400 };
const wait = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
/** Discord сам превежда относителното време („след 5 минути“) на езика на клиента. */
const relTime = (ms) => `<t:${Math.floor((Date.now() + Math.max(0, Number(ms) || 0)) / 1000)}:R>`;

// Неразделим интервал (U+00A0) между емоджито и числото: в тясно поле Discord
// пренася реда, а „❤️“ оставаше на един ред, „110“ — на следващия (снимка от
// прегледа, 10.10.2026). Сега редът се чупи само при „·“.
const NBSP = "\u00a0";
const keep = (s) => String(s).replace(/ /g, NBSP);

export function statLine(s) {
  return STAT_KEYS.map((k) => `${STAT_EMOJI[k]}${NBSP}${s?.[k] ?? 0}`).join(" · ");
}
function powerText(s, lang) {
  return keep(`💪 ${t("game.stats.power", lang, { power: s?.power ?? 0 })}`);
}
export function hpBar(hp, max, width = 10) {
  const filled = max > 0 ? Math.round((Math.max(0, Math.min(hp, max)) / max) * width) : 0;
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}

async function owned(interaction, userId = interaction.user.id) {
  const { data } = await api.get(`/bot/game/companions/${interaction.guildId}/${userId}`);
  return data;
}
function byIndex(list, n) {
  return list.companions[n - 1] || null;
}
function codeKey(code, sub) {
  // Една и съща грешка значи различно нещо според подкомандата (недостиг при
  // хранене = опитаната сума; при тренировка = цената на нивото).
  if (sub === "train") {
    const k = { NOT_ENOUGH_SPARKS: "game.train.notEnough", STAT_CAP: "game.train.cap", STAT_MAXED: "game.train.capFinal", BUSY: "game.train.busy" }[code];
    if (k) return k;
  }
  return { NOT_OWNED: "game.companion.notOwned", MAX_STAGE: "game.companion.maxStage", NOT_ENOUGH_SPARKS: "game.shop.notEnough", INVALID_AMOUNT: "game.companion.invalidAmount",
    SELF_TRADE: "game.companion.selfTrade", TRADE_PENDING: "game.companion.tradePending", GAME_DISABLED: "game.disabled",
    SELF: "game.battle.self", NO_ACTIVE: "game.battle.noActive", TARGET_NO_COMPANION: "game.battle.targetNone", PVP_OFF_SELF: "game.battle.pvpOffSelf",
    TARGET_PVP_OFF: "game.battle.targetPvpOff", COOLDOWN: "game.battle.cooldown", DAILY_LIMIT: "game.battle.daily", PAIR_COOLDOWN: "game.battle.pair",
    SHIELD: "game.battle.shield", BATTLES_DISABLED: "game.battle.disabled", PVP_LOCKED: "game.pvp.locked" }[code];
}

// ─── v53 — битката: кадри от събитията, които връща backend-ът ───────────────
/** До 3 кадъра: ~1/3, ~2/3 и краят (по-къса битка → по-малко). */
export function battleFrames(n) {
  return [...new Set([Math.ceil(n / 3), Math.ceil((2 * n) / 3), n])].filter((x) => x > 0);
}

function eventLine(e, names, lang) {
  const actor = e.by === "a" ? names.a : names.b;
  const target = e.by === "a" ? names.b : names.a;
  if (e.dodge) return t("game.battle.dodge", lang, { name: target });
  return t(e.crit ? "game.battle.crit" : "game.battle.hit", lang, { name: actor, dmg: e.dmg });
}

/** Процентът по езика: „1,6“ на български, „1.6“ на английски. */
function fmtPct(pct, lang) {
  try { return new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(pct); } catch { return String(pct); }
}

/** v54 — загубилият губи 1–3 % от искрите си (защитникът — най-много 5 пъти за 24 ч). */
function lossLine(data, lang) {
  const l = data.loss;
  if (!l) return "";
  const user = `<@${l.userId}>`;
  if (l.capped) return t("game.battle.lostCapped", lang, { user, limit: data.lossLimit ?? 5 });
  if (!(l.sparks > 0)) return "";
  return t("game.battle.lost", lang, { user, sparks: l.sparks, pct: fmtPct(l.pct, lang) });
}

function rewardLine(data, lang) {
  const atk = `<@${data.attacker.userId}>`;
  if (data.winner !== "attacker") return t("game.battle.defended", lang, { user: `<@${data.defender.userId}>` });
  const r = data.reward || {};
  if (r.sparks > 0) return t(r.tier === "underdog" ? "game.battle.rewardUnderdog" : "game.battle.reward", lang, { sparks: r.sparks, user: atk });
  if (r.capped) return t("game.battle.noRewardCap", lang, { limit: data.rewardLimit ?? 5 });
  return t("game.battle.noRewardEasy", lang);
}

/**
 * Кадър `upto` (брой изиграни събития) от битката като embed. Последният кадър
 * носи победителя, наградата и оставащите атаки.
 */
export function battleEmbed(data, upto, lang) {
  const A = data.attacker;
  const D = data.defender;
  const names = { a: A.companion.name, b: D.companion.name };
  const shown = data.events.slice(0, upto);
  const last = shown[shown.length - 1];
  const hpA = last ? last.hpA : A.stats.hp;
  const hpB = last ? last.hpB : D.stats.hp;
  const final = upto >= data.events.length;
  const side = (x, hp) => ({
    name: `${x.companion.rarityEmoji || ""} ${x.companion.name} · ${t("game.profile.stage", lang, { stage: x.stage || 1 })}`.trim(),
    value: `<@${x.userId}>\n${statLine(x.stats)}\n${hpBar(hp, x.stats.hp)} ${hp}/${x.stats.hp}`,
    inline: true,
  });
  const e = new EmbedBuilder()
    .setColor(final ? SUCCESS : BRAND)
    .setTitle(final ? t("game.battle.won", lang, { name: data.winner === "attacker" ? names.a : names.b }) : t("game.battle.title", lang, { a: names.a, b: names.b }))
    .setDescription(shown.slice(-4).map((ev) => eventLine(ev, names, lang)).join("\n") || "⚔️")
    .addFields(side(A, hpA), side(D, hpB))
    .setThumbnail((data.winner === "attacker" || !final ? A : D).companion.imageUrl);
  if (final) {
    e.addFields({ name: "\u200b", value: [rewardLine(data, lang), lossLine(data, lang)].filter(Boolean).join("\n"), inline: false });
    e.setFooter({ text: t("game.battle.footer", lang, { n: data.attacksLeft ?? 0 }) });
  }
  return e;
}

export function companionCard(c, ownedRow, lang) {
  const e = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(`${c.rarityEmoji} ${ownedRow?.nickname || c.name} · ${STAGE_EMOJI[ownedRow?.stage || 1]} ${t("game.profile.stage", lang, { stage: ownedRow?.stage || 1 })}`)
    .setDescription(companionBlurb(c, lang))
    .setThumbnail(c.imageUrl)
    .addFields(
      { name: t("game.companion.rarity", lang), value: `${rarityName(c, lang)}${c.seasonId ? ` · ${t("game.companion.seasonal", lang)}` : ""}`, inline: true },
      { name: t("game.companion.family", lang), value: familyName(c, lang), inline: true },
    );
  if (ownedRow) {
    e.addFields({ name: t("game.companion.fed", lang), value: ownedRow.nextStageAt ? `✨ ${ownedRow.fed} / ${ownedRow.nextStageAt}` : `✨ ${ownedRow.fed} · ${t("game.companion.finalForm", lang)}`, inline: true });
  }
  const sheet = ownedRow?.sheet;
  if (sheet?.stats) {
    const training = STAT_KEYS.map((k) => `${keep(`${STAT_EMOJI[k]} ${t(`game.stats.${k}`, lang)} ${sheet.levels[k]}/${sheet.cap}`)} · ${sheet.nextCost[k] == null ? t("game.stats.max", lang) : `✨${NBSP}${sheet.nextCost[k]}`}`).join("\n");
    e.addFields(
      { name: t("game.stats.title", lang), value: `${statLine(sheet.stats)}\n${powerText(sheet.stats, lang)}`, inline: false },
      { name: t("game.stats.training", lang), value: training, inline: true },
      { name: t("game.stats.record", lang), value: `🏆 ${sheet.wins} · 💔 ${sheet.losses}`, inline: true },
    );
  }
  return e;
}

export default {
  data: new SlashCommandBuilder()
    .setName("companion")
    .setDescription("Your Server Season companions: list, feed, train, battle, trade")
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
      .addIntegerOption((o) => o.setName("theirs").setDescription("Number of THEIR companion you want").setRequired(true).setMinValue(1).setMaxValue(1000)))
    .addSubcommand((s) => s.setName("train").setDescription("Spend sparks to raise one stat of a companion by a level")
      .addIntegerOption((o) => o.setName("number").setDescription("Its number from /companion list").setRequired(true).setMinValue(1).setMaxValue(1000))
      .addStringOption((o) => o.setName("stat").setDescription("Which stat to train").setRequired(true)
        .addChoices({ name: "⚔️ Attack", value: "atk" }, { name: "🛡️ Defense", value: "def" }, { name: "💨 Speed", value: "spd" }, { name: "❤️ Health", value: "hp" })))
    .addSubcommand((s) => s.setName("attack").setDescription("Battle another member's active companion with yours")
      .addUserOption((o) => o.setName("user").setDescription("Whose companion to attack").setRequired(true)))
    .addSubcommand((s) => s.setName("pvp").setDescription("Join or leave battles (off = nobody can attack you)")
      .addStringOption((o) => o.setName("mode").setDescription("on or off").setRequired(true)
        .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" }))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "attack") return attackCommand(interaction);
    const ephemeral = sub !== "trade";
    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});
    // Езикът може да иска бекенда (en-US + празен кеш) — след defer, не преди:
    // 3-секундният прозорец на Discord не чака мрежата (одит на Дискорджията 25.09.2026).
    const lang = await resolveLang(interaction);
    try {
      if (sub === "list") {
        const mine = await owned(interaction);
        if (!mine.companions.length) return interaction.editReply({ content: t("game.companion.none", lang) });
        const lines = mine.companions.map((c) => `**#${c.index}** ${c.rarityEmoji} ${c.nickname || c.name} · ${STAGE_EMOJI[c.stage]} ${t("game.profile.stage", lang, { stage: c.stage })}${c.sheet?.stats ? ` · 💪 ${c.sheet.stats.power}` : ""}${mine.activeId === c.id ? ` · ${t("game.companion.active", lang)}` : ""}`);
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
          .setDescription(t("game.companion.fedBody", lang, { sparks: data.charged ?? sparks, fed: data.owned.fed, left: data.sparksLeft }))
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
      if (sub === "train") {
        const mine = await owned(interaction);
        const c = byIndex(mine, n);
        if (!c) return interaction.editReply({ content: t("game.companion.notOwned", lang) });
        const stat = interaction.options.getString("stat");
        const { data } = await api.post(`/bot/game/companions/${interaction.guildId}/${interaction.user.id}/train`, { ownedId: c.id, stat });
        const e = new EmbedBuilder().setColor(SUCCESS)
          .setTitle(t("game.train.done", lang, { emoji: STAT_EMOJI[stat], name: c.nickname || c.name, stat: t(`game.stats.${stat}`, lang), level: data.level }))
          .setDescription(`${statLine(data.sheet.stats)}\n${powerText(data.sheet.stats, lang)}`)
          .setThumbnail(data.companion?.imageUrl || c.imageUrl)
          .setFooter({ text: t("game.train.paid", lang, { cost: data.cost, left: data.sparksLeft }) });
        return interaction.editReply({ embeds: [e] });
      }
      if (sub === "pvp") {
        const enabled = interaction.options.getString("mode") === "on";
        await api.post(`/bot/game/pvp/${interaction.guildId}/${interaction.user.id}`, { enabled });
        return interaction.editReply({ content: t(enabled ? "game.pvp.on" : "game.pvp.off", lang) });
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
      const key = codeKey(err?.response?.data?.error || err?.response?.data?.code, sub);
      const d = err?.response?.data || {};
      const stat = interaction.options.getString?.("stat");
      return interaction.editReply({
        content: key ? t(key, lang, {
          sparks: d.sparks ?? 0, price: interaction.options.getInteger("sparks") ?? 0,
          stat: stat ? t(`game.stats.${stat}`, lang) : "", cost: d.cost ?? 0, cap: d.cap ?? "", stage: d.stage ?? "", time: relTime(d.retryInMs),
        }) : friendlyError(err, interaction).content,
        embeds: [], components: [],
      });
    }
  },
};

/**
 * /companion attack: публичен отговор с битката (3 кадъра). Грешките (охлаждане,
 * щит, pvp off…) са само за нападателя — публичното „мисли…“ се маха и идва
 * ефимерен отговор, за да не се пълни каналът с откази.
 */
async function attackCommand(interaction) {
  const target = interaction.options.getUser("user");
  const quick = resolveLangSync(interaction);
  if (target.bot) return interaction.reply({ content: t("game.profile.noBots", quick), flags: MessageFlags.Ephemeral });
  if (target.id === interaction.user.id) return interaction.reply({ content: t("game.battle.self", quick), flags: MessageFlags.Ephemeral });
  await interaction.deferReply();
  const lang = await resolveLang(interaction);
  let data;
  try {
    ({ data } = await api.post("/bot/game/battle", { serverId: interaction.guildId, attackerId: interaction.user.id, defenderId: target.id }));
  } catch (err) {
    const d = err?.response?.data || {};
    const key = codeKey(d.error || d.code, "attack");
    const payload = key
      ? { content: t(key, lang, { user: `<@${target.id}>`, time: relTime(d.retryInMs), limit: d.limit ?? "" }), allowedMentions: { parse: [] } }
      : friendlyError(err, interaction);
    await interaction.deleteReply().catch(() => {});
    return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  }
  const frames = battleFrames(data.events.length);
  for (let i = 0; i < frames.length; i++) {
    if (i > 0) await wait(replay.delayMs);
    await interaction.editReply({ embeds: [battleEmbed(data, frames[i], lang)], allowedMentions: { parse: [] } });
  }
  return undefined;
}
