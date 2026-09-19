// bot/src/utils/game.js
// v50 — Server Season от страната на бота: кеш на настройките по сървър,
// охлаждане за XP от съобщения (в паметта — един процес обслужва и главния, и
// white-label клиентите), партиди към backend-а на всеки FLUSH_MS, и раздаване
// на ролите за ниво. Съдържанието на съобщенията НЕ се чете тук: броим
// събитието (message.author + channel), нищо друго (Privileged Intents:
// употребата на Message Content остава само за тикети/лог/counting).
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { BRAND, MUTED } from "./colors.js";
import api from "./api.js";
import { roleAssignabilityReason } from "./reactionRoles.js";

const SETTINGS_TTL_MS = 60 * 1000;
const FLUSH_MS = 30 * 1000;

const settingsCache = new Map();  // serverId → { settings, expiresAt }
const cooldown = new Map();       // `${serverId}:${userId}` → last XP timestamp
const pending = new Map();        // serverId → Map(userId → { messageXpEvents, voiceMinutes })
const voiceJoined = new Map();    // `${serverId}:${userId}` → joinedAt ms
const spawnState = new Map();     // serverId → { events, lastAttemptAt }

// ─── Спътници (етап 2): поява при активност ─────────────────────────────────
// Правилата (праг събития, шанс, интервал) са в backend/src/lib/game/companions.js;
// тук е само евтиният гейт в паметта, за да не бием backend-а на всяко съобщение.
export const SPAWN_MIN_EVENTS = 6;
export const SPAWN_CHANCE = 1 / 25;
export const SPAWN_LOCAL_INTERVAL_MS = 12 * 60 * 1000;

export async function getGameSettings(serverId) {
  const hit = settingsCache.get(serverId);
  if (hit && hit.expiresAt > Date.now()) return hit.settings;
  let settings = null;
  try {
    ({ data: settings } = await api.get(`/bot/game/settings/${serverId}`));
  } catch {
    settings = hit?.settings || null; // при провал пазим последното известно
  }
  settingsCache.set(serverId, { settings, expiresAt: Date.now() + SETTINGS_TTL_MS });
  return settings;
}

export function invalidateGameSettings(serverId) {
  settingsCache.delete(serverId);
}

function bucket(serverId, userId) {
  let m = pending.get(serverId);
  if (!m) { m = new Map(); pending.set(serverId, m); }
  let e = m.get(userId);
  if (!e) { e = { messageXpEvents: 0, voiceMinutes: 0 }; m.set(userId, e); }
  return e;
}

/** Събитие „съобщение" — брои се най-много веднъж на messageCooldownSec. */
export async function onMessageForXp(message) {
  if (message.author?.bot || !message.guildId) return;
  const settings = await getGameSettings(message.guildId);
  if (!settings?.enabled) return;
  const key = `${message.guildId}:${message.author.id}`;
  const last = cooldown.get(key) || 0;
  const cd = Math.max(10, Number(settings.messageCooldownSec) || 60) * 1000;
  if (Date.now() - last < cd) return;
  cooldown.set(key, Date.now());
  bucket(message.guildId, message.author.id).messageXpEvents += 1;
  // Спътниците се появяват при активност — само от XP събития (с охлаждане),
  // тоест спам от един човек не ускорява появата.
  maybeSpawn(message, settings, rand).catch(() => {});
}

let rand = Math.random;
/** Само за тестове: детерминистичен жребий. */
export function __setRandom(fn) { rand = fn || Math.random; }

export async function maybeSpawn(message, settings, r = rand) {
  if (!settings?.spawnEnabled) return false;
  if (settings.spawnChannelIds?.length && !settings.spawnChannelIds.includes(message.channelId)) return false;
  const st = spawnState.get(message.guildId) || { events: 0, lastAttemptAt: 0 };
  st.events += 1;
  spawnState.set(message.guildId, st);
  if (st.events < SPAWN_MIN_EVENTS) return false;
  if (Date.now() - st.lastAttemptAt < SPAWN_LOCAL_INTERVAL_MS) return false;
  if (r() > SPAWN_CHANCE) return false;
  st.lastAttemptAt = Date.now(); st.events = 0;
  let data;
  try {
    ({ data } = await api.post("/bot/game/spawn", { serverId: message.guildId, channelId: message.channelId }));
  } catch (err) {
    return false; // SPAWN_ACTIVE / TOO_SOON / CHANNEL_NOT_ALLOWED — backend-ът е съдията
  }
  await postSpawn(message.channel, data, message.client).catch(() => {});
  return true;
}

export function spawnMessage(data, lang = "en", tFn = (k) => k) {
  const c = data.companion;
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setTitle(tFn("game.spawn.title", lang, { name: c.name }))
    .setDescription(tFn("game.spawn.body", lang, { rarity: `${c.rarityEmoji} ${c.rarityLabel}` }))
    .setThumbnail(c.imageUrl);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`game:catch:${data.spawn.id}`).setStyle(ButtonStyle.Success).setLabel(tFn("game.spawn.catch", lang)),
  );
  return { embeds: [embed], components: [row] };
}

