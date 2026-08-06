// bot/src/utils/serverEventLog.js
// Споделен util за "Server Event Logging" — логва действия на членове (глас,
// членове, модерация) и съобщения (редакция/изтриване — категория "messages",
// добавена по желание на owner-а; съдържанието отива САМО в лог канала на
// СЪЩИЯ guild) в конфигуриран Discord канал. НЕ се пази в базата и НЕ се
// показва в dashboard-а (по желание на owner-а).
//
// Ползва се от event модулите под /events/ (voiceStateUpdate, guildMemberUpdate,
// guildBanAdd/Remove, guildMemberAdd/Remove), затова се закача И на главния
// клиент, И на всеки white-label клиент (clientManager.loadEventModules).
//
// Fail-safe контракт: НИКОГА не хвърля и не краш-ва извикващия. При грешка —
// само console.warn. Логването е странична функция; не бива да чупи welcomer,
// autorole, verification и т.н.

import api from "./api.js";
import { AuditLogEvent } from "discord.js";
import { SUCCESS, DANGER, WARNING, INFO, MUTED } from "./colors.js";

// ─── Per-guild конфиг кеш (като ticketCaches) ────────────────────────────────
// serverId → { config, expiresAt }. config = { enabled, channelId, categories }
// или null (потвърдено няма конфиг / disabled). Кешираме И hit, И miss, за да не
// бием backend GET при всяко voiceStateUpdate (гласовете шумят силно).
const eventLogConfigCache = new Map();
const CONFIG_CACHE_TTL = 60 * 1000;       // 60s — dashboard промените се разпространяват бързо
const CONFIG_CACHE_TTL_ERR = 15 * 1000;   // при не-404 грешка — retry по-скоро

// Периодично почистване, за да не расте кешът за неактивни guild-ове.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of eventLogConfigCache) if (v.expiresAt <= now) eventLogConfigCache.delete(k);
}, CONFIG_CACHE_TTL).unref();

// Цвят по категория (за визуално разграничаване в лог канала).
const CATEGORY_COLORS = {
  voice: INFO,       // blurple
  members: SUCCESS,     // green
  moderation: DANGER,  // red
  messages: WARNING,    // amber
  server: MUTED,        // структурни промени (канали/роли) — неутрално
};

// Човеко-четими заглавия по action string (exact strings — сверява се с backend).
const ACTION_LABELS = {
  // voice
  voice_join: "🔊 Joined Voice",
  voice_leave: "🔇 Left Voice",
  voice_move: "↔️ Moved Voice Channel",
  voice_server_mute: "🔇 Server Muted",
  voice_server_unmute: "🔊 Server Unmuted",
  voice_self_mute: "🔇 Self Muted",
  voice_self_unmute: "🔊 Self Unmuted",
  voice_server_deaf: "🔇 Server Deafened",
  voice_server_undeaf: "🔊 Server Undeafened",
  voice_self_deaf: "🔇 Self Deafened",
  voice_self_undeaf: "🔊 Self Undeafened",
  voice_stream_start: "📺 Started Streaming",
  voice_stream_stop: "📺 Stopped Streaming",
  voice_video_on: "📹 Camera On",
  voice_video_off: "📹 Camera Off",
  // members
  role_add: "➕ Role Added",
  role_remove: "➖ Role Removed",
  nickname_change: "✏️ Nickname Changed",
  timeout_add: "⏳ Member Timed Out",
  timeout_remove: "⏳ Timeout Removed",
  member_join: "📥 Member Joined",
  member_leave: "📤 Member Left",
  // moderation
  member_ban: "🔨 Member Banned",
  member_unban: "♻️ Member Unbanned",
  member_kick: "👢 Member Kicked",
  // messages
  message_edit: "✏️ Message Edited",
  message_delete: "🗑️ Message Deleted",
  message_bulk_delete: "🗑️ Messages Bulk Deleted",
  // server (структура: канали и роли)
  channel_create: "📁 Channel Created",
  channel_update: "✏️ Channel Updated",
  channel_delete: "🗑️ Channel Deleted",
  role_create: "🏷️ Role Created",
  role_update: "✏️ Role Updated",
  role_permissions_update: "🔐 Role Permissions Changed",
  role_delete: "🗑️ Role Deleted",
};

