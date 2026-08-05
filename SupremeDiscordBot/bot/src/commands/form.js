// bot/src/commands/form.js
import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import api from "../utils/api.js";
import { friendlyError } from "../utils/friendlyError.js";
import { INFO } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new SlashCommandBuilder()
    .setName("form")
    .setDescription("Manage application forms")
    .setDescriptionLocalizations(CMD_DESC_L10N.form)
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
          opt.setName("id").setDescription("Application ID").setRequired(true).setAutocomplete(true)
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
    const focusedOption = interaction.options.getFocused(true);
    const focused = String(focusedOption.value || "").toLowerCase();

    // /form review <id> — autocomplete от pending applications, label четим,
    // value = ПЪЛНИЯ cuid (никога не съкращаваме value-то).
    if (focusedOption.name === "id") {
      try {
        const { data } = await api.get(`/bot/guild/${interaction.guildId}/applications/pending`);
        const filtered = (data || [])
          .filter((a) => a.id.toLowerCase().includes(focused) || (a.username || "").toLowerCase().includes(focused))
          .slice(0, 25);
        await interaction.respond(filtered.map((a) => ({
          name: `${a.username || "unknown"} — ${a.formName || "form"}`.slice(0, 100),
          value: a.id,
        })));
      } catch {
        await interaction.respond([]);
      }
      return;
    }

    // /form spawn <name> — autocomplete от application-type форми.
    try {
      const { data } = await api.get(`/bot/server/${interaction.guildId}`);
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
            color: INFO,
          }],
          components: [row],
        });

        await interaction.editReply("✅ Form button posted!");
      } catch (err) {
        await interaction.editReply(friendlyError(err, interaction));
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
        await interaction.editReply(friendlyError(err, interaction));
      }
    }
  },
};