export async function postSpawn(channel, data, client) {
  const { t, resolveLangForGuild } = await import("../i18n/index.js");
  const lang = await resolveLangForGuild(channel.guildId).catch(() => "en");
  const msg = await channel.send(spawnMessage(data, lang, t));
  await api.patch(`/bot/game/spawn/${data.spawn.id}/message`, { messageId: msg.id }).catch(() => {});
  // След изтичане — „избяга" (ако не е уловен). Backend-ът пази истината; тук е само визуалното.
  const ttl = Math.max(1000, new Date(data.spawn.expiresAt).getTime() - Date.now());
  const timer = setTimeout(async () => {
    try {
      const { data: fresh } = await api.get(`/bot/game/companion/${data.companion.id}`).catch(() => ({ data: null }));
      const current = await channel.messages.fetch(msg.id).catch(() => null);
      if (!current || !current.components?.length) return; // вече редактирано (уловен)
      const embed = EmbedBuilder.from(current.embeds[0]).setColor(MUTED).setDescription(t("game.spawn.escaped", lang, { name: (fresh || data.companion).name }));
      await current.edit({ embeds: [embed], components: [] });
    } catch { /* нищо */ }
  }, ttl);
  timer.unref?.();
  return msg;
}


/** Гласови минути: старт при влизане, отчитане при излизане/преместване. AFK каналът не се брои. */
export async function onVoiceForXp(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (!guild?.id || !member || member.user?.bot) return;
  const key = `${guild.id}:${member.id}`;
  const afk = guild.afkChannelId;
  const wasIn = oldState.channelId && oldState.channelId !== afk;
  const nowIn = newState.channelId && newState.channelId !== afk;
  if (!wasIn && nowIn) { voiceJoined.set(key, Date.now()); return; }
  if (wasIn && !nowIn) {
    const joined = voiceJoined.get(key);
    voiceJoined.delete(key);
    if (!joined) return;
    const minutes = Math.floor((Date.now() - joined) / 60000);
    if (minutes <= 0) return;
    const settings = await getGameSettings(guild.id);
    if (!settings?.enabled) return;
    bucket(guild.id, member.id).voiceMinutes += Math.min(minutes, 24 * 60);
  }
}

/** Изпраща натрупаното към backend-а и раздава ролите за ниво. */
export async function flushXp(client) {
  if (pending.size === 0) return;
  const batches = [...pending.entries()];
  pending.clear();
  for (const [serverId, users] of batches) {
    const entries = [...users.entries()].map(([userId, e]) => ({ userId, ...e })).filter((e) => e.messageXpEvents || e.voiceMinutes);
    if (!entries.length) continue;
    try {
      const { data } = await api.post("/bot/game/xp-batch", { serverId, entries });
      for (const up of data?.levelUps || []) {
        await applyLevelUp(client, serverId, up, data.announceChannelId, data.levelUpMessage).catch(() => {});
      }
    } catch (err) {
      // Загубена партида = загубени ~30 s XP; не трупаме назад, за да не удвоим при повторен провал.
      console.warn(`[game] xp-batch за ${serverId} пропадна: ${err?.response?.status || err.message}`);
    }
  }
}

let flushTimer = null;
export function startXpFlusher(client) {
  if (flushTimer) return;
  flushTimer = setInterval(() => flushXp(client).catch(() => {}), FLUSH_MS);
  flushTimer.unref?.();
}

/** Дава натрупаните роли за ниво (само безопасни) и обявява, ако е включено. */
export async function applyLevelUp(client, serverId, up, announceChannelId, levelUpMessage) {
  const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
  if (!guild) return;
  const member = await guild.members.fetch(up.userId).catch(() => null);
  if (!member) return;
  const granted = [];
  for (const roleId of up.roleIds || []) {
    if (member.roles.cache.has(roleId)) continue;
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) continue;
    if (roleAssignabilityReason(role, guild.members.me)) continue; // управлявана / опасна / над бота
    await member.roles.add(role, `Server Season: level ${up.level}`).then(() => granted.push(role.name)).catch(() => {});
  }
  if (levelUpMessage === false || !announceChannelId) return;
  const channel = guild.channels.cache.get(announceChannelId) || await guild.channels.fetch(announceChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  // Локализирано като всяка друга обява (одит 19.09.2026 — беше единственият EN-only текст).
  const { t, resolveLangForGuild } = await import("../i18n/index.js");
  const lang = await resolveLangForGuild(serverId).catch(() => "en");
  const roles = granted.length ? t("game.levelUp.roles", lang, { roles: granted.map((n) => `**${n}**`).join(", ") }) : "";
  const sparks = up.sparksAwarded ? ` · +${up.sparksAwarded} ✨` : "";
  const embed = new EmbedBuilder()
    .setColor(BRAND)
    .setDescription(t("game.levelUp.announce", lang, { user: `<@${up.userId}>`, level: up.level, roles, sparks }));
  await channel.send({ embeds: [embed], allowedMentions: { users: [up.userId] } }).catch(() => {});
}

/** Маха изтекла роля от магазина (backend → /internal/game-role-revoke). */
export async function revokeShopRole(client, { serverId, userId, roleId }) {
  const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
  if (!guild) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member || !member.roles.cache.has(roleId)) return true;
  return member.roles.remove(roleId, "Server Season: shop role expired").then(() => true).catch(() => false);
}

/** Дава купена роля; връща причината, ако не може. */
export async function grantShopRole(guild, member, roleId) {
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return "missing";
  const reason = roleAssignabilityReason(role, guild.members.me);
  if (reason) return reason;
  if (member.roles.cache.has(roleId)) return null;
  return member.roles.add(role, "Server Season: shop purchase").then(() => null).catch(() => "failed");
}

/** Само за тестове. */
export const __test = { cooldown, pending, voiceJoined, settingsCache, spawnState };
