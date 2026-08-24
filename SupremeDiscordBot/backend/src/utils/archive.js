// backend/src/utils/archive.js
//
// Самостоятелен HTML транскрипт на тикет. Това е ЕДИНСТВЕНИЯТ ни артефакт,
// който напуска Discord: клиентът го сваля, архивира и праща на трети хора
// (свой екип, клиент, понякога адвокат). Затова:
//
//  * НУЛА външни ресурси — стилът е inline, логото е inline SVG. Файлът трябва
//    да изглежда еднакво отворен от диск, от нашия домейн и прикачен в имейл.
//  * Носи НАШИЯ бранд, не облика на Discord (беше стилизиран с #36393f /
//    #5865f2 / Whitney — тоест продавахме чуждо лице).
//  * При white-label бот брандът е НА КЛИЕНТА: точно за това плаща — нашето
//    име и лого не се появяват никъде.
//  * Има печатен изглед: екипите разпечатват транскрипти за преписки, а тъмна
//    тема на хартия е кофти шега към тонера.

// Палитрата е същата като на dashboard-а (frontend/tailwind.config.js cs.*) —
// една истина за бранда, а не приблизително същото зелено.
const C = {
  bg: "#070a06",
  surface: "#0d130b",
  panel: "#141d10",
  border: "#24301e",
  borderHi: "#4b5a44",
  text: "#f0f0eb",
  muted: "#aaaaaa",
  dim: "#9a9a9a",
  accent: "#8fe600",
};

// Марката като inline SVG — щит с ромб, четим и на 24px. Без външен файл,
// защото свален транскрипт няма как да дръпне /logo-mark.png.
const LOGO_SVG = `<svg width="34" height="34" viewBox="0 0 32 32" role="img" aria-label="Supreme Bot" style="display:block;">
  <path d="M16 2 L28 7 v9c0 7-5.2 12.3-12 14-6.8-1.7-12-7-12-14V7z" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M16 10 l5 6-5 6-5-6z" fill="${C.accent}"/>
</svg>`;

/**
 * @param {object} ticket  тикет с include: messages, creator, assignee, (server)
 * @param {object} [opts]
 * @param {boolean} [opts.whiteLabel] явно превключване; иначе се извежда от
 *        ticket.server.customBotName
 * @param {string}  [opts.brandName] име за white-label заглавието
 */
