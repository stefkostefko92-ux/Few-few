// bot/src/commands/apply.js
import { SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { runFormSession } from "../utils/formSession.js";

export default {
  data: new SlashCommandBuilder()
    .setName("apply")
    .setDescription("Submit an application")
    .addStringOption((opt) =>
      opt.setName("form").setDescription("Name of the application form").setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    try {
      const { data } = await api.get(`/bot/server/${interaction.guildId}`);
      const focused = interaction.options.getFocused().toLowerCase();
      const appForms = (data.forms || []).filter(
        (f) => f.isApplication && f.name.toLowerCase().includes(focused)
      );
      await interaction.respond(
        appForms.slice(0, 25).map((f) => ({ name: f.name, value: f.id }))
      );
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const formId = interaction.options.getString("form");

    try {
      const { data: server } = await api.get(`/bot/server/${interaction.guildId}`);
      const form = server.forms?.find((f) => f.id === formId);

      if (!form || !form.isApplication) {
        return interaction.editReply("❌ Application form not found.");
      }

      // Check if user already has a pending application for this form
      // (Optional: implement a rate-limit check here)

      await interaction.editReply("📬 Check your DMs to start your application!");
      await runFormSession(interaction, form, { id: null, name: form.name, supportRoleIds: [], categoryId: null });
    } catch (err) {
      await interaction.editReply(`❌ ${err?.response?.data?.error || err.message}`);
    }
  },
};
