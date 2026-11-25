// bot/src/commands/escalate.js
// Move a ticket to another panel — TicketTool's $escalate equivalent.
// Changes the panel association, moves the channel to the new open category,
// and updates support role permissions.

import { MessageFlags, SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { friendlyError } from "../utils/friendlyError.js";
import { WARNING } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { isStaffForAutocomplete } from "../utils/staffCheck.js";
import { t, resolveLang, resolveLangForGuild } from "../i18n/index.js";
import { moveTicketToPanel } from "../utils/ticketLifecycle.js";
import { describeActionConflict } from "../utils/ticketErrors.js";

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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lang = await resolveLang(interaction);

    // Current ticket + panel — `by-channel` връща ПЪЛНИЯ изчистен по план панел
    // (Т5), затова `currentPanel.id` е наличен: проверката „вече е в този панел“
    // работи, а съобщението носи името, не „?“.
    let ticket;
    try {
      const { data } = await api.get(`/bot/ticket/by-channel/${interaction.channelId}`);
      ticket = data;
    } catch {}
    if (!ticket || (ticket.serverId && ticket.serverId !== interaction.guildId)) {
      return interaction.editReply(t("tkt.notATicket", lang));
    }

    // Permission: support role or ManageGuild
    const currentPanel = ticket.panel;
    const isStaff = (currentPanel?.supportRoleIds || []).some((r) => interaction.member.roles.cache.has(r))
                    || interaction.member.permissions.has("ManageGuild");
    if (!isStaff) return interaction.editReply(t("tkt.escalateStaffOnly", lang));

    const targetPanelId = interaction.options.getString("panel");
    const reason = interaction.options.getString("reason") || "";

    // Load target panel
    let targetPanel;
    try {
      const { data } = await api.get(`/bot/panel/${targetPanelId}`, { params: { serverId: interaction.guildId } });
      targetPanel = data;
    } catch { return interaction.editReply(t("tkt.escalateTargetMissing", lang)); }

    if (targetPanel.id === currentPanel?.id || targetPanel.id === ticket.panelId) {
      return interaction.editReply(t("tkt.escalateSamePanel", lang));
    }

    // Call backend to update association (премиум гейт и изолация са там)
    try {
      await api.post(`/bot/ticket/${ticket.id}/escalate`, {
        newPanelId: targetPanel.id,
        actorId: interaction.user.id,
        reason,
      });
    } catch (err) {
      const code = err?.response?.data?.code;
      return interaction.editReply(code ? describeActionConflict(code, lang) : friendlyError(err, interaction));
    }

    // Т3: нишка → без setParent/permissionOverwrites (ThreadChannel ги няма);
    // канал → нова категория + роли. Провал на Discord частта не е тих: казваме го.
    let moved;
    try {
      moved = await moveTicketToPanel(interaction.channel, interaction.guild, currentPanel, targetPanel);
    } catch (err) {
      console.error(`[escalate] Discord step failed: ${err?.code} ${err?.message}`);
      moved = { added: [], removed: [], warnings: ["discord"] };
    }

    // Post notice
    const gl = await resolveLangForGuild(interaction.guildId);
    await interaction.channel.send({
      embeds: [{
        title: t("tkt.escalatedTitle", gl),
        description: [
          t("tkt.escalatedBody", gl, {
            from: currentPanel?.name || "—", to: targetPanel.name, user: `<@${interaction.user.id}>`,
          }),
          reason && t("tkt.closeReasonLine", gl, { reason }),
          (moved.added.length || moved.removed.length) && t("tkt.escalatedTeamUpdated", gl),
        ].filter(Boolean).join("\n"),
        color: WARNING,
        timestamp: new Date().toISOString(),
      }],
      allowedMentions: { parse: [] },
    }).catch(() => {});

    const warn = moved.warnings?.length ? `\n${t("tkt.closedWithWarnings", lang)}` : "";
    await interaction.editReply(`${t("tkt.escalatedOk", lang, { panel: targetPanel.name })}${warn}`);
  },
};
