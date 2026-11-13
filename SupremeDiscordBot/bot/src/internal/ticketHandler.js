// bot/src/internal/ticketHandler.js
import { buildStatusEmbed } from "../utils/embed.js";
import { INFO } from "../utils/colors.js";
import { closeTicket, finalizeClosedTicketById } from "../utils/ticketLifecycle.js";
import { t, resolveLangForGuild } from "../i18n/index.js";

/**
 * Затваряне от таблото: БД вече е CLOSED (условен запис в бекенда); тук е ЕДНАТА
 * Discord част (категория „затворени“ / заключена нишка, Reopen/Delete,
 * транскрипт, ЛС, оценка, лог) — не изтриване на канала след 5 секунди.
 */
export async function handleTicketClose(client, { ticketId, serverId, closedById = null, reason = null, fullArchiveUrl = null }) {
  if (typeof serverId !== "string" || !ticketId) return { ok: false, code: "BAD_REQUEST" };
  return finalizeClosedTicketById(client, { ticketId, serverId, closedById, reason, fullArchiveUrl });
}

/**
 * Автозатваряне по неактивност (от планировчика): ботът затваря ПО ЕДНИЯ път —
 * условно в базата (`lastActivityAt < cutoff`) и после Discord частта. Ботът
 * недостъпен → в базата нищо не е променено и планировчикът опитва пак.
 * @returns {Promise<{ok:true, closed:boolean, code?:string}>}
 */
export async function handleTicketAutoClose(client, { ticketId, serverId, hours, inactiveBeforeMs }) {
  if (typeof serverId !== "string" || !ticketId) return { ok: false, closed: false, code: "BAD_REQUEST" };
  const lang = await resolveLangForGuild(serverId);
  const r = await closeTicket(client, {
    ticketId, guildId: serverId, closedById: null,
    reason: t("tkt.autoCloseReason", lang, { hours }),
    inactiveBeforeMs: Number(inactiveBeforeMs) || null,
    source: "inactivity", lang,
  });
  return { ok: true, closed: !!r.ok, ...(r.ok ? {} : { code: r.code }) };
}

export async function handleTicketClaim(client, { ticketId, serverId, channelId, claimerId }) {
  // Fallback към REST fetch — кешът може да е студен след рестарт/sharding.
  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  let claimer;
  try {
    claimer = await client.users.fetch(claimerId);
  } catch {}

  await channel.send({
    embeds: [buildStatusEmbed(
      "🛡️ Ticket Claimed",
      claimer ? `This ticket is now being handled by <@${claimer.id}>` : "This ticket has been claimed.",
      INFO,
      { client }
    )],
  });
}
