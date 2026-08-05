// bot/src/commands/tag.js
// v2.9 — Canned responses. #1 staff request (Ticket Tool parity). Staff save
// reusable replies once, then post them into any channel with `/tag use`
// instead of re-typing the same answer for every ticket.
import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getTags, createTag, deleteTag, useTag, getServer } from "../utils/api.js";
import { isStaffMember } from "../utils/staffCheck.js";
import { friendlyError } from "../utils/friendlyError.js";
import { BRAND } from "../utils/colors.js";

const NAME_MAX = 32;
const CONTENT_MAX = 1500;

function denyStaff(interaction) {
  return interaction.reply({
    content: "❌ You need Manage Messages permission (or a support role) to manage tags.",
    flags: MessageFlags.Ephemeral,
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName("tag")
    .setDescription("Manage canned responses (saved replies)")
    .addSubcommand((s) =>
      s.setName("use")
        .setDescription("Post a saved reply in this channel")
        .addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) =>
      s.setName("add")
        .setDescription("Save a new canned response")
        .addStringOption((o) => o.setName("name").setDescription("Tag name (kebab-case, ≤32 chars)").setRequired(true).setMaxLength(NAME_MAX))
        .addStringOption((o) => o.setName("content").setDescription("Reply text (≤1500 chars)").setRequired(true).setMaxLength(CONTENT_MAX))
    )
    .addSubcommand((s) =>
      s.setName("remove")
        .setDescription("Delete a canned response")
        .addStringOption((o) => o.setName("name").setDescription("Tag name").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) => s.setName("list").setDescription("List all canned responses")),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    try {
      const tags = await getTags(interaction.guildId);
      const filtered = (tags || [])
        .filter((t) => t.name.includes(focused))
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 25);
      await interaction.respond(filtered.map((t) => ({ name: `${t.name} (used ${t.usageCount}×)`.slice(0, 100), value: t.name })));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "use") {
      return handleUse(interaction, interaction.options.getString("name"));
    }

    // add/remove/list are staff-only management actions.
    if (!(await isStaffMember(interaction))) return denyStaff(interaction);

    if (sub === "add") return handleAdd(interaction);
    if (sub === "remove") return handleRemove(interaction);
    if (sub === "list") return handleList(interaction);
  },
};

async function handleUse(interaction, name) {
  // Posting a saved reply in the channel is the actual support answer to the
  // user, not a bot reply — never ephemeral, must be gated like the other
  // ticket-response actions.
  if (!(await isStaffMember(interaction))) return denyStaff(interaction);

  await interaction.deferReply();
  let tag;
  try {
    tag = await useTag(interaction.guildId, name);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction, `Tag "${name}" not found.`));
  }
  await interaction.editReply({ content: tag.content });
}

async function handleAdd(interaction) {
  const name = interaction.options.getString("name").trim().toLowerCase();
  const content = interaction.options.getString("content");

  if (!/^[a-z0-9-]{1,32}$/.test(name)) {
    return interaction.reply({
      content: "❌ Tag name must be kebab-case, ≤32 characters (letters, numbers, hyphens only).",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let isPremium = false;
  try {
    const server = await getServer(interaction.guildId);
    isPremium = !!server?.isPremium;
  } catch { /* best-effort — backend limit-check re-validates anyway */ }

  try {
    await createTag(interaction.guildId, name, content, interaction.user.id, isPremium);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction));
  }
  await interaction.editReply(`✅ Tag \`${name}\` saved. Use it with \`/tag use ${name}\`.`);
}

async function handleRemove(interaction) {
  const name = interaction.options.getString("name");
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await deleteTag(interaction.guildId, name);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction, `Tag "${name}" not found.`));
  }
  await interaction.editReply(`🗑️ Tag \`${name}\` removed.`);
}

async function handleList(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  let tags;
  try {
    tags = await getTags(interaction.guildId);
  } catch (err) {
    return interaction.editReply(friendlyError(err, interaction));
  }
  if (!tags?.length) {
    return interaction.editReply("No canned responses yet. Add one with `/tag add`.");
  }
  const lines = tags
    .sort((a, b) => b.usageCount - a.usageCount)
    .map((t) => `**${t.name}** — used ${t.usageCount}× — ${t.content.slice(0, 80)}${t.content.length > 80 ? "…" : ""}`);
  await interaction.editReply({
    embeds: [{
      title: `🏷️ Canned Responses (${tags.length})`,
      description: lines.join("\n").slice(0, 4096),
      color: BRAND,
    }],
  });
}
