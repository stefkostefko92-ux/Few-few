// Генератор на екрани за ръководствата „Как да…“ — месинджъри и социални мрежи:
// Viber, Messenger, WhatsApp, Facebook (Android, актуален вид 2025–2026).
// Това са пресъздавания на интерфейса, нарисувани по актуалните екрани; НЕ са официални
// екрани на съответните компании. Важният бутон е подчертан в червено (.ring).
// Профилните снимки са както в приложенията — сив силует или цветен кръг с инициали.
// Снимките в публикации/чатове са само CC0/PDM — assets/messaging/ + assets/credits/messaging.md.
//
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen.js
//   ONLY=viber-pisane,whatsapp node scripts/howto-mockups/gen.js   — само избрани
// Изходът е в public/kak-da/. Слой: _shell.js (телефон, Material Symbols, шрифтове).
const fs = require("node:fs");
const path = require("node:path");
const { phone, ms, tip, av, navBar, photo, render, ASSETS } = require("./_shell");

// ───────────────────────── общи помощници ─────────────────────────
const H = 790; // височина на екрана под лентата за състоянието (вкл. жестовата лента) → 20:9
const ST = 38; // височина на лентата за състоянието на Android в шела

// Корен на екрана: фиксирана височина; dim=true → без отрязване (за сянката върху лентата за състоянието)
const root = (inner, o = {}) => `<div style="height:${H}px;display:flex;flex-direction:column;position:relative;${o.dim ? "" : "overflow:hidden;"}${o.style || ""}">${inner}</div>`;
const nav = (bg, color = "#111") => `<div style="background:${bg};flex-shrink:0">${navBar({ color })}</div>`;
// затъмняване на целия екран (вкл. лентата за състоянието)
const scrim = (a = 0.5) => `<div style="position:absolute;left:0;right:0;top:-${ST}px;bottom:0;background:rgba(0,0,0,${a});z-index:35"></div>`;
const t = (text, style = "") => `<span style="${style}">${text}</span>`;
const flex = (style, inner) => `<div style="display:flex;${style}">${inner}</div>`;

