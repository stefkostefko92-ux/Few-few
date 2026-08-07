// bot/src/events/roleUpdate.js
// Server Event Logging — category "server".
// Разделя ПРАВАТА от козметиката: промяна на permissions е отделно действие
// (`role_permissions_update`), защото е чувствителна от гледна точка на
// сигурността и собственикът иска да я вижда открояваща се, а не смесена с
// „някой смени цвета на ролята“.
import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";
import { PermissionsBitField } from "discord.js";

/** Кои конкретни права са добавени/махнати (по име, не като битова маска). */
function diffPermissions(oldRole, newRole) {
  const before = new PermissionsBitField(oldRole.permissions?.bitfield ?? 0n).toArray();
  const after = new PermissionsBitField(newRole.permissions?.bitfield ?? 0n).toArray();
  const added = after.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !after.includes(p));
  return { added, removed };
}

export default {
  name: "roleUpdate",
  once: false,
  async execute(oldRole, newRole) {
    try {
      const guild = newRole.guild || oldRole.guild;
      if (!guild?.id) return;

      if (!(await isEventCategoryEnabled(guild.id, "server"))) return;

      const permsChanged = (oldRole.permissions?.bitfield ?? 0n) !== (newRole.permissions?.bitfield ?? 0n);
      const cosmetic = {};
      if (oldRole.name !== newRole.name) { cosmetic.before = oldRole.name; cosmetic.after = newRole.name; }
      if (oldRole.hexColor !== newRole.hexColor) cosmetic.color = `${oldRole.hexColor} → ${newRole.hexColor}`;
      if (oldRole.hoist !== newRole.hoist) cosmetic.hoisted = String(newRole.hoist);
      if (oldRole.mentionable !== newRole.mentionable) cosmetic.mentionable = String(newRole.mentionable);

      if (!permsChanged && !Object.keys(cosmetic).length) return; // нищо реално

      const actor = await fetchAuditActor(guild, AuditLogEvent.RoleUpdate, newRole.id);
      const actorFields = { actorId: actor?.executorId || null, actorTag: actor?.executorTag || null };

      if (permsChanged) {
        const { added, removed } = diffPermissions(oldRole, newRole);
        await logServerEvent(newRole.client, guild, {
          category: "server",
          action: "role_permissions_update",
          ...actorFields,
          metadata: {
            role: `<@&${newRole.id}>`,
            name: newRole.name,
            // Изброяваме по ИМЕ — сурова битова маска не помага на никого.
            ...(added.length && { granted: added.slice(0, 20).join(", ") }),
            ...(removed.length && { revoked: removed.slice(0, 20).join(", ") }),
          },
        });
      }

      if (Object.keys(cosmetic).length) {
        await logServerEvent(newRole.client, guild, {
          category: "server",
          action: "role_update",
          ...actorFields,
          metadata: { role: `<@&${newRole.id}>`, name: newRole.name, ...cosmetic },
        });
      }
    } catch (err) {
      console.warn(`[roleUpdate] error: ${err?.message}`);
    }
  },
};
