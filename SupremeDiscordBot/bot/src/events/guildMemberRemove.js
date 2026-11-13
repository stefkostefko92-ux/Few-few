// bot/src/events/guildMemberRemove.js
// When a member leaves a guild, check if any panels have `autoCloseOnLeave`
// enabled, and auto-close their open tickets.

import api from "../utils/api.js";
import { logServerEvent, fetchRemovalCause } from "../utils/serverEventLog.js";
import { WARNING } from "../utils/colors.js";
import { closeTicket } from "../utils/ticketLifecycle.js";
import { t, resolveLangForGuild } from "../i18n/index.js";

const AUDIT_RETRY_MS = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// В4: банът/изгонването е „наказание“ — снимка на ролите след него би го самоанулирала.
// Записът в одитния дневник идва със закъснение (и guildMemberRemove обикновено е по-бърз от него),
// затова при липса изчакваме ~1 s и проверяваме пак, а накрая питаме и списъка с банове.
async function isBanned(guild, userId) {
  try {
    const b = await guild.bans.fetch(userId);
    return !!b;
  } catch {
    return false; // 10026 Unknown Ban (не е баннат) или не можем да разберем → пазим както преди
  }
}

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
    // `kick`/`ban` се пазят ИЗВЪН блока: „лепкавите роли" по-долу трябва да
    // знаят дали напускането е доброволно (виж бележката там).
    let kick = null;
    let ban = null;
    try {
      const targetTag = member.user?.tag || member.user?.username || null;
      // ЕДНА заявка към audit log за двете причини (виж fetchRemovalCause).
      let cause = await fetchRemovalCause(member.guild, member.id, 5000);
      // В4: записът още липсва, а има какво да се снима → второ четене след ~1 s; и ако пак мълчи —
      // списъкът с банове (guild.bans.fetch). Частичен член няма роли, не плащаме за проверката.
      const worthChecking = !member.partial && [...member.roles.cache.values()].some((r) => r.id !== member.guild.id && !r.managed);
      if (!cause && worthChecking) {
        await sleep(AUDIT_RETRY_MS);
        cause = await fetchRemovalCause(member.guild, member.id, 5000 + AUDIT_RETRY_MS);
        if (!cause && (await isBanned(member.guild, member.id))) cause = { kind: "ban", executorId: null, executorTag: null, reason: null };
      }
      kick = cause?.kind === "kick" ? cause : null;
      ban = cause?.kind === "ban" ? cause : null;
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

    // ─── „Лепкави роли": заснемане на ролите при напускане ───────────────────
    // Отделен try/catch — снимката е удобство, а не бива да пречи на
    // авто-затварянето на тикети отдолу.
    //
    // `managed` роли се изключват СЕГА, а не при връщането: те се дават от
    // интеграции (бот роли, Nitro буст) и Discord не позволява да се раздават
    // ръчно — пазенето им би създало снимка, която обещава повече от реалното.
    // ПРОПУСКАМЕ при kick/ban. Иначе наказанието се самоанулира: изгонен
    // модератор се връща и ботът ЛЮБЕЗНО му връща правата, които току-що са
    // му отнети. Санкцията трябва да значи нещо. (Червен екип, 12.08.2026)
    if (kick || ban) {
      console.log(
        `[sticky-roles] ${member.id} напусна принудително (${kick ? "kick" : "ban"}) — ролите НЕ се пазят`,
      );
      // И старата снимка си отива: ако е останала от предишно доброволно напускане
      // (връщането не е станало или изтриването ѝ е паднало), след разбан ролите
      // щяха да се върнат (червен екип, 13.11.2026).
      await api.delete(`/bot/member-roles/${member.guild.id}/${member.id}`).catch(() => {});
    } else if (member.partial) {
      // В5: частичен член (извън кеша) няма роли — празна снимка би изтрила истинската.
      // Тикетът и логът по-долу/по-горе продължават да работят.
      console.log(`[sticky-roles] ${member.id} е частичен член (извън кеша) — снимка на роли не се прави`);
    } else try {
      const roleIds = [...member.roles.cache.values()]
        .filter((r) => r.id !== member.guild.id && !r.managed)   // @everyone има id = guild id
        .map((r) => r.id);
      await api.post(`/bot/member-roles/${member.guild.id}/${member.id}`, { roleIds });
    } catch (err) {
      console.warn(`[guildMemberRemove] ролите на ${member.id} не бяха запазени: ${err?.message}`);
    }

    try {
      const { data: tickets } = await api.get(`/bot/user/${member.id}/open-tickets/${member.guild.id}`)
        .catch(() => ({ data: [] }));

      if (!Array.isArray(tickets) || !tickets.length) return;

      const lang = await resolveLangForGuild(member.guild.id);
      for (const ticket of tickets) {
        const panel = ticket.panel;
        if (!panel?.autoCloseOnLeave) continue;

        // Т2: ЕДНОТО затваряне (utils/ticketLifecycle.js) — категория „затворени“ /
        // заключена нишка, Reopen/Delete, транскрипт, ЛС и оценка по изчистения
        // панел, лог, webhook. Преди: само статус в базата, каналът оставаше
        // отворен и пишем, а известието казваше „use the buttons above“ без бутони.
        // Провалено затваряне НЕ се маскира като успех (Разбивача, 07.08.2026):
        // казваме го в канала, а тикетът остава отворен за ръчно затваряне.
        let failed = false;
        try {
          await closeTicket(member.client, {
            ticketId: ticket.id,
            guildId: member.guild.id,
            closedById: null,
            reason: t("tkt.autoCloseLeft", lang),
            source: "creator_left",
            lang,
          });
        } catch (err) {
          failed = true;
          console.warn(`[guildMemberRemove] тикет ${ticket.id} НЕ беше затворен: ${err?.message}`);
        }

        if (failed && ticket.channelId) {
          const ch = await member.guild.channels.fetch(ticket.channelId).catch(() => null);
          await ch?.send({
            embeds: [{
              title: t("tkt.autoCloseFailedTitle", lang),
              description: t("tkt.autoCloseFailedBody", lang, { user: `<@${member.id}>` }),
              color: WARNING,
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
