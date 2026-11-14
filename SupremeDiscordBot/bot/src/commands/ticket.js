// bot/src/commands/ticket.js
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { buildStatusEmbed } from "../utils/embed.js";
import { friendlyError } from "../utils/friendlyError.js";
import { INFO, WARNING } from "../utils/colors.js";
import { TICKET_PRIORITIES, priorityColor } from "../utils/priority.js";
import { t, resolveLang, resolveLangForGuild } from "../i18n/index.js";
import { describeTicketError, describeActionConflict } from "../utils/ticketErrors.js";
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
        .addStringOption((opt) => opt.setName("reason").setDescription("Reason for closing").setRequired(false).setMaxLength(1000))
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

    // Т13: ПЪРВО отговор (defer), после мрежа. Преди: заявка към бекенда с
    // 10-секунден таван преди ack — при бавен бекенд „interaction failed“.
    // Всичко е ephemeral; публичното обявяване (claim/unclaim/priority) става в
    // канала, така че отказът (Premium, не е тикет, без права) не се вижда на клиента.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lang = await resolveLang(interaction);

    // Fetch ticket record from backend by Discord channel ID. Връща ПЪЛНИЯ,
    // изчистен по план панел (Т5) — същият като бутоновия път.
    let ticket;
    try {
      const { data } = await api.get(`/bot/ticket/by-channel/${interaction.channelId}`);
      ticket = data;
    } catch {}

    if (!ticket) {
      return interaction.editReply(t("tkt.notATicket", lang));
    }
    // Изолация: тикет от друг сървър не се пипа през тази команда.
    if (ticket.serverId && ticket.serverId !== interaction.guildId) {
      return interaction.editReply(t("tkt.notATicket", lang));
    }

    // ── Authz (OWASP A01) — същият модел като бутоните.
    // add/remove/claim/unclaim/priority → само support екипът; close → екип ИЛИ създателят.
    const panel = ticket.panel || null;
    const hasSupportRole = (panel?.supportRoleIds || []).some((r) =>
      interaction.member?.roles?.cache?.has(r)
    );
    const isStaff = hasSupportRole || interaction.member?.permissions?.has("ManageGuild");
    const isCreator = ticket.creatorId && interaction.user.id === ticket.creatorId;

    if (["add", "remove", "claim", "unclaim"].includes(sub) && !isStaff) {
      return interaction.editReply(t("ticket.staffOnly", lang));
    }
    if (sub === "priority" && !isStaff) {
      return interaction.editReply(t("ticket.priorityStaffOnly", lang));
    }
    if (sub === "close" && !isStaff && !isCreator) {
      return interaction.editReply(t("tkt.closeStaffOrCreator", lang));
    }

    // Публично обявяване в канала (не ephemeral отговорът).
    const announce = (title, description, color) =>
      interaction.channel.send({
        embeds: [buildStatusEmbed(title, description, color, { client: interaction.client })],
        allowedMentions: { parse: [] },
      }).catch(() => {});

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
        await interaction.editReply(t("tkt.userAdded", lang, { user: String(user) }));
      } catch (err) {
        await interaction.editReply(describeTicketError(err, lang, { thread: interaction.channel.isThread() }));
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
        await interaction.editReply(t("tkt.userRemoved", lang, { user: String(user) }));
      } catch (err) {
        await interaction.editReply(describeTicketError(err, lang, { thread: interaction.channel.isThread() }));
      }
    }

    else if (sub === "claim") {
      try {
        await api.post(`/bot/ticket/${ticket.id}/claim`, { userId: interaction.user.id });
      } catch (err) {
        const code = err?.response?.data?.code;
        return interaction.editReply(code ? describeActionConflict(code, lang) : t("tkt.err.generic", lang));
      }
      const gl = await resolveLangForGuild(interaction.guildId);
      await announce(t("tkt.claimedTitle", gl), t("ticket.claimedConfirm", gl, { user: String(interaction.user) }), INFO);
      await interaction.editReply(t("tkt.claimedAck", lang));
    }

    else if (sub === "priority") {
      const level = interaction.options.getString("level");
      if (!TICKET_PRIORITIES.includes(level)) {
        await interaction.editReply(t("tkt.priorityInvalid", lang));
      } else {
        try {
          await api.patch(`/bot/ticket/${ticket.id}/priority`, { priority: level, actorId: interaction.user.id });
          const gl = await resolveLangForGuild(interaction.guildId);
          await announce("🎯 Ticket Priority", t("ticket.priorityUpdated", gl, { priority: level }), priorityColor(level));
          await interaction.editReply(t("ticket.priorityUpdated", lang, { priority: level }));
        } catch (err) {
          await interaction.editReply(friendlyError(err, interaction));
        }
      }
    }

    else if (sub === "unclaim") {
      try {
        await api.post(`/bot/ticket/${ticket.id}/unclaim`);
      } catch (err) {
        const code = err?.response?.data?.code;
        return interaction.editReply(code === "NOT_CLAIMED" ? t("tkt.notClaimed", lang) : t("tkt.err.generic", lang));
      }
      const gl = await resolveLangForGuild(interaction.guildId);
      await announce(t("tkt.unclaimedTitle", gl), t("tkt.unclaimedBody", gl), WARNING);
      await interaction.editReply(t("tkt.unclaimedAck", lang));
    }

    else if (sub === "close") {
      const reason = (interaction.options.getString("reason") || "").slice(0, 1000) || null;
      // Същият път като бутона Close (handleTicketCloseFinalize → closeTicket):
      // условно затваряне, категория „затворени“/заключена нишка, Reopen/Delete,
      // транскрипт, ЛС и оценка по пълния панел, лог. Никога изтриване на канал.
      const { handleTicketCloseFinalize } = await import("../events/interactionCreate.js");
      await handleTicketCloseFinalize(interaction, ticket, panel, reason);
    }
  },
};
