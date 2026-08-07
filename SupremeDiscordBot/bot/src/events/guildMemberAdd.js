// bot/src/events/guildMemberAdd.js
// Fires when a member joins a guild. Handles:
//   - Autorole (give roles automatically)
//   - Welcomer embed in a channel
//   - Welcomer DM
//
// Server-level settings loaded from backend.

import api from "../utils/api.js";
import { interpolate } from "../utils/variables.js";
import { logServerEvent } from "../utils/serverEventLog.js";
import { BRAND } from "../utils/colors.js";
import { isRoleSafeToSelfAssign } from "../utils/reactionRoles.js";

export default {
  name: "guildMemberAdd",
  once: false,
  async execute(member) {
    if (!member?.guild?.id) return;

    // ─── Server Event Logging (category "members", action "member_join") ──────
    // Fail-safe util — не хвърля; не пипаме welcomer/autorole логиката отдолу.
    logServerEvent(member.client, member.guild, {
      category: "members",
      action: "member_join",
      targetId: member.id,
      targetTag: member.user?.tag || member.user?.username || null,
      actorId: member.id,
    });

    let server;
    try {
      const { data } = await api.get(`/bot/server/${member.guild.id}`);
      server = data;
    } catch (err) {
      // Гол `catch { return; }` значеше, че при недостъпен backend НИТО
      // welcomer-ът, НИТО autorole-ът сработват — и никой не научава. Собственикът
      // вижда „новите членове не получават роля" без никаква следа защо.
      // (Разбивача, 07.08.2026)
      console.warn(
        `[guildMemberAdd] конфигурацията за guild ${member.guild.id} е недостъпна (${err?.message}) — welcomer и autorole се пропускат за ${member.user?.tag ?? member.id}`,
      );
      return;
    }

    if (!server) {
      console.warn(`[guildMemberAdd] guild ${member.guild.id} няма запис в backend-а — welcomer и autorole се пропускат`);
      return;
    }

    // ─── 1. Autorole ──────────────────────────────────────────────────────────
    const roleIdsToAssign = member.user.bot
      ? (server.autoroleBotIds || [])
      : (server.autoroleIds || []);

    // Гард срещу ескалация на права — същият, който Reaction Roles има от
    // 05.08.2026, но autorole беше БЕЗ него, при това е по-опасен: прилага се
    // автоматично на ВСЕКИ влизащ, без никакво действие от негова страна.
    //
    // Сценарият: админ с Manage Server (който сам може да НЯМА Administrator)
    // задава autorole → роля с Administrator. Всеки нов член става администратор
    // и йерархията на Discord е заобиколена през нашия бот. Отказваме и логваме
    // ясно — по-добре необичайна конфигурация да не сработи, отколкото тих
    // превзет сървър. (Разбивача, 07.08.2026)
    const botMember = member.guild.members.me;
    for (const roleId of roleIdsToAssign) {
      const role = member.guild.roles.cache.get(roleId)
        || await member.guild.roles.fetch(roleId).catch(() => null);
      if (!isRoleSafeToSelfAssign(role, botMember)) {
        console.warn(
          `[autorole] ОТКАЗАНА роля ${roleId} в guild ${member.guild.id}: опасни права, managed или над ботската роля`,
        );
        continue;
      }
      try {
        await member.roles.add(roleId, "Autorole on join");
      } catch (err) {
        // Common cause: role hierarchy — bot role must be above target role
        console.warn(`[autorole] Failed to add ${roleId} to ${member.user.tag}: ${err.message}`);
      }
    }

    // Build interpolation context for welcomer messages
    const ctx = {
      user: { id: member.id, username: member.user.username, tag: member.user.tag },
      server: { id: member.guild.id, name: member.guild.name },
      memberCount: member.guild.memberCount,
    };

    // ─── 2. Welcomer channel ──────────────────────────────────────────────────
    if (server.welcomerEnabled && server.welcomerChannelId && server.welcomerMessage) {
      const channel = await member.guild.channels.fetch(server.welcomerChannelId).catch(() => null);
      if (channel) {
        const content = interpolate(server.welcomerMessage, ctx);
        const color = parseHex(server.welcomerEmbedColor);
        await channel.send({
          embeds: [{
            title: `👋 Welcome to ${member.guild.name}!`,
            description: content,
            color,
            thumbnail: { url: member.user.displayAvatarURL({ size: 128 }) },
            footer: { text: `Member #${member.guild.memberCount}` },
            timestamp: new Date().toISOString(),
          }],
        }).catch(() => {});
      }
    }

    // ─── 3. Welcomer DM ───────────────────────────────────────────────────────
    if (server.welcomerDmEnabled && server.welcomerDmMessage) {
      try {
        const content = interpolate(server.welcomerDmMessage, ctx);
        await member.user.send({
          embeds: [{
            title: `Welcome to ${member.guild.name}!`,
            description: content,
            color: parseHex(server.welcomerEmbedColor),
            // Иконата на сървъра в DM-а: получателят вижда ОТКЪДЕ идва
            // съобщението, вместо гола кутия от непознат бот.
            thumbnail: member.guild.iconURL ? { url: member.guild.iconURL({ size: 128 }) } : undefined,
            footer: { text: member.guild.name },
            timestamp: new Date().toISOString(),
          }],
        });
      } catch { /* DMs disabled */ }
    }
  },
};

function parseHex(hex) {
  if (!hex) return BRAND;
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : BRAND;
}
