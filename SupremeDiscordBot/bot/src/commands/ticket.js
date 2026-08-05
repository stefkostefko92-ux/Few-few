// bot/src/commands/ticket.js
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { buildStatusEmbed } from "../utils/embed.js";
import { friendlyError } from "../utils/friendlyError.js";
import { INFO } from "../utils/colors.js";
import { TICKET_PRIORITIES, priorityColor } from "../utils/priority.js";
import { t, resolveLang } from "../i18n/index.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage tickets")
    .setDescriptionLocalizations(CMD_DESC_L10N.ticket)
    .addSubcommand((sub) =>
      sub.setName("add")
        .setDescription("Add a user to the current ticket")
        .addUserOption((opt) => opt.setName("user").setDescription("User to add").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("remove")
        .setDescription("Remove a user from the current ticket")
        .addUserOption((opt) => opt.setName("user").setDescription("User to remove").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub.setName("claim")
        .setDescription("Claim this ticket as yours")
    )
    .addSubcommand((sub) =>
      sub.setName("unclaim")
        .setDescription("Unclaim this ticket")
    )
    .addSubcommand((sub) =>
      sub.setName("close")
        .setDescription("Close this ticket and generate an archive")
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason for closing").setRequired(false))
    )
    .addSubcommand((sub) =>
      sub.setName("priority")
        .setDescription("Set this ticket's priority")
        .addStringOption((opt) =>
          opt.setName("level").setDescription("Priority level").setRequired(true)
            .addChoices(
              { name: "Low", value: "LOW" },
              { name: "Normal", value: "NORMAL" },
              { name: "High", value: "HIGH" },
              { name: "Urgent", value: "URGENT" },
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // Fetch ticket record from backend by Discord channel ID
    let ticket;
    try {
      const { data } = await api.get(`/bot/ticket/by-channel/${interaction.channelId}`);
      ticket = data;
    } catch {}

    if (!ticket && ["add", "remove", "claim", "unclaim", "close", "priority"].includes(sub)) {
      return interaction.reply({ content: "❌ This channel is not a ticket.", flags: MessageFlags.Ephemeral });
    }

    // ── Authz (OWASP A01) — същият модел като бутоните (interactionCreate.js:520-542).
    // Зареждаме панела за supportRoleIds и прилагаме проверката СЪРВЪРНО, преди defer:
    // add/remove/claim/unclaim → само support екипа; close → екип ИЛИ създателят.
    let panel = ticket?.panel || null;
    if (!panel && ticket?.panelId) {
      panel = await api.get(`/bot/panel/${ticket.panelId}`).then((r) => r.data).catch(() => null);
    }
    const hasSupportRole = (panel?.supportRoleIds || []).some((r) =>
      interaction.member?.roles?.cache?.has(r)
    );
    const isStaff = hasSupportRole || interaction.member?.permissions?.has("ManageGuild");
    const isCreator = ticket?.creatorId && interaction.user.id === ticket.creatorId;

    if (["add", "remove", "claim", "unclaim"].includes(sub) && !isStaff) {
      return interaction.reply({
        content: "❌ Only support team members can perform this action.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (sub === "priority" && !isStaff) {
      return interaction.reply({
        content: t("ticket.priorityStaffOnly", await resolveLang(interaction)),
        flags: MessageFlags.Ephemeral,
      });
    }
    if (sub === "close" && !isStaff && !isCreator) {
      return interaction.reply({
        content: "❌ Only support team members or the ticket creator can close this ticket.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // "close" defers itself (handleTicketCloseFinalize) — everything else defers here.
    if (sub !== "close") {
      await interaction.deferReply(
        ["add", "remove"].includes(sub) ? { flags: MessageFlags.Ephemeral } : {}
      );
    }

    if (sub === "add") {
      const user = interaction.options.getUser("user");
      try {
        if (interaction.channel.isThread()) {
          // Private threads — add as member instead of permission overwrite
          await interaction.channel.members.add(user.id);
        } else {
          await interaction.channel.permissionOverwrites.create(user, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });
        }
        await interaction.editReply(`✅ Added ${user} to the ticket.`);
      } catch (err) {
        await interaction.editReply(friendlyError(err, interaction, `Failed to add user: ${err.message}`));
      }
    }

    else if (sub === "remove") {
      const user = interaction.options.getUser("user");
      try {
        if (interaction.channel.isThread()) {
          await interaction.channel.members.remove(user.id);
        } else {
          await interaction.channel.permissionOverwrites.delete(user);
        }
        await interaction.editReply(`✅ Removed ${user} from the ticket.`);
      } catch (err) {
        await interaction.editReply(friendlyError(err, interaction, `Failed to remove user: ${err.message}`));
      }
    }

    else if (sub === "claim") {
      try {
        await api.post(`/bot/ticket/${ticket.id}/claim`, { userId: interaction.user.id });
        await interaction.editReply({
          embeds: [buildStatusEmbed("🛡️ Ticket Claimed", `This ticket has been claimed by ${interaction.user}`, INFO)],
        });
      } catch (err) {
        await interaction.editReply(friendlyError(err, interaction));
      }
    }

    else if (sub === "priority") {
      const level = interaction.options.getString("level");
      if (!TICKET_PRIORITIES.includes(level)) {
        await interaction.editReply("❌ Invalid priority level.");
      } else {
        try {
          await api.patch(`/bot/ticket/${ticket.id}/priority`, { priority: level, actorId: interaction.user.id });
          const lang = await resolveLang(interaction);
          await interaction.editReply({
            embeds: [buildStatusEmbed("🎯 Ticket Priority", t("ticket.priorityUpdated", lang, { priority: level }), priorityColor(level))],
          });
        } catch (err) {
          await interaction.editReply(friendlyError(err, interaction));
        }
      }
    }

    else if (sub === "unclaim") {
      try {
        await api.post(`/bot/ticket/${ticket.id}/unclaim`);
        await interaction.editReply({
          embeds: [buildStatusEmbed("🔓 Ticket Unclaimed", "This ticket is now open for any staff member.", 0xffd700)],
        });
      } catch (err) {
        await interaction.editReply(friendlyError(err, interaction));
      }
    }

    else if (sub === "close") {
      const reason = interaction.options.getString("reason") || null;
      // Same code path as the Close button (handleTicketCloseFinalize) — archives
      // + posts Reopen/Delete/Transcript buttons, never an outright channel delete.
      // Deleting is now its own explicit (confirm-gated) action: the Delete button
      // or `ticket:delete` — consistent behavior everywhere a ticket is closed.
      const { handleTicketCloseFinalize } = await import("../events/interactionCreate.js");
      await handleTicketCloseFinalize(interaction, ticket, panel, reason);
    }
  },
};
