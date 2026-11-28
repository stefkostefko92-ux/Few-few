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
// Discord задържа преименуванията на канал (няколко за кратко време; не е в официалната
// документация). discord.js чака сам — затова не чакаме повече от това и казваме „на опашка“,
// вместо backend-ът да реши, че е провал, докато Discord после все пак го приложи (ревю, 28.11.2026).
const RENAME_WAIT_MS = 8000;
const notAMember = { ok: false, code: "NOT_A_MEMBER" };

/**
 * Човекът за /ticket add|remove — САМО член на сървъра, никога роля или @everyone.
 * discord.js приема и ID на роля в permissionOverwrites (резолвва първо роля), затова
 * суровото ID би могло да отвори тикета за целия сървър (ревю на Кодаджията, 28.11.2026).
 */
async function memberOf(guild, userId) {
  if (!userId || userId === guild.id || guild.roles?.cache?.has?.(userId)) return null;
  return guild.members.fetch(userId).catch(() => null);
}

export async function manageTicket({ guild, channel, action, priority, name, userId, currentPanel, targetPanel, renameWaitMs = RENAME_WAIT_MS }) {
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
    case "rename": {
      const done = channel.setName(name, REASON).then(() => "done");
      done.catch(() => {}); // ако остане на опашка и после падне — да не е необработен отказ
      const r = await Promise.race([done, new Promise((res) => { const t = setTimeout(() => res("queued"), renameWaitMs); t.unref?.(); })]);
      return r === "queued" ? { ok: true, queued: true } : { ok: true };
    }
    case "add": {
      const member = await memberOf(guild, userId);
      if (!member) return notAMember;
      if (thread) await channel.members.add(member.id);
      else await channel.permissionOverwrites.create(member, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      return { ok: true };
    }
    case "remove": {
      if (!userId || userId === guild.id || guild.roles?.cache?.has?.(userId)) return notAMember;
      const member = await memberOf(guild, userId);
      if (thread) {
        await channel.members.remove(userId);
        return { ok: true };
      }
      if (member) {
        await channel.permissionOverwrites.delete(member);
        return { ok: true };
      }
      // Напуснал сървъра: махаме само ЛИЧНОТО право в канала (тип „член“), ако го има.
      const ow = channel.permissionOverwrites.cache?.get?.(userId);
      if (ow?.type === 1) { await ow.delete(REASON); return { ok: true }; }
      return notAMember;
    }
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
