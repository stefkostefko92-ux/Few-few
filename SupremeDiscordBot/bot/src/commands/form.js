// bot/src/commands/form.js
import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import api from "../utils/api.js";

export default {
  data: new SlashCommandBuilder()
    .setName("form")
    .setDescription("Manage application forms")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub.setName("spawn")
        .setDescription("Post an application form button in this channel")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Form name").setRequired(true).setAutocomplete(true)
        )
        .addStringOption((opt) =>
          opt.setName("button_label").setDescription("Text on the button").setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("review")
        .setDescription("Manually approve or deny an application")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("Application ID").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("action").setDescription("approve or deny").setRequired(true)
            .addChoices(
              { name: "Approve", value: "approve" },
              { name: "Deny", value: "deny" }
            )
        )
        .addStringOption((opt) =>
          opt.setName("note").setDescription("Optional review note").setRequired(false)
        )
    ),

  async autocomplete(interaction) {
    try {
      const { data } = await api.get(`/bot/server/${interaction.guildId}`);
      const focused = interaction.options.getFocused().toLowerCase();
      const appForms = (data.forms || []).filter(
        (f) => f.isApplication && f.name.toLowerCase().includes(focused)
      );
      await interaction.respond(appForms.slice(0, 25).map((f) => ({ name: f.name, value: f.id })));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === "spawn") {
      const formId = interaction.options.getString("name");
      const buttonLabel = interaction.options.getString("button_label") || "Apply Now";

      try {
        const { data: server } = await api.get(`/bot/server/${interaction.guildId}`);
        const form = server.forms?.find((f) => f.id === formId);
        if (!form) return interaction.editReply("❌ Form not found.");

        const btn = new ButtonBuilder()
          .setCustomId(`form_direct:${form.id}`)
          .setLabel(buttonLabel)
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📋");

        const row = new ActionRowBuilder().addComponents(btn);

        await interaction.channel.send({
          embeds: [{
            title: form.name,
            description: form.description || "Click the button below to apply.",
            color: 0x5865f2,
          }],
          components: [row],
        });

        await interaction.editReply("✅ Form button posted!");
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }

    else if (sub === "review") {
      const appId = interaction.options.getString("id");
      const action = interaction.options.getString("action");
      const note = interaction.options.getString("note");

      try {
        await api.post(`/bot/application/${appId}/review`, {
          action,
          note,
          serverId: interaction.guildId,
          reviewerId: interaction.user.id,
          reviewerTag: interaction.user.username,
        });
        await interaction.editReply(`✅ Application **${appId}** ${action}d successfully.`);
      } catch (err) {
        await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
      }
    }
  },
};
