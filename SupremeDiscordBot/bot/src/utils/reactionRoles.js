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
];

/**
 * Безопасна ли е ролята за self-service раздаване през реакция?
 * @param {import('discord.js').Role|null|undefined} role
 * @returns {boolean} false ако липсва/managed/има опасно право/над бота
 */
export function isRoleSafeToSelfAssign(role, botMember) {
  if (!role) return false;
  if (role.managed) return false;                         // интеграционна роля (бот/буст) — не се дава ръчно
  if (role.permissions.any(DANGEROUS_ROLE_PERMS)) return false;
  // Над ботската роля Discord и без това отказва, но проверяваме изрично.
  if (botMember && role.comparePositionTo(botMember.roles.highest) >= 0) return false;
  return true;
}

// ─── Emoji ключ ──────────────────────────────────────────────────────────────
// Каноничният формат, в който dashboard-ът пази двойките:
//   unicode  → самият знак ("🎮")
//   custom   → "name:id" ("pepe:123456789012345678")
export function emojiKey(emoji) {
  return emoji?.id ? `${emoji.name}:${emoji.id}` : emoji?.name || "";
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
