// bot/src/events/guildMemberRemove.js
// When a member leaves a guild, check if any panels have `autoCloseOnLeave`
// enabled, and auto-close their open tickets.

import api from "../utils/api.js";

export default {
  name: "guildMemberRemove",
  once: false,
  async execute(member) {
    if (!member?.id || !member?.guild?.id) return;

    try {
      const { data: tickets } = await api.get(`/bot/user/${member.id}/open-tickets/${member.guild.id}`)
        .catch(() => ({ data: [] }));

      if (!Array.isArray(tickets) || !tickets.length) return;

      for (const ticket of tickets) {
        const panel = ticket.panel;
        if (!panel?.autoCloseOnLeave) continue;

        // Close the ticket via backend
        await api.post(`/bot/ticket/${ticket.id}/close`, {
          reason: "Ticket creator left the server",
        }).catch(() => {});

        // Optionally delete the channel — keeps it if just closed
        const ch = await member.guild.channels.fetch(ticket.channelId).catch(() => null);
        if (ch) {
          await ch.send({
            embeds: [{
              title: "🔒 Ticket Auto-Closed",
              description: `<@${member.id}> has left the server. This ticket has been automatically closed.`,
              color: 0xef4444,
              timestamp: new Date().toISOString(),
            }],
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[guildMemberRemove] auto-close failed:", err?.message);
    }
  },
};
