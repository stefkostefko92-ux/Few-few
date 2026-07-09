// bot/src/commands/premium.js
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { sendPremiumRequired } from "../utils/premiumRequired.js";

export default {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("⭐ Premium server commands")
    .addSubcommand((sub) =>
      sub.setName("status")
        .setDescription("Show your server's Premium subscription status")
    )
    .addSubcommand((sub) =>
      sub.setName("custombot")
        .setDescription("⭐ Update your white-label bot's appearance")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("New bot name").setRequired(false)
        )
        .addStringOption((opt) =>
          opt.setName("avatar").setDescription("Avatar image URL").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("export")
        .setDescription("⭐ Export all tickets or applications to CSV/XLSX")
        .addStringOption((opt) =>
          opt.setName("type")
            .setDescription("What to export")
            .setRequired(true)
            .addChoices(
              { name: "Tickets", value: "tickets" },
              { name: "Applications", value: "applications" }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === "status") {
      try {
        // Use bot-secret endpoint to get server config
        const { data: server } = await api.get(`/bot/server/${interaction.guildId}`);

        if (!server.isPremium) {
          return interaction.editReply({
            embeds: [{
              title: "❌ Not a Premium Server",
              description: `This server is on the **Base (Free)** plan.\n\n🔗 Upgrade at: ${process.env.FRONTEND_URL}`,
              color: 0xed4245,
            }],
          });
        }

        const premiumSince = server.premiumSince
          ? new Date(server.premiumSince).toLocaleDateString()
          : "Unknown";

        await interaction.editReply({
          embeds: [{
            title: "⭐ Premium Active",
            description: `This server has an active **Premium** subscription.`,
            fields: [
              { name: "Status", value: server.stripeStatus || "active", inline: true },
              { name: "Premium Since", value: premiumSince, inline: true },
              { name: "Manage Billing", value: `[Dashboard](${process.env.FRONTEND_URL})`, inline: true },
            ],
            color: 0xffd700,
          }],
        });
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }

    else if (sub === "custombot") {
      // White-label настройките са администраторско действие на ниво сървър —
      // изискваме Manage Server (defer вече е ephemeral, затова editReply).
      if (!interaction.member?.permissions?.has("ManageGuild")) {
        return interaction.editReply("❌ You need Manage Server permission to change the white-label bot.");
      }

      const name = interaction.options.getString("name");
      const avatar = interaction.options.getString("avatar");

      if (!name && !avatar) {
        return interaction.editReply("Please provide at least a name or avatar URL.");
      }

      try {
        await api.patch(`/bot/server/${interaction.guildId}`, {
          ...(name && { customBotName: name }),
          ...(avatar && { customBotAvatar: avatar }),
        });
        await interaction.editReply("✅ White-label bot settings updated! Changes will apply on next bot restart.");
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }

    else if (sub === "export") {
      const type = interaction.options.getString("type");

      try {
        const { data: server } = await api.get(`/bot/server/${interaction.guildId}`);
        if (!server.isPremium) {
          // Native Discord monetization upsell — offer the in-app purchase
          // button for the Premium SKU alongside the explanation. Falls back to
          // a dashboard link if DISCORD_SKU_PREMIUM is not configured.
          await interaction.editReply("❌ Data export is a Premium feature.");
          return sendPremiumRequired(interaction, process.env.DISCORD_SKU_PREMIUM);
        }

        await interaction.editReply({
          embeds: [{
            title: "📦 Export Ready",
            description: `Head to the dashboard to download your **${type}** export as a CSV file.\n\n🔗 ${process.env.FRONTEND_URL}/dashboard/${interaction.guildId}/premium`,
            color: 0x5865f2,
          }],
        });
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }
  },
};
