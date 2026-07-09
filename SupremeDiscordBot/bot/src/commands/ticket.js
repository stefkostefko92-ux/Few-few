// bot/src/commands/ticket.js
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import api, { closeTicketApi } from "../utils/api.js";
import { buildStatusEmbed } from "../utils/embed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage tickets")
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
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // Fetch ticket record from backend by Discord channel ID
    let ticket;
    try {
      const { data } = await api.get(`/bot/ticket/by-channel/${interaction.channelId}`);
      ticket = data;
    } catch {}

    if (!ticket && ["add", "remove", "claim", "unclaim", "close"].includes(sub)) {
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
    if (sub === "close" && !isStaff && !isCreator) {
      return interaction.reply({
        content: "❌ Only support team members or the ticket creator can close this ticket.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply(
      ["add", "remove"].includes(sub) ? { flags: MessageFlags.Ephemeral } : {}
    );

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
        await interaction.editReply(`❌ Failed to add user: ${err.message}`);
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
        await interaction.editReply(`❌ Failed to remove user: ${err.message}`);
      }
    }

    else if (sub === "claim") {
      try {
        await api.post(`/bot/ticket/${ticket.id}/claim`, { userId: interaction.user.id });
        await interaction.editReply({
          embeds: [buildStatusEmbed("🛡️ Ticket Claimed", `This ticket has been claimed by ${interaction.user}`, 0x5865f2)],
        });
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }

    else if (sub === "unclaim") {
      try {
        await api.post(`/bot/ticket/${ticket.id}/unclaim`);
        await interaction.editReply({
          embeds: [buildStatusEmbed("🔓 Ticket Unclaimed", "This ticket is now open for any staff member.", 0xffd700)],
        });
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }

    else if (sub === "close") {
      const reason = interaction.options.getString("reason") || "No reason provided";
      try {
        const closed = await closeTicketApi(ticket.id, interaction.user.id, reason);
        // Archive links require the unguessable token the backend returns —
        // never build them from the raw ticket ID.
        const archiveLink = closed?.fullArchiveUrl
          || `${process.env.ARCHIVE_BASE_URL || process.env.FRONTEND_URL}${closed?.archiveUrl || ""}`;
        await interaction.editReply({
          embeds: [buildStatusEmbed(
            "🔒 Ticket Closed",
            `Closed by ${interaction.user}\n**Reason:** ${reason}${closed?.archiveUrl ? `\n\n[📄 View Archive](${archiveLink})` : ""}`,
            0xed4245
          )],
        });
        // Archive the Discord channel/thread
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }
  },
};
