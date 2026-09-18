// bot/src/events/channelCreate.js
// Server Event Logging — category "server", action "channel_create".
// Изисква само GatewayIntentBits.Guilds (непривилегирован). Актьорът идва
// best-effort от audit log (ChannelCreate). Закача се и на white-label
// клиентите (clientManager.loadEventModules).
import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";
import { CHANNEL_TYPE_LABELS } from "../utils/channelTypes.js";

export default {
  name: "channelCreate",
  once: false,
  async execute(channel) {
    try {
      const guild = channel.guild;
      if (!guild?.id) return;

      // Гейт ПРЕДИ audit-log fetch (rate limit) — виж messageDelete.
      if (!(await isEventCategoryEnabled(guild.id, "server"))) return;

      const actor = await fetchAuditActor(guild, AuditLogEvent.ChannelCreate, channel.id);

      await logServerEvent(channel.client, guild, {
        category: "server",
        action: "channel_create",
        actorId: actor?.executorId || null,
        actorTag: actor?.executorTag || null,
        channelId: channel.id,
        metadata: {
          name: channel.name || "(unnamed)",
          type: CHANNEL_TYPE_LABELS[channel.type] || String(channel.type),
        },
      });
    } catch (err) {
      console.warn(`[channelCreate] error: ${err?.message}`);
    }
  },
};
