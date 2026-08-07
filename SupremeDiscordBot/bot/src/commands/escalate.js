// bot/src/commands/escalate.js
// Move a ticket to another panel — TicketTool's $escalate equivalent.
// Changes the panel association, moves the channel to the new open category,
// and updates support role permissions.

import { SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { friendlyError } from "../utils/friendlyError.js";
import { WARNING } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { isStaffForAutocomplete } from "../utils/staffCheck.js";

export default {
  data: new SlashCommandBuilder()
    .setName("escalate")
    .setDescription("Move this ticket to a different panel / support team")
    .setDescriptionLocalizations(CMD_DESC_L10N.escalate)
    .addStringOption((opt) =>
      opt.setName("panel").setDescription("Target panel").setRequired(true).setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for escalation").setRequired(false).setMaxLength(500)
    ),

  async autocomplete(interaction) {
    // autocomplete е ОТДЕЛЕН тип взаимодействие — Discord го доставя, без да
    // мине през проверката в execute(). Без този гард падащото меню показваше
    // вътрешни имена на всеки член (Изпитателят, 07.08.2026). Staff-ът тук е по
    // потребителски роли, не по Discord право, затова гейтът е runtime, не
    // setDefaultMemberPermissions — иначе легитимен модератор без ManageGuild
    // би загубил командата.
    if (!(await isStaffForAutocomplete(interaction))) return interaction.respond([]);
    const focused = interaction.options.getFocused().toLowerCase();
    try {
      const { data: panels } = await api.get(`/bot/guild/${interaction.guildId}/panels`);
      const filtered = (panels || [])
        .filter((p) => p.name.toLowerCase().includes(focused))
        .slice(0, 25);
      await interaction.respond(filtered.map((p) => ({ name: p.name, value: p.id })));
    } catch { await interaction.respond([]); }
  },

  async execute(interaction) {
    await interaction.deferReply();

    // Current ticket + panel
    let ticket;
    try {
      const { data } = await api.get(`/bot/ticket/by-channel/${interaction.channelId}`);
      ticket = data;
    } catch {}
    if (!ticket) return interaction.editReply("❌ This channel is not a ticket.");

    // Permission: support role or ManageGuild
    const currentPanel = ticket.panel;
    const isStaff = (currentPanel?.supportRoleIds || []).some((r) => interaction.member.roles.cache.has(r))
                    || interaction.member.permissions.has("ManageGuild");
    if (!isStaff) return interaction.editReply("❌ Only staff can escalate tickets.");

    const targetPanelId = interaction.options.getString("panel");
    const reason = interaction.options.getString("reason") || "";

    // Load target panel
    let targetPanel;
    try {
      const { data } = await api.get(`/bot/panel/${targetPanelId}`);
      targetPanel = data;
    } catch { return interaction.editReply("❌ Target panel not found."); }

    if (targetPanel.id === currentPanel?.id) {
      return interaction.editReply("❌ This ticket is already in that panel.");
    }

    // Call backend to update association
    try {
      await api.post(`/bot/ticket/${ticket.id}/escalate`, {
        newPanelId: targetPanel.id,
        actorId: interaction.user.id,
        reason,
      });
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction));
    }

    // Move channel to new open category + update permissions
    const newCategory = targetPanel.categoryOpenId || targetPanel.categoryId;
    const channel = interaction.channel;

    if (newCategory && channel.parent?.id !== newCategory) {
      await channel.setParent(newCategory, { lockPermissions: false }).catch(() => {});
    }

    // Remove old support roles (if they're not also in new panel)
    const oldRoles = new Set(currentPanel?.supportRoleIds || []);
    const newRoles = new Set(targetPanel.supportRoleIds || []);
    const removed = [...oldRoles].filter((r) => !newRoles.has(r));
    const added   = [...newRoles].filter((r) => !oldRoles.has(r));

    for (const roleId of removed) {
      await channel.permissionOverwrites.delete(roleId).catch(() => {});
    }
    for (const roleId of added) {
      await channel.permissionOverwrites.create(roleId, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true, ManageMessages: true,
      }).catch(() => {});
    }

    // Post notice
    await channel.send({
      embeds: [{
        title: "🔀 Ticket Escalated",
        description: [
          `Moved from **${currentPanel?.name || "?"}** to **${targetPanel.name}** by <@${interaction.user.id}>.`,
          reason && `**Reason**: ${reason}`,
          (added.length || removed.length) && `_Support team updated._`,
        ].filter(Boolean).join("\n"),
        color: WARNING,
        timestamp: new Date().toISOString(),
      }],
    });

    await interaction.editReply(`✅ Ticket escalated to **${targetPanel.name}**.`);
  },
};
