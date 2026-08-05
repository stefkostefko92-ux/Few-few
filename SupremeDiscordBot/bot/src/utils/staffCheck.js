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
    const server = await getServer(interaction.guildId);
    const roleIds = new Set();
    for (const panel of server?.panels || []) {
      for (const r of panel.supportRoleIds || []) roleIds.add(r);
    }
    if (!roleIds.size) return false;
    return [...roleIds].some((r) => interaction.member?.roles?.cache?.has(r));
  } catch {
    // Backend unreachable — fail closed for a permission check (unlike the
    // blacklist cache, which fails open so an outage doesn't disable the bot;
    // here the risk direction is reversed: granting staff access on a guess).
    return false;
  }
}
