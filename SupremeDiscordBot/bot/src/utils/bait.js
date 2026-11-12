// bot/src/utils/bait.js
// v52 — канал-стръв за спам ботове (/bait). Вътрешно: таблица honeypot_configs
// и пътища /bot/honeypot/* — създадени с миграция v52, имената им не се виждат.
//
// Компрометирани акаунти и спам ботове пускат една и съща измама във ВСЕКИ
// канал, който виждат. Хората четат предупреждението в канала-стръв и не пишат
// там. Значи който напише там, почти сигурно е бот → изваждаме го веднага:
//   • softban — бан + веднага разбан: Discord трие съобщенията му от последния
//     час във всички канали, а човекът може да се върне с покана (по подразбиране);
//   • ban     — същото, без разбан;
//   • timeout — 24 ч без писане (само това съобщение се трие).
// Собственикът на сървъра и екипът (Administrator / Manage Server / Manage
// Messages / Moderate Members / Ban Members) не се пипат — само съобщението се трие и
// логът казва защо. Съдържанието на съобщението НЕ се чете: решава каналът.
//
// Настройките са в backend-а (lib/honeypot.js); тук е кеш 60 s, изпълнението,
// предупреждението в канала и логът.
import { EmbedBuilder, PermissionFlagsBits } from "discord.js";
import api from "./api.js";
import { DANGER, WARNING } from "./colors.js";
import { t, resolveLangForGuild } from "../i18n/index.js";

const CONFIG_TTL_MS = 60 * 1000;
export const DELETE_MESSAGE_SECONDS = 60 * 60;   // съобщенията от последния час
export const TIMEOUT_MS = 24 * 60 * 60 * 1000;
const HANDLED_TTL_MS = 30 * 1000;                // спам бот пише по няколко пъти в секунда

const cache = new Map();      // serverId → { config, expiresAt }
const inflight = new Map();   // serverId → Promise<config>
const handled = new Map();    // `${serverId}:${userId}` → до кога не го пипаме пак

// Екипът не захапва стръвта (тест на модератор, грешен клик) — само логваме.
const STAFF_PERMS = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.BanMembers,
];
// За да постави и поддържа предупреждението; Manage Messages — за да трие.
export const TRAP_CHANNEL_PERMS = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages,
];
const ACTION_PERM = { softban: PermissionFlagsBits.BanMembers, ban: PermissionFlagsBits.BanMembers, timeout: PermissionFlagsBits.ModerateMembers };

// Самоналожен таван за лични съобщения: вълна от спам ботове не бива да кара
// бота да праща стотици DM-и (Discord наказва такъв поток).
const DM_WINDOW_MS = 60 * 1000;
const DM_MAX_PER_WINDOW = 30;
let dmWindow = { startedAt: 0, count: 0 };
function takeDmSlot(now = Date.now()) {
  if (now - dmWindow.startedAt > DM_WINDOW_MS) dmWindow = { startedAt: now, count: 0 };
  if (dmWindow.count >= DM_MAX_PER_WINDOW) return false;
  dmWindow.count++;
  return true;
}

export async function getBait(serverId) {
  const c = cache.get(serverId);
  if (c && c.expiresAt > Date.now()) return c.config;
  if (inflight.has(serverId)) return inflight.get(serverId);
  const p = api.get(`/bot/honeypot/${serverId}`)
    .then(({ data }) => { cache.set(serverId, { config: data, expiresAt: Date.now() + CONFIG_TTL_MS }); return data; })
    // Backend-ът е долу → последното известно (не „изключен“), и то кеширано:
    // иначе всяко съобщение във всеки сървър би било нова заявка към падналия backend.
    .catch(() => { const config = c?.config || null; cache.set(serverId, { config, expiresAt: Date.now() + CONFIG_TTL_MS }); return config; })
    .finally(() => inflight.delete(serverId));
  inflight.set(serverId, p);
  return p;
}

export function invalidateBait(serverId) { cache.delete(serverId); }

export const actionLabel = (action, lang) => t(`bait.action.${action}`, lang);
export const permLabel = (action, lang) => t(action === "timeout" ? "bait.perm.timeout" : "bait.perm.ban", lang);

