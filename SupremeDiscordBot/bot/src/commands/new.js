// bot/src/commands/new.js
// Command-style ticket opening — TicketTool's $new/$ticket equivalent.
// Opens a ticket on behalf of the invoker (or another user with a reason).

import { MessageFlags, SlashCommandBuilder, ChannelType } from "discord.js";
import api from "../utils/api.js";
import { checkCooldown } from "../utils/cooldowns.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND } from "../utils/colors.js";

const COOLDOWN_SECONDS = 10;

export default {
  data: new SlashCommandBuilder()
    .setName("new")
    .setDescription("Open a new support ticket")
    .addStringOption((opt) =>
      opt.setName("panel").setDescription("Panel name to open ticket for").setRequired(false).setAutocomplete(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Short reason for opening").setRequired(false).setMaxLength(500)
    )
    .addUserOption((opt) =>
      opt.setName("on_behalf_of").setDescription("Open on behalf of another user (staff only)").setRequired(false)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    try {
      const { data: panels } = await api.get(`/bot/guild/${interaction.guildId}/panels`);
      const filtered = (panels || [])
        .filter((p) => p.name.toLowerCase().includes(focused))
        .slice(0, 25);
      await interaction.respond(filtered.map((p) => ({ name: p.name, value: p.id })));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const remaining = checkCooldown("new", interaction.user.id, COOLDOWN_SECONDS);
    if (remaining > 0) {
      return interaction.reply({ content: `⏳ Please wait ${remaining}s before opening another ticket this way.`, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const panelIdOrName = interaction.options.getString("panel");
    const reason = interaction.options.getString("reason") || "";
    const onBehalfOf = interaction.options.getUser("on_behalf_of");

    // Look up panel — by ID first, fall back to name
    let panel;
    try {
      const { data: panels } = await api.get(`/bot/guild/${interaction.guildId}/panels`);
      panel = panels.find((p) => p.id === panelIdOrName)
           || panels.find((p) => p.name.toLowerCase() === (panelIdOrName || "").toLowerCase())
           || panels[0]; // fallback: first panel
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction, `Could not load panels: ${err.message}`));
    }

    if (!panel) return interaction.editReply("❌ No panels are configured for this server. Ask an admin to create one via the dashboard.");

    // on_behalf_of requires staff
    let creator = interaction.user;
    if (onBehalfOf) {
      const isStaff = (panel.supportRoleIds || []).some((r) => interaction.member.roles.cache.has(r))
                      || interaction.member.permissions.has("ManageGuild");
      if (!isStaff) {
        return interaction.editReply("❌ Only staff can open tickets on behalf of other users.");
      }
      creator = onBehalfOf;
    }

    // Delegate to the standard panel flow — import and call the helper
    // We re-use the same logic by invoking the bot endpoint directly
    try {
      const guild = interaction.guild;
      const openCategory = panel.categoryOpenId || panel.categoryId;

      if (!openCategory) {
        return interaction.editReply("❌ This panel has no category configured. Open the panel via a button first or configure it in the dashboard.");
      }

      const channelPrefix = (panel.channelNamePrefix || "ticket").toLowerCase().replace(/[^a-z0-9-]/g, "");
      const tempName = `${channelPrefix}-new-${Date.now().toString().slice(-5)}`;

      const channel = await guild.channels.create({
        name: tempName,
        parent: openCategory,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: ["ViewChannel"] },
          { id: creator.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"] },
          ...(panel.supportRoleIds || []).map((r) => ({
            id: r, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageMessages"],
          })),
        ],
      });

      let ticketResult;
      try {
        ticketResult = await api.post("/bot/ticket/create", {
          serverId: guild.id,
          panelId: panel.id,
          creatorId: creator.id,
          channelId: channel.id,
          firstMessage: reason,
        });
      } catch (err) {
        // Limit errors come back as HTTP 429/403, so axios throws — clean up
        // the just-created channel instead of orphaning it.
        await channel.delete().catch(() => {});
        if (err?.response?.data?.code) {
          return interaction.editReply(`⚠️ ${err.response.data.error}`);
        }
        throw err;
      }

      const number = ticketResult?.data?.number;
      const padding = panel.counterPadding || 4;
      if (number != null) {
        await channel.setName(`${channelPrefix}-${String(number).padStart(padding, "0")}-${creator.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30)}`).catch(() => {});
      }

      await channel.send({
        embeds: [{
          title: `🎫 Ticket #${String(number ?? "").padStart(padding, "0")}`,
          description: [
            `Opened by <@${interaction.user.id}>${onBehalfOf ? ` on behalf of <@${creator.id}>` : ""}.`,
            reason && `**Reason**: ${reason}`,
          ].filter(Boolean).join("\n"),
          color: BRAND,
          timestamp: new Date().toISOString(),
        }],
      });

      await interaction.editReply(`✅ Ticket opened: ${channel}`);
    } catch (err) {
      await interaction.editReply(friendlyError(err, interaction));
    }
  },
};
