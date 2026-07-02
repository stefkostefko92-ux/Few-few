// bot/src/commands/setup.js
import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import api from "../utils/api.js";
import { buildPanelMessage } from "../utils/embed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Server setup commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("sync")
        .setDescription("Force-sync all panels and forms from the dashboard")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === "sync") {
      try {
        // Fetch fresh server config from API
        const { data: server } = await api.get(`/bot/server/${interaction.guildId}`);

        // Re-post all spawned panels
        let updated = 0;
        for (const panel of server.panels || []) {
          if (panel.channelId && panel.messageId) {
            try {
              const channel = interaction.guild.channels.cache.get(panel.channelId);
              if (!channel) continue;
              const msg = await channel.messages.fetch(panel.messageId).catch(() => null);
              if (!msg) continue;

              const { embeds, components } = buildPanelMessage(panel);
              await msg.edit({ embeds, components });
              updated++;
            } catch (e) {
              console.error(`Failed to update panel ${panel.id}:`, e.message);
            }
          }
        }

        await interaction.editReply(`✅ Sync complete! Updated **${updated}** panel(s).`);
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }
  },
};
