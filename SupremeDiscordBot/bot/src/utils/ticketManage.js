// bot/src/utils/ticketManage.js
// Действия с тикет, поискани от таблото — същото като командите в Discord (паритет, 28.11.2026):
//   priority → обява в канала (/ticket priority)      rename → /rename
//   add, remove → /ticket add|remove                   move → /escalate (moveTicketToPanel)
// Правата и Premium се проверяват в backend-а ПРЕДИ да стигне дотук; тук е само Discord.
import { buildStatusEmbed } from "./embed.js";
import { priorityColor } from "./priority.js";
import { moveTicketToPanel } from "./ticketLifecycle.js";
import { t, resolveLangForGuild } from "../i18n/index.js";

const REASON = "Supreme Bot: change from the dashboard";

export async function manageTicket({ guild, channel, action, priority, name, userId, currentPanel, targetPanel }) {
  const thread = channel.isThread?.() === true;
  switch (action) {
    case "priority": {
      const lang = await resolveLangForGuild(guild.id);
      await channel.send({
        embeds: [buildStatusEmbed("🎯 Ticket Priority", t("ticket.priorityUpdated", lang, { priority }), priorityColor(priority), { client: channel.client })],
        allowedMentions: { parse: [] },
      });
      return { ok: true };
    }
    case "rename":
      await channel.setName(name, REASON);
      return { ok: true };
    case "add":
      if (thread) await channel.members.add(userId);
      else await channel.permissionOverwrites.create(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      return { ok: true };
    case "remove":
      if (thread) await channel.members.remove(userId);
      else await channel.permissionOverwrites.delete(userId);
      return { ok: true };
    case "move": {
      const r = await moveTicketToPanel(channel, guild, currentPanel, targetPanel);
      return { ok: true, warnings: r.warnings || [] };
    }
    default:
      throw new Error(`unknown action: ${action}`);
  }
}

/** Търсене на член по име — за „добави човек“ в таблото. Навън излизат само ID и имена. */
export async function searchMembers(guild, query) {
  const found = await guild.members.search({ query, limit: 10 });
  return [...found.values()].map((m) => ({
    id: m.id,
    name: m.displayName || m.user?.globalName || m.user?.username || "",
    username: m.user?.username || "",
  }));
}