/** Предупреждението в канала-стръв. */
export function warningMessage(config, lang) {
  const action = ["softban", "ban", "timeout"].includes(config.action) ? config.action : "softban";
  const embed = new EmbedBuilder()
    .setColor(WARNING)
    .setTitle(t("bait.warning.title", lang))
    .setDescription(`${t(`bait.warning.${action}`, lang)}\n\n${t("bait.warning.count", lang, { count: config.caughtCount || 0 })}`);
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

function exemptReason(message) {
  if (message.guild?.ownerId === message.author.id) return "owner";
  if (message.member?.permissions?.any?.(STAFF_PERMS)) return "staff";
  return null;
}

/** Може ли ботът да приложи действието върху този член (право + йерархия). */
function canAct(member, me, action) {
  if (!me?.permissions?.has?.(ACTION_PERM[action])) return false;
  if (!member) return action !== "timeout"; // бан по id работи и без член в кеша
  return action === "timeout" ? !!member.moderatable : !!member.bannable;
}

async function sendLog(guild, config, lang, payload) {
  if (!config.logChannelId) return;
  const ch = guild.channels?.cache?.get(config.logChannelId);
  if (!ch?.isTextBased?.()) return;
  await ch.send({ ...payload, allowedMentions: { parse: [] } }).catch(() => {});
}

/**
 * Обработва съобщение в сървър. Връща true, ако е било в канала-стръв (тогава
 * повикващият спира — без XP, sticky и т.н. за това съобщение).
 */
export async function onBaitMessage(message, now = Date.now()) {
  if (!message.guildId || message.author?.bot || message.system || message.webhookId) return false;
  const config = await getBait(message.guildId);
  if (!config?.enabled || !config.channelId || config.channelId !== message.channelId) return false;

  const key = `${message.guildId}:${message.author.id}`;
  const until = handled.get(key);
  if (until && until > now) { await message.delete().catch(() => {}); return true; }
  handled.set(key, now + HANDLED_TTL_MS);
  if (handled.size > 5000) for (const [k, v] of handled) if (v <= now) handled.delete(k);

  const guild = message.guild;
  const lang = await resolveLangForGuild(message.guildId).catch(() => "en");
  const action = ["softban", "ban", "timeout"].includes(config.action) ? config.action : "softban";
  const user = message.author;
  const who = `<@${user.id}> (\`${user.tag || user.username}\`, ${user.id})`;
  const where = `<#${config.channelId}>`;
  const reason = t("bait.reason", lang);

  await message.delete().catch(() => {});

  const exempt = exemptReason(message);
  if (exempt) {
    await sendLog(guild, config, lang, { content: t("bait.log.exempt", lang, { user: who, channel: where }) });
    return true;
  }

  const me = guild.members?.me;
  const member = message.member || null;
  if (!canAct(member, me, action)) {
    await sendLog(guild, config, lang, { content: t("bait.log.failed", lang, { user: who, channel: where, action: actionLabel(action, lang), perm: permLabel(action, lang) }) });
    return true;
  }

  // Личното съобщение — ПРЕДИ действието: след бан нямаме общ сървър и Discord
  // го отказва. Кратко чакане: бавен DM не бива да забавя изваждането.
  if (config.dmUser && takeDmSlot(now)) {
    const dm = user.send({ content: t("bait.dm.body", lang, { server: guild.name, action: actionLabel(action, lang) }), allowedMentions: { parse: [] } }).catch(() => {});
    await Promise.race([dm, new Promise((r) => setTimeout(r, 2000).unref?.())]);
  }

  let outcome = "ok";
  try {
    if (action === "timeout") {
      await member.timeout(TIMEOUT_MS, reason);
    } else {
      await guild.members.ban(user.id, { deleteMessageSeconds: DELETE_MESSAGE_SECONDS, reason });
      if (action === "softban") {
        try { await guild.members.unban(user.id, reason); } catch { outcome = "unbanFailed"; }
      }
    }
  } catch {
    outcome = "failed";
  }

  if (outcome === "failed") {
    await sendLog(guild, config, lang, { content: t("bait.log.failed", lang, { user: who, channel: where, action: actionLabel(action, lang), perm: permLabel(action, lang) }) });
    return true;
  }

  let caughtCount = (config.caughtCount || 0) + 1;
  try {
    ({ data: { caughtCount } } = await api.post(`/bot/honeypot/${message.guildId}/caught`));
  } catch { /* броячът е козметика — действието вече е станало */ }
  config.caughtCount = caughtCount; // кешът показва новото число до следващото четене

  const created = Math.floor((user.createdTimestamp || 0) / 1000);
  const embed = new EmbedBuilder()
    .setColor(DANGER)
    .setTitle(t("bait.log.title", lang))
    .addFields(
      { name: t("bait.log.user", lang), value: who, inline: false },
      { name: t("bait.log.account", lang), value: created ? `<t:${created}:R>` : "—", inline: true },
      { name: t("bait.log.action", lang), value: actionLabel(action, lang), inline: true },
      { name: t("bait.log.total", lang), value: String(caughtCount), inline: true },
    );
  if (user.displayAvatarURL) embed.setThumbnail(user.displayAvatarURL());
  await sendLog(guild, config, lang, { embeds: [embed] });
  if (outcome === "unbanFailed") await sendLog(guild, config, lang, { content: t("bait.log.unbanFailed", lang, { user: who }) });

  await refreshWarning(message.channel, config, lang);
  return true;
}

async function refreshWarning(channel, config, lang) {
  if (!config.warningMessageId || !channel?.messages) return;
  const msg = await channel.messages.fetch(config.warningMessageId).catch(() => null);
  if (msg) await msg.edit(warningMessage(config, lang)).catch(() => {});
}

/**
 * Привежда предупреждението в съответствие с настройките: махане от стария
 * канал, публикуване в новия, ако липсва, махане при изключена стръв.
 * Вика се след /bait и когато таблото смени настройките.
 */
export async function syncBaitWarning(client, serverId, previous = null) {
  invalidateBait(serverId);
  const config = await getBait(serverId);
  if (!config) return { ok: false, reason: "BACKEND" };
  const guild = client.guilds?.cache?.get(serverId);
  if (!guild) return { ok: false, reason: "NO_GUILD" };
  const lang = await resolveLangForGuild(serverId).catch(() => "en");

  // Старото предупреждение (сменен канал) — махни го.
  if (previous?.warningMessageId && previous.channelId && previous.warningMessageId !== config.warningMessageId) {
    const old = guild.channels.cache.get(previous.channelId);
    await old?.messages?.delete?.(previous.warningMessageId).catch(() => {});
  }

  const channel = config.channelId ? guild.channels.cache.get(config.channelId) : null;
  if (!config.enabled) {
    if (channel && config.warningMessageId) await channel.messages.delete(config.warningMessageId).catch(() => {});
    if (config.warningMessageId) await api.patch(`/bot/honeypot/${serverId}/warning`, { messageId: null }).catch(() => {});
    invalidateBait(serverId);
    return { ok: true };
  }
  if (!channel?.isTextBased?.()) return { ok: false, reason: "NO_CHANNEL" };
  const me = guild.members?.me;
  if (!me || !channel.permissionsFor(me)?.has(TRAP_CHANNEL_PERMS)) return { ok: false, reason: "CHANNEL_PERMS" };

  const existing = config.warningMessageId ? await channel.messages.fetch(config.warningMessageId).catch(() => null) : null;
  if (existing) {
    await existing.edit(warningMessage(config, lang)).catch(() => {});
  } else {
    const sent = await channel.send(warningMessage(config, lang)).catch(() => null);
    if (!sent) return { ok: false, reason: "CHANNEL_PERMS" };
    await api.patch(`/bot/honeypot/${serverId}/warning`, { messageId: sent.id, channelId: channel.id }).catch(() => {});
  }
  invalidateBait(serverId);
  return { ok: true, actionPermMissing: !me.permissions?.has?.(ACTION_PERM[config.action] || PermissionFlagsBits.BanMembers) };
}

export const __test = { cache, handled, resetDm: () => { dmWindow = { startedAt: 0, count: 0 }; } };
