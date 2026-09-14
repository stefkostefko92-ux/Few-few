// bot/src/events/channelDelete.js
// Когато тикет канал бъде изтрит от Discord, затваряме тикета в DB.
// Покрива случая, в който екипът ръчно трие канала вместо да ползва /ticket close.
// Изнесено от index.js в event модул, за да работи И за white-label ботовете
// (clientManager.loadEventModules чете само /events/).

import api from "../utils/api.js";
import { ticketChannelCache, stickyCache } from "../utils/ticketCaches.js";
import { logServerEvent, fetchAuditActor, isEventCategoryEnabled, AuditLogEvent } from "../utils/serverEventLog.js";
import { CHANNEL_TYPE_LABELS } from "../utils/channelTypes.js";

export default {
  name: "channelDelete",
  once: false,
  async execute(channel) {
    ticketChannelCache.delete(channel.id);
    stickyCache.delete(channel.id);

    // Always ask the API — the deleted channel may be a ticket we never cached
    try {
      await api.post(`/bot/ticket/by-channel/${channel.id}/close-if-open`, {
        reason: "Discord channel was deleted",
        closedById: null,
      });
    } catch {
      // Silently ignore — channel may not have been a ticket
    }

    // Server Event Logging — category "server". Отделно от тикет cleanup-а
    // по-горе: то е вътрешна хигиена, това е одитна следа за собственика.
    try {
      const guild = channel.guild;
      if (!guild?.id) return;
      if (!(await isEventCategoryEnabled(guild.id, "server"))) return;

      const actor = await fetchAuditActor(guild, AuditLogEvent.ChannelDelete, channel.id);
      await logServerEvent(channel.client, guild, {
        category: "server",
        action: "channel_delete",
        actorId: actor?.executorId || null,
        actorTag: actor?.executorTag || null,
        // НАРОЧНО без top-level channelId (за разлика от channelCreate/Update):
        // то се рисува като <#id>, а изтрит канал излиза „#deleted-channel“ —
        // безполезно. Суровият id в metadata се показва като „Channel ID“ и
        // остава използваем за одитна следа.
        metadata: {
          name: channel.name || "(unknown)",
          type: CHANNEL_TYPE_LABELS[channel.type] || String(channel.type),
          channelId: channel.id,
        },
      });
    } catch (err) {
      console.warn(`[channelDelete] event log error: ${err?.message}`);
    }
  },
};
