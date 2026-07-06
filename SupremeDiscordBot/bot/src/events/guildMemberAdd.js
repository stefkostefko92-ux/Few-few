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
    } catch { return; }

    if (!server) return;

    // ─── 1. Autorole ──────────────────────────────────────────────────────────
    const roleIdsToAssign = member.user.bot
      ? (server.autoroleBotIds || [])
      : (server.autoroleIds || []);

    for (const roleId of roleIdsToAssign) {
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
            footer: { text: member.guild.name },
          }],
        });
      } catch { /* DMs disabled */ }
    }
  },
};

function parseHex(hex) {
  if (!hex) return 0x00e5ff;
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x00e5ff;
}
