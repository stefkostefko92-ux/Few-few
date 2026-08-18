// bot/src/utils/embed.js
import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import { priorityField } from "./priority.js";
// Палитрата и помощниците живеят в colors.js — един източник за цвят, аватар,
// таг и релативно време, за да не се дублират из файловете.
import { BRAND, SUCCESS, WARNING, withFooter, brandEmbed, avatarUrl, userTag } from "./colors.js";

/**
 * Build the Discord embed + button rows for a Panel.
 * Supports buttonStyle = BUTTON (default) | DROPDOWN | THREAD.
 *
 *   BUTTON:   one button per panel.buttons entry, chunked into rows of 5
 *   DROPDOWN: a single StringSelectMenu — each option maps to a button's formId/panel action
 *   THREAD:   same as BUTTON but tickets spawn as threads (handled at interaction time)
 */
/**
 * Свежда потребителско emoji до формата, който Discord API приема, или null.
 *
 * ВАЖНО (проверено срещу discord.js v14): невалиден стринг НЕ хвърля при
 * билд — builders го увиват в { name: "каквото-и-да-е" } и заявката пада чак
 * в Discord API (400 Invalid Emoji), събаряйки ЦЯЛОТО съобщение. Затова
 * try/catch около setEmoji не пази нищо — валидираме формата сами:
 *   • `<a:name:id>` / `<:name:id>` → custom emoji обект
 *   • голо ID (17–20 цифри)       → { id }
 *   • кратък unicode emoji         → { name }
 * Всичко останало → null (панелът е ценен, emoji-то не е).
 */
export function sanitizeEmoji(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  const custom = s.match(/^<(a?):(\w{2,32}):(\d{17,20})>$/);
  if (custom) return { animated: custom[1] === "a", name: custom[2], id: custom[3] };
  if (/^\d{17,20}$/.test(s)) return { id: s };

  // Unicode emoji — стрингът трябва да Е emoji, не да СЪДЪРЖА emoji.
  //
  // ДЕФЕКТЪТ (продукция, 11.08.2026): проверката беше `.test(s)`, която е
  // вярна и при ЧАСТИЧНО съвпадение. „🎫 Support" минаваше за emoji и
  // Discord отказваше ЦЯЛОТО съобщение с
  // `options[0].emoji.name[COMPONENT_INVALID_EMOJI]: Invalid emoji`.
  // Сега броим графемите: точно една, и тя да е emoji. Покрива и
  // съставните — флаг (два regional indicator-а), keycap, ZWJ вериги,
  // тон на кожата — всяко от тях е ЕДНА графема.
  if (s.length > 32) return null;
  const graphemes = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)];
  if (graphemes.length !== 1) return null;
  const isEmoji = /\p{Extended_Pictographic}/u.test(s)   // повечето emoji
    || /\p{Regional_Indicator}/u.test(s)                 // флагове
    || /\u20E3/.test(s);                                 // keycap
  return isEmoji ? { name: s } : null;
}

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
          const opt = { label: String(btn.label || "Open").slice(0, 100), value: btn.id };
          const emoji = sanitizeEmoji(btn.emoji);
          if (emoji) opt.emoji = emoji;
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
          // Таван 80 (Discord) + резервен етикет — null label събаря целия билд.
          .setLabel(String(btn.label || "Open").slice(0, 80))
          .setStyle(styleMap[btn.style] || ButtonStyle.Primary);
        const emoji = sanitizeEmoji(btn.emoji);
        if (emoji) button.setEmoji(emoji);
        return button;
      })
    );
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

// Discord тавани за ЕДНО съобщение (проверени в API документацията):
//   • 10 embed-а
//   • 5 реда компоненти (action rows)
// Панел в DROPDOWN режим яде 1 ред; в BUTTON режим — по 1 ред на всеки 5 бутона.
export const MAX_EMBEDS_PER_MESSAGE = 10;
export const MAX_ROWS_PER_MESSAGE = 5;
//   • 6000 знака СБОРНО във всички embed-и на съобщението
export const MAX_EMBED_CHARS_PER_MESSAGE = 6000;