// Ключове от metadata, които buildEventEmbed рисува ПОИМЕННО (с точен ред и
// формат). Всичко извън този списък минава през общия проход накрая.
const RENDERED_META_KEYS = new Set([
  "roleIds", "fromChannelId", "toChannelId", "before", "after", "reason",
  "content", "attachments", "count", "messageUrl",
]);

// Човеко-четими заглавия за общия проход (липсва ли ключ — заглавието е самият
// ключ с главна буква, така новите ключове се показват, вместо да изчезват).
const META_LABELS = {
  name: "Name",
  type: "Type",
  role: "Role",
  roleId: "Role ID",
  channelId: "Channel ID",
  granted: "Granted",
  revoked: "Revoked",
  color: "Color",
  hoisted: "Hoisted",
  mentionable: "Mentionable",
  permissions: "Permission Overwrites",
  topicBefore: "Topic (before)",
  topicAfter: "Topic (after)",
  nsfw: "NSFW",
  slowmode: "Slowmode",
  category: "Category",
};

/**
 * Прочети (кеширано) per-guild event-log конфига от backend.
 * @returns {Promise<{enabled:boolean, channelId:string|null, categories:string[]}|null>}
 */
async function getEventLogConfig(serverId) {
  const now = Date.now();
  const cached = eventLogConfigCache.get(serverId);
  if (cached && cached.expiresAt > now) return cached.config;

  let config = null;
  let ttl = CONFIG_CACHE_TTL;
  try {
    const { data } = await api.get(`/bot/${serverId}/eventlog-config`);
    config = data || null;
  } catch (err) {
    const status = err?.response?.status;
    // 404 = няма конфиг (feature изключена за този guild) — нормално, кешираме null.
    if (status && status !== 404) {
      ttl = CONFIG_CACHE_TTL_ERR; // реален проблем — retry по-скоро
      console.warn(`[event-log] config fetch failed for ${serverId}: ${status || err.message}`);
    }
  }
  eventLogConfigCache.set(serverId, { config, expiresAt: now + ttl });
  return config;
}

/**
 * Построй чист embed за едно събитие.
 */
