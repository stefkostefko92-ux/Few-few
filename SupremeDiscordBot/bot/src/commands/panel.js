// bot/src/commands/panel.js
import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import api, { markPanelSpawned } from "../utils/api.js";
import { buildPanelMessage } from "../utils/embed.js";
import { friendlyError } from "../utils/friendlyError.js";

export default {
  data: new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Manage ticket panels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("spawn")
        .setDescription("Post a ticket panel in this channel")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Panel name").setRequired(true).setAutocomplete(true)
        )
    ),

  async autocomplete(interaction) {
    try {
      const { data } = await api.get(`/bot/server/${interaction.guildId}`);
      const focused = interaction.options.getFocused().toLowerCase();
      const panels = (data.panels || []).filter((p) => p.name.toLowerCase().includes(focused));
      await interaction.respond(panels.slice(0, 25).map((p) => ({ name: p.name, value: p.id })));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === "spawn") {
      const panelId = interaction.options.getString("name");

      try {
        const { data: panel } = await api.get(`/bot/panel/${panelId}`);
        if (!panel) return interaction.editReply("❌ Panel not found.");

        const { embeds, components } = buildPanelMessage(panel);
        const msg = await interaction.channel.send({ embeds, components });

        await markPanelSpawned(panel.id, interaction.channelId, msg.id);
        await interaction.editReply(`✅ Panel **${panel.name}** spawned successfully!`);
      } catch (err) {
        await interaction.editReply(friendlyError(err, interaction));
      }
    }
  },
};
