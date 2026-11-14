// bot/src/utils/ticketLifecycle.js
// Т2/Т3/Т15 — ЕДНА bot-страна на жизнения цикъл на тикета.
//
// `closeTicket` се вика от ВСИЧКИ пътища: бутона Close, `/ticket close`,
// вътрешния маршрут за таблото, автозатварянето по неактивност и напусналия
// създател. Условният запис е в бекенда (`lib/ticketClose.js`): два
// едновременни опита дават ЕДНО съобщение, а тикет с нова активност не се
// затваря. Тук е само Discord частта — и тя е една и съща навсякъде.
//
// ThreadChannel няма `setParent` и `permissionOverwrites` (discord.js 14.26.4),
// затова всяко действие върху канала има клон по `channel.isThread()`.
import { ActionRowBuilder, ButtonBuilder } from "discord.js";
import api from "./api.js";
import { t, resolveLangForGuild } from "../i18n/index.js";
import { BRAND, DANGER } from "./colors.js";
import { logTicketEvent } from "./ticketLog.js";
import { invalidateTicketChannel } from "./ticketCaches.js";
import { interpolate } from "./variables.js";

export const CLOSE_REASON_MAX = 1000;

const isThreadChannel = (ch) => typeof ch?.isThread === "function" && ch.isThread();


/**
 * Т4: бутонът Claim в приветственото съобщение е изключен след затваряне и
 * включен наново при reopen. Приветствието е ПЪРВОТО съобщение в канала
 * (`after: "0"` връща най-старите) — не разчитаме на закачането му.
 * Best effort: провал не е фатален (бекендът така или иначе отказва claim).
 */
export async function setClaimButtonDisabled(channel, ticketId, disabled) {
  try {
    const msgs = await channel?.messages?.fetch?.({ after: "0", limit: 5 });
    if (!msgs) return false;
    const claimId = `ticket:claim:${ticketId}`;
    for (const m of msgs.values()) {
      const rows = m.components || [];
      if (!rows.some((r) => (r.components || []).some((c) => c.customId === claimId))) continue;
      const newRows = rows.map((r) => new ActionRowBuilder().addComponents(
        (r.components || []).map((c) => {
          const b = ButtonBuilder.from(c);
          if (c.customId === claimId) b.setDisabled(disabled);
          return b;
        }),
      ));
      await m.edit({ components: newRows });
      return true;
    }
  } catch (e) {
    console.warn(`[ticket] claim button ${disabled ? "disable" : "enable"} failed: ${e?.message}`);
  }
  return false;
}

/** Резолвира канала В РАМКИТЕ на сървъра (никога чужд guild). */
async function resolveTicketChannel(client, guildId, channelId, given) {
  if (given) return given;
  if (!channelId) return null;
  const ch = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
  return ch && ch.guildId === guildId ? ch : null;
}

/**
 * Discord частта на затварянето (БД вече е CLOSED).
 * @returns {Promise<{warnings: string[]}>}
 */