// брандове (simple-icons, CC0) — само пътя на знака
function brand(slug, color, size) {
  const svg = fs.readFileSync(path.join(ASSETS, "brands", slug + ".svg"), "utf8");
  const ds = [...svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">${ds.map((d) => `<path d="${d}"/>`).join("")}</svg>`;
}

// профилни снимки: сив силует по подразбиране или кръг с инициали
const sil = (s, bg = "#c3c6cc") => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${bg};overflow:hidden;flex-shrink:0;position:relative"><svg width="${s}" height="${s}" viewBox="0 0 40 40"><circle cx="20" cy="15.2" r="6.9" fill="#fff" fill-opacity=".93"/><path d="M4.5 40c0-9 6.7-13.6 15.5-13.6S35.5 31 35.5 40z" fill="#fff" fill-opacity=".93"/></svg></div>`;
const ini = (l, c, s = 40) => av(l, c, s);

// курсор за текстово поле
const caret = (c) => `<span style="display:inline-block;width:2px;height:1.1em;background:${c};vertical-align:text-bottom;margin-left:1px"></span>`;

// ───────────────────────── клавиатура (Gboard, светла, български) ─────────────────────────
function keyboard(o = {}) {
  const { sugg = ["", "", ""], enter = "keyboard_return", num = false } = o;
  const key = (c, st = "") => `<div style="flex:1;height:47px;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:21px;color:#1f1f1f;box-shadow:0 1px 0 rgba(0,0,0,.18);${st}">${c}</div>`;
  const sp = (c, w, st = "") => `<div style="flex:0 0 ${w}px;height:47px;border-radius:9px;background:#d9dde4;display:flex;align-items:center;justify-content:center;font-size:15px;color:#1f1f1f;box-shadow:0 1px 0 rgba(0,0,0,.14);${st}">${c}</div>`;
  const enterKey = (w) => `<div style="flex:0 0 ${w}px;height:47px;border-radius:24px;background:#a8c7fa;display:flex;align-items:center;justify-content:center;color:#041e49">${ms(enter, { size: 24, fill: 1 })}</div>`;
  const row = (inner, pad = 0) => `<div style="display:flex;gap:5px;padding:0 ${pad}px">${inner}</div>`;
  if (num) {
    const nk = (c) => `<div style="flex:1;height:54px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:25px;color:#1f1f1f;box-shadow:0 1px 0 rgba(0,0,0,.18)">${c}</div>`;
    const ns = (c, st = "") => `<div style="flex:0 0 76px;height:54px;border-radius:12px;background:#d9dde4;display:flex;align-items:center;justify-content:center;font-size:20px;color:#1f1f1f;${st}">${c}</div>`;
    return `<div style="background:#eceef2;padding:10px 6px 4px;display:flex;flex-direction:column;gap:6px;flex-shrink:0">
      ${row(nk(1) + nk(2) + nk(3) + ns("−"))}${row(nk(4) + nk(5) + nk(6) + ns("␣", "font-size:18px"))}
      ${row(nk(7) + nk(8) + nk(9) + ns(ms("backspace", { size: 24, fill: 1 })))}
      ${row(nk(",") + nk(0) + nk(".") + `<div style="flex:0 0 76px;height:54px;border-radius:27px;background:#a8c7fa;display:flex;align-items:center;justify-content:center;color:#041e49">${ms("check", { size: 26, weight: 600 })}</div>`)}
    </div>`;
  }
  const L = (s) => s.split(" ").map((c) => key(c)).join("");
  const strip = `<div style="height:44px;display:flex;align-items:center;padding:0 8px;color:#444746">
      <span style="width:36px;display:flex;justify-content:center">${ms("apps", { size: 24, fill: 1 })}</span>
      <div style="flex:1;display:flex;font-size:16.5px;color:#1f1f1f;text-align:center">${sugg.map((s, i) => `<div style="flex:1;${i ? "border-left:1px solid #c8ccd3;" : ""}padding:2px 0">${s}</div>`).join("")}</div>
      <span style="width:36px;display:flex;justify-content:center">${ms("mic", { size: 24, fill: 1 })}</span></div>`;
  return `<div style="background:#eceef2;padding:0 4px 4px;display:flex;flex-direction:column;gap:7px;flex-shrink:0">${strip}
    ${row(L("я в е р т ъ у и о п ч"))}${row(L("а с д ф г х й к л ш"), 12)}
    ${row(sp(ms("arrow_upward", { size: 22 }), 46) + L("ю з ц ж б н м") + sp(ms("backspace", { size: 22, fill: 1 }), 46))}
    ${row(sp("?123", 52) + key(",", "flex:0 0 38px") + key(ms("sentiment_satisfied", { size: 22 }), "flex:0 0 40px") + key(`<span style="font-size:14px;color:#5f6368">Български</span>`, "flex:1") + key(".", "flex:0 0 38px") + enterKey(66))}
  </div>`;
}

// ═════════════════════════ VIBER ═════════════════════════
const VP = "#7360F2"; // лилавото на Viber
const VBG = "#EEEAF9"; // фон на чата (светла тема)

// Лента на разговора: назад · снимка · име/състояние · видео · обаждане
function vHeader(name, sub = "Последно видян днес в 08:52", o = {}) {
  const a = o.avatar || sil(38, "#b9b4d6");
  return `<div style="background:${VP};color:#fff;height:58px;padding:0 10px 0 6px;display:flex;align-items:center;gap:8px;flex-shrink:0">
    <span style="width:36px;display:flex;justify-content:center">${ms("arrow_back", { size: 24 })}</span>${a}
    <div style="flex:1;min-width:0;line-height:1.2"><div style="font-size:17px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>${sub ? `<div style="font-size:12.5px;opacity:.82">${sub}</div>` : ""}</div>
    <span style="display:flex;gap:18px;padding-right:4px">${ms("videocam", { size: 25, fill: 1 })}${ms("call", { size: 23, fill: 1 })}</span></div>`;
}
const vDay = (s) => `<div style="align-self:center;background:rgba(255,255,255,.75);color:#6a6485;font-size:12px;padding:3px 11px;border-radius:12px;margin:2px 0 4px">${s}</div>`;
const vTime = (tm, st, onDark) => {
  const c = onDark ? "rgba(255,255,255,.78)" : "#8b86a3";
  const ck = st === "sent" ? ms("done", { size: 15, color: c, weight: 500 }) : st ? ms("done_all", { size: 16, color: c, weight: 500 }) : "";
  return `<div style="display:flex;justify-content:flex-end;align-items:center;gap:3px;font-size:11px;color:${c};margin-top:2px;line-height:1">${tm}${ck}</div>`;
};
const vIn = (text, tm, st = "") => `<div style="align-self:flex-start;max-width:76%;background:#fff;color:#1c1b22;padding:8px 12px 6px;border-radius:18px 18px 18px 5px;font-size:16px;line-height:1.3;box-shadow:0 1px 1px rgba(60,40,120,.08);${st}">${text}${vTime(tm, "", false)}</div>`;
const vOut = (text, tm, status = "delivered", st = "") => `<div style="align-self:flex-end;max-width:76%;background:${VP};color:#fff;padding:8px 12px 6px;border-radius:18px 18px 5px 18px;font-size:16px;line-height:1.3;${st}">${text}${vTime(tm, status, true)}</div>`;
const vSeen = (s = "Видяно") => `<div style="align-self:flex-end;font-size:11.5px;color:#7d7898;margin:-4px 4px 0 0">${s}</div>`;
const vChat = (inner, st = "") => `<div style="flex:1;background:${VBG};padding:10px 12px;display:flex;flex-direction:column;justify-content:flex-end;gap:7px;overflow:hidden;${st}">${inner}</div>`;

// Поле за съобщение: + · поле (емоджи) · микрофон/изпрати
function vInput(o = {}) {
  const { text, ring = "", emoji = false } = o;
  const r = (k, inner, extra = "") => `<div class="${ring === k ? "ring ringr" : ""}" style="display:flex;align-items:center;justify-content:center;border-radius:50%;${extra}">${inner}</div>`;
  const right = text
    ? r("send", ms("send", { size: 25, fill: 1, color: VP }), "width:42px;height:42px")
    : r("mic", ms("mic", { size: 26, fill: 1, color: VP }), "width:42px;height:42px");
  return `<div style="background:#fff;border-top:1px solid #e6e2f4;padding:7px 8px 7px 6px;display:flex;align-items:center;gap:4px;flex-shrink:0">
    ${r("plus", ms("add", { size: 28, weight: 500, color: VP }), "width:42px;height:42px")}
    <div style="flex:1;background:#f3f1fa;border-radius:23px;height:42px;padding:0 8px 0 15px;display:flex;align-items:center;font-size:16px;color:${text ? "#1c1b22" : "#8b86a3"}">
      <span style="flex:1;white-space:nowrap;overflow:hidden">${text ? text + caret(VP) : "Напишете съобщение"}</span>
      ${r("emoji", ms("sentiment_satisfied", { size: 26, color: emoji ? VP : "#8b86a3", fill: emoji ? 1 : 0 }), "width:34px;height:34px")}
    </div>${right}</div>`;
}

const S = {};
// по-ранна история за чатовете (чатът не започва „от нищото“)
const vHist = vDay("Вчера") + vIn("Добър ден! Утре ще ти се обадя", "18:20") + vOut("Добре, чакам те", "18:22", "seen");

// ── Viber — писане (стъпки: полето „Напишете съобщение“ → текст → стрелката) ──
S["viber-pisane"] = phone(root(`
  ${vHeader("Мария (дъщеря)")}
  ${vChat(`${vDay("Днес")}
    ${vIn("Здравей, мамо! Как си днес?", "10:12")}
    ${vOut("Добре съм, миличка. Ходих до пазара.", "10:14", "seen")}
    ${vIn("Идваме в неделя!", "10:15")}`)}
  ${vInput({ text: "Чудесно! Ще направя баница", ring: "send" })}
  ${keyboard({ sugg: ["баница", "баба", "бавно"] })}
  ${nav("#eceef2")}
  ${tip("Натиснете стрелката,<br>за да изпратите", "right:8px;top:385px", { arrow: "d", at: "88%" })}
`), "#7360F2", "#ffffff", { nav: false, time: "10:16" });

// ── Viber — гласово (задържане на микрофона) ──
const wave = (n, c, seed = 3, played = 0) => {
  let x = seed; const bars = [];
  for (let i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; const h = 5 + Math.round((x / 233280) * 20); bars.push(`<i style="display:block;width:3px;height:${h}px;border-radius:2px;background:${i < played ? VP : c}"></i>`); }
  return `<div style="display:flex;align-items:center;gap:2.5px;height:28px">${bars.join("")}</div>`;
};
S["viber-glasovo"] = phone(root(`
  ${vHeader("Мария (дъщеря)")}
  ${vChat(`${vDay("Днес")}
    <div style="align-self:flex-start;background:#fff;padding:9px 14px 6px 10px;border-radius:18px 18px 18px 5px;box-shadow:0 1px 1px rgba(60,40,120,.08)">
      <div style="display:flex;align-items:center;gap:10px"><div style="width:36px;height:36px;border-radius:50%;background:${VP};display:flex;align-items:center;justify-content:center">${ms("play_arrow", { size: 26, fill: 1, color: "#fff" })}</div>${wave(26, "#cfc9ea", 7, 0)}<span style="font-size:12px;color:#7d7898">0:12</span></div>
      ${vTime("10:20", "", false)}</div>
    ${vOut("Мило, ще ти пиша по-късно", "10:21", "seen")}
    ${vIn("Добре, мамо. Целуваме те!", "10:22")}`)}
  <div style="background:#fff;border-top:1px solid #e6e2f4;padding:7px 8px 7px 14px;display:flex;align-items:center;gap:10px;flex-shrink:0;height:58px">
    <span style="width:10px;height:10px;border-radius:50%;background:#e53935"></span><span style="font-size:17px;color:#1c1b22;width:44px">0:06</span>
    <div style="flex:1;display:flex;align-items:center;gap:4px;color:#8b86a3;font-size:15px">${ms("chevron_left", { size: 22 })}Плъзнете за отказ</div>
    <div class="ring ringr" style="width:46px;height:46px;border-radius:50%;background:${VP};display:flex;align-items:center;justify-content:center">${ms("mic", { size: 27, fill: 1, color: "#fff" })}</div></div>
  ${nav("#fff")}
  ${tip("Задръжте микрофона<br>и говорете", "right:10px;bottom:" + (26 + 58 + 14) + "px", { arrow: "d", at: "82%" })}
`), "#7360F2", "#ffffff", { nav: false, time: "10:22" });

// ── Viber — нова група (избор на участници) ──
{
  const people = [["А", "Антон (зет)", "#8e6bbf"], ["Е", "Елена (сестра)", "#2a9d8f"], ["И", "Иван (син)", "#e07a1f", 1], ["М", "Мария (дъщеря)", "#d6457a", 1], ["П", "Петър (внук)", "#3a7bd5"], ["С", "Стела (снаха)", "#6a8d2f"]];
  const rows = people.map(([l, n, c, on]) => `${flex("align-items:center;gap:14px;padding:9px 16px", `${ini(l, c, 44)}<div style="flex:1;font-size:16.5px;color:#1c1b22">${n}</div>
    <div style="width:24px;height:24px;border-radius:50%;${on ? `background:${VP};` : "border:2px solid #c9c5dc;"}display:flex;align-items:center;justify-content:center">${on ? ms("check", { size: 17, color: "#fff", weight: 600 }) : ""}</div>`)}`).join("");
  const chip = (l, n, c) => `<div style="display:flex;align-items:center;gap:6px;background:#efecfb;border-radius:18px;padding:3px 10px 3px 3px;font-size:14px;color:#1c1b22;white-space:nowrap">${ini(l, c, 26)}${n}${ms("close", { size: 16, color: "#7d7898" })}</div>`;
  S["viber-grupa"] = phone(root(`
    <div style="background:${VP};color:#fff;height:58px;padding:0 10px 0 6px;display:flex;align-items:center;gap:8px;flex-shrink:0">
      <span style="width:36px;display:flex;justify-content:center">${ms("arrow_back", { size: 24 })}</span>
      <div style="flex:1;line-height:1.2"><div style="font-size:19px;font-weight:500">Нова група</div><div style="font-size:12.5px;opacity:.85">Избрани: 2</div></div>
      <span style="padding-right:8px">${ms("search", { size: 24 })}</span></div>
    <div style="background:#fff;padding:10px 12px;display:flex;gap:8px;flex-shrink:0;border-bottom:1px solid #eceaf5">${chip("И", "Иван (син)", "#e07a1f")}${chip("М", "Мария (дъщеря)", "#d6457a")}</div>
    <div style="background:#fff;flex:1;overflow:hidden;padding-top:4px">
      <div style="padding:8px 16px 2px;font-size:13px;color:${VP};font-weight:500">Контакти във Viber</div>${rows}</div>
    <div class="ring ringr" style="position:absolute;right:20px;bottom:${26 + 22}px;width:58px;height:58px;border-radius:50%;background:${VP};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(115,96,242,.45)">${ms("arrow_forward", { size: 28, color: "#fff", weight: 500 })}</div>
    ${nav("#fff")}
    ${tip("Отметнете хората, после<br>натиснете стрелката", `right:14px;bottom:${26 + 22 + 58 + 14}px`, { arrow: "d", at: "86%" })}
  `), "#7360F2", "#ffffff", { nav: false, time: "10:30" });
}

// ── Viber — меню „+“ (Местоположение, Контакт, Галерия…) ──
{
  const item = (icon, label, c, bgc, ring) => `<div style="display:flex;flex-direction:column;align-items:center;gap:7px;width:25%"><div class="${ring ? "ring ringr" : ""}" style="width:56px;height:56px;border-radius:50%;background:${bgc};display:flex;align-items:center;justify-content:center">${ms(icon, { size: 28, fill: 1, color: c })}</div><div style="font-size:12.5px;color:#3d3a4d;text-align:center;line-height:1.15">${label}</div></div>`;
  const grid = [
    ["photo_library", "Галерия", "#e8573d", "#fdeae6"], ["photo_camera", "Камера", "#7360F2", "#ece9fd"], ["gif_box", "GIF", "#1b9e77", "#dff4ec"], ["folder", "Файл", "#3a7bd5", "#e3edfb"],
    ["location_on", "Локация", "#e53935", "#fde7e6", 1], ["contact_page", "Контакт", "#d6457a", "#fbe6ee", 1], ["mic", "Гласово", "#7360F2", "#ece9fd"], ["sticky_note_2", "Стикери", "#f29a1f", "#fdf0dc"],
  ];
  S["viber-prikachi"] = phone(root(`
    ${vHeader("Иван (син)", "Последно видян днес в 09:58", { avatar: ini("И", "#e07a1f", 38) })}
    ${vChat(`${vHist}${vDay("Днес")}${vIn("Мамо, къде да се срещнем?", "10:35")}${vOut("Чакай да ти пратя къде съм", "10:36", "delivered")}`)}
    <div style="background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -4px 18px rgba(30,20,80,.16);padding:10px 8px 14px;flex-shrink:0;position:relative;z-index:2">
      <div style="width:38px;height:4px;border-radius:2px;background:#d6d2e6;margin:0 auto 16px"></div>
      <div style="display:flex;flex-wrap:wrap;row-gap:20px">${grid.map((g) => item(...g)).join("")}</div>
      <div style="height:6px"></div></div>
    ${nav("#fff")}
    ${tip("„Локация“ праща къде сте,<br>„Контакт“ — телефона на човек", "left:0;right:0;margin:0 auto;width:max-content;top:482px", { arrow: "d", at: "50%" })}
  `, { style: "background:" + VBG }), "#7360F2", "#ffffff", { nav: false, time: "10:36" });
}

// ── Viber — информация за контакта → Блокирай ──
{
  const row = (icon, label, o = {}) => `<div class="${o.ring ? "ring" : ""}" style="display:flex;align-items:center;gap:20px;padding:0 20px;height:58px;${o.ring ? "border-radius:12px;margin:2px 8px;padding:0 12px;" : ""}">${ms(icon, { size: 25, fill: o.fill ?? 0, color: o.c || "#6b6785" })}<div style="flex:1;font-size:16.5px;color:${o.c || "#1c1b22"};${o.ring ? "font-weight:500" : ""}">${label}</div>${o.r || ""}</div>`;
  S["viber-blok"] = phone(root(`
    <div style="background:${VP};color:#fff;height:58px;padding:0 10px 0 6px;display:flex;align-items:center;gap:8px;flex-shrink:0">
      <span style="width:36px;display:flex;justify-content:center">${ms("arrow_back", { size: 24 })}</span><div style="flex:1;font-size:19px;font-weight:500">Информация</div>${ms("more_vert", { size: 24 })}</div>
    <div style="background:#fff;flex:1;overflow:hidden">
      <div style="padding:24px 16px 18px;display:flex;flex-direction:column;align-items:center;gap:4px;border-bottom:8px solid #f1eff8">
        ${sil(92, "#b9b4d6")}<div style="font-size:21px;font-weight:500;color:#1c1b22;margin-top:10px">+359 888 123 456</div>
        <div style="font-size:14px;color:#8b86a3">Не е във Вашите контакти</div>
        <div style="display:flex;gap:34px;margin-top:16px">${[["call", "Повикване"], ["videocam", "Видео"], ["chat_bubble", "Съобщение"]].map(([i, l]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12.5px;color:#5b5675"><div style="width:48px;height:48px;border-radius:50%;background:#efecfb;display:flex;align-items:center;justify-content:center">${ms(i, { size: 24, fill: 1, color: VP })}</div>${l}</div>`).join("")}</div></div>
      ${row("perm_media", "Медии, файлове и връзки", { r: ms("chevron_right", { size: 22, color: "#a9a5be" }) })}
      ${row("notifications_off", "Заглуши известията", { r: `<div style="width:44px;height:26px;border-radius:13px;background:#d6d2e6;position:relative"><i style="position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;display:block"></i></div>` })}
      ${row("person_add", "Добави в контактите", { c: "#1c1b22" })}
      ${row("flag", "Докладвай", { c: "#d93025" })}
      ${row("block", "Блокирай", { c: "#d93025", ring: true })}
    </div>
    ${nav("#fff")}
    ${tip("Натиснете „Блокирай“ —<br>човекът няма да Ви пише повече", "left:0;right:0;margin:0 auto;width:max-content;top:676px", { arrow: "u", at: "28%" })}
  `), "#7360F2", "#ffffff", { nav: false, time: "10:40" });
}

// ── Viber — задържане на съобщение → Изтрий ──
{
  const mi = (icon, label, o = {}) => `<div class="${o.ring ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;height:50px;padding:0 16px;${o.ring ? "border-radius:10px;margin:2px 6px;padding:0 10px;" : ""}">${ms(icon, { size: 23, fill: o.fill ?? 0, color: o.c || "#4a4660" })}<span style="font-size:16px;color:${o.c || "#1c1b22"};${o.ring ? "font-weight:500" : ""}">${label}</span></div>`;
  S["viber-iztrij"] = phone(root(`
    ${vHeader("Иван (син)", "Последно видян днес в 09:58", { avatar: ini("И", "#e07a1f", 38) })}
    ${vChat(`${vDay("Днес")}${vIn("Кога ще дойдеш, мамо?", "10:44")}${vOut("Изпратих това по погрешка", "10:45", "delivered", "visibility:hidden")}`, "justify-content:flex-start")}
    ${vInput({})}
    ${nav("#fff")}
    ${scrim(0.55)}
    <div style="position:absolute;left:0;right:0;top:${58 + 28 + 56}px;z-index:36;display:flex;flex-direction:column;align-items:flex-end;gap:10px;padding:0 14px">
      <div style="background:#fff;border-radius:26px;padding:6px 12px;display:flex;gap:10px;font-size:25px;box-shadow:0 4px 16px rgba(0,0,0,.25)">👍 ❤️ 😂 😮 😢 🙏</div>
      ${vOut("Изпратих това по погрешка", "10:45", "delivered", "box-shadow:0 0 0 3px rgba(255,255,255,.55)")}
      <div style="background:#fff;border-radius:16px;box-shadow:0 8px 28px rgba(0,0,0,.3);width:236px;padding:6px 0;margin-top:2px">
        ${mi("reply", "Отговор")}${mi("forward", "Препрати")}${mi("content_copy", "Копирай")}${mi("delete", "Изтрий", { ring: true, fill: 1, c: "#d93025" })}</div>
    </div>
    ${tip("Задръжте пръст върху съобщението,<br>после изберете „Изтрий“", "left:130px;top:556px;z-index:60", { arrow: "u", at: "55%" })}
  `, { dim: true }), "#7360F2", "#ffffff", { nav: false, time: "10:45" });
}

// ── Viber — отметки: изпратено / доставено / видяно ──
S["viber-procheteno"] = phone(root(`
  ${vHeader("Мария (дъщеря)")}
  ${vChat(`${vDay("Вчера")}
    ${vIn("Лека нощ, мамо! Целувки", "21:40")}${vOut("Лека нощ, мило!", "21:41", "seen")}
    ${vDay("Днес")}
    ${vOut("Добро утро, миличка!", "09:02", "sent")}
    ${vOut("Как си? Как са внуците?", "09:03", "delivered")}
    ${vOut("Обичам Ви! Целувки", "09:05", "seen")}
    ${vSeen("Видяно")}`, "gap:14px;padding-top:14px")}
  ${vInput({})}
  ${nav("#fff")}
  ${tip("Една отметка =<br>изпратено", "right:208px;top:490px", { arrow: "r", at: "50%" })}
  ${tip("Две отметки =<br>доставено", "right:227px;top:556px", { arrow: "r", at: "50%" })}
  ${tip("„Видяно“ — човекът<br>го е прочел", "right:66px;top:667px", { arrow: "r", at: "50%" })}
`), "#7360F2", "#ffffff", { nav: false, time: "09:06" });

// ── Viber — емоджи и стикери ──
{
  const em = "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 🥰 😍 😘 😗 😋 😎 🤗 🤔 😢 😭 😮 😴 🙏 👍 👏 💪 ❤️ 🌹 🌷 ☀️ 🎉 🎂 🎁 🍀 ☕ 🍰 🏠 🚗 ✈️".split(" ");
  const grid = em.map((e, i) => `<div style="width:12.5%;height:44px;display:flex;align-items:center;justify-content:center;font-size:27px;${i === 11 ? "background:#ece9fd;border-radius:10px" : ""}">${e}</div>`).join("");
  S["viber-emoji"] = phone(root(`
    ${vHeader("Елена (сестра)", "Последно видян днес в 11:02", { avatar: ini("Е", "#2a9d8f", 38) })}
    ${vChat(`${vHist}${vDay("Днес")}${vIn("Честит имен ден! 🎉", "11:05")}${vOut("Благодаря, сестричке! Целувки", "11:06", "delivered")}`)}
    ${vInput({ text: "Честит празник и на теб ", ring: "emoji", emoji: true })}
    <div style="background:#fff;border-top:1px solid #eceaf5;flex-shrink:0;height:300px;display:flex;flex-direction:column">
      <div style="display:flex;align-items:center;height:44px;padding:0 6px;border-bottom:1px solid #f0eef8">
        <div style="width:56px;display:flex;justify-content:center;border-bottom:3px solid ${VP};height:44px;align-items:center">${ms("sentiment_satisfied", { size: 25, fill: 1, color: VP })}</div>
        <div style="width:56px;display:flex;justify-content:center">${ms("sticky_note_2", { size: 25, color: "#8b86a3" })}</div>
        <div style="width:56px;display:flex;justify-content:center">${ms("gif_box", { size: 25, color: "#8b86a3" })}</div>
        <div style="flex:1"></div><div style="padding:0 12px">${ms("search", { size: 24, color: "#8b86a3" })}</div><div style="padding:0 10px">${ms("backspace", { size: 24, color: "#8b86a3" })}</div></div>
      <div style="padding:2px 6px;display:flex;flex-wrap:wrap;overflow:hidden;flex:1">${grid}</div>
      <div style="display:flex;height:40px;border-top:1px solid #f0eef8;padding:0 6px;align-items:center;justify-content:space-around;color:#8b86a3">${["schedule", "sentiment_satisfied", "pets", "restaurant", "directions_car", "emoji_objects", "tag"].map((i, k) => ms(i, { size: 22, color: k === 1 ? VP : "#8b86a3", fill: k === 1 ? 1 : 0 })).join("")}</div>
    </div>
    ${nav("#fff")}
    ${tip("Натиснете усмихнатото лице,<br>после изберете картинка", "right:8px;top:352px", { arrow: "d", at: "86%" })}
  `), "#7360F2", "#ffffff", { nav: false, time: "11:07" });
}

// ── Viber — заглушаване на групов чат ──
{
  const opt = (l, on, ring) => `<div class="${ring ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;height:52px;padding:0 6px;${ring ? "border-radius:12px;margin:2px -2px;padding:0 8px;" : ""}"><div style="width:22px;height:22px;border-radius:50%;border:2.2px solid ${on ? VP : "#79747e"};display:flex;align-items:center;justify-content:center">${on ? `<i style="display:block;width:11px;height:11px;border-radius:50%;background:${VP}"></i>` : ""}</div><span style="font-size:16.5px;color:#1c1b22">${l}</span></div>`;
  S["viber-zaglushi"] = phone(root(`
    <div style="background:${VP};color:#fff;height:58px;padding:0 10px 0 6px;display:flex;align-items:center;gap:8px;flex-shrink:0">
      <span style="width:36px;display:flex;justify-content:center">${ms("arrow_back", { size: 24 })}</span><div style="flex:1;font-size:19px;font-weight:500">Информация за групата</div></div>
    <div style="background:#fff;flex:1;overflow:hidden">
      <div style="padding:22px 16px 16px;display:flex;flex-direction:column;align-items:center;gap:4px;border-bottom:8px solid #f1eff8">
        <div style="width:88px;height:88px;border-radius:50%;background:#d9d4f4;display:flex;align-items:center;justify-content:center">${ms("groups", { size: 50, fill: 1, color: VP })}</div>
        <div style="font-size:21px;font-weight:500;color:#1c1b22;margin-top:10px">Семейна група</div><div style="font-size:14px;color:#8b86a3">5 участници</div></div>
      ${[["perm_media", "Медии, файлове и връзки"], ["notifications_off", "Заглуши известията"], ["push_pin", "Закачи чата"], ["person_add", "Добави участници"]].map(([i, l]) => `<div style="display:flex;align-items:center;gap:20px;padding:0 20px;height:58px">${ms(i, { size: 25, color: "#6b6785" })}<div style="flex:1;font-size:16.5px;color:#1c1b22">${l}</div></div>`).join("")}
    </div>
    ${nav("#fff")}
    ${scrim(0.5)}
    <div style="position:absolute;left:28px;right:28px;top:210px;z-index:36;background:#fff;border-radius:28px;padding:24px 22px 14px;box-shadow:0 10px 34px rgba(0,0,0,.35)">
      <div style="font-size:22px;color:#1c1b22;margin-bottom:10px">Заглуши известията</div>
      ${opt("За 1 час", 0)}${opt("За 8 часа", 1, 1)}${opt("До утре сутрин", 0)}${opt("Завинаги", 0)}
      <div style="display:flex;justify-content:flex-end;gap:22px;padding:16px 6px 4px;font-size:15.5px;font-weight:500;color:${VP}"><span>Отказ</span><span>Готово</span></div></div>
    ${tip("Изберете за колко време<br>да мълчи групата", "left:0;right:0;margin:0 auto;width:max-content;top:614px;z-index:60", { arrow: "u", at: "30%" })}
  `, { dim: true }), "#7360F2", "#ffffff", { nav: false, time: "11:12" });
}

// ── Viber/чат — запазване на снимка в галерията (преглед на снимката → меню) ──
{
  const mi = (icon, label, ring) => `<div class="${ring ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;height:50px;padding:0 16px;${ring ? "border-radius:10px;margin:2px 6px;padding:0 10px;" : ""}">${ms(icon, { size: 23, color: "#4a4660" })}<span style="font-size:16px;color:#1c1b22;${ring ? "font-weight:500" : ""}">${label}</span></div>`;
  S["chat-zapazi"] = phone(root(`
    <div style="height:58px;display:flex;align-items:center;gap:10px;padding:0 6px;color:#fff;flex-shrink:0;position:relative;z-index:3">
      <span style="width:36px;display:flex;justify-content:center">${ms("arrow_back", { size: 24 })}</span>
      <div style="flex:1;line-height:1.2"><div style="font-size:17px;font-weight:500">Мария (дъщеря)</div><div style="font-size:12.5px;opacity:.75">Днес, 11:20</div></div>
      <span style="width:36px;display:flex;justify-content:center">${ms("more_vert", { size: 24 })}</span></div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;margin-top:-58px;overflow:hidden">${photo("messaging/beach.jpg", { w: 390, h: 292 })}</div>
    <div style="height:66px;display:flex;align-items:center;gap:14px;padding:0 16px;color:#fff;flex-shrink:0">
      <div style="flex:1;font-size:15px;opacity:.9">Морето е чудесно! Целуваме те</div>${ms("reply", { size: 25, style: "transform:scaleX(-1)" })}${ms("favorite", { size: 24 })}</div>
    ${nav("#000", "#fff")}
    <div style="position:absolute;right:10px;top:50px;z-index:5;background:#fff;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.45);width:226px;padding:6px 0">
      ${mi("forward", "Препрати")}${mi("download", "Запази в галерията", true)}${mi("share", "Сподели")}${mi("delete", "Изтрий")}</div>
    ${tip("Менюто (три точки)<br>→ „Запази“", "left:12px;top:110px", { arrow: "r", at: "50%" })}
  `), "#000", "#ffffff", { nav: false, time: "11:21" });
}

// ═════════════════════════ MESSENGER ═════════════════════════
{
  const MB = "#0084FF", MG = "#F0F0F0";
  const day = (s) => `<div style="align-self:center;font-size:12px;color:#65676b;margin:4px 0">${s}</div>`;
  const inb = (x, st = "") => `<div style="align-self:flex-start;max-width:74%;background:${MG};color:#050505;padding:9px 14px;border-radius:20px;font-size:16px;line-height:1.28;${st}">${x}</div>`;
  const outb = (x) => `<div style="align-self:flex-end;max-width:74%;background:${MB};color:#fff;padding:9px 14px;border-radius:20px;font-size:16px;line-height:1.28">${x}</div>`;
  const ic = (i, o = {}) => ms(i, { size: o.s || 28, fill: 1, color: MB });
  S["messenger"] = phone(root(`
    <div style="height:60px;display:flex;align-items:center;gap:6px;padding:0 10px 0 4px;flex-shrink:0;background:#fff">
      <span style="width:38px;display:flex;justify-content:center">${ms("arrow_back", { size: 26, color: MB, weight: 500 })}</span>
      <div style="position:relative;width:40px;height:40px">${ini("И", "#e07a1f", 40)}<span style="position:absolute;right:-1px;bottom:0;width:13px;height:13px;border-radius:50%;background:#31a24c;border:2.5px solid #fff"></span></div>
      <div style="flex:1;margin-left:4px;line-height:1.2"><div style="font-size:17px;font-weight:700;color:#050505">Иван (син)</div><div style="font-size:12.5px;color:#65676b">Активен сега</div></div>
      <span style="display:flex;gap:20px;padding-right:6px">${ic("call", { s: 25 })}${ic("videocam", { s: 28 })}</span></div>
    <div style="flex:1;background:#fff;padding:12px 12px 8px;display:flex;flex-direction:column;gap:4px;overflow:hidden">
      <div style="display:flex;flex-direction:column;align-items:center;padding:8px 0 10px">${ini("И", "#e07a1f", 76)}<div style="font-size:18px;font-weight:700;margin-top:8px;color:#050505">Иван (син)</div><div style="font-size:13px;color:#65676b">Приятели във Facebook</div></div>
      ${day("ВТОР 18:02")}
      ${inb("Мамо, видя ли снимките на внучето?")}
      ${outb("Видях ги! Колко е пораснал, Боже мой")}
      ${inb("Утре идваме на гости 🙂", "margin-top:4px")}
      ${day("СРЯ 09:15")}
      ${outb("Добро утро! Правя баница, чакам Ви")}
      <div style="align-self:flex-end;margin:0 2px 0 0;display:flex;align-items:center;gap:4px">${sil(15, "#c3c6cc")}</div>
    </div>
    <div style="background:#fff;padding:8px 8px 8px 6px;display:flex;align-items:center;gap:2px;flex-shrink:0">
      <span style="width:38px;display:flex;justify-content:center">${ms("add_circle", { size: 29, fill: 1, color: MB })}</span>
      <span style="width:38px;display:flex;justify-content:center">${ic("photo_camera", { s: 28 })}</span>
      <span style="width:38px;display:flex;justify-content:center">${ic("image", { s: 28 })}</span>
      <span class="ring ringr" style="width:38px;height:38px;display:flex;justify-content:center;align-items:center;border-radius:50%">${ic("mic", { s: 28 })}</span>
      <div style="flex:1;background:#f0f2f5;border-radius:21px;height:40px;padding:0 10px 0 14px;display:flex;align-items:center;font-size:16px;color:#65676b;margin-left:4px"><span style="flex:1">Съобщение</span>${ms("sentiment_satisfied", { size: 25, color: MB, fill: 1 })}</div>
      <span style="width:40px;display:flex;justify-content:center">${ic("thumb_up", { s: 28 })}</span></div>
    ${nav("#fff")}
    ${tip("Микрофонът праща гласово<br>съобщение — задръжте и говорете", "left:14px;bottom:100px", { arrow: "d", at: "42%" })}
  `), "#fff", "#111111", { nav: false, time: "09:16" });
}

// ═════════════════════════ WHATSAPP ═════════════════════════
const WG = "#1DAA61", WBG = "#EFEAE2";
// фин десен от контурни рисунки (подобен на характерния фон на чата; нарисуван, не копиран)
function waPattern(w, h) {
  const names = ["favorite", "star", "photo_camera", "call", "music_note", "cake", "local_cafe", "home", "pets", "flight", "wb_sunny", "sports_soccer", "cloud", "umbrella", "local_florist", "directions_car", "headphones", "mail"];
  let x = 11; const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const out = []; let k = 0;
  for (let y = 6; y < h; y += 58) for (let xx = (Math.floor(y / 58) % 2) * 29; xx < w; xx += 58) {
    out.push(`<span style="position:absolute;left:${(xx + rnd() * 14).toFixed(0)}px;top:${(y + rnd() * 14).toFixed(0)}px;transform:rotate(${Math.round(rnd() * 70 - 35)}deg)">${ms(names[k++ % names.length], { size: 25 + Math.round(rnd() * 5), color: "rgba(113,95,64,.17)", weight: 300, outlined: true })}</div>`.replace("</div>", "</span>"));
  }
  return `<div style="position:absolute;inset:0;overflow:hidden;pointer-events:none">${out.join("")}</div>`;
}
const wCss = `<style>
.wb{position:relative;max-width:80%;padding:6px 8px 5px 9px;font-size:16px;line-height:1.28;color:#111b21;box-shadow:0 1px .5px rgba(11,20,26,.13)}
.wb .tm{float:right;margin:7px 0 -4px 10px;font-size:11.5px;color:#667781;display:flex;align-items:center;gap:2px;line-height:1}
.wi{align-self:flex-start;background:#fff;border-radius:0 9px 9px 9px}
.wi:before{content:"";position:absolute;left:-7px;top:0;border-right:8px solid #fff;border-bottom:9px solid transparent}
.wo{align-self:flex-end;background:#D9FDD3;border-radius:9px 0 9px 9px}
.wo:before{content:"";position:absolute;right:-7px;top:0;border-left:8px solid #D9FDD3;border-bottom:9px solid transparent}
</style>`;
const wTm = (tm, st) => `<span class="tm">${tm}${st === "read" ? ms("done_all", { size: 17, color: "#53BDEB", weight: 500 }) : st === "del" ? ms("done_all", { size: 17, color: "#667781", weight: 500 }) : st === "sent" ? ms("done", { size: 17, color: "#667781", weight: 500 }) : ""}</span>`;
const wIn = (x, tm) => `<div class="wb wi">${x}${wTm(tm, "")}</div>`;
const wOut = (x, tm, st) => `<div class="wb wo">${x}${wTm(tm, st)}</div>`;
const wDay = (s) => `<div style="align-self:center;background:#fff;color:#54656f;font-size:12.5px;padding:4px 11px;border-radius:8px;box-shadow:0 1px .5px rgba(11,20,26,.13);margin:2px 0 4px">${s}</div>`;

{
  const hasFlowers = fs.existsSync(path.join(ASSETS, "messaging", "flowers.jpg"));
  const pic = hasFlowers ? `<div class="wb wi" style="padding:3px 3px 5px;width:250px">${photo("messaging/flowers.jpg", { w: 244, h: 180, radius: 7 })}<div style="padding:5px 5px 0 6px">Погледни цветята в градината ❤️${wTm("08:29", "")}</div></div>` : "";
  S["whatsapp"] = phone(root(`${wCss}
    <div style="background:#fff;height:60px;display:flex;align-items:center;gap:6px;padding:0 8px 0 4px;flex-shrink:0;box-shadow:0 1px 0 rgba(11,20,26,.1);position:relative;z-index:2">
      <span style="width:36px;display:flex;justify-content:center">${ms("arrow_back", { size: 24, color: "#111b21" })}</span>${sil(40, "#c4cbd0")}
      <div style="flex:1;margin-left:4px;line-height:1.2"><div style="font-size:17px;font-weight:500;color:#111b21">Елена (сестра)</div><div style="font-size:13px;color:#667781">на линия</div></div>
      <span style="display:flex;gap:20px;color:#111b21;padding-right:4px">${ms("videocam", { size: 26, fill: 1 })}${ms("call", { size: 22, fill: 1 })}${ms("more_vert", { size: 24 })}</span></div>
    <div style="flex:1;background:${WBG};position:relative;overflow:hidden">${waPattern(390, 640)}
      <div style="position:relative;padding:10px 10px;display:flex;flex-direction:column;gap:6px;height:100%">
        ${wDay("Днес")}
        ${wIn("Добро утро, Стойно! Как е времето при вас?", "08:24")}
        ${wOut("Добро утро! Слънчево и топло ☀️", "08:26", "read")}
        ${pic}
        ${wOut("Много са красиви! В събота ще дойда на гости", "08:31", "del")}
      </div></div>
    <div style="background:${WBG};padding:6px 6px 8px;display:flex;align-items:flex-end;gap:6px;flex-shrink:0">
      <div style="flex:1;background:#fff;border-radius:24px;height:48px;display:flex;align-items:center;padding:0 12px;gap:12px;color:#667781;font-size:17px;box-shadow:0 1px .5px rgba(11,20,26,.13)">${ms("sentiment_satisfied", { size: 26 })}<span style="flex:1">Съобщение</span>${ms("attach_file", { size: 24, style: "transform:rotate(-45deg)" })}${ms("photo_camera", { size: 25, fill: 1 })}</div>
      <div class="ring ringr" style="width:48px;height:48px;border-radius:50%;background:${WG};display:flex;align-items:center;justify-content:center">${ms("mic", { size: 27, fill: 1, color: "#fff" })}</div></div>
    ${nav(WBG)}
    ${tip("Зеленият бутон: задръжте<br>и говорете (гласово съобщение)", "right:8px;bottom:112px", { arrow: "d", at: "88%" })}
  `), "#fff", "#111111", { nav: false, time: "08:32" });
}

// ── WhatsApp — регистрация: въвеждане на номер ──
S["whatsapp-registraciya"] = phone(root(`
  <div style="height:56px;display:flex;align-items:center;justify-content:flex-end;padding:0 14px;flex-shrink:0">${ms("more_vert", { size: 24, color: "#111b21" })}</div>
  <div style="flex:1;padding:6px 26px 0;display:flex;flex-direction:column;align-items:center;overflow:hidden">
    <div style="font-size:23px;font-weight:500;color:#111b21;text-align:center;margin-top:4px">Въведете телефонния си номер</div>
    <div style="font-size:15px;line-height:1.4;color:#54656f;text-align:center;margin-top:14px">WhatsApp ще трябва да потвърди Вашия телефонен номер. Може да се начислят такси от оператора. <span style="color:#027eb5">Какъв е номерът ми?</span></div>
    <div style="width:100%;margin-top:26px">
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;border-bottom:2px solid ${WG};padding:8px 0;font-size:18px;color:#111b21"><span style="flex:1;text-align:center;padding-left:30px">България</span>${ms("arrow_drop_down", { size: 28, color: "#667781" })}</div>
      <div style="display:flex;gap:18px;margin-top:6px">
        <div style="display:flex;align-items:center;gap:8px;border-bottom:2px solid ${WG};padding:10px 6px;font-size:18px;color:#111b21;width:92px">${t("+", "color:#667781")}359</div>
        <div style="flex:1;border-bottom:2px solid ${WG};padding:10px 6px;font-size:19px;color:#111b21;letter-spacing:.3px">888 123 456${caret(WG)}</div></div></div>
    <div style="font-size:14px;color:#667781;margin-top:16px;text-align:center">Носете телефона си подръка — кодът идва по SMS.</div>
  </div>
  <div style="display:flex;justify-content:center;padding:0 0 18px;flex-shrink:0"><div class="ring ringr" style="background:${WG};color:#fff;font-size:16.5px;font-weight:500;padding:13px 40px;border-radius:26px">Напред</div></div>
  ${keyboard({ num: true })}
  ${nav("#eceef2")}
  ${tip("Въведете номера си<br>и натиснете „Напред“", "left:0;right:0;margin:0 auto;width:max-content;bottom:" + (26 + 262 + 72) + "px", { arrow: "d", at: "50%" })}
`), "#fff", "#111111", { nav: false, time: "10:05" });

// ═════════════════════════ FACEBOOK ═════════════════════════
const FB = "#0866FF", FG = "#050505", FS = "#65676B", FL = "#E4E6EB";
const fbMark = (s = 29) => `<span style="font-family:'Inter','Roboto',sans-serif;font-weight:700;font-size:${s}px;letter-spacing:${(-s * 0.045).toFixed(2)}px;color:${FB};line-height:1">facebook</span>`;
const circ = (inner, s = 38, bg = FL) => `<span style="width:${s}px;height:${s}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0">${inner}</span>`;
const fbTop = (title, ring = false) => `<div style="height:56px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 14px;flex-shrink:0">${title}
  <span style="display:flex;gap:11px">${circ(ms("add", { size: 25, weight: 500, color: FG }))}<span class="${ring ? "ring ringr" : ""}" style="display:flex;border-radius:50%">${circ(ms("search", { size: 23, weight: 500, color: FG }))}</span><span class="${ring ? "ring ringr" : ""}" style="display:flex;border-radius:50%">${circ(brand("messenger", FG, 21))}</span></span></div>`;
const fbTabs = () => `<div style="height:48px;background:#fff;display:flex;flex-shrink:0;border-bottom:1px solid #dadde1">${[["home", 1], ["group", 0], ["smart_display", 0], ["storefront", 0], ["notifications", 0], ["menu", 0]].map(([i, a]) => `<div style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;${a ? `border-bottom:3px solid ${FB};` : ""}">${ms(i, { size: 27, fill: a ? 1 : 0, color: a ? FB : "#606770" })}${i === "notifications" ? `<span style="position:absolute;left:54%;top:6px;min-width:17px;height:17px;border-radius:9px;background:#e41e3f;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 4px">5</span>` : ""}</div>`).join("")}</div>`;
const reactIcons = `<span style="display:flex"><span style="width:20px;height:20px;border-radius:50%;background:${FB};display:flex;align-items:center;justify-content:center;border:1.5px solid #fff">${ms("thumb_up", { size: 12, fill: 1, color: "#fff" })}</span><span style="width:20px;height:20px;border-radius:50%;background:#f33e58;display:flex;align-items:center;justify-content:center;border:1.5px solid #fff;margin-left:-5px">${ms("favorite", { size: 12, fill: 1, color: "#fff" })}</span></span>`;
const actBtn = (icon, label, o = {}) => `<div class="${o.ring ? "ring" : ""}" style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;height:40px;font-size:14.5px;font-weight:500;color:${o.on ? FB : FS};${o.ring ? "border-radius:10px;margin:0 4px;" : ""}">${ms(icon, { size: 22, fill: o.on ? 1 : 0, color: o.on ? FB : FS })}${label}</div>`;
const postHead = (avatar, name, sub) => `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px 0">${avatar}<div style="flex:1;line-height:1.25"><div style="font-size:15.5px;font-weight:600;color:${FG}">${name}</div><div style="font-size:13px;color:${FS};display:flex;align-items:center;gap:4px">${sub}${ms("public", { size: 14, fill: 1, color: FS })}</div></div>${ms("more_horiz", { size: 24, color: FS })}${ms("close", { size: 24, color: FS })}</div>`;
const has = (f) => fs.existsSync(path.join(ASSETS, "messaging", f));

// ── Facebook — начален екран (емисия) ──
S["fb-feed"] = phone(root(`
  ${fbTop(fbMark(30), true)}${fbTabs()}
  <div style="background:#fff;padding:10px 12px;display:flex;align-items:center;gap:10px;flex-shrink:0;border-bottom:8px solid ${FL}">
    ${ini("С", "#1f7a8c", 40)}<div style="flex:1;border:1px solid #ced0d4;border-radius:22px;height:40px;padding:0 15px;display:flex;align-items:center;font-size:16px;color:${FS}">Какво ви се случва?</div>${ms("photo_library", { size: 27, fill: 1, color: "#45bd62" })}</div>
  <div style="background:#fff;flex-shrink:0;padding-bottom:0">
    ${postHead(ini("П", "#2f6fb5", 40), "Читалище „Просвета“", "Вчера в 18:30 · ")}
    <div style="padding:10px 14px 10px;font-size:16px;line-height:1.35;color:${FG}">Утре от 11:00 ч. на площада в Бобов дол има концерт. Вход свободен — заповядайте!</div>
    ${has("concert.jpg") ? photo("messaging/concert.jpg", { w: 390, h: 250 }) : ""}
    <div style="display:flex;align-items:center;padding:9px 14px;font-size:14px;color:${FS};gap:6px">${reactIcons}<span style="flex:1;white-space:nowrap">Мария и още 48</span><span style="white-space:nowrap">7 коментара · 2 споделяния</span></div>
    <div style="display:flex;border-top:1px solid #dadde1;margin:0 6px">${actBtn("thumb_up", "Харесвам")}${actBtn("chat_bubble", "Коментар")}${actBtn("share", "Споделяне")}</div></div>
  <div style="height:8px;background:${FL};flex-shrink:0"></div>
  <div style="background:#fff;flex:1;overflow:hidden">${postHead(ini("П", "#3f8f4f", 40), "Петър Иванов", "2 ч. · ")}<div style="padding:10px 14px;font-size:16px;color:${FG}">Добро утро от село!</div></div>
  ${nav("#fff")}
  ${tip("Горе: лупата търси хора,<br>балончето е за съобщения", "left:0;right:0;margin:0 auto;width:max-content;top:735px")}
`), "#fff", "#111111", { nav: false, time: "09:41" });

// ── Facebook — харесване и коментар ──
S["fb-haresai"] = phone(root(`
  ${fbTop(fbMark(30))}${fbTabs()}
  <div style="background:#fff;flex:1;overflow:hidden">
    ${postHead(ini("П", "#3f8f4f", 40), "Петър Иванов", "2 ч. · ")}
    <div style="padding:10px 14px 10px;font-size:16px;line-height:1.35;color:${FG}">Прибрахме реколтата! Хубава година беше.</div>
    ${has("grapes.jpg") ? photo("messaging/grapes.jpg", { w: 390, h: 250 }) : ""}
    <div style="display:flex;align-items:center;padding:9px 14px;font-size:14px;color:${FS};gap:6px">${reactIcons}<span style="flex:1">Иван Георгиев и още 23</span><span>4 коментара</span></div>
    <div style="display:flex;border-top:1px solid #dadde1;margin:0 6px;border-bottom:1px solid #dadde1">${actBtn("thumb_up", "Харесвам", { ring: 1 })}${actBtn("chat_bubble", "Коментар")}${actBtn("share", "Споделяне")}</div>
    <div style="padding:10px 12px;display:flex;gap:9px;margin-top:74px"><div style="margin-top:2px">${sil(34, "#b7c0c7")}</div>
      <div><div style="background:${"#f0f2f5"};border-radius:18px;padding:8px 13px"><div style="font-size:13.5px;font-weight:600;color:${FG}">Елена Стоянова</div><div style="font-size:15.5px;color:${FG};line-height:1.3">Браво, Петре! Какво хубаво грозде!</div></div>
      <div style="font-size:12.5px;color:${FS};padding:3px 12px;font-weight:600">1 ч. &nbsp; Харесвам &nbsp; Отговор</div></div></div>
  </div>
  <div style="background:#fff;border-top:1px solid #dadde1;padding:7px 12px;display:flex;align-items:center;gap:10px;flex-shrink:0">${ini("С", "#1f7a8c", 36)}
    <div style="flex:1;background:#f0f2f5;border-radius:20px;height:40px;padding:0 14px;display:flex;align-items:center;font-size:15.5px;color:${FS}"><span style="flex:1">Напишете коментар…</span>${ms("sentiment_satisfied", { size: 23, color: FS })}</div>${ms("send", { size: 25, fill: 1, color: "#bcc0c4" })}</div>
  ${nav("#fff")}
  ${tip("Натиснете „Харесвам“ (палецът) —<br>става синьо", "left:14px;top:534px", { arrow: "u", at: "20%" })}
`), "#fff", "#111111", { nav: false, time: "11:52" });

// ── Facebook — публикуване ──
{
  const opt = (icon, label, c, fill = 1) => `<div style="display:flex;align-items:center;gap:16px;height:52px;padding:0 16px">${ms(icon, { size: 27, fill, color: c })}<span style="font-size:16.5px;color:${FG}">${label}</span></div>`;
  S["fb-publikuvai"] = phone(root(`
    <div style="height:56px;background:#fff;display:flex;align-items:center;gap:12px;padding:0 12px 0 10px;flex-shrink:0;border-bottom:1px solid #dadde1">
      ${ms("arrow_back", { size: 25, color: FG })}<div style="flex:1;font-size:16.5px;font-weight:700;color:${FG};white-space:nowrap">Създаване на публикация</div>
      <div class="ring" style="background:${FB};color:#fff;font-size:15px;font-weight:600;padding:7px 14px;border-radius:8px">Публикувай</div></div>
    <div style="background:#fff;flex:1;overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 14px">${ini("С", "#1f7a8c", 44)}
        <div style="line-height:1.3"><div style="font-size:16.5px;font-weight:600;color:${FG}">Стойна Иванова</div>
          <div style="display:flex;gap:6px;margin-top:3px"><div style="display:flex;align-items:center;gap:4px;border:1px solid #ced0d4;border-radius:7px;padding:2px 8px;font-size:13px;font-weight:600;color:${FG}">${ms("group", { size: 15, fill: 1, color: FG })}Приятели${ms("arrow_drop_down", { size: 18, color: FG })}</div></div></div></div>
      <div style="padding:80px 16px 0;font-size:25px;line-height:1.3;color:${FG}">Честит празник на всички! Бъдете здрави и усмихнати.${caret(FB)}</div>
    </div>
    <div style="background:#fff;border-top:1px solid #dadde1;flex-shrink:0;padding:4px 0">
      ${opt("photo_library", "Снимка/видео", "#45bd62")}${opt("person_add", "Маркирай хора", FB)}${opt("sentiment_satisfied", "Чувство/дейност", "#f7b928")}${opt("location_on", "Регистрация", "#f5533d")}</div>
    ${nav("#fff")}
    ${tip("Проверете: „Приятели“ —<br>кой ще го види", "left:60px;top:136px", { arrow: "u", at: "20%" })}
    ${tip("Натиснете синия бутон<br>„Публикувай“", "right:10px;top:64px", { arrow: "u", at: "84%" })}
    ${tip("„Снимка“ — за да добавите снимка", "left:14px;bottom:" + (26 + 4 * 52 + 10) + "px", { arrow: "d", at: "14%" })}
  `), "#fff", "#111111", { nav: false, time: "10:20" });
}

// ── Facebook — намиране на приятел ──
{
  const chipF = (l, on) => `<div style="padding:7px 14px;border-radius:18px;font-size:14.5px;font-weight:600;background:${on ? "#e7f3ff" : FL};color:${on ? FB : FG};white-space:nowrap">${l}</div>`;
  const res = (av_, n, sub, ring) => `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px">${av_}<div style="flex:1;line-height:1.3"><div style="font-size:16.5px;font-weight:600;color:${FG}">${n}</div><div style="font-size:13.5px;color:${FS}">${sub}</div></div>
    <div class="${ring ? "ring" : ""}" style="display:flex;align-items:center;gap:5px;background:#e7f3ff;color:${FB};font-size:14px;font-weight:600;padding:8px 11px;border-radius:8px;white-space:nowrap">${ms("person_add", { size: 18, fill: 1, color: FB })}Добави приятел</div></div>`;
  S["fb-priatel"] = phone(root(`
    <div style="height:58px;background:#fff;display:flex;align-items:center;gap:6px;padding:0 12px 0 8px;flex-shrink:0">${ms("arrow_back", { size: 25, color: FG })}
      <div style="flex:1;background:#f0f2f5;border-radius:22px;height:40px;padding:0 12px 0 14px;display:flex;align-items:center;font-size:16.5px;color:${FG};margin-left:6px"><span style="flex:1">Мария Петрова</span>${ms("close", { size: 20, color: FS })}</div></div>
    <div style="display:flex;gap:8px;padding:2px 12px 10px;background:#fff;flex-shrink:0;overflow:hidden;border-bottom:1px solid #dadde1">${chipF("Всичко")}${chipF("Хора", 1)}${chipF("Публикации")}${chipF("Снимки")}</div>
    <div style="background:#fff;flex:1;overflow:hidden;padding-top:4px">
      ${res(sil(60, "#d3a6b8"), "Мария Петрова", "5 общи приятели", 1)}
      ${res(sil(60, "#a9b8d6"), "Мария Колева", "2 общи приятели")}
      ${res(sil(60, "#b6c9a8"), "Мария Петрова", "Живее в София")}
    </div>
    ${nav("#fff")}
    ${tip("Познайте човека по общите приятели,<br>натиснете „Добави приятел“", "left:0;right:0;margin:0 auto;width:max-content;top:452px")}
  `), "#fff", "#111111", { nav: false, time: "10:48" });
}

// ── Facebook — поверителност (избор на аудитория) ──
{
  const opt = (icon, t1, t2, on) => `<div class="${on ? "ring" : ""}" style="display:flex;align-items:center;gap:14px;padding:12px 14px;${on ? "border-radius:12px;margin:2px 8px;padding:12px 8px;" : ""}">${circ(ms(icon, { size: 26, fill: 1, color: FG }), 48)}<div style="flex:1;line-height:1.3"><div style="font-size:16.5px;font-weight:600;color:${FG}">${t1}</div><div style="font-size:13.5px;color:${FS}">${t2}</div></div>
    <div style="width:24px;height:24px;border-radius:50%;${on ? `background:${FB};` : "border:2px solid #8a8d91;"}display:flex;align-items:center;justify-content:center">${on ? `<i style="display:block;width:9px;height:9px;border-radius:50%;background:#fff"></i>` : ""}</div></div>`;
  S["fb-poveritelnost"] = phone(root(`
    <div style="height:56px;background:#fff;display:flex;align-items:center;gap:12px;padding:0 12px 0 10px;flex-shrink:0;border-bottom:1px solid #dadde1">${ms("arrow_back", { size: 25, color: FG })}<div style="flex:1;font-size:19px;font-weight:700;color:${FG}">Избор на аудитория</div></div>
    <div style="background:#fff;flex:1;overflow:hidden">
      <div style="padding:16px 14px 8px"><div style="font-size:18px;font-weight:700;color:${FG}">Кой може да вижда публикацията Ви?</div>
      <div style="font-size:14px;line-height:1.35;color:${FS};margin-top:6px">Публикацията ще се показва в емисията, във Вашия профил и в резултатите от търсене.</div></div>
      ${opt("public", "Публично", "Всеки във Facebook и извън него", 0)}${opt("group", "Приятели", "Само Вашите приятели във Facebook", 1)}${opt("person_add", "Конкретни приятели", "Само избрани от Вас хора", 0)}${opt("lock", "Само аз", "Никой друг не я вижда", 0)}
    </div>
    <div style="background:#fff;padding:10px 14px 12px;flex-shrink:0;border-top:1px solid #dadde1"><div style="background:${FB};color:#fff;text-align:center;font-size:16.5px;font-weight:600;height:46px;border-radius:8px;display:flex;align-items:center;justify-content:center">Готово</div></div>
    ${nav("#fff")}
    ${tip("„Приятели“ е най-безопасно —<br>само познати виждат снимките Ви", "left:0;right:0;margin:0 auto;width:max-content;top:520px")}
  `), "#fff", "#111111", { nav: false, time: "10:22" });
}

// ── Facebook — фалшив профил (подозрителни признаци) ──
{
  const info = (icon, x) => `<div style="display:flex;align-items:center;gap:12px;padding:5px 16px;font-size:15.5px;color:${FG}">${ms(icon, { size: 24, color: "#606770" })}<span>${x}</span></div>`;
  S["fb-falshiv"] = phone(root(`
    <div style="height:56px;background:#fff;display:flex;align-items:center;gap:8px;padding:0 12px 0 10px;flex-shrink:0">${ms("arrow_back", { size: 25, color: FG })}
      <div style="flex:1;background:#f0f2f5;border-radius:20px;height:38px;padding:0 14px;display:flex;align-items:center;font-size:16px;color:${FG};margin-left:4px">Ivan Petrov</div>${ms("more_horiz", { size: 26, color: FG })}</div>
    <div style="background:#fff;flex:1;overflow:hidden">
      <div style="height:150px;background:linear-gradient(180deg,#d8dadf,#c9ccd1)"></div>
      <div style="margin:-64px 0 0 16px;width:128px;height:128px;border-radius:50%;border:4px solid #fff;overflow:hidden;background:#fff">${sil(120, "#bcc0c7")}</div>
      <div style="padding:8px 16px 0"><div style="font-size:26px;font-weight:700;color:${FG}">Ivan Petrov</div><div style="font-size:15px;color:${FS};margin-top:2px"><b style="color:${FG}">3</b> приятели</div></div>
      <div style="display:flex;gap:8px;padding:14px 16px 12px"><div style="flex:1;background:${FB};color:#fff;height:40px;border-radius:8px;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px">${ms("person_add", { size: 19, fill: 1, color: "#fff" })}Добави приятел</div><div style="flex:1;background:${FL};color:${FG};height:40px;border-radius:8px;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px">${ms("chat", { size: 19, fill: 1, color: FG })}Съобщение</div></div>
      <div style="border-top:1px solid #dadde1;padding:10px 0 62px">${info("work", "Работи като инженер в Лондон")}${info("home", "Живее в Лондон, Англия")}${info("schedule", "Присъединил се през октомври 2026")}</div>
      <div style="border-top:8px solid ${FL};padding:12px 16px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:19px;font-weight:700;color:${FG}">Снимки</span><span style="font-size:15px;color:${FB}">Всички снимки</span></div>
        <div style="display:flex;gap:4px;margin-top:10px"><div style="flex:1;height:96px;border-radius:8px;background:#d3d6db"></div><div style="flex:1;height:96px;border-radius:8px;background:#c4c8ce"></div><div style="flex:1;height:96px;border-radius:8px;border:1px dashed #ced0d4"></div></div></div>
    </div>
    ${nav("#fff")}
    ${tip("Присъединил се наскоро —<br>профилът е съвсем нов", "right:10px;top:516px", { arrow: "u", at: "30%" })}
    ${tip("Само 3 приятели", "left:112px;top:306px", { arrow: "l", at: "50%" })}
    ${tip("Само 2 снимки", "right:10px;top:724px", { arrow: "u", at: "70%" })}
  `), "#fff", "#111111", { nav: false, time: "20:07" });
}

// ── Facebook — забравена парола (намерете профила си) ──
S["fb-parola"] = phone(root(`
  <div style="height:56px;display:flex;align-items:center;padding:0 12px;flex-shrink:0;background:#fff">${ms("arrow_back", { size: 25, color: FG })}</div>
  <div style="background:#fff;flex:1;padding:0 20px;overflow:hidden">
    <div style="display:flex;justify-content:center;margin:2px 0 18px">${brand("facebook", FB, 56)}</div>
    <div style="font-size:23px;font-weight:700;color:${FG}">Намерете профила си</div>
    <div style="font-size:15px;line-height:1.4;color:${FS};margin:8px 0 18px">Въведете имейл адреса или мобилния номер, с които сте се регистрирали.</div>
    <div style="position:relative;border:2px solid ${FB};border-radius:10px;height:56px;padding:0 14px;display:flex;align-items:flex-end;padding-bottom:9px;font-size:18px;color:${FG}">
      <span style="position:absolute;left:12px;top:-10px;background:#fff;padding:0 4px;font-size:13px;color:${FB}">Мобилен номер или имейл</span>0888 123 456${caret(FB)}</div>
    <div class="ring" style="margin-top:20px;background:${FB};color:#fff;height:48px;border-radius:24px;font-size:17px;font-weight:600;display:flex;align-items:center;justify-content:center">Търсене</div>
    <div style="margin-top:14px;text-align:center;font-size:14px;color:${FS}">След това ще получите код по SMS</div>
  </div>
  ${keyboard({ num: true })}
  ${nav("#eceef2")}
  ${tip("Въведете телефона или имейла си —<br>идва код за нова парола", "left:0;right:0;margin:0 auto;width:max-content;top:470px", { arrow: "u", at: "50%" })}
`), "#fff", "#111111", { nav: false, time: "19:15" });

// емоджитата — винаги с цветния шрифт (иначе DejaVu слага контурни/монохромни глифове)
const emojify = (h) => h.replace(/(\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)/gu, `<span style="font-family:'Noto Color Emoji'">$1</span>`);
render(Object.fromEntries(Object.entries(S).map(([k, v]) => [k, emojify(v)])));
