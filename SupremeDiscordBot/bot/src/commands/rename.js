// bot/src/commands/rename.js
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { describeTicketError, describeActionConflict } from "../utils/ticketErrors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

export default {
  data: new SlashCommandBuilder()
    .setName("rename")
    .setDescription("Rename the current ticket channel")
    .setDescriptionLocalizations(CMD_DESC_L10N.rename)
    .addStringOption((opt) =>
      opt.setName("name").setDescription("New channel name").setRequired(true).setMaxLength(100)
    ),

  async execute(interaction) {
    // Т13: първо отговор, после мрежа.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lang = await resolveLang(interaction);

    // Only usable inside ticket channels — look up the ticket by channel ID
    let ticket;
    try {
      const { data } = await api.get(`/bot/ticket/by-channel/${interaction.channelId}`);
      ticket = data;
    } catch {
      return interaction.editReply(t("tkt.notATicket", lang));
    }
    if (!ticket || (ticket.serverId && ticket.serverId !== interaction.guildId)) {
      return interaction.editReply(t("tkt.notATicket", lang));
    }

    // Permission check — staff only (пълният, изчистен по план панел)
    const panel = ticket.panel;
    const isStaff = (panel?.supportRoleIds || []).some((r) => interaction.member.roles.cache.has(r))
                    || interaction.member.permissions.has("ManageGuild");
    if (!isStaff) {
      return interaction.editReply(t("tkt.renameStaffOnly", lang));
    }

    const rawName = interaction.options.getString("name");
    const cleanName = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 100);
    if (!cleanName) {
      return interaction.editReply(t("tkt.renameInvalid", lang));
    }

    // Т7: ПЪРВО проверката в бекенда (Premium гейт, запис, одит), ПОСЛЕ Discord.
    // Преди: каналът се преименуваше първо — на Free платената функция работеше,
    // а човекът виждаше суровото „Request failed with status code 403“.
    try {
      await api.post(`/bot/ticket/${ticket.id}/rename`, { newName: cleanName, actorId: interaction.user.id });
    } catch (err) {
      const code = err?.response?.data?.code;
      return interaction.editReply(code ? describeActionConflict(code, lang) : t("tkt.err.generic", lang));
    }

    try {
      await interaction.channel.setName(cleanName, `Renamed by ${interaction.user.tag}`);
    } catch (err) {
      return interaction.editReply(describeTicketError(err, lang, { thread: interaction.channel.isThread?.() }));
    }
    await interaction.editReply(t("tkt.renamed", lang, { name: cleanName }));
  },
};
