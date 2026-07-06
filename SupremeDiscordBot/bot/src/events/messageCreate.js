// bot/src/events/messageCreate.js
// Логва съобщения в тикет канали към DB transcript-а + sticky repost (v1.8).
// Изнесено от index.js в event модул, за да се закача И на главния клиент, И на
// всеки white-label клиент (clientManager.loadEventModules чете само /events/).
// Клиентът се взима от message.client (не се подава изрично).

import * as Sentry from "@sentry/node";
import api, { logTicketMessage } from "../utils/api.js";
import {
  ticketChannelCache,
  CACHE_TTL,
  stickyCache,
  STICKY_CACHE_TTL,
} from "../utils/ticketCaches.js";

export default {
  name: "messageCreate",
  once: false,
  async execute(message) {
    if (message.author.bot) return;
    if (!message.guildId) return;

    // ═══ v1.8 Sticky Messages ═══
    // Check if this channel has a sticky message. If so, delete previous
    // sticky post and re-send at the bottom of the channel.
    try {
      let sticky;
      const cachedSticky = stickyCache.get(message.channelId);
      if (cachedSticky && cachedSticky.expiresAt > Date.now()) {
        sticky = cachedSticky.sticky; // null = confirmed no sticky for this channel
      } else {
        ({ data: sticky } = await api.get(`/bot/sticky/channel/${message.channelId}`).catch(() => ({ data: null })));
        stickyCache.set(message.channelId, { sticky: sticky || null, expiresAt: Date.now() + STICKY_CACHE_TTL });
      }
      if (sticky && sticky.enabled && sticky.content) {
        // Delete previous sticky post
        if (sticky.currentMessageId) {
          try {
            const old = await message.channel.messages.fetch(sticky.currentMessageId);
            await old.delete();
          } catch { /* already gone */ }
        }
        // Post fresh sticky
        const embed = {
          description: sticky.content,
          color: parseInt((sticky.embedColor || "#00e5ff").replace("#", ""), 16),
        };
        if (sticky.embedTitle) embed.title = sticky.embedTitle;
        embed.footer = { text: "📌 Sticky" };
        const msg = await message.channel.send({ embeds: [embed] }).catch(() => null);
        if (msg) {
          sticky.currentMessageId = msg.id; // keep the cached copy in sync
          await api.patch(`/bot/sticky/channel/${message.channelId}`, { currentMessageId: msg.id }).catch(() => {});
        }
      }
    } catch { /* non-fatal */ }

    try {
      const now = Date.now();
      let ticketId;  // undefined = not yet resolved; null = confirmed not a ticket

      const cached = ticketChannelCache.get(message.channelId);
      if (cached && cached.expiresAt > now) {
        ticketId = cached.ticketId; // hit: null = not a ticket, string = ticket ID
      } else {
        if (cached) ticketChannelCache.delete(message.channelId); // expired entry

        // Cache miss — query API
        let ticket = null;
        let apiError = null;
        try {
          const res = await api.get(`/bot/ticket/by-channel/${message.channelId}`);
          ticket = res.data;
        } catch (err) {
          apiError = err?.response?.status || err.message;
          // 404 = not a ticket channel, that's expected for non-ticket channels
          // 401/500/network = real problem, should log
          if (apiError !== 404) {
            console.error(`[msg-log] API error looking up channel ${message.channelId}:`, apiError, err?.response?.data);
          }
        }

        ticketId = ticket?.id ?? null;
        // Cache both hits AND misses to prevent repeat queries for non-ticket channels
        // Cache misses for shorter time if there was a non-404 error (retry sooner)
        const ttl = (apiError && apiError !== 404) ? 30 * 1000 : CACHE_TTL;
        ticketChannelCache.set(message.channelId, { ticketId, expiresAt: now + ttl });
      }

      if (!ticketId) return; // null = confirmed not a ticket

      const attachments = [...message.attachments.values()].map((a) => a.url);
      const authorTag = message.author.discriminator && message.author.discriminator !== "0"
        ? `${message.author.username}#${message.author.discriminator}`
        : message.author.username;

      try {
        await logTicketMessage(
          ticketId,
          message.author.id,
          authorTag,
          message.content || "[attachment only]",
          attachments
        );
        // Uncomment for debugging: console.log(`[msg-log] ✓ ticket=${ticketId} by=${authorTag}`);
      } catch (err) {
        console.error(`[msg-log] ❌ Failed to log message for ticket ${ticketId}:`, err?.response?.status, err?.response?.data || err.message);
      }
    } catch (err) {
      console.error(`[msg-log] ❌ Unexpected error:`, err.message);
      if (process.env.SENTRY_DSN) Sentry.captureException(err);
    }
  },
};
