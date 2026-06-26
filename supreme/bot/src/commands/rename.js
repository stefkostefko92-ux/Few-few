// bot/src/commands/rename.js
import { SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";

export default {
  data: new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Rename the current ticket channel")
    .addStringOption((opt) =>
      opt.setName("name").setDescription("New channel name").setRequired(true).setMaxLength(100)
    ),

  async execute(interaction) {
    // Only usable inside ticket channels — look up the ticket by channel ID
    let ticket;
    try {
      const { data } = await api.get(`/bot/ticket/by-channel/${interaction.channelId}`);
      ticket = data;
    } catch {
      return interaction.reply({ content: "❌ This command can only be used inside a ticket channel.", ephemeral: true });
    }
    if (!ticket) return interaction.reply({ content: "❌ No ticket found for this channel.", ephemeral: true });

    // Permission check — staff only
    const panel = ticket.panel;
    const isStaff = (panel?.supportRoleIds || []).some((r) => interaction.member.roles.cache.has(r))
                    || interaction.member.permissions.has("ManageGuild");
    if (!isStaff) {
      return interaction.reply({ content: "❌ Only support team members can rename tickets.", ephemeral: true });
    }

    const rawName = interaction.options.getString("name");
    const cleanName = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 100);
    if (!cleanName) {
      return interaction.reply({ content: "❌ Invalid channel name.", ephemeral: true });
    }

    await interaction.deferReply();
    try {
      await interaction.channel.setName(cleanName, `Renamed by ${interaction.user.tag}`);
      await api.post(`/bot/ticket/${ticket.id}/rename`, { newName: cleanName, actorId: interaction.user.id });
      await interaction.editReply(`✏️ Channel renamed to **${cleanName}**`);
    } catch (err) {
      await interaction.editReply(`❌ Failed to rename: ${err.message}`);
    }
  },
};
