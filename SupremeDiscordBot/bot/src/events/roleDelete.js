// bot/src/events/roleDelete.js
// Server Event Logging — category "server", action "role_delete".
// Ролята вече не съществува, затова логваме ИМЕТО (mention би се показал като
// счупен @deleted-role).
import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";

export default {
  name: "roleDelete",
  once: false,
  async execute(role) {
    try {
      const guild = role.guild;
      if (!guild?.id) return;
      if (!(await isEventCategoryEnabled(guild.id, "server"))) return;

      const actor = await fetchAuditActor(guild, AuditLogEvent.RoleDelete, role.id);
      await logServerEvent(role.client, guild, {
        category: "server",
        action: "role_delete",
        actorId: actor?.executorId || null,
        actorTag: actor?.executorTag || null,
        metadata: { name: role.name || "(unknown)", roleId: role.id },
      });
    } catch (err) {
      console.warn(`[roleDelete] error: ${err?.message}`);
    }
  },
};