function buildEventEmbed({ category, action, actorId, targetId, channelId, metadata }) {
  const meta = metadata || {};
  const fields = [];

  if (targetId) fields.push({ name: "Member", value: `<@${targetId}>`, inline: true });
  // Actor само ако има И е различен от target (за self_* действия actor === target).
  if (actorId && actorId !== targetId) fields.push({ name: "Actor", value: `<@${actorId}>`, inline: true });
  if (channelId) fields.push({ name: "Channel", value: `<#${channelId}>`, inline: true });

  // Известни metadata ключове → чисти полета.
  if (Array.isArray(meta.roleIds) && meta.roleIds.length) {
    fields.push({ name: "Roles", value: meta.roleIds.map((r) => `<@&${r}>`).join(", ").slice(0, 1024), inline: false });
  }
  if (meta.fromChannelId) fields.push({ name: "From", value: `<#${meta.fromChannelId}>`, inline: true });
  if (meta.toChannelId) fields.push({ name: "To", value: `<#${meta.toChannelId}>`, inline: true });
  if (meta.before !== undefined && meta.before !== null && meta.before !== "") {
    fields.push({ name: "Before", value: String(meta.before).slice(0, 1024), inline: true });
  }
  if (meta.after !== undefined && meta.after !== null && meta.after !== "") {
    fields.push({ name: "After", value: String(meta.after).slice(0, 1024), inline: true });
  }
  if (meta.reason) fields.push({ name: "Reason", value: String(meta.reason).slice(0, 1024), inline: false });
  // messages категория
  if (meta.content) fields.push({ name: "Content", value: String(meta.content).slice(0, 1024), inline: false });
  if (meta.attachments) fields.push({ name: "Attachments", value: String(meta.attachments), inline: true });
  if (meta.count) fields.push({ name: "Count", value: String(meta.count), inline: true });
  if (meta.messageUrl) fields.push({ name: "Message", value: `[Jump to message](${meta.messageUrl})`, inline: true });

  // Всичко ОСТАНАЛО от metadata (категория "server" го ползва обилно: name/type/
  // role/granted/revoked/slowmode/permissions…). Без този проход embed-ът
  // мълчаливо изхвърляше всеки непознат ключ — тоест лог за промяна на права
  // излизаше с ЕДИНСТВЕНО заглавие и Actor, без да казва коя роля и кои права.
  for (const [key, value] of Object.entries(meta)) {
    if (RENDERED_META_KEYS.has(key)) continue;
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object") continue; // масиви/обекти нямат смислен вид тук
    const text = String(value);
    fields.push({
      name: META_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1),
      value: text.slice(0, 1024),
      inline: text.length <= 40,
    });
  }

  return {
    title: ACTION_LABELS[action] || action,
    color: CATEGORY_COLORS[category] ?? MUTED,
    fields: fields.slice(0, 25), // Discord лимит: ≤25 полета
    footer: { text: `${category} · ${action}` },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Евтина проверка (кеширана) дали категория е включена за guild-а — за event
 * handler-и, които вършат СКЪПА работа ПРЕДИ logServerEvent (напр.
 * fetchAuditLogs в messageDelete). Без нея audit fetch-ът се случва на всяко
 * изтрито съобщение във ВСЕКИ guild, дори с изключено логване (rate-limit
 * риск — находка на Дискорджията, 05.08.2026).
 */
export async function isEventCategoryEnabled(serverId, category) {
  const config = await getEventLogConfig(serverId);
  return !!(config?.enabled && Array.isArray(config.categories) && config.categories.includes(category));
}

/**
 * Логни едно server-event: (а) прати embed в конфигурирания лог канал,
 * (б) прати payload към backend за DB запис. Fail-safe — никога не хвърля.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {object} evt
 * @param {"voice"|"members"|"moderation"} evt.category
 * @param {string} evt.action  exact action string (виж ACTION_LABELS)
 * @param {string} [evt.actorId]
 * @param {string} [evt.actorTag]
 * @param {string} [evt.targetId]
 * @param {string} [evt.targetTag]
 * @param {string} [evt.channelId]
 * @param {object} [evt.metadata]
 */
export async function logServerEvent(client, guild, evt) {
  try {
    if (!guild?.id || !evt?.category || !evt?.action) return;

    const config = await getEventLogConfig(guild.id);
    if (!config?.enabled) return;
    if (!Array.isArray(config.categories) || !config.categories.includes(evt.category)) return;

    const { category, action, actorId, actorTag, targetId, targetTag, channelId, metadata } = evt;

    // (а) Прати embed в лог канала (fail-safe — липсващ канал/права само warn-ва).
    // v37 — всяка категория може да сочи към СВОЙ канал; липсва ли запис за
    // нея, пада обратно към общия. Така заварените конфигурации не се променят.
    const targetChannelId = config.channels?.[category] || config.channelId;
    if (targetChannelId) {
      try {
        const logChannel = client.channels.cache.get(targetChannelId)
          || await client.channels.fetch(targetChannelId).catch(() => null);
        // Guard: only log to a channel that belongs to THIS guild — otherwise an
        // admin could point eventLogChannelId at a channel in another server where
        // the bot is present and relay this guild's activity there.
        if (logChannel?.isTextBased?.() && logChannel.guildId === guild.id) {
          await logChannel.send({
            embeds: [buildEventEmbed({ category, action, actorId, targetId, channelId, metadata })],
            // allowedMentions guard: <@id>/<@&id> в embed-а НЕ бива да пингват —
            // това е лог, не известие.
            allowedMentions: { parse: [] },
          });
        } else {
          console.warn(`[event-log] log channel ${targetChannelId} (category ${category}) not found or not text-based for guild ${guild.id}`);
        }
      } catch (err) {
        console.warn(`[event-log] failed to post embed to ${targetChannelId} (category ${category}): ${err?.message}`);
      }
    }
    // Events are relayed to the server's own log channel only — NOT stored in
    // our database and NOT shown in the dashboard (by owner request).
  } catch (err) {
    // Твърд fail-safe: каквото и да се обърка, не чупим извикващия event handler.
    console.warn(`[event-log] unexpected error: ${err?.message}`);
  }
}

/**
 * Best-effort извличане на актьора (и reason) от audit log-а за дадено събитие.
 * Ползва се САМО за moderation/server-инициирани действия (ban, kick, server
 * mute/deaf, role/nickname промени от друг), НЕ при всяко self-mute — иначе
 * биваме rate-limit-нати на fetchAuditLogs.
 *
 * Fail-safe: при липса на ViewAuditLog право (или всяка друга грешка) → връща
 * null, извикващият просто пропуска actor-а.
 *
 * @param {import('discord.js').Guild} guild
 * @param {number} type  AuditLogEvent.* (напр. AuditLogEvent.MemberBanAdd)
 * @param {string} targetId  очакван target user id (за сверяване)
 * @param {number} [maxAgeMs=5000]  игнорирай стари записи (audit log е eventually consistent)
 * @returns {Promise<{ executorId: string|null, executorTag: string|null, reason: string|null }|null>}
 */
export async function fetchAuditActor(guild, type, targetId, maxAgeMs = 5000) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const now = Date.now();
    const entry = logs.entries.find(
      (e) => e.target?.id === targetId && now - e.createdTimestamp <= maxAgeMs,
    );
    if (!entry?.executor) return null;
    const ex = entry.executor;
    const tag = ex.discriminator && ex.discriminator !== "0" ? `${ex.username}#${ex.discriminator}` : ex.username;
    return { executorId: ex.id, executorTag: tag, reason: entry.reason || null };
  } catch {
    // Няма ViewAuditLog право или друга грешка — пропускаме actor-а тихо.
    return null;
  }
}

