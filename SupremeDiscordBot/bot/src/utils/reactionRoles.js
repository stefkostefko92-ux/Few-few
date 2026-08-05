// bot/src/utils/reactionRoles.js
// v33 — Reaction Roles: общи помощници за events/ и internal handler-ите.
import api from "./api.js";

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
