// bot/src/utils/embed.js
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { priorityField } from "./priority.js";
import { BRAND, SUCCESS, WARNING, withFooter } from "./colors.js";

// Аватар на потребител (или дефолтният на Discord) — за author/thumbnail
// линиите на embed-ите. Без него ревюта и тикети изглеждат като сух текст.
function avatarUrl(user) {
  if (!user) return undefined;
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  if (typeof user.displayAvatarURL === "function") return user.displayAvatarURL({ size: 128 });
  return undefined;
}

function userTag(user) {
  if (!user) return "Unknown";
  return user.discriminator && user.discriminator !== "0"
    ? `${user.username}#${user.discriminator}`
    : user.username;
}

/**
 * Build the Discord embed + button rows for a Panel.
 * Supports buttonStyle = BUTTON (default) | DROPDOWN | THREAD.
 *
 *   BUTTON:   one button per panel.buttons entry, chunked into rows of 5
 *   DROPDOWN: a single StringSelectMenu — each option maps to a button's formId/panel action
 *   THREAD:   same as BUTTON but tickets spawn as threads (handled at interaction time)
 */
export function buildPanelMessage(panel) {
  // Резервният цвят е брандовият, не Discord blurple — панел без зададен цвят
  // не бива да изглежда като чужд бот.
  const parsed = parseInt(String(panel.color || "").replace("#", ""), 16);
  const colorInt = Number.isNaN(parsed) ? BRAND : parsed;

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

  const title = `📋 New Application — ${formName}`;
  const authorName = userTag(user);
  const footerText = `Application ID: ${application.id}`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    // WARNING = „чака решение" от единната палитра (преди беше сурово 0xffd700).
    .setColor(WARNING)
    .setAuthor({ name: authorName, iconURL: avatarUrl(user) })
    .setThumbnail(avatarUrl(user) || null)
    .setTimestamp()
    .setFooter({ text: footerText });

  // Кой кандидатства — като кликаем ментион, не само като име в author реда.
  if (user?.id) {
    embed.addFields({ name: "Applicant", value: `<@${user.id}>`, inline: true });
  }

  // Discord embed лимити: макс 25 полета И сумарно ≤6000 знака (title + author.name
  // + footer.text + всички field.name + field.value). Ако надхвърлим тихо, цялото
  // review съобщение изчезва. Акумулираме дължината и спираме при ~5900 (буфер за
  // бележката), като добавяме поле-индикатор колко въпроса са пропуснати.
  const TOTAL_CAP = 5900;
  // „Applicant" полето по-горе вече яде от двата бюджета: ~30 знака и 1 слот.
  // Затова таванът на отговорите пада на 23 → 1 (applicant) + 23 + 1
  // (truncated) = 25, точно лимита на Discord.
  const APPLICANT_FIELD_LEN = user?.id ? 30 : 0;
  const MAX_ANSWER_FIELDS = user?.id ? 23 : 24;
  let total = title.length + authorName.length + footerText.length + APPLICANT_FIELD_LEN;
  let fieldCount = 0;
  let skipped = 0;
  for (const q of questions) {
    const answer = answers[q.id];
    const name = q.label.slice(0, 256);
    const value = (String(answer ?? "").trim() || "*No answer*").slice(0, 1024);
    // Резервираме ~120 знака за евентуалната "и още N…" бележка.
    if (fieldCount >= MAX_ANSWER_FIELDS || total + name.length + value.length > TOTAL_CAP - 120) {
      skipped = questions.length - fieldCount;
      break;
    }
    embed.addFields({ name, value });
    total += name.length + value.length;
    fieldCount++;
  }
  if (skipped > 0) {
    embed.addFields({
      name: "⚠️ Truncated",
      value: `+${skipped} more answer(s) omitted — view the full submission in the dashboard.`,
    });
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

  // Отваря личен discussion канал с кандидата ПРЕДИ решение (status остава
  // PENDING) — същият flow като „Open discussion" в dashboard-а.
  const discussBtn = new ButtonBuilder()
    .setCustomId(`app_review:${application.id}:discuss`)
    .setLabel("Open a ticket")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🎫");

  const row = new ActionRowBuilder().addComponents(approveBtn, denyBtn, discussBtn);

  return { embeds: [embed], components: [row] };
}

/**
 * Build the "ticket opened" embed shown in a new ticket thread/channel.
 * `priority` is optional and only rendered as a field when it's not the
 * NORMAL default (see priorityField) — keeps the common case uncluttered.
 */
export function buildTicketOpenEmbed(creator, panelName, priority, opts = {}) {
  const { ticketNumber, padding = 4, supportRoleIds = [], client } = opts;
  const ref = ticketNumber != null ? `#${String(ticketNumber).padStart(padding, "0")}` : null;

  const embed = new EmbedBuilder()
    .setTitle(ref ? `🎫 Ticket ${ref}` : "🎫 Ticket opened")
    .setColor(SUCCESS)
    .setAuthor({ name: userTag(creator), iconURL: avatarUrl(creator) })
    .setDescription(
      `Welcome <@${creator.id}> — your ticket is open and the team has been notified.\n\n` +
      "**While you wait**, add anything that helps us solve this faster: what you " +
      "expected, what happened instead, and screenshots if you have them."
    )
    .addFields(
      { name: "Category", value: panelName || "General", inline: true },
      { name: "Opened", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
    )
    .setTimestamp();

  const field = priorityField(priority);
  if (field) embed.addFields({ ...field, inline: true });

  // Кой отговаря — прави обещанието конкретно вместо „някой ще дойде".
  if (supportRoleIds.length) {
    embed.addFields({
      name: "Handled by",
      value: supportRoleIds.slice(0, 5).map((r) => `<@&${r}>`).join(" "),
      inline: false,
    });
  }

  // Брандиран footer, освен ако сървърът върти собствен white-label бот.
  return client ? withFooter(embed, client) : embed;
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