/**
 * Кой е преместил члена между гласови канали.
 *
 * MemberMove записите в audit log-а НЕ носят потребителя като `target` (за
 * разлика от MemberUpdate) — те са агрегирани: `extra.channel` е ЦЕЛЕВИЯТ
 * канал, `extra.count` колко души са преместени наведнъж. Затова общият
 * fetchAuditActor (който сравнява target.id) никога не намираше нищо и
 * преместването се приписваше на самия човек.
 *
 * Сверяваме по целеви канал + свежест. Ако човекът се е преместил САМ,
 * Discord изобщо не пише запис — липсата на съвпадение значи „сам се премести",
 * което е точно разграничението, което искаме.
 */
export async function fetchVoiceMoveActor(guild, toChannelId, maxAgeMs = 5000) {
  if (!toChannelId) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: 5 });
    const now = Date.now();
    const entry = logs.entries.find(
      (e) => e.extra?.channel?.id === toChannelId && now - e.createdTimestamp <= maxAgeMs,
    );
    if (!entry?.executor) return null;
    const ex = entry.executor;
    const tag = ex.discriminator && ex.discriminator !== "0" ? `${ex.username}#${ex.discriminator}` : ex.username;
    return { executorId: ex.id, executorTag: tag };
  } catch {
    return null; // няма ViewAuditLog право — тихо
  }
}

/** Кой е изключил члена от гласов канал (Discord: MemberDisconnect). */
export async function fetchVoiceDisconnectActor(guild, maxAgeMs = 5000) {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberDisconnect, limit: 5 });
    const now = Date.now();
    const entry = logs.entries.find((e) => now - e.createdTimestamp <= maxAgeMs);
    if (!entry?.executor) return null;
    const ex = entry.executor;
    const tag = ex.discriminator && ex.discriminator !== "0" ? `${ex.username}#${ex.discriminator}` : ex.username;
    return { executorId: ex.id, executorTag: tag };
  } catch {
    return null;
  }
}

export { AuditLogEvent };
export { eventLogConfigCache };