/**
 * Сглобява НЯКОЛКО панела в ЕДНО съобщение.
 *
 * Работи, защото customId-тата вече носят panelId
 * (`panel_button:<panelId>:<btnId>` и `panel_select:<panelId>`) — значи
 * съществуващите interaction handler-и не различават дали панелът е сам в
 * съобщението, или е трети по ред. Нула промени по обработката.
 *
 * Връща { embeds, components, skipped } — `skipped` са панелите, които не
 * се побират в лимитите (по-добре частично съобщение + ясен доклад, отколкото
 * заявка, която Discord отхвърля цялата).
 */
export function buildMultiPanelMessage(panels, { mode = "STACK" } = {}) {
  // MERGE режими: панелите се СЛИВАТ в един контрол (както прави Ticket Tool),
  // вместо да се редят като отделни блокове. Всяка опция помни от кой панел
  // идва, затова тикетът пак се отваря с правилните настройки.
  if (mode === "DROPDOWN" || mode === "BUTTONS") {
    return buildMergedPanelMessage(panels, mode);
  }

  const embeds = [];
  const components = [];
  const skipped = [];
  let totalChars = 0;

  for (const panel of panels) {
    const built = buildPanelMessage(panel);
    const nextEmbeds = embeds.length + built.embeds.length;
    const nextRows = components.length + built.components.length;
    // Discord брои СБОРНАТА дължина на всички embed-и в съобщението (6000).
    // Без тази проверка десет дълги панела минаваха лимитите за брой, но
    // Discord отхвърляше ЦЯЛАТА заявка и потребителят виждаше само
    // „Bot is offline“ — вместо ясно кой панел не се е побрал.
    const chars = built.embeds.reduce((n, e) => n + embedCharCount(e), 0);
    const reason =
      nextEmbeds > MAX_EMBEDS_PER_MESSAGE ? "embeds"
      : nextRows > MAX_ROWS_PER_MESSAGE ? "rows"
      : totalChars + chars > MAX_EMBED_CHARS_PER_MESSAGE ? "chars"
      : null;
    if (reason) {
      skipped.push({ id: panel.id, name: panel.name, reason });
      continue;
    }
    embeds.push(...built.embeds);
    components.push(...built.components);
    totalChars += chars;
  }

  return { embeds, components, skipped };
}

/**
 * СЛЯТО групово съобщение: един embed + един контрол, събрал опциите на всички
 * избрани панели (както Ticket Tool). Първият панел дава външния вид (заглавие,
 * описание, цвят) — той е „обвивката“ на групата.
 *
 * Всяка опция помни от кой панел идва:
 *   • DROPDOWN → customId `panel_select_multi`, value `<panelId>:<btnId>`
 *   • BUTTONS  → customId `panel_button:<panelId>:<btnId>` (същият като досега,
 *     значи бутонният път изобщо не иска нов handler)
 * Така отвореният тикет пази настройките на СВОЯ панел (категория, роли, SLA).
 */
