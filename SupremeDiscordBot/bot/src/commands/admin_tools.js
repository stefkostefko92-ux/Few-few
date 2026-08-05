// bot/src/commands/admin_tools.js
// /sticky set/remove and /schedule add/list/remove
import { MessageFlags, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import api from "../utils/api.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Admin tools (Manage Server)")
    .setDescriptionLocalizations(CMD_DESC_L10N.admin)
    .addSubcommandGroup((g) =>
      g.setName("sticky")
        .setDescription("Sticky messages — auto-repost at bottom of channel")
        .addSubcommand((s) =>
          s.setName("set")
            .setDescription("Set a sticky message for this channel")
            .addStringOption((o) => o.setName("content").setDescription("Text or embed description").setRequired(true).setMaxLength(2000))
            .addStringOption((o) => o.setName("title").setDescription("Embed title").setRequired(false))
        )
        .addSubcommand((s) => s.setName("remove").setDescription("Remove sticky from this channel"))
    )
    .addSubcommandGroup((g) =>
      g.setName("schedule")
        .setDescription("Scheduled messages")
        .addSubcommand((s) =>
          s.setName("add")
            .setDescription("Schedule a message")
            .addStringOption((o) => o.setName("content").setDescription("Message to send").setRequired(true).setMaxLength(2000))
            .addStringOption((o) => o.setName("when").setDescription("ISO timestamp e.g. 2026-05-01T12:00:00Z or \"2h\" / \"1d\"").setRequired(true))
            .addStringOption((o) => o.setName("recurrence").setDescription("daily | weekly | monthly").setRequired(false)
              .addChoices({ name: "daily", value: "daily" }, { name: "weekly", value: "weekly" }, { name: "monthly", value: "monthly" }))
            .addStringOption((o) => o.setName("channel_id").setDescription("Target channel (default: current)").setRequired(false))
        )
        .addSubcommand((s) => s.setName("list").setDescription("List scheduled messages"))
        .addSubcommand((s) =>
          s.setName("remove")
            .setDescription("Remove a scheduled message")
            .addStringOption((o) => o.setName("id").setDescription("Scheduled message ID").setRequired(true).setAutocomplete(true))
        )
    ),

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub !== "remove") return interaction.respond([]);
    const focused = interaction.options.getFocused().toLowerCase();
    try {
      const { data } = await api.get(`/bot/schedule/${interaction.guildId}`);
      const filtered = (data || []).filter((m) => m.id.toLowerCase().includes(focused)).slice(0, 25);
      // label = съкратен текст + кога, value = ПЪЛНИЯТ id (никога не съкращаваме value-то).
      await interaction.respond(filtered.map((m) => ({
        name: `${(m.content || "").slice(0, 50)} — ${new Date(m.sendAt).toLocaleString()}`.slice(0, 100),
        value: m.id,
      })));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    if (!interaction.member.permissions.has("ManageGuild")) {
      return interaction.reply({ content: "❌ You need Manage Server permission.", flags: MessageFlags.Ephemeral });
    }

    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();

    // ═══ STICKY ═══
    if (group === "sticky") {
      if (sub === "set") {
        const content = interaction.options.getString("content");
        const title = interaction.options.getString("title");
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await api.post(`/bot/sticky`, {
            serverId: interaction.guildId,
            channelId: interaction.channelId,
            content, embedTitle: title || null,
            createdBy: interaction.user.id,
          });
          await interaction.editReply("📌 Sticky message set for this channel.");
        } catch (err) {
          await interaction.editReply(friendlyError(err, interaction));
        }
      }

      if (sub === "remove") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          await api.delete(`/bot/sticky/${interaction.channelId}`);
          await interaction.editReply("🗑️ Sticky removed.");
        } catch (err) {
          await interaction.editReply(friendlyError(err, interaction));
        }
      }
    }

    // ═══ SCHEDULE ═══
    else if (group === "schedule") {
      if (sub === "add") {
        const content = interaction.options.getString("content");
        const whenRaw = interaction.options.getString("when");
        const recurrence = interaction.options.getString("recurrence");
        const channelId = interaction.options.getString("channel_id") || interaction.channelId;

        let sendAt;
        // Parse relative duration ("2h", "30m", "1d") or ISO
        const match = whenRaw.match(/^(\d+)([smhdw])$/i);
        if (match) {
          const n = parseInt(match[1], 10);
          const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 }[match[2].toLowerCase()];
          sendAt = new Date(Date.now() + n * mult);
        } else {
          sendAt = new Date(whenRaw);
        }
        if (!(sendAt instanceof Date) || isNaN(sendAt.getTime())) {
          return interaction.reply({ content: "❌ Invalid `when` — use ISO timestamp or relative like `2h`, `1d`, `30m`.", flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const { data } = await api.post(`/bot/schedule`, {
            serverId: interaction.guildId, channelId, content,
            sendAt: sendAt.toISOString(), recurrence,
            createdBy: interaction.user.id,
          });
          await interaction.editReply(`📅 Scheduled for <t:${Math.floor(sendAt.getTime() / 1000)}:F>\nID: \`${data.id}\``);
        } catch (err) {
          await interaction.editReply(friendlyError(err, interaction));
        }
      }

      if (sub === "list") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          const { data } = await api.get(`/bot/schedule/${interaction.guildId}`);
          if (!data?.length) return interaction.editReply("📭 No scheduled messages.");
          const lines = data.slice(0, 25).map((m) => {
            const ts = Math.floor(new Date(m.sendAt).getTime() / 1000);
            return `\`${m.id.slice(0, 8)}\` <#${m.channelId}> <t:${ts}:R>${m.recurrence ? ` (${m.recurrence})` : ""}${m.sentAt ? " ✅" : ""}`;
          }).join("\n");
          await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle("📅 Scheduled Messages").setDescription(lines).setColor(BRAND)],
          });
        } catch (err) {
          await interaction.editReply(friendlyError(err, interaction));
        }
      }

      if (sub === "remove") {
        const id = interaction.options.getString("id");
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
          // Backend скоупва deleteMany({id, serverId}) (cross-tenant IDOR fix) —
          // подаваме serverId в body-то, иначе легитимното триене връща 404.
          await api.delete(`/bot/schedule/${id}`, { data: { serverId: interaction.guildId } });
          await interaction.editReply(`🗑️ Removed.`);
        } catch (err) {
          await interaction.editReply(friendlyError(err, interaction));
        }
      }
    }
  },
};
