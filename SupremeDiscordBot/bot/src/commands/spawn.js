// bot/src/commands/spawn.js
// /spawn [companion] [channel] — админът пуска поява на спътник СЕГА, без да
// чака жребия от активността (utils/game.js → maybeSpawn). Същата поява като
// автоматичната: бутон „Улови“, 5 минути живот, първият печели.
//
// Правилата живеят в backend-а (lib/game/companionOps.js → createSpawn с
// manual): прескача се паузата между появите, но НЕ и живата поява — една на
// сървър; избраният спътник трябва да е позволен от плана (Free: common/uncommon)
// и сезона. Manage Server: платформено (default permissions) И runtime, както
// /trivia — операторът може да е разширил командата на всички.
import { MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import api from "../utils/api.js";
import { t, resolveLang } from "../i18n/index.js";
import { friendlyError } from "../utils/friendlyError.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";
import { postSpawn } from "../utils/game.js";

// Без тях съобщението не излиза, а появата вече е създадена и блокира следващата
// за 5 минути — затова се проверява ПРЕДИ заявката към backend-а.
// ReadMessageHistory: след 5 минути появата се маркира „избягала“ през
// channel.messages.fetch — без него бутонът „Улови“ оставаше видим.
const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory];

export default {
  data: new SlashCommandBuilder()
    .setName("spawn")
    .setDescription("Spawn a companion in a channel now (Manage Server)")
    .setDescriptionLocalizations(CMD_DESC_L10N.spawn)
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((o) => o.setName("companion").setDescription("Which companion (empty = random, like a natural spawn)").setAutocomplete(true))
    .addChannelOption((o) => o.setName("channel").setDescription("Where (default: this channel)")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  // autocomplete е отделно взаимодействие — гардът е и тук (виж commands/admin_tools.js).
  async autocomplete(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.respond([]);
    const focused = String(interaction.options.getFocused() || "").toLowerCase();
    try {
      const { data } = await api.get(`/bot/game/companions/spawnable/${interaction.guildId}`);
      const list = (data?.companions || [])
        .filter((c) => !focused || c.name.toLowerCase().includes(focused) || c.id.includes(focused))
        .slice(0, 25);
      await interaction.respond(list.map((c) => ({ name: `${c.rarityEmoji} ${c.name} · ${c.rarityLabel}`.slice(0, 100), value: c.id })));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // Езикът може да иска бекенда (en-US + празен кеш) — след defer, не преди.
    const lang = await resolveLang(interaction);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return interaction.editReply({ content: t("game.spawnCmd.noPermission", lang) });

    const channel = interaction.options.getChannel("channel") || interaction.channel;
    if (!channel?.isTextBased?.() || channel.guildId !== interaction.guildId) return interaction.editReply({ content: t("game.spawnCmd.badChannel", lang) });
    const me = interaction.guild?.members?.me;
    if (!me || !channel.permissionsFor(me)?.has(NEEDED)) return interaction.editReply({ content: t("game.spawnCmd.postFailed", lang, { channel: `<#${channel.id}>` }) });

    const companionId = interaction.options.getString("companion") || null;
    let data;
    try {
      ({ data } = await api.post("/bot/game/spawn/manual", { serverId: interaction.guildId, channelId: channel.id, companionId }));
    } catch (err) {
      const code = err?.response?.data?.error;
      if (code === "SPAWN_ACTIVE") return interaction.editReply({ content: t("game.spawnCmd.active", lang) });
      if (code === "GAME_DISABLED") return interaction.editReply({ content: t("game.disabled", lang) });
      if (code === "COMPANION_NOT_ALLOWED") return interaction.editReply({ content: t("game.spawnCmd.notAllowed", lang) });
      if (code === "UNKNOWN_COMPANION") return interaction.editReply({ content: t("game.spawnCmd.unknown", lang) });
      return interaction.editReply(friendlyError(err, interaction));
    }
    try {
      await postSpawn(channel, data, interaction.client);
    } catch {
      return interaction.editReply({ content: t("game.spawnCmd.postFailed", lang, { channel: `<#${channel.id}>` }) });
    }
    return interaction.editReply({ content: t("game.spawnCmd.posted", lang, { name: data.companion.name, channel: `<#${channel.id}>` }) });
  },
};
