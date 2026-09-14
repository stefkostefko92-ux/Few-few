// bot/src/commands/premium.js
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { sendPremiumRequired } from "../utils/premiumRequired.js";
import { skuUrl, upgradeUrl } from "../utils/discordStore.js";
import { friendlyError } from "../utils/friendlyError.js";
import { INFO, WARNING } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("⭐ Premium server commands")
    .setDescriptionLocalizations(CMD_DESC_L10N.premium)
    .addSubcommand((sub) =>
      sub.setName("status")
        .setDescription("Show your server's Premium subscription status")
    )
    .addSubcommand((sub) =>
      sub.setName("custombot")
        .setDescription("⭐ Update your white-label bot's appearance")
        .addStringOption((opt) =>
          // Discord ограничава името на бота до 32 знака, а URL-ите — на практика
          // до няколкостотин. Без таван потребителят получава грешка чак от
          // Discord API, вместо от формата.
          opt.setName("name").setDescription("New bot name").setRequired(false).setMaxLength(32)
        )
        .addStringOption((opt) =>
          opt.setName("avatar").setDescription("Avatar image URL").setRequired(false).setMaxLength(512)
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
          // v3.3 — покупката е САМО през Discord: native premium бутон за
          // Premium SKU-то + линк към магазина (за white-label клиенти, където
          // бутонът е невъзможен, sendPremiumRequired пада на линка).
          return sendPremiumRequired(
            interaction,
            process.env.DISCORD_SKU_PREMIUM,
            `This server is on the **Free** plan. Premium and White-label are sold through the Discord store — one monthly subscription per server, billed by Discord.\n🔗 ${upgradeUrl(interaction.client)}`
          );
        }

        const premiumSince = server.premiumSince
          ? new Date(server.premiumSince).toLocaleDateString()
          : "Unknown";
        const planLabel = server.plan === "whitelabel" ? "White-label" : "Premium";
        const discordTs = (d) => `<t:${Math.floor(new Date(d).getTime() / 1000)}:D>`;

        // Откъде идват правата — един източник, една дума.
        let via, manage;
        if (server.planSource === "discord") {
          via = "Discord subscription";
          // 0 active · 1 inactive · 2 ending (документацията; преводът е в backend-а)
          const st = server.discordSubscriptionStatus;
          const end = server.discordCurrentPeriodEnd ? discordTs(server.discordCurrentPeriodEnd) : null;
          if (st === 2 && end) via += ` — cancelled, access until ${end}`;
          else if (end) via += ` — renews ${end}`;
          manage = `[Discord store](${skuUrl(interaction.client, server.discordSkuId) || upgradeUrl(interaction.client)}) · User Settings → Subscriptions`;
        } else if (server.agencyId) {
          via = "Agency seat";
          manage = `[Dashboard](${process.env.FRONTEND_URL})`;
        } else if (server.planSource === "stripe" || server.stripeSubscriptionId) {
          via = `Legacy card subscription (${server.stripeStatus || "active"})`;
          manage = `[Dashboard](${process.env.FRONTEND_URL}/dashboard/${interaction.guildId}/premium)`;
        } else {
          via = server.planSource === "manual" ? "Granted manually" : "Active";
          manage = `[Dashboard](${process.env.FRONTEND_URL})`;
        }

        await interaction.editReply({
          embeds: [{
            title: `⭐ ${planLabel} Active`,
            description: `This server has an active **${planLabel}** plan.`,
            fields: [
              { name: "Source", value: via, inline: false },
              { name: "Since", value: premiumSince, inline: true },
              { name: "Manage", value: manage, inline: true },
            ],
            color: WARNING,
          }],
        });
      } catch (err) {
        await interaction.editReply(friendlyError(err, interaction));
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
        await interaction.editReply(friendlyError(err, interaction));
      }
    }

    else if (sub === "export") {
      const type = interaction.options.getString("type");

      try {
        const { data: server } = await api.get(`/bot/server/${interaction.guildId}`);
        if (!server.isPremium) {
          // Native Discord monetization upsell — one message: explanation +
          // in-app purchase button for the Premium SKU. Falls back to a
          // dashboard link if DISCORD_SKU_PREMIUM is not configured or on
          // white-label clients (foreign SKU).
          return sendPremiumRequired(
            interaction,
            process.env.DISCORD_SKU_PREMIUM,
            "❌ Data export is a Premium feature — upgrade to unlock it:"
          );
        }

        await interaction.editReply({
          embeds: [{
            title: "📦 Export Ready",
            description: `Head to the dashboard to download your **${type}** export as a CSV file.\n\n🔗 ${process.env.FRONTEND_URL}/dashboard/${interaction.guildId}/premium`,
            color: INFO,
          }],
        });
      } catch (err) {
        await interaction.editReply(friendlyError(err, interaction));
      }
    }
  },
};
