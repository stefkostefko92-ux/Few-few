// bot/src/utils/staffCheck.js
// v2.9 — единна "is this member support staff?" проверка, ползвана от /tag
// (add/remove/use) и от context menu командите (Create ticket from message,
// Open ticket for user). Няма единно server-wide "support role" поле в
// schema-та (supportRoleIds живее per-panel — виж Panel model), затова
// приемаме за staff всеки с ManageMessages/ManageGuild ИЛИ член на support
// ролята на кой да е панел в сървъра (същия критерий като isTicketStaff в
// interactionCreate.js, само без нужда от конкретен ticket/panel контекст).
import { getServer } from "./api.js";

/**
 * @param {import("discord.js").Interaction} interaction
 * @returns {Promise<boolean>}
 */
export async function isStaffMember(interaction) {
  const perms = interaction.member?.permissions;
  if (perms?.has?.("ManageMessages") || perms?.has?.("ManageGuild")) return true;

  try {
    const roleIds = await supportRoleIds(interaction.guildId);
    if (!roleIds.size) return false;
    return [...roleIds].some((r) => interaction.member?.roles?.cache?.has(r));
  } catch {
    // Backend unreachable — fail closed for a permission check (unlike the
    // blacklist cache, which fails open so an outage doesn't disable the bot;
    // here the risk direction is reversed: granting staff access on a guess).
    return false;
  }
}

// ─── Кеш на support ролите (30s) ─────────────────────────────────────────────
// Проверката се вика и от autocomplete handler-ите, а те се задействат на ВСЕКИ
// натиснат клавиш. Без кеш това е по едно backend извикване на буква — затова
// резултатът се пази кратко, по същия модел като eventLogConfigCache.
// Кешираме и празния резултат: сървър без support роли не бива да се пита пак
// на всяка буква.
const staffRoleCache = new Map(); // guildId → { roleIds:Set, expiresAt:number }
const STAFF_CACHE_TTL = 30_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of staffRoleCache) if (v.expiresAt <= now) staffRoleCache.delete(k);
}, STAFF_CACHE_TTL).unref?.();

async function supportRoleIds(guildId) {
  const now = Date.now();
  const hit = staffRoleCache.get(guildId);
  if (hit && hit.expiresAt > now) return hit.roleIds;

  const server = await getServer(guildId);
  const roleIds = new Set();
  for (const panel of server?.panels || []) {
    for (const r of panel.supportRoleIds || []) roleIds.add(r);
  }
  staffRoleCache.set(guildId, { roleIds, expiresAt: now + STAFF_CACHE_TTL });
  return roleIds;
}

/**
 * Гард за autocomplete: същият критерий като isStaffMember, но предназначен за
 * handler-и, които Discord вика на всеки клавиш. При отказ ПОВИКВАЩИЯТ трябва
 * да отговори с празен списък — autocomplete няма как да покаже грешка.
 */
export async function isStaffForAutocomplete(interaction) {
  return isStaffMember(interaction);
}

export const __testing = { staffRoleCache, STAFF_CACHE_TTL };
