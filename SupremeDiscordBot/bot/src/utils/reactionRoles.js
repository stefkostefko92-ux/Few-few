// bot/src/utils/reactionRoles.js
// v33 — Reaction Roles: общи помощници за events/ и internal handler-ите.
import { PermissionsBitField } from "discord.js";
import api from "./api.js";

// ─── Гард срещу privilege escalation (находка на Разбивача, 05.08.2026) ──────
// Reaction role, вързан за роля с опасни права, превръща обикновена реакция в
// self-service ескалация: член с права само да РЕАГИРА получава Administrator/
// Manage*. Manage Server-админ, който конфигурира формата, може да НЯМА тези
// права сам → заобикаля Discord йерархията през бота. Затова при РАЗДАВАНЕ
// отказваме роля с някое от следните права (независимо от йерархията).
const DANGEROUS_ROLE_PERMS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.ManageGuildExpressions,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ModerateMembers,
  PermissionsBitField.Flags.MentionEveryone,
  PermissionsBitField.Flags.ManageMessages,
  PermissionsBitField.Flags.ManageNicknames,
  PermissionsBitField.Flags.ViewAuditLog,
  // Модерация, която липсваше в списъка (червен екип, 13.11.2026): заглушаване,
  // оглушаване и местене на хора в гласов канал, чужди нишки и чужди събития.
  // Роля с такова право не се раздава сама — нито с реакция, нито автоматично,
  // нито от магазина, нито от снимка.
  PermissionsBitField.Flags.MuteMembers,
  PermissionsBitField.Flags.DeafenMembers,
  PermissionsBitField.Flags.MoveMembers,
  PermissionsBitField.Flags.ManageThreads,
  PermissionsBitField.Flags.ManageEvents,
];

/**
 * ЗАЩО пречи ролята — една дефиниция, две употреби.
 *
 * Ботът отказваше такава роля ТИХО (само ред в лога), а таблото я предлагаше на
 * човека, все едно е наред. За да няма второ, паралелно мнение в UI-я, таблото
 * пита СЪЩАТА функция и показва причината ПРЕДИ избора. (08.08.2026)
 *
 * @returns {null|"managed"|"dangerous"|"above_bot"} null = безопасна
 */
export function roleAssignabilityReason(role, botMember) {
  if (!role) return "managed";
  if (role.managed) return "managed";                     // интеграционна роля (бот/буст) — не се дава ръчно
  if (role.permissions.any(DANGEROUS_ROLE_PERMS)) return "dangerous";
  // Над ботската роля Discord и без това отказва, но проверяваме изрично.
  if (botMember && role.comparePositionTo(botMember.roles.highest) >= 0) return "above_bot";
  return null;
}

/**
 * Безопасна ли е ролята за self-service раздаване през реакция?
 * @param {import('discord.js').Role|null|undefined} role
 * @returns {boolean} false ако липсва/managed/има опасно право/над бота
 */
export function isRoleSafeToSelfAssign(role, botMember) {
  return roleAssignabilityReason(role, botMember) === null;
}

// ─── Emoji ключ ──────────────────────────────────────────────────────────────
// Каноничният формат, в който dashboard-ът пази двойките:
//   unicode  → самият знак ("🎮")
//   custom   → "name:id" ("pepe:123456789012345678"); анимираното може да е "a:name:id"
export function emojiKey(emoji) {
  return emoji?.id ? `${emoji.name}:${emoji.id}` : emoji?.name || "";
}

const SNOWFLAKE = /^\d{17,20}$/;

/**
 * Собственото емоджи се разпознава по `id`, не по име: преименуване на емоджито
 * в сървъра сменяше `name`, ключът „име:id“ спираше да съвпада и реакцията
 * мълчаливо не даваше роля (З5). Unicode емоджи се сравнява по знак.
 *
 * @param {string} stored  стойността от таблото („🎮“, „name:id“, „a:name:id“)
 * @param {{id?:string|null, name?:string|null}} emoji  емоджито от реакцията
 */
export function emojiMatches(stored, emoji) {
  if (!stored || !emoji) return false;
  if (emoji.id) {
    const id = String(stored).split(":").pop();
    return SNOWFLAKE.test(id) && id === emoji.id;
  }
  return stored === emoji.name;
}

/** Двойката за това емоджи, или undefined. */
export function findPair(rrm, emoji) {
  return rrm?.pairs?.find((p) => emojiMatches(p.emoji, emoji));
}

// ─── Реакции, махнати от самия бот ───────────────────────────────────────────
// Когато ботът маха реакция (отказана опасна роля, размяна в режим „една роля“),
// Discord връща събитие messageReactionRemove — и то не бива да свали роля,
// която човекът има по друг начин (З4). Белегът е кратък и се изяжда веднъж.
const BOT_REMOVAL_TTL_MS = 30 * 1000;
const botRemovals = new Map(); // `${messageId}:${userId}:${pairId}` → expiresAt

export function markBotRemoval(messageId, userId, pairId, now = Date.now()) {
  botRemovals.set(`${messageId}:${userId}:${pairId}`, now + BOT_REMOVAL_TTL_MS);
}

/** true, ако махането е от бота (и белегът се изразходва). */
export function consumeBotRemoval(messageId, userId, pairId, now = Date.now()) {
  const key = `${messageId}:${userId}:${pairId}`;
  const until = botRemovals.get(key);
  if (!until) return false;
  botRemovals.delete(key);
  return until > now;
}

// ─── TTL кеш messageId → rrm | null ─────────────────────────────────────────
// ВСЯКА реакция в guild-а минава оттук — без кеш (вкл. НЕГАТИВЕН за чужди
// съобщения) всяко react би удряло backend-а.
const cache = new Map(); // messageId → { rrm, expiresAt }
const CACHE_TTL = 60 * 1000;

export async function getRrmForMessage(messageId) {
  const now = Date.now();
  const hit = cache.get(messageId);
  if (hit && hit.expiresAt > now) return hit.rrm;

  let rrm = null;
  try {
    const { data } = await api.get(`/bot/reaction-roles/message/${messageId}`);
    rrm = data;
  } catch {
    rrm = null; // 404 = не е reaction-role съобщение → кешираме и това
  }
  cache.set(messageId, { rrm, expiresAt: now + CACHE_TTL });
  return rrm;
}

export function clearRrmCache(messageId) {
  if (messageId) cache.delete(messageId);
  else cache.clear();
}

// Периодично чистене, за да не расте Map-ът безкрайно.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
  for (const [k, until] of botRemovals) if (until <= now) botRemovals.delete(k);
}, CACHE_TTL).unref();

// ─── Embed builder ───────────────────────────────────────────────────────────
// Един и същ рендер при spawn и update, за да няма дрейф между двете.
export function buildReactionRoleEmbed(rrm) {
  const lines = rrm.pairs.map((p) => {
    const emoji = p.emoji.includes(":") ? `<:${p.emoji}>` : p.emoji;
    return `${emoji} — <@&${p.roleId}>${p.label ? ` · ${p.label}` : ""}`;
  });

  return {
    title: rrm.title,
    description: [rrm.description, "", ...lines].filter((x, i) => x !== "" || i === 1).join("\n").trim(),
    color: parseInt((rrm.color || "#5865F2").replace("#", ""), 16),
    footer: {
      text: rrm.exclusive
        ? "React to get a role · one role at a time"
        : "React to get a role · remove your reaction to remove it",
    },
  };
}
