// bot/src/events/roleCreate.js
// Server Event Logging — category "server", action "role_create".
import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";

export default {
  name: "roleCreate",
  once: false,
  async execute(role) {
    try {
      const guild = role.guild;
      if (!guild?.id) return;
      if (!(await isEventCategoryEnabled(guild.id, "server"))) return;

      const actor = await fetchAuditActor(guild, AuditLogEvent.RoleCreate, role.id);
      await logServerEvent(role.client, guild, {
        category: "server",
        action: "role_create",
        actorId: actor?.executorId || null,
        actorTag: actor?.executorTag || null,
        metadata: { role: `<@&${role.id}>`, name: role.name },
      });
    } catch (err) {
      console.warn(`[roleCreate] error: ${err?.message}`);
    }
  },
};
