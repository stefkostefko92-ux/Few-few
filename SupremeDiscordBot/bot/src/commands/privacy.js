// bot/src/commands/privacy.js
// /privacy — правата върху данните за ВСЕКИ Discord потребител, без табло.
//
// Discord Developer Terms §5(b) (сверено 13.09.2026): „You will give users an
// easily accessible way to ask for their API Data to be modified and deleted."
// Хората, чиито данни пазим най-много (създатели на тикети, кандидати), никога
// не влизат в таблото. Тази команда е техният път:
//   /privacy info    — какво пазим, къде е политиката, как се изтрива
//   /privacy delete  — изтриване/анонимизиране на данните за ТЕБ (потвърждение с бутон)
//
// Обхватът на самообслужването е „identity" (профил, подпис на съобщенията,
// сесии, ключове, снимки на роли, опити за верификация, членство). Текстът на
// тикетите е запис на сървърния оператор (контролър) — за пълно изтриване се
// пише на privacy@carbonstealth.eu (обработва се от админ конзолата).
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder, MessageFlags, SlashCommandBuilder,
} from "discord.js";
import api from "../utils/api.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND, DANGER } from "../utils/colors.js";
import { CMD_DESC_L10N } from "../utils/commandLocalizations.js";

const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://supremebot.carbonstealth.eu";
const PRIVACY_URL = `${DASHBOARD_URL}/privacy`;
const PRIVACY_EMAIL = "privacy@carbonstealth.eu";
// Охлаждане по потребител (10 min) — изтриването е идемпотентно, но всяко
// повикване пише одитен ред; без дросел командата е усилвател на шум.
const COOLDOWN_MS = 10 * 60 * 1000;
const recent = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Your data rights: see what Supreme Bot stores about you and request deletion.")
    .setDescriptionLocalizations(CMD_DESC_L10N.privacy)
    .addSubcommand((sub) => sub.setName("info").setDescription("What we store about you and how to exercise your rights"))
    .addSubcommand((sub) => sub.setName("delete").setDescription("Delete / anonymise the data Supreme Bot holds about you")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === "info") {
      try {
        const { data } = await api.get(`/bot/dsr/${interaction.user.id}`);
        const c = data.counts || {};
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setTitle("🔐 Your data at Supreme Bot")
            .setColor(BRAND)
            .setDescription(
              `Supreme Bot stores only what the servers you use need: tickets you opened, messages inside those tickets, applications you submitted, ` +
              `verification attempts, and (if the server enables it) a snapshot of your roles so they can be restored if you rejoin.\n\n` +
              `Full details: ${PRIVACY_URL}`
            )
            .addFields(
              { name: "Dashboard account", value: data.registered ? "yes" : "no", inline: true },
              { name: "Tickets opened", value: String(c.tickets ?? 0), inline: true },
              { name: "Ticket messages", value: String(c.messages ?? 0), inline: true },
              { name: "Applications", value: String(c.applications ?? 0), inline: true },
              { name: "Role snapshots", value: String(c.roleSnapshots ?? 0), inline: true },
              { name: "Verification attempts", value: String(c.verificationAttempts ?? 0), inline: true },
              { name: "Delete your data", value: `Run \`/privacy delete\` here, or use the dashboard (Privacy settings). Questions / full erasure of ticket text: ${PRIVACY_EMAIL}` },
            )],
        });
      } catch (err) {
        return interaction.editReply(friendlyError(err, interaction));
      }
    }

    if (sub === "delete") {
      const last = recent.get(interaction.user.id) || 0;
      if (Date.now() - last < COOLDOWN_MS) {
        return interaction.editReply({ content: `⏳ Your data was already erased ${Math.ceil((Date.now() - last) / 60000)} min ago. Wait a few minutes before running this again.` });
      }
      const confirmId = `privacy:erase:${interaction.user.id}:${interaction.id}`;
      const cancelId = `privacy:cancel:${interaction.user.id}:${interaction.id}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel("Yes, delete my data").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setTitle("⚠️ Delete your data?")
          .setColor(DANGER)
          .setDescription(
            "This anonymises your profile and the author signature on your ticket messages, deletes your sessions, API keys, role snapshots, " +
            "verification attempts and membership records across **all servers** that use Supreme Bot. It cannot be undone.\n\n" +
            `The text of tickets stays as the server's own record; to have it erased too, email ${PRIVACY_EMAIL}. ` +
            "Active paid subscriptions must be cancelled first (Discord → User Settings → Subscriptions)."
          )],
        components: [row],
      });

      let click;
      try {
        const msg = await interaction.fetchReply();
        click = await msg.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === interaction.user.id && (i.customId === confirmId || i.customId === cancelId),
          time: 60_000,
        });
      } catch {
        return interaction.editReply({ content: "⏱️ Timed out — nothing was deleted.", embeds: [], components: [] });
      }

      if (click.customId === cancelId) {
        return click.update({ content: "Cancelled — nothing was deleted.", embeds: [], components: [] });
      }

      await click.deferUpdate();
      try {
        const { data } = await api.post("/bot/dsr/erase", { userId: interaction.user.id, guildId: interaction.guildId ?? null });
        recent.set(interaction.user.id, Date.now());
        if (recent.size > 5000) recent.clear();
        const c = data.counts || {};
        return interaction.editReply({
          content:
            `✅ Done. Anonymised profile: ${data.registered ? "yes" : "n/a"} · message signatures: ${c.messageTags ?? 0} · ` +
            `role snapshots: ${c.roleSnapshots ?? 0} · verification attempts: ${c.verificationAttempts ?? 0} · memberships: ${c.memberships ?? 0}.\n` +
            `A non-identifying reference is kept only so other people's tickets stay intact. Questions: ${PRIVACY_EMAIL}`,
          embeds: [], components: [],
        });
      } catch (err) {
        const code = err?.response?.data?.code;
        if (code === "ACTIVE_SUBSCRIPTIONS") {
          return interaction.editReply({ content: "❌ You still have an active paid subscription. Cancel it first (Discord → User Settings → Subscriptions), then run `/privacy delete` again.", embeds: [], components: [] });
        }
        if (code === "DSR_COOLDOWN") {
          return interaction.editReply({ content: "⏳ An erasure for your account was just processed. Try again in a few minutes.", embeds: [], components: [] });
        }
        if (code === "STAFF_ACCOUNT") {
          return interaction.editReply({ content: "❌ Staff accounts cannot self-erase. Contact the platform owner.", embeds: [], components: [] });
        }
        return interaction.editReply({ ...friendlyError(err, interaction), embeds: [], components: [] });
      }
    }
  },
};
