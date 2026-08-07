// bot/src/events/guildMemberRemove.js
// When a member leaves a guild, check if any panels have `autoCloseOnLeave`
// enabled, and auto-close their open tickets.

import api from "../utils/api.js";
import { logServerEvent, fetchAuditActor, AuditLogEvent } from "../utils/serverEventLog.js";
import { DANGER, WARNING } from "../utils/colors.js";

export default {
  name: "guildMemberRemove",
  once: false,
  async execute(member) {
    if (!member?.id || !member?.guild?.id) return;

    // ─── Server Event Logging (category "members") ────────────────────────────
    // Best-effort разграничаване kick vs. доброволно напускане: ако има audit
    // log запис MemberKick за този target в последните ~5s → member_kick (с
    // актьор + reason), иначе member_leave. Отделен try/catch — не бива да чупи
    // ticket auto-close логиката отдолу.
    try {
      const targetTag = member.user?.tag || member.user?.username || null;
      const kick = await fetchAuditActor(member.guild, AuditLogEvent.MemberKick, member.id, 5000);
      if (kick) {
        await logServerEvent(member.client, member.guild, {
          category: "members",
          action: "member_kick",
          targetId: member.id,
          targetTag,
          actorId: kick.executorId,
          actorTag: kick.executorTag,
          metadata: kick.reason ? { reason: kick.reason } : null,
        });
      } else {
        await logServerEvent(member.client, member.guild, {
          category: "members",
          action: "member_leave",
          targetId: member.id,
          targetTag,
          actorId: member.id,
        });
      }
    } catch (err) {
      console.warn(`[guildMemberRemove] event-log error: ${err?.message}`);
    }

    try {
      const { data: tickets } = await api.get(`/bot/user/${member.id}/open-tickets/${member.guild.id}`)
        .catch(() => ({ data: [] }));

      if (!Array.isArray(tickets) || !tickets.length) return;

      for (const ticket of tickets) {
        const panel = ticket.panel;
        if (!panel?.autoCloseOnLeave) continue;

        // Close the ticket via backend.
        // `.catch(() => {})` тук значеше, че провалено затваряне минава НЕЗАБЕЛЯЗАНО
        // и въпреки това публикуваме „🔒 Ticket Auto-Closed“ в канала. Персоналът
        // чете, че тикетът е затворен, а в базата той е отворен: брои се в
        // лимитите, стои в таблото и никой не го поглежда пак.
        // (Разбивача, 07.08.2026)
        let closed = true;
        try {
          await api.post(`/bot/ticket/${ticket.id}/close`, {
            reason: "Ticket creator left the server",
          });
        } catch (err) {
          closed = false;
          console.warn(`[guildMemberRemove] тикет ${ticket.id} НЕ беше затворен: ${err?.message}`);
        }

        // Optionally delete the channel — keeps it if just closed
        const ch = await member.guild.channels.fetch(ticket.channelId).catch(() => null);
        if (ch && !closed) {
          // Казваме истината: тикетът остава отворен и иска ръчно затваряне.
          await ch.send({
            embeds: [{
              title: "⚠️ Auto-close failed",
              description: `<@${member.id}> has left the server, but this ticket could not be closed automatically. Please close it manually.`,
              color: WARNING,
              timestamp: new Date().toISOString(),
            }],
          }).catch(() => {});
        } else if (ch) {
          await ch.send({
            embeds: [{
              title: "🔒 Ticket Auto-Closed",
              description: `<@${member.id}> has left the server. This ticket has been automatically closed.`,
              color: DANGER,
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