export async function finalizeTicketClose(client, {
  guild, channel, ticket, panel, closedById = null, reason = null,
  transcriptUrl = null, transcriptChannelId = null, lang,
}) {
  const warnings = [];
  lang = lang || await resolveLangForGuild(guild.id);
  const thread = isThreadChannel(channel);
  const padding = panel?.counterPadding ?? 4;
  const ticketLabel = ticket.number != null
    ? `#${String(ticket.number).padStart(padding, "0")}`
    : String(ticket.id).slice(-8);

  // Абсолютен адрес — Discord иска http(s):// в embed url/бутон.
  let url = transcriptUrl;
  if (url && !/^https?:\/\//i.test(url)) url = null;

  if (channel && !thread) {
    // Категория „затворени“ (само канали — нишките нямат родител за местене).
    if (panel?.categoryClosedId && channel.parent?.id !== panel.categoryClosedId) {
      await channel.setParent(panel.categoryClosedId, { lockPermissions: false })
        .catch((e) => { warnings.push("category"); console.warn(`[ticket:close] setParent: ${e?.message}`); });
    }
    // Създателят не пише след затваряне.
    if (ticket.creatorId && channel.permissionOverwrites) {
      await channel.permissionOverwrites.edit(ticket.creatorId, { SendMessages: false })
        .catch((e) => { warnings.push("permissions"); console.warn(`[ticket:close] overwrites: ${e?.message}`); });
    }
  }

  // Транскрипт в канала за транскрипти.
  const tcId = panel?.transcriptChannelId || transcriptChannelId;
  if (tcId && url) {
    try {
      const tch = await guild.channels.fetch(tcId).catch(() => null);
      if (tch?.isTextBased?.()) {
        const me = guild.members?.me || await guild.members?.fetchMe?.().catch(() => null);
        const perms = me ? tch.permissionsFor?.(me) : null;
        if (!perms || perms.has("SendMessages")) {
          await tch.send({
            embeds: [{
              title: t("tkt.transcriptEmbedTitle", lang, { label: ticketLabel }),
              description: t("tkt.transcriptEmbedBody", lang, {
                channel: channel?.name || "—",
                creator: ticket.creatorId ? `<@${ticket.creatorId}>` : "—",
                closedBy: closedById ? `<@${closedById}>` : t("tkt.automatic", lang),
                panel: panel?.name || "—",
              }),
              color: BRAND,
              url,
              timestamp: new Date().toISOString(),
              footer: { text: `Ticket ID: ${ticket.id}` },
            }],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setStyle(5).setLabel(t("tkt.btnViewTranscript", lang)).setURL(url),
            )],
          });
        }
      }
    } catch (err) {
      console.error(`[ticket:close] transcript post failed: ${err?.message}`);
    }
  }

  // Съобщение за затваряне с Reopen / Delete / Transcript.
  if (channel) {
    const modRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket:reopen:${ticket.id}`).setLabel(t("tkt.btnReopen", lang)).setStyle(3).setEmoji("🔓"),
      new ButtonBuilder().setCustomId(`ticket:delete:${ticket.id}`).setLabel(t("tkt.btnDelete", lang)).setStyle(4).setEmoji("🗑️"),
      new ButtonBuilder().setCustomId(`ticket:transcript:${ticket.id}`).setLabel(t("tkt.btnViewTranscript", lang)).setStyle(2).setEmoji("📜"),
    );
    const safeReason = reason ? String(reason).slice(0, CLOSE_REASON_MAX) : null;
    const parts = [
      closedById ? t("tkt.closedBy", lang, { user: `<@${closedById}>` }) : t("tkt.closedAuto", lang),
      safeReason ? t("tkt.closeReasonLine", lang, { reason: safeReason }) : null,
      url ? `[${t("tkt.viewFullTranscript", lang)}](${url})` : null,
      t("tkt.modHint", lang),
    ].filter(Boolean);
    const sent = await channel.send({
      embeds: [{
        title: t("tkt.closedTitle", lang),
        description: parts.join("\n\n"),
        color: DANGER,
        timestamp: new Date().toISOString(),
      }],
      components: [modRow],
    }).catch((e) => { warnings.push("message"); console.error(`[ticket:close] close message failed: ${e?.message}`); return null; });
    void sent;
  }

  // ЛС до създателя + оценка — по ИЧИСТЕНИЯ по план панел.
  if (ticket.creatorId && (panel?.dmOnClose || panel?.feedbackEnabled)) {
    const creator = await client.users.fetch(ticket.creatorId).catch(() => null);
    if (creator && panel?.dmOnClose && panel?.dmOnCloseMessage) {
      try {
        await creator.send({
          embeds: [{
            description: interpolate(panel.dmOnCloseMessage, {
              user: { id: ticket.creatorId },
              ticket: { id: ticket.id, number: ticket.number, padding },
              server: { id: guild.id, name: guild.name },
              panel: { name: panel.name },
              reason: reason || "",
              memberCount: guild.memberCount,
            }),
            color: BRAND,
            footer: { text: guild.name },
          }],
        });
      } catch { /* ЛС затворени — не е фатално */ }
    }
    if (creator && panel?.feedbackEnabled) {
      try {
        const row = new ActionRowBuilder().addComponents(
          [1, 2, 3, 4, 5].map((n) => new ButtonBuilder()
            .setCustomId(`feedback:${ticket.id}:${n}`)
            .setLabel(`${n} ${"⭐".repeat(n)}`)
            .setStyle(2)),
        );
        await creator.send({
          embeds: [{
            title: t("tkt.feedbackTitle", lang),
            description: t("tkt.feedbackBody", lang, { number: String(ticket.number ?? "").padStart(padding, "0") }),
            color: BRAND,
            footer: { text: guild.name },
          }],
          components: [row],
        });
      } catch { /* ЛС затворени */ }
    }
  }

  // Лог.
  if (panel?.logChannelId) {
    await logTicketEvent(guild, panel.logChannelId, "CLOSE", {
      ticketNumber: ticket.number, padding,
      channel, user: { id: ticket.creatorId }, actor: closedById ? { id: closedById } : undefined,
      reason, color: DANGER,
    }).catch(() => {});
  }

  // Бутонът Claim се изключва (преди заключването на нишка).
  if (channel) await setClaimButtonDisabled(channel, ticket.id, true);

  // Нишка: заключване + архивиране ПОСЛЕДНО, за да минат съобщенията по-горе.
  if (channel && thread) {
    try {
      await channel.setLocked(true);
      await channel.setArchived(true);
    } catch (e) {
      warnings.push("thread");
      console.warn(`[ticket:close] thread lock/archive failed: ${e?.message}`);
    }
  }

  invalidateTicketChannel(channel?.id || ticket.channelId);
  return { warnings };
}

/**
 * Затваря тикет (условно в бекенда) и върши Discord частта.
 * @returns {Promise<{ok:true, ticket:object, warnings:string[]}|{ok:false, code:string}>}
 */
export async function closeTicket(client, {
  ticketId, guildId, closedById = null, reason = null,
  inactiveBeforeMs = null, source = "manual", channel = null, lang,
}) {
  let data;
  try {
    const res = await api.post(`/bot/ticket/${ticketId}/close`, {
      closedById, reason: reason ? String(reason).slice(0, CLOSE_REASON_MAX) : null,
      serverId: guildId, inactiveBeforeMs, source,
    });
    data = res.data;
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404 || status === 409) {
      return { ok: false, code: err.response.data?.code || (status === 404 ? "NOT_FOUND" : "ALREADY_CLOSED") };
    }
    throw err;
  }

  invalidateTicketChannel(data.channelId);
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { ok: true, ticket: data, warnings: ["guild"] };
  const ch = await resolveTicketChannel(client, guildId, data.channelId, channel);
  const { warnings } = await finalizeTicketClose(client, {
    guild, channel: ch, ticket: data, panel: data.panel || null,
    closedById, reason: data.closeReason ?? reason,
    transcriptUrl: data.fullArchiveUrl, transcriptChannelId: data.transcriptChannelId, lang,
  });
  return { ok: true, ticket: data, warnings };
}

/**
 * Затваряне, което БД вече е направила (затваряне от таблото): само Discord частта.
 * Зарежда тикета с изчистения по план панел от бекенда.
 */
export async function finalizeClosedTicketById(client, { ticketId, serverId, closedById = null, reason = null, fullArchiveUrl = null }) {
  const { data: ticket } = await api.get(`/bot/ticket/${ticketId}`);
  if (!ticket || ticket.serverId !== serverId) return { ok: false, code: "NOT_FOUND" };
  const guild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
  if (!guild) return { ok: false, code: "NO_GUILD" };
  const channel = await resolveTicketChannel(client, serverId, ticket.channelId, null);
  const { warnings } = await finalizeTicketClose(client, {
    guild, channel, ticket, panel: ticket.panel || null,
    closedById, reason: reason ?? ticket.closeReason,
    transcriptUrl: fullArchiveUrl, transcriptChannelId: ticket.panel?.transcriptChannelId || null,
  });
  return { ok: true, warnings };
}

/**
 * Discord частта на „отваряне наново“.
 * Нишка: САМО setArchived/setLocked (без setParent/permissionOverwrites).
 * Хвърля при провал на съществената стъпка за нишка (БД още не е пипана).
 * @returns {Promise<{warnings:string[]}>}
 */
export async function reopenTicketChannel(channel, panel, ticket) {
  const warnings = [];
  if (isThreadChannel(channel)) {
    await channel.setArchived(false);
    await channel.setLocked(false);
    if (ticket?.id) await setClaimButtonDisabled(channel, ticket.id, false);
    return { warnings };
  }
  const openCategory = panel?.categoryOpenId || panel?.categoryId;
  if (openCategory && channel?.parent?.id !== openCategory) {
    await channel.setParent(openCategory, { lockPermissions: false }).catch(() => warnings.push("category"));
  }
  if (ticket?.creatorId && channel?.permissionOverwrites) {
    await channel.permissionOverwrites.edit(ticket.creatorId, { SendMessages: true }).catch(() => warnings.push("permissions"));
  }
  if (ticket?.id) await setClaimButtonDisabled(channel, ticket.id, false);
  return { warnings };
}

/**
 * Discord частта на ескалация към друг панел. Нишка: без категория/overwrites —
 * екипът на новия панел се добавя като членове (best effort).
 * @returns {Promise<{added:string[], removed:string[], warnings:string[]}>}
 */
export async function moveTicketToPanel(channel, guild, currentPanel, targetPanel) {
  const warnings = [];
  const oldRoles = new Set(currentPanel?.supportRoleIds || []);
  const newRoles = new Set(targetPanel?.supportRoleIds || []);
  const removed = [...oldRoles].filter((r) => !newRoles.has(r));
  const added = [...newRoles].filter((r) => !oldRoles.has(r));

  if (isThreadChannel(channel)) {
    for (const roleId of added) {
      const role = guild?.roles?.cache?.get(roleId);
      for (const member of role?.members?.values?.() || []) {
        await channel.members.add(member.id).catch(() => {});
      }
    }
    return { added, removed: [], warnings };
  }

  const newCategory = targetPanel?.categoryOpenId || targetPanel?.categoryId;
  if (newCategory && channel.parent?.id !== newCategory) {
    await channel.setParent(newCategory, { lockPermissions: false }).catch(() => warnings.push("category"));
  }
  for (const roleId of removed) {
    await channel.permissionOverwrites.delete(roleId).catch(() => warnings.push("permissions"));
  }
  for (const roleId of added) {
    await channel.permissionOverwrites.create(roleId, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true,
    }).catch(() => warnings.push("permissions"));
  }
  return { added, removed, warnings };
}
