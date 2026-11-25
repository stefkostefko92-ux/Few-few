// bot/src/commands/new.js
// Command-style ticket opening — TicketTool's $new/$ticket equivalent.
// Opens a ticket on behalf of the invoker (or another user with a reason).

import { MessageFlags, SlashCommandBuilder } from "discord.js";
import api from "../utils/api.js";
import { checkCooldown } from "../utils/cooldowns.js";
import { friendlyError } from "../utils/friendlyError.js";
import { loadPanel } from "../utils/panelCache.js";
import { runFormSession } from "../utils/formSession.js";
import { t, resolveLang, resolveLangSync } from "../i18n/index.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

const COOLDOWN_SECONDS = 10;

export default {
  data: new SlashCommandBuilder()
    .setName("new")
    .setDescription("Open a new support ticket")
    .setDescriptionLocalizations(CMD_DESC_L10N.new)
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
      const lang = resolveLangSync(interaction); // пред първия отговор — без мрежа
      return interaction.reply({ content: t("cooldown.newTicket", lang, { seconds: remaining }), flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lang = await resolveLang(interaction);

    const panelIdOrName = interaction.options.getString("panel");
    const reason = interaction.options.getString("reason") || "";
    const onBehalfOf = interaction.options.getUser("on_behalf_of");

    // Look up panel — by ID first, fall back to name.
    // Т8: непознат панел → ОТКАЗ. Преди: тихо `panels[0]` — тикетът излизаше в
    // грешния панел, с грешния екип. Без аргумент се приема само единственият панел.
    let summary;
    try {
      const { data: panels } = await api.get(`/bot/guild/${interaction.guildId}/panels`);
      if (!panels?.length) return interaction.editReply(t("tkt.noPanels", lang));
      if (panelIdOrName) {
        const needle = panelIdOrName.toLowerCase();
        summary = panels.find((p) => p.id === panelIdOrName)
               || panels.find((p) => p.name.toLowerCase() === needle);
        if (!summary) return interaction.editReply(t("tkt.panelUnknown", lang));
      } else if (panels.length === 1) {
        summary = panels[0];
      } else {
        return interaction.editReply(t("tkt.panelRequired", lang));
      }
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction));
    }

    // Пълният панел (бутони, приветствие, наблюдатели, режим нишка, врата, формуляр).
    let panel;
    try {
      panel = await loadPanel(summary.id, interaction.guildId);
    } catch (err) {
      return interaction.editReply(friendlyError(err, interaction, t("tkt.panelGone", lang)));
    }

    // on_behalf_of requires staff — проверка СЪРВЪРНО (роли от Gateway кеша).
    if (onBehalfOf) {
      const isStaff = (panel.supportRoleIds || []).some((r) => interaction.member.roles.cache.has(r))
                      || interaction.member.permissions.has("ManageGuild");
      if (!isStaff) return interaction.editReply(t("tkt.onBehalfStaffOnly", lang));
    }

    const ic = await import("../events/interactionCreate.js");

    // Задължителен формуляр (всеки бутон на панела е с формуляр): /new не може да
    // покаже модал след defer → DM сесията като при бутона; при няколко различни
    // формуляра не познаваме кой е нужен — насочваме към бутона на панела.
    const buttons = panel.buttons || [];
    if (buttons.length && buttons.every((b) => b.formId && b.form)) {
      const forms = [...new Map(buttons.map((b) => [b.form.id, b.form])).values()];
      if (forms.length !== 1) return interaction.editReply(t("tkt.useButtonForForm", lang));
      const gate = ic.checkVerificationGate(interaction, panel);
      if (!gate.allowed) return interaction.editReply({ content: gate.message });
      await interaction.editReply(t("form.dmCheck", lang));
      return runFormSession(interaction, forms[0], panel);
    }

    // Т8: ЕДИНЕН път — същият като бутон: Close/Claim/Transcript, приветствие,
    // наблюдатели, режим нишка, верификационна врата, лимит преди канал, лог.
    try {
      await ic.createTicketFromPanel(interaction, panel, null, {
        onBehalfOf: onBehalfOf || undefined,
        reason: reason || undefined,
      });
    } catch (err) {
      await interaction.editReply(friendlyError(err, interaction));
    }
  },
};