function buildMergedPanelMessage(panels, mode) {
  const list = panels.filter((p) => (p.buttons || []).length > 0);
  const skipped = [];
  if (!list.length) return { embeds: [], components: [], skipped };

  const head = list[0];
  const parsed = parseInt(String(head.color || "").replace("#", ""), 16);
  const embed = new EmbedBuilder()
    .setTitle(head.title)
    .setColor(Number.isNaN(parsed) ? BRAND : parsed)
    .setTimestamp();
  if (head.description) embed.setDescription(head.description);
  if (head.thumbnailUrl) embed.setThumbnail(head.thumbnailUrl);
  if (head.imageUrl) embed.setImage(head.imageUrl);

  // Плосък списък от всички опции, в реда на панелите.
  const entries = [];
  for (const panel of list) {
    for (const btn of panel.buttons) entries.push({ panel, btn });
  }

  const styleMap = {
    PRIMARY: ButtonStyle.Primary, SECONDARY: ButtonStyle.Secondary,
    SUCCESS: ButtonStyle.Success, DANGER: ButtonStyle.Danger,
  };

  if (mode === "DROPDOWN") {
    const fit = entries.slice(0, 25);
    for (const e of entries.slice(25)) {
      skipped.push({ id: e.panel.id, name: `${e.panel.name} → ${e.btn.label}`, reason: "options" });
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId("panel_select_multi")
      .setPlaceholder(head.selectPlaceholder || "Select an option…")
      .setMinValues(1).setMaxValues(1)
      .addOptions(fit.map(({ panel, btn }) => {
        const opt = { label: String(btn.label || "Open").slice(0, 100), value: `${panel.id}:${btn.id}` };
        // Описанието подсказва от кой панел е опцията, когато имената се
        // припокриват между панели.
        if (list.length > 1 && panel.name) opt.description = String(panel.name).slice(0, 100);
        const emoji = sanitizeEmoji(btn.emoji);
        if (emoji) opt.emoji = emoji;
        return opt;
      }));
    return { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)], skipped };
  }

  // BUTTONS — до 25 (5 реда × 5)
  const fit = entries.slice(0, 25);
  for (const e of entries.slice(25)) {
    skipped.push({ id: e.panel.id, name: `${e.panel.name} → ${e.btn.label}`, reason: "buttons" });
  }
  const rows = [];
  for (let i = 0; i < fit.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(
      fit.slice(i, i + 5).map(({ panel, btn }) => {
        const b = new ButtonBuilder()
          .setCustomId(`panel_button:${panel.id}:${btn.id}`)
          // Discord таванът за етикет на бутон е 80 — DROPDOWN клонът реже,
          // този не режеше: един дълъг етикет събаряше ЦЯЛАТА група с
          // необяснимо „Bot is offline" (одит 09.08.2026).
          .setLabel(String(btn.label || "Open").slice(0, 80))
          .setStyle(styleMap[btn.style] || ButtonStyle.Primary);
        // Невалидно emoji НЕ хвърля при билд, а чак в Discord API (400 за
        // цялото съобщение) — затова се валидира формата, не се лови грешка.
        const emoji = sanitizeEmoji(btn.emoji);
        if (emoji) b.setEmoji(emoji);
        return b;
      })
    ));
  }
  return { embeds: [embed], components: rows, skipped };
}

/** Знаците, които Discord брои към лимита от 6000 на съобщение. */
function embedCharCount(embed) {
  const d = typeof embed?.toJSON === "function" ? embed.toJSON() : (embed || {});
  let n = (d.title?.length || 0) + (d.description?.length || 0)
    + (d.footer?.text?.length || 0) + (d.author?.name?.length || 0);
  for (const f of d.fields || []) n += (f.name?.length || 0) + (f.value?.length || 0);
  return n;
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
    // WARNING = „чака решение“ от единната палитра (преди беше сурово 0xffd700).
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
  // „Applicant“ полето по-горе вече яде от двата бюджета: ~30 знака и 1 слот.
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
    .setEmoji("👍");

  const denyBtn = new ButtonBuilder()
    .setCustomId(`app_review:${application.id}:deny`)
    .setLabel("Deny")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("👎");

  // Отваря личен discussion канал с кандидата ПРЕДИ решение (status остава
  // PENDING) — същият flow като „Open discussion“ в dashboard-а.
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

  // Кой отговаря — прави обещанието конкретно вместо „някой ще дойде“.
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
export function buildStatusEmbed(title, description, color = SUCCESS, opts = {}) {
  // Минава през общия строител → един цвят, един timestamp, един footer.
  // `client` е по избор: подаде ли се, embed-ът получава брандиран footer
  // (и нищо, ако сървърът върти собствен white-label бот).
  return brandEmbed({
    title,
    description,
    color,
    client: opts.client,
    footer: opts.footer,
    fields: opts.fields,
  });
}
