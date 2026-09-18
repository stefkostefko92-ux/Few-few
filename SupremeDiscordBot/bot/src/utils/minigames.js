// bot/src/utils/minigames.js
// v50 — Server Season, етап 3 от страната на бота: Counting (чете съдържание
// САМО в обявения канал), съобщенията за куест (публикуване + редактиране с
// охлаждане), trivia (публикуване/затваряне), и броенето на гласове за /wyr
// (в паметта — не заслужава таблица). Backend-ът е съдията навсякъде.
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import api from "./api.js";
import { BRAND, SUCCESS, WARNING, MUTED, INFO } from "./colors.js";
import { t, resolveLangForGuild } from "../i18n/index.js";

export const QUEST_EDIT_COOLDOWN_MS = 60 * 1000;
const questEditAt = new Map(); // questId → last edit ms
const wyrVotes = new Map();    // messageId → { a:Set, b:Set, expiresAt }
export const WYR_TTL_MS = 60 * 60 * 1000;

// ─── Counting ────────────────────────────────────────────────────────────────
/** Само цяло положително число — огледално на backend/lib/game/counting.js. */
export function parseCount(content) {
  const m = /^\s*(\d{1,9})\s*$/.exec(String(content ?? ""));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

/**
 * Извиква се от messageCreate за ВСЯКО съобщение; чете `message.content` само
 * ако каналът е countingChannelId на сървъра. Връща какво е направил (за тестове).
 */
export async function onCounting(message, settings) {
  if (!settings?.enabled || !settings.countingChannelId || settings.countingChannelId !== message.channelId) return null;
  const number = parseCount(message.content);
  if (number === null) return null; // чат в канала е позволен — не се брои и не се трие
  const lang = await resolveLangForGuild(message.guildId).catch(() => "en");
  let out;
  try {
    ({ data: out } = await api.post("/bot/game/counting", { serverId: message.guildId, userId: message.author.id, number }));
  } catch (err) {
    const d = err?.response?.data || {};
    if (d.error === "WRONG_NUMBER" || d.error === "SAME_USER") {
      await message.react("❌").catch(() => {});
      const key = d.error === "WRONG_NUMBER" ? "game.counting.wrong" : "game.counting.sameUser";
      await message.channel.send({ content: t(key, lang, { user: `<@${message.author.id}>`, reached: d.reached ?? 0, expected: d.expected ?? 1, high: d.high ?? 0 }), allowedMentions: { users: [message.author.id] } }).catch(() => {});
      return { reset: true, code: d.error };
    }
    return { ignored: true, code: d.error || "ERROR" }; // RACE / DISABLED — тихо
  }
  await message.react(out.record ? "🥇" : "✅").catch(() => {});
  if (out.milestone) {
    await message.channel.send({ content: t("game.counting.milestone", lang, { number: out.number, user: `<@${message.author.id}>`, xp: out.xp }), allowedMentions: { users: [message.author.id] } }).catch(() => {});
  }
  if (out.record && out.number > 1 && out.number % 50 === 0) {
    await message.channel.send({ content: t("game.counting.record", lang, { number: out.number }) }).catch(() => {});
  }
  return { ok: true, number: out.number, record: out.record, milestone: out.milestone };
}

// ─── Куестове ────────────────────────────────────────────────────────────────
export function questEmbed(quest, lang, { rewards = null, chest = null, cancelled = false } = {}) {
  const goal = t(`game.quest.goal.${quest.type}`, lang, { target: quest.target });
  const e = new EmbedBuilder().setTitle(t("game.quest.title", lang, { emoji: quest.emoji || "🎯", goal }));
  if (quest.status === "COMPLETED") {
    const top = chest?.userId ? `<@${chest.userId}>` : "—";
    e.setColor(SUCCESS).setDescription(`${t("game.quest.completed", lang, { n: rewards?.length || 0, top })}${chest ? `\n${t("game.quest.chest", lang, { user: `<@${chest.userId}>`, sparks: chest.sparks, companion: chest.companion ? t("game.quest.chestCompanion", lang, { name: chest.companion.name }) : "" })}` : ""}`);
    if (chest?.companion?.imageUrl) e.setThumbnail(chest.companion.imageUrl);
  } else if (quest.status === "FAILED") {
    e.setColor(MUTED).setDescription(t(cancelled ? "game.quest.cancelled" : "game.quest.failed", lang, { progress: quest.progress, target: quest.target }));
  } else {
    e.setColor(BRAND)
      .setDescription(t("game.quest.body", lang, { bar: quest.bar, progress: quest.progress, target: quest.target, ends: `<t:${Math.floor(new Date(quest.endsAt).getTime() / 1000)}:R>` }))
      .setFooter({ text: t("game.quest.reward", lang, { sparks: quest.rewardSparks }) });
  }
  return e;
}

async function questChannel(client, serverId, channelId) {
  if (!channelId) return null;
  const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
  if (!guild) return null;
  const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  return ch?.isTextBased?.() ? ch : null;
}

/** Backend → /internal/game-quest: STARTED публикува, PROGRESS редактира (с охлаждане), COMPLETED/FAILED редактира + обявява. */
export async function handleQuestEvent(client, { event, serverId, quest, quests, rewards, chest, cancelled }) {
  const lang = await resolveLangForGuild(serverId).catch(() => "en");
  if (event === "PROGRESS") {
    let edited = 0;
    for (const q of quests || []) {
      const last = questEditAt.get(q.id) || 0;
      if (Date.now() - last < QUEST_EDIT_COOLDOWN_MS) continue;
      questEditAt.set(q.id, Date.now());
      if (await editQuestMessage(client, serverId, q, lang)) edited++;
    }
    return { edited };
  }
  if (!quest) return { ok: false };
  if (event === "STARTED") {
    const ch = await questChannel(client, serverId, quest.channelId);
    if (!ch) return { ok: false, reason: "no-channel" };
    const msg = await ch.send({ embeds: [questEmbed(quest, lang)] }).catch(() => null);
    if (!msg) return { ok: false, reason: "send-failed" };
    await api.patch(`/bot/game/quest/${quest.id}/message`, { messageId: msg.id, channelId: ch.id }).catch(() => {});
    return { ok: true, messageId: msg.id };
  }
  // COMPLETED / FAILED
  questEditAt.delete(quest.id);
  const embed = questEmbed(quest, lang, { rewards, chest, cancelled });
  const edited = await editQuestMessage(client, serverId, quest, lang, embed);
  if (event === "COMPLETED") {
    const ch = await questChannel(client, serverId, quest.channelId);
    if (ch && !edited) await ch.send({ embeds: [embed] }).catch(() => {});
    else if (ch && chest?.userId) await ch.send({ content: t("game.quest.completedPing", lang, { user: `<@${chest.userId}>` }), allowedMentions: { users: [chest.userId] } }).catch(() => {});
  }
  return { ok: true, edited };
}

async function editQuestMessage(client, serverId, quest, lang, embed = null) {
  if (!quest.messageId) return false;
  const ch = await questChannel(client, serverId, quest.channelId);
  if (!ch) return false;
  const msg = await ch.messages.fetch(quest.messageId).catch(() => null);
  if (!msg) return false;
  await msg.edit({ embeds: [embed || questEmbed(quest, lang)] }).catch(() => null);
  return true;
}

// ─── Trivia ──────────────────────────────────────────────────────────────────
const LETTERS = ["🇦", "🇧", "🇨", "🇩"];
export function triviaMessage(round, lang, { sparks = 30 } = {}) {
  const minutes = Math.max(1, Math.round((new Date(round.expiresAt).getTime() - Date.now()) / 60000));
  const embed = new EmbedBuilder().setColor(INFO)
    .setTitle(t(round.source === "KB" ? "game.trivia.kbTitle" : "game.trivia.title", lang))
    .setDescription(t("game.trivia.body", lang, { question: round.question, sparks, minutes }))
    .addFields(round.options.map((o, i) => ({ name: `${LETTERS[i]} ${o}`, value: "​", inline: false })));
  const row = new ActionRowBuilder().addComponents(round.options.map((_, i) =>
    new ButtonBuilder().setCustomId(`game:trivia:${round.id}:${i}`).setStyle(ButtonStyle.Secondary).setLabel(String.fromCharCode(65 + i))));
  return { embeds: [embed], components: [row] };
}

export async function postTrivia(client, serverId, round) {
  const lang = await resolveLangForGuild(serverId).catch(() => "en");
  const ch = await questChannel(client, serverId, round.channelId);
  if (!ch) return { ok: false, reason: "no-channel" };
  const msg = await ch.send(triviaMessage(round, lang)).catch(() => null);
  if (!msg) return { ok: false, reason: "send-failed" };
  await api.patch(`/bot/game/trivia/${round.id}/message`, { messageId: msg.id }).catch(() => {});
  return { ok: true, messageId: msg.id };
}

/** Затваряне от бота: показва отговора (победител или изтекло) и маха бутоните. */
export async function closeTriviaMessage(client, serverId, round, { winnerId = null, lang = null } = {}) {
  lang = lang || await resolveLangForGuild(serverId).catch(() => "en");
  const ch = await questChannel(client, serverId, round.channelId);
  if (!ch || !round.messageId) return false;
  const msg = await ch.messages.fetch(round.messageId).catch(() => null);
  if (!msg) return false;
  const answer = round.options?.[round.answer] ?? "?";
  const embed = EmbedBuilder.from(msg.embeds[0]).setColor(winnerId ? SUCCESS : MUTED)
    .setFooter({ text: winnerId ? t("game.trivia.winnerFooter", lang, { answer }) : t("game.trivia.noWinnerFooter", lang, { answer }) });
  await msg.edit({ embeds: [embed], components: [] }).catch(() => null);
  if (winnerId) await ch.send({ content: t("game.trivia.winner", lang, { user: `<@${winnerId}>`, answer }), allowedMentions: { users: [winnerId] } }).catch(() => {});
  return true;
}

// ─── Would you rather — гласове в паметта ────────────────────────────────────
export function wyrVote(messageId, userId, choice) {
  let v = wyrVotes.get(messageId);
  if (!v) { v = { a: new Set(), b: new Set(), expiresAt: Date.now() + WYR_TTL_MS }; wyrVotes.set(messageId, v); }
  v.a.delete(userId); v.b.delete(userId);
  (choice === "a" ? v.a : v.b).add(userId);
  // Чистене на старите (без таймер — при всеки глас).
  for (const [id, x] of wyrVotes) if (x.expiresAt < Date.now()) wyrVotes.delete(id);
  return { a: v.a.size, b: v.b.size };
}

export function wyrMessage(pair, lang, votes = { a: 0, b: 0 }) {
  const embed = new EmbedBuilder().setColor(WARNING).setTitle(t("game.wyr.title", lang))
    .setDescription(t("game.wyr.body", lang, { a: pair[0], b: pair[1] }))
    .setFooter({ text: t("game.wyr.votes", lang, { a: votes.a, b: votes.b }) });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("game:wyr:a").setStyle(ButtonStyle.Primary).setLabel("🅰️"),
    new ButtonBuilder().setCustomId("game:wyr:b").setStyle(ButtonStyle.Primary).setLabel("🅱️"),
  );
  return { embeds: [embed], components: [row] };
}

/** Само за тестове. */
export const __test = { questEditAt, wyrVotes };
