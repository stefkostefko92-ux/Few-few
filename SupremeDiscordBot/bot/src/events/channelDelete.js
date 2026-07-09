// bot/src/events/channelDelete.js
// Когато тикет канал бъде изтрит от Discord, затваряме тикета в DB.
// Покрива случая, в който екипът ръчно трие канала вместо да ползва /ticket close.
// Изнесено от index.js в event модул, за да работи И за white-label ботовете
// (clientManager.loadEventModules чете само /events/).

import api from "../utils/api.js";
import { ticketChannelCache, stickyCache } from "../utils/ticketCaches.js";

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
  },
};