export function generateHtmlTranscript(ticket, opts = {}) {
  const messages = ticket.messages || [];
  const customBotName = ticket.server?.customBotName || null;
  const whiteLabel = opts.whiteLabel ?? Boolean(customBotName);
  const brandName = opts.brandName || customBotName || ticket.server?.name || "Support";

  const fmt = (d) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : null);
  const createdAt = fmt(ticket.createdAt) || "—";
  const closedAt = fmt(ticket.closedAt) || "Still open";
  const duration = humanDuration(ticket.createdAt, ticket.closedAt);
  const ref = ticket.number != null ? `#${String(ticket.number).padStart(4, "0")}` : ticket.id.slice(-8);

  const messagesHtml = messages.length === 0
    ? `<p style="color:${C.dim};text-align:center;padding:28px 0;font-size:14px;">No messages were recorded in this ticket.</p>`
    : messages.map((msg) => messageRow(msg, ticket)).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Ticket ${esc(ref)} — ${esc(brandName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: ${C.bg}; color: ${C.text}; line-height: 1.55;
      -webkit-font-smoothing: antialiased;
    }
    .wrap { max-width: 860px; margin: 0 auto; padding: 24px 20px 48px; }
    .card {
      background: ${C.surface}; border: 1px solid ${C.border};
      border-radius: 14px; padding: 24px; margin-bottom: 16px;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
    a { color: ${C.accent}; word-break: break-all; }
    h1 { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
    h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .label {
      font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
      color: ${C.dim};
    }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .meta {
      background: ${C.panel}; border: 1px solid ${C.border};
      border-radius: 9px; padding: 10px 12px;
    }
    .meta p + p { margin-top: 3px; font-size: 13px; color: ${C.text}; word-break: break-word; }
    .msg { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid ${C.border}; }
    .msg:last-child { border-bottom: 0; }
    .avatar {
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 15px;
      background: ${C.panel}; border: 1px solid ${C.border}; color: ${C.accent};
    }
    .chip {
      font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
      border: 1px solid ${C.borderHi}; color: ${C.muted};
      border-radius: 999px; padding: 1px 7px;
    }
    .chip-staff { border-color: ${C.accent}; color: ${C.accent}; }
    /* v36 — изтрито/редактирано: видимо, но не крещящо */
    .chip-deleted { border-color: #a05252; color: #d98b8b; }
    .msg-deleted .content { text-decoration: line-through; color: ${C.muted}; }
    .original {
      margin-top: 6px; padding: 6px 10px; border-left: 2px solid ${C.borderHi};
      background: ${C.panel}; border-radius: 0 6px 6px 0;
    }
    .original div { font-size: 13px; color: ${C.muted}; white-space: pre-wrap; word-break: break-word; }
    .content { white-space: pre-wrap; word-break: break-word; color: ${C.text}; font-size: 14px; }
    .qa + .qa { margin-top: 14px; }
    footer { text-align: center; font-size: 11px; color: ${C.dim}; margin-top: 20px; }

    /* Печат: транскриптите се разпечатват за преписки — тъмната тема става
       черен лист. Обръщаме на хартиен изглед и махаме декорацията. */
    @media print {
      body { background: #fff; color: #111; }
      .card, .meta { background: #fff; border-color: #ccc; }
      .avatar { background: #f2f2f2; border-color: #ccc; color: #333; }
      .content, .meta p + p, h1, h2 { color: #111; }
      .label, footer, .chip { color: #555; }
      a { color: #0645ad; }
      .wrap { max-width: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
        ${whiteLabel ? "" : LOGO_SVG}
        <div style="flex:1;min-width:0;">
          <h1>Ticket transcript ${esc(ref)}</h1>
          <p class="mono" style="font-size:11px;color:${C.dim};margin-top:2px;">
            ${esc(brandName)} &bull; ID ${esc(ticket.id)}
          </p>
        </div>
      </div>
      <div class="meta-grid">
        ${metaCard("Opened", createdAt)}
        ${metaCard("Closed", closedAt)}
        ${duration ? metaCard("Duration", duration) : ""}
        ${metaCard("Opened by", ticket.creator?.username || "Unknown")}
        ${metaCard("Handled by", ticket.assignee?.username || "Unassigned")}
        ${metaCard("Messages", String(messages.length))}
        ${ticket.priority && ticket.priority !== "NORMAL" ? metaCard("Priority", ticket.priority) : ""}
        ${ticket.closeReason ? metaCard("Close reason", ticket.closeReason) : ""}
      </div>
    </header>

    ${ticket.application ? applicationSection(ticket.application) : ""}

    <main class="card">
      <h2>Conversation <span class="mono" style="color:${C.dim};font-weight:400;">(${messages.length})</span></h2>
      ${messagesHtml}
    </main>

    <footer>
      ${whiteLabel
        ? `${esc(brandName)} &bull; generated ${esc(fmt(new Date()))}`
        : `Generated by <strong style="color:${C.muted};">Supreme Bot</strong> &bull; ${esc(fmt(new Date()))}`}
    </footer>
  </div>
</body>
</html>`;
}

// Един ред съобщение. Ролята (Member/Staff) се извежда от автора спрямо
// създателя на тикета — в модела няма флаг, но точно това разграничение прави
// транскрипта четим при преглед след месеци.
function messageRow(msg, ticket) {
  const time = msg.createdAt
    ? new Date(msg.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
    : "";
  const tag = msg.authorTag || "Unknown";
  const letter = tag[0]?.toUpperCase() || "?";
  const isCreator = msg.authorId && ticket.creatorId && msg.authorId === ticket.creatorId;
  const chip = isCreator
    ? `<span class="chip">Member</span>`
    : `<span class="chip chip-staff">Staff</span>`;

  const attachments = (msg.attachments || []).length
    ? `<div style="margin-top:6px;">${msg.attachments.map((url) =>
        `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="display:block;font-size:12px;">📎 ${esc(url)}</a>`
      ).join("")}</div>`
    : "";

  // v36 — одитната следа. Изтритото съобщение НЕ изчезва: показва се зачертано
  // и маркирано, защото транскриптът е одитен документ, а не жив чат.
  const deleted = Boolean(msg.deletedAt);
  const edited = Boolean(msg.editedAt);
  const stateChips =
    (deleted ? `<span class="chip chip-deleted">Deleted</span>` : "") +
    (edited ? `<span class="chip">Edited</span>` : "");

  // При редакция показваме и двете версии — „какво е било казано“ е точно
  // въпросът, заради който се вади транскрипт.
  const original = edited && msg.originalContent
    ? `<div class="original"><span class="label">Original</span><div>${esc(msg.originalContent)}</div></div>`
    : "";

  return `<div class="msg${deleted ? " msg-deleted" : ""}">
    <div class="avatar" aria-hidden="true">${esc(letter)}</div>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px;">
        <span style="font-weight:600;font-size:14px;">${esc(tag)}</span>
        ${chip}${stateChips}
        <span class="mono" style="font-size:11px;color:${C.dim};">${esc(time)}</span>
      </div>
      <div class="content">${esc(msg.content || "")}</div>
      ${original}
      ${attachments}
    </div>
  </div>`;
}

function metaCard(label, value) {
  return `<div class="meta">
    <p class="label">${esc(label)}</p>
    <p>${esc(String(value))}</p>
  </div>`;
}

function applicationSection(application) {
  const answers = application.answers || {};
  const questions = application.form?.questions || [];

  const qaHtml = questions.map((q) => {
    const answer = answers[q.id] || "No answer provided";
    return `<div class="qa">
      <p class="label">${esc(q.label)}</p>
      <p class="content" style="margin-top:3px;">${esc(String(answer))}</p>
    </div>`;
  }).join("");

  return `<section class="card">
    <h2>Application answers</h2>
    ${qaHtml || `<p style="color:${C.dim};font-size:14px;">No questions found.</p>`}
  </section>`;
}

// „2h 14m“ — по-полезно от две дати, които читателят вади наум.
function humanDuration(from, to) {
  if (!from || !to) return null;
  const ms = new Date(to) - new Date(from);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
