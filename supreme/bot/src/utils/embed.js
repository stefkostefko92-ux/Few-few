// bot/src/utils/embed.js
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";

/**
 * Build the Discord embed + button rows for a Panel.
 * Supports buttonStyle = BUTTON (default) | DROPDOWN | THREAD.
 *
 *   BUTTON:   one button per panel.buttons entry, chunked into rows of 5
 *   DROPDOWN: a single StringSelectMenu — each option maps to a button's formId/panel action
 *   THREAD:   same as BUTTON but tickets spawn as threads (handled at interaction time)
 */
export function buildPanelMessage(panel) {
  const colorInt = parseInt(panel.color?.replace("#", "") || "5865F2", 16);

  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setColor(colorInt)
    .setTimestamp();

  if (panel.description) embed.setDescription(panel.description);
  if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);
  if (panel.imageUrl) embed.setImage(panel.imageUrl);

  const styleMap = {
    PRIMARY: ButtonStyle.Primary,
    SECONDARY: ButtonStyle.Secondary,
    SUCCESS: ButtonStyle.Success,
    DANGER: ButtonStyle.Danger,
  };

  const mode = (panel.buttonStyle || "BUTTON").toUpperCase();

  // ─── DROPDOWN mode ──────────────────────────────────────────────────────────
  if (mode === "DROPDOWN" && (panel.buttons || []).length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`panel_select:${panel.id}`)
      .setPlaceholder("Select a ticket type…")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        panel.buttons.slice(0, 25).map((btn) => {
          const opt = { label: btn.label.slice(0, 100), value: btn.id };
          if (btn.emoji) opt.emoji = btn.emoji;
          return opt;
        })
      );
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] };
  }

  // ─── BUTTON / THREAD mode ───────────────────────────────────────────────────
  // Discord allows max 5 buttons per row, max 5 rows → cap at 25 buttons
  const buttons = (panel.buttons || []).slice(0, 25);
  const rows = [];
  const chunkSize = 5;
  for (let i = 0; i < buttons.length; i += chunkSize) {
    const chunk = buttons.slice(i, i + chunkSize);
    const row = new ActionRowBuilder().addComponents(
      chunk.map((btn) => {
        const button = new ButtonBuilder()
          .setCustomId(`panel_button:${panel.id}:${btn.id}`)
          .setLabel(btn.label)
          .setStyle(styleMap[btn.style] || ButtonStyle.Primary);
        // Only set emoji if provided — passing undefined throws
        if (btn.emoji) button.setEmoji(btn.emoji);
        return button;
      })
    );
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

/**
 * Build an application review embed (Approve / Deny buttons).
 */
export function buildReviewEmbed(application, formName, user, questions) {
  const answers = application.answers || {};

  const embed = new EmbedBuilder()
    .setTitle(`📋 New Application — ${formName}`)
    .setColor(0xffd700)
    .setAuthor({
      name: user.discriminator && user.discriminator !== "0" ? `${user.username}#${user.discriminator}` : user.username,
      iconURL: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : undefined,
    })
    .setTimestamp()
    .setFooter({ text: `Application ID: ${application.id}` });

  let fieldCount = 0;
  for (const q of questions) {
    if (fieldCount >= 25) break; // Discord embed field limit
    const answer = answers[q.id];
    const value = String(answer ?? "").trim();
    embed.addFields({
      name: q.label.slice(0, 256),
      value: (value || "*No answer*").slice(0, 1024),
    });
    fieldCount++;
  }

  const approveBtn = new ButtonBuilder()
    .setCustomId(`app_review:${application.id}:approve`)
    .setLabel("Approve")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅");

  const denyBtn = new ButtonBuilder()
    .setCustomId(`app_review:${application.id}:deny`)
    .setLabel("Deny")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("❌");

  const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn);

  return { embeds: [embed], components: [row] };
}

/**
 * Build the "ticket opened" embed shown in a new ticket thread/channel.
 */
export function buildTicketOpenEmbed(creator, panelName) {
  return new EmbedBuilder()
    .setTitle("🎫 Ticket Opened")
    .setDescription(`Welcome, <@${creator.id}>! A staff member will be with you shortly.`)
    .setColor(0x57f287)
    .addFields({ name: "Category", value: panelName || "General" })
    .setTimestamp();
}

/**
 * Build a status embed for closed/approved/denied items.
 */
export function buildStatusEmbed(title, description, color = 0x57f287) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}
