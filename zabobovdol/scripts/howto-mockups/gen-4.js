// Четвърта партида „мокъп" екрани (фотореалистични): Chrome за Android, Gmail, Google Карти (плочки на
// OpenStreetMap), Календар, Часовник, Преводач, Keep, Снимки/Галерия, банково приложение, магазин,
// радио/аудиокнига/филми/рецепти/игра. Стартиране (от zabobovdol/):
//   node scripts/howto-mockups/gen-4.js        |   ONLY=refresh,timer node scripts/howto-mockups/gen-4.js
// Активи: assets/apps/ (CC0/PDM снимки + плочки на OSM), описани в assets/credits/apps.md.
const { phone, I, tip, ms, photo, appIcon, ASSETS, render } = require("./_shell");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const S = {};
const AP = (f) => path.join(ASSETS, "apps", f);
const m = (n, s = 24, c, f = 0) => ms(n, { size: s, color: c, fill: f });

// ───────────────────────── общи помощници ─────────────────────────
// Снимка от assets/apps/ (ако липсва — първата налична, за да не пада рендерът; в credits са само реалните).
function P(name, o = {}) {
  const f = AP(name + ".jpg");
  if (!fs.existsSync(f)) { console.warn("! липсва снимка", name); return photo(AP("poppy.jpg"), o); }
  return photo(f, o);
}
const ph = (name, pos = "50% 50%", w = "100%", h = "100%", extra = "") => P(name, { w, h, style: `object-position:${pos};${extra}` });
// кореновият блок на екрана (660px) + червените бележки
const scr = (body, tips = "", bg = "#fff", sc = "#0b0b0b", rootBg, under) =>
  under
    ? phone(`<div style="margin-top:-38px;height:698px;display:flex;flex-direction:column;position:relative;overflow:hidden;background:${rootBg || bg}"><div style="height:38px;background:${under};flex-shrink:0"></div>${body}</div>${tips}`, bg, sc)
    : phone(`<div style="height:660px;display:flex;flex-direction:column;position:relative;overflow:hidden;background:${rootBg || bg}">${body}</div>${tips}`, bg, sc);
const abs = (css, inner) => `<div style="position:absolute;${css}">${inner}</div>`;
const ringed = (on) => (on ? "ring" : "");

// ───────────────────────── Chrome за Android ─────────────────────────
const SITE = "zabobovdol.carbonstealth.eu";
function chromeBar(url, o = {}) {
  const tabs = o.tabs || 3;
  const sec = o.insecure
    ? `<span style="display:flex;align-items:center;gap:4px;color:#b3261e;font-size:13px;font-weight:500">${m("warning", 18, "#b3261e", 1)}Не е защитено</span>`
    : m("tune", 20, "#444746");
  return `<div style="background:#fff;padding:6px 6px 8px 12px;display:flex;align-items:center;gap:2px;flex-shrink:0">
    <div style="flex:1;height:46px;border-radius:23px;background:#f0f4f9;display:flex;align-items:center;gap:10px;padding:0 14px 0 12px;min-width:0">
      ${sec}<span style="flex:1;font-size:15.5px;color:#1f1f1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${url}</span>${o.mic === false ? "" : m("mic", 20, "#444746")}</div>
    <div class="${ringed(o.ringTabs)}" style="width:44px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center"><span style="width:23px;height:23px;border:2px solid #444746;border-radius:6px;font-size:12.5px;font-weight:700;color:#444746;display:flex;align-items:center;justify-content:center">${tabs}</span></div>
    <div class="${ringed(o.ringMenu)}" style="width:44px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center">${m("more_vert", 24, "#444746")}</div></div>
    ${o.progress ? `<div style="height:3px;background:#d3e3fd;flex-shrink:0"><div style="width:62%;height:3px;background:#0b57d0"></div></div>` : ""}`;
}
const MENU_ITEMS = [
  ["add", "Нов раздел"], ["tab_inactive", "Нов раздел „Инкогнито“"], ["history", "История"], ["download", "Изтегляния"],
  ["star", "Отметки"], ["translate", "Преведи…"], ["share", "Споделяне…"], ["search", "Намиране на страницата"],
  ["add_to_home_screen", "Добавяне към началния екран"], ["settings", "Настройки"],
];
// icons: ring върху иконата от горния ред (star | refresh); ringItem: надпис от менюто
function chromeMenu(o = {}) {
  const icons = [["arrow_forward", 0], ["star", 1], ["download", 0], ["info", 0], ["refresh", 1]];
  const row = icons.map(([n]) => `<div class="${o.ringIcon === n ? "ring" : ""}" style="width:44px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center;${n === "arrow_forward" ? "opacity:.38" : ""}">${m(n, 24, o.ringIcon === n ? "#0b57d0" : "#444746", n === "star" && o.ringIcon === "star" ? 0 : 0)}</div>`).join("");
  const items = MENU_ITEMS.map(([ic, t]) => {
    const h = o.ringItem === t;
    return `<div class="${h ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;height:46px;padding:0 16px;${h ? "border-radius:12px;margin:0 6px;padding:0 10px;background:#e8f0fe;" : ""}">${m(ic, 22, h ? "#0b57d0" : "#444746")}<span style="font-size:15.5px;color:${h ? "#0b57d0" : "#1f1f1f"};font-weight:${h ? 500 : 400}">${t}</span></div>`;
  }).join("");
  return abs("right:8px;top:52px;width:268px;background:#fff;border-radius:16px;box-shadow:0 2px 6px rgba(0,0,0,.2),0 8px 24px rgba(0,0,0,.22);z-index:20;overflow:hidden;padding:4px 0 6px", `<div style="display:flex;justify-content:space-around;padding:4px 6px 6px;border-bottom:1px solid #e3e3e3;margin-bottom:4px">${row}</div>${items}`);
}
// мини „уебстраница" на портала (реалистичен вид на сайта)
function portalPage(o = {}) {
  const cards = [["local_pharmacy", "Аптеки и дежурства", "#d7f0e0", "#0a6c3a"], ["directions_bus", "Автобуси и разписание", "#d3e3fd", "#0b57d0"], ["account_balance", "Общинска администрация", "#ffe7c2", "#8f4700"], ["event", "Събития в града", "#f3e0ff", "#6a2fa0"]];
  return `<div style="flex:1;background:#fff;overflow:hidden;position:relative${o.shift ? `;transform:translateY(${o.shift}px)` : ""}">
    <div style="background:#212f8a;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px">${m("menu", 24, "#fff")}<div style="font-weight:700;font-size:18px;flex:1">За Бобов дол</div>${m("search", 24, "#fff")}</div>
    <div style="height:150px;position:relative">${ph("poppy", "50% 60%")}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,27,87,0) 30%,rgba(20,27,87,.78))"></div><div style="position:absolute;left:16px;right:16px;bottom:12px;color:#fff;font-size:21px;font-weight:700;line-height:1.2">Всичко за Бобов дол на едно място</div></div>
    <div style="padding:14px 14px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px">${cards.map(([ic, t, bg, fg]) => `<div style="background:${bg};border-radius:14px;padding:14px 12px;min-height:84px">${m(ic, 28, fg, 1)}<div style="font-size:14px;font-weight:500;color:#1f1f1f;margin-top:8px;line-height:1.2">${t}</div></div>`).join("")}</div>
    <div style="padding:14px;font-size:14px;color:#444;line-height:1.5">Ръководства „Как да…“ стъпка по стъпка, местни услуги и новини — написани просто и с големи букви.</div></div>`;
}
const chromeScreen = (url, content, o = {}, tips = "") => scr(`${chromeBar(url, o)}${content}${o.menu || ""}`, tips);

// ───────────────────────── Клавиатура (Gboard, български фонетичен) ─────────────────────────
function keyboard() {
  const key = (t, w = 31, bg = "#fff", fg = "#1f1f1f") => `<div style="width:${w}px;height:46px;border-radius:8px;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 1px 0 rgba(0,0,0,.18)">${t}</div>`;
  const row = (s, pad = 0) => `<div style="display:flex;justify-content:center;gap:5px;padding:0 ${pad}px">${[...s].map((c) => key(c)).join("")}</div>`;
  return `<div style="background:#e2e7ee;padding:8px 4px 6px;display:flex;flex-direction:column;gap:9px;flex-shrink:0">
    <div style="display:flex;gap:18px;padding:2px 12px 4px;align-items:center;color:#444746">${m("apps", 22)}${m("sticky_note_2", 22)}${m("gif_box", 22)}${m("settings", 22)}${m("translate", 22)}<span style="flex:1"></span>${m("mic", 22)}</div>
    ${row("явертъуиопч")}${row("асдфгхйклш", 6)}
    <div style="display:flex;justify-content:center;gap:5px">${key(m("arrow_upward", 20), 44, "#cfd6e1")}${[..."зьцжбнм"].map((c) => key(c, 33)).join("")}${key(m("backspace", 20), 44, "#cfd6e1")}</div>
    <div style="display:flex;justify-content:center;gap:5px">${key("?123", 50, "#cfd6e1")}${key(",", 34)}${key("", 180)}${key(".", 34)}${key(m("search", 22, "#fff"), 52, "#0b57d0")}</div>
  </div>`;
}

// ───────────────────────── Gmail ─────────────────────────
const AVC = ["#1a73e8", "#e8710a", "#188038", "#a142f4", "#d93025", "#129eaf", "#9334e6"];
const gAv = (l, i = 0, s = 40) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${AVC[i % AVC.length]};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${Math.round(s * 0.45)}px;font-weight:500;flex-shrink:0">${l}</div>`;
function gmRow([l, who, subj, snip, time, unread], i, o = {}) {
  return `<div style="display:flex;gap:14px;padding:11px 16px 11px 14px;align-items:flex-start">${gAv(l, i + (o.c || 0))}<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:15.5px;color:#1f1f1f;font-weight:${unread ? 700 : 400}">${who}</span><span style="font-size:12px;color:${unread ? "#1f1f1f" : "#5f6368"};font-weight:${unread ? 700 : 400}">${time}</span></div><div style="font-size:14px;color:#1f1f1f;font-weight:${unread ? 500 : 400};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subj}</div><div style="font-size:13.5px;color:#5f6368;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${snip}</div></div>${m("star", 22, "#c4c7c5")}</div>`;
}
const INBOX = [
  ["М", "Мария Георгиева", "Поздрав от нас", "Здравей, искаме да те видим в неделя на обяд…", "08:42", 1],
  ["А", "Аптека „Здраве“", "Поръчката Ви е готова", "Можете да я вземете до 18:00 ч. днес.", "пон.", 0],
  ["Е", "Електроснабдяване", "Сметка за ноември 2026", "Сумата за плащане е 24,85 €. Срок до 05.11.", "28 окт.", 1],
  ["Н", "Николай Стоянов", "Снимките от разходката", "Пращам ти ги, както се разбрахме. Прегръдки!", "27 окт.", 0],
  ["О", "Общинска администрация", "Покана за информационна среща", "Каним жителите на кмеч…", "25 окт.", 0],
  ["Д", "Доктор Иванова", "Напомняне за преглед", "Очакваме Ви във вторник в 10:30 ч.", "24 окт.", 0],
];
function gmailTop(text = "Търсене в имейла") {
  return `<div style="padding:8px 12px 6px;flex-shrink:0"><div style="height:50px;border-radius:25px;background:#e9eef6;display:flex;align-items:center;padding:0 8px 0 18px;gap:14px">${m("menu", 24, "#444746")}<span style="flex:1;font-size:16px;color:#444746">${text}</span><div style="width:34px;height:34px;border-radius:50%;background:#188038;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:15px">И</div></div></div>`;
}
const gmailBottom = `<div style="background:#f3f6fc;height:68px;display:flex;justify-content:space-around;align-items:center;flex-shrink:0;color:#444746;font-size:12px">${[["mail", "Поща", 1], ["videocam", "Meet", 0]].map(([i, t, a]) => `<div style="text-align:center"><div style="width:64px;height:32px;border-radius:16px;background:${a ? "#d3e3fd" : "transparent"};display:flex;align-items:center;justify-content:center;margin:0 auto 3px">${m(i, 24, "#1f1f1f", a)}</div><span style="color:#1f1f1f;font-weight:${a ? 700 : 400}">${t}</span></div>`).join("")}</div>`;
const composeFab = abs("right:16px;bottom:84px", `<div style="height:56px;border-radius:16px;background:#c2e7ff;color:#001d35;display:flex;align-items:center;gap:12px;padding:0 20px 0 16px;font-size:15px;font-weight:500;box-shadow:0 3px 8px rgba(0,0,0,.2)">${m("edit", 24, "#001d35", 1)}Ново писмо</div>`);
const gmailOpenBar = (o = {}) => `<div style="display:flex;align-items:center;padding:8px 6px 8px 8px;flex-shrink:0;background:#fff"><div style="width:48px;display:flex;justify-content:center">${m("arrow_back", 24, "#444746")}</div><div style="flex:1"></div>
  <div style="width:46px;display:flex;justify-content:center">${m("archive", 24, "#444746")}</div>
  <div class="${ringed(o.ringDelete)}" style="width:44px;height:44px;border-radius:22px;display:flex;align-items:center;justify-content:center">${m("delete", 24, "#444746")}</div>
  <div style="width:46px;display:flex;justify-content:center">${m("mark_email_unread", 24, "#444746")}</div>
  <div style="width:46px;display:flex;justify-content:center">${m("more_vert", 24, "#444746")}</div></div>`;
function gmailMessage(o = {}) {
  return `<div style="padding:4px 18px 8px;flex-shrink:0"><div style="display:flex;align-items:flex-start;gap:8px"><div style="flex:1;font-size:21px;color:#1f1f1f;line-height:1.3">${o.subject}</div>${m("star", 24, "#c4c7c5")}</div><div style="display:inline-block;margin-top:8px;background:#e8eaed;color:#444746;font-size:12px;padding:2px 8px;border-radius:4px">Входящи</div></div>
  <div style="display:flex;align-items:center;gap:12px;padding:10px 12px 10px 18px;flex-shrink:0"><div class="${ringed(o.ringAvatar)}" style="border-radius:50%;display:flex">${gAv(o.letter, o.color || 0, 42)}</div><div style="flex:1;min-width:0"><div style="font-size:15px;color:#1f1f1f;font-weight:500">${o.who} <span style="font-weight:400;color:#5f6368;font-size:12.5px;margin-left:4px">${o.date}</span></div><div style="font-size:13px;color:#5f6368">до мен ${m("expand_more", 16, "#5f6368")}</div></div>
    ${m("reply", 24, "#444746")}<div class="${ringed(o.ringMore)}" style="width:40px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center">${m("more_vert", 24, "#444746")}</div></div>
  <div style="padding:6px 18px;font-size:15px;color:#1f1f1f;line-height:1.5">${o.body}</div>`;
}
const popupMenu = (css, items, ringIdx, w = 220) => abs(`${css};width:${w}px;background:#fff;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,.2),0 8px 24px rgba(0,0,0,.2);z-index:20;padding:6px 0`,
  items.map((t, i) => `<div class="${i === ringIdx ? "ring" : ""}" style="height:46px;padding:0 18px;display:flex;align-items:center;font-size:15.5px;color:${i === ringIdx ? "#0b57d0" : "#1f1f1f"};font-weight:${i === ringIdx ? 500 : 400};${i === ringIdx ? "border-radius:10px;margin:0 6px;padding:0 12px;background:#e8f0fe;" : ""}">${t}</div>`).join(""));

// ───────────────────────── Карти (плочки OSM) ─────────────────────────
// набор z17: x 73911..73913, y 48475..48477; z12: x 2309..2311, y 1514..1516
const SETS = { 17: { x0: 73911, y0: 48475, n: 3 }, 12: { x0: 2309, y0: 1514, n: 3 } };
function osm(z, cx, cy, w, h, scale = 1) {
  const s = SETS[z], T = 256 * scale;
  let imgs = "";
  for (let i = 0; i < s.n; i++) for (let j = 0; j < s.n; j++) {
    const tx = s.x0 + i, ty = s.y0 + j;
    imgs += `<img alt="" src="${pathToFileURL(AP(`tiles/${z}_${tx}_${ty}.png`)).href}" style="position:absolute;left:${(w / 2 + (tx - cx) * T).toFixed(1)}px;top:${(h / 2 + (ty - cy) * T).toFixed(1)}px;width:${T}px;height:${T}px">`;
  }
  const pt = (fx, fy) => [w / 2 + (fx - cx) * T, h / 2 + (fy - cy) * T];
  return { html: `<div style="position:absolute;left:0;top:0;width:${w}px;height:${h}px;overflow:hidden;background:#f2efe9">${imgs}</div>`, pt };
}
const OSM_CR = (css = "left:6px;bottom:6px") => abs(`${css};background:rgba(255,255,255,.78);padding:1px 5px;font-size:10px;color:#333;border-radius:3px;z-index:6`, "© OpenStreetMap contributors");
const blueDot = (x, y) => abs(`left:${x - 46}px;top:${y - 46}px;width:92px;height:92px;z-index:5`, `<div style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,rgba(66,133,244,.34) 0,rgba(66,133,244,.14) 60%,rgba(66,133,244,0) 72%)"></div><div style="position:absolute;left:46px;top:46px;width:0;height:0;border-left:15px solid transparent;border-right:15px solid transparent;border-bottom:34px solid rgba(66,133,244,.35);transform:translate(-15px,-34px) rotate(25deg);transform-origin:15px 34px;filter:blur(2px)"></div><div style="position:absolute;left:33px;top:33px;width:26px;height:26px;border-radius:50%;background:#4285f4;border:3.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.4)"></div>`);
const mapsTop = (chips = true) => abs("left:10px;right:10px;top:10px;z-index:10", `<div style="height:50px;border-radius:25px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;padding:0 8px 0 14px;gap:12px">${m("search", 24, "#5f6368")}<span style="flex:1;font-size:16px;color:#5f6368">Търсене тук</span>${m("mic", 24, "#5f6368")}<div style="width:34px;height:34px;border-radius:50%;background:#188038;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:15px">И</div></div>
  ${chips ? `<div style="display:flex;gap:8px;margin-top:10px;overflow:hidden">${[["restaurant", "Ресторанти"], ["local_gas_station", "Бензиностанции"], ["local_pharmacy", "Аптеки"], ["local_cafe", "Кафенета"]].map(([i, t]) => `<div style="height:36px;border-radius:18px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);display:flex;align-items:center;gap:6px;padding:0 12px 0 10px;font-size:14px;color:#3c4043;white-space:nowrap">${m(i, 18, "#1a73e8", 1)}${t}</div>`).join("")}</div>` : ""}`);
const mapsNav = `<div style="position:absolute;left:0;right:0;bottom:0;height:62px;background:#fff;display:flex;justify-content:space-around;align-items:center;z-index:12;border-top:1px solid #e8eaed">${[["explore", "Проучване", 1], ["commute", "Пътувания", 0], ["bookmark", "Запазени", 0], ["add_circle", "Допринасяне", 0], ["notifications", "Актуализации", 0]].map(([i, t, a]) => `<div style="text-align:center;font-size:11px;color:${a ? "#1a73e8" : "#5f6368"};font-weight:${a ? 700 : 400}">${m(i, 24, a ? "#1a73e8" : "#5f6368", a)}<div>${t}</div></div>`).join("")}</div>`;
const myLocFab = (ring) => abs("right:12px;bottom:74px;z-index:10", `<div style="display:flex;flex-direction:column;gap:12px;align-items:flex-end"><div style="width:52px;height:52px;border-radius:16px;background:#1a73e8;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3)">${m("directions", 28, "#fff", 1)}</div><div class="${ringed(ring)}" style="width:52px;height:52px;border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.3)">${m("my_location", 26, "#1a73e8")}</div></div>`);
const MAPBG = "#f2efe9";

// ───────────────────────── Keep, Календар и др. ─────────────────────────
const keepCard = (title, lines, bg = "#fff", o = {}) => `<div style="background:${bg};border:1px solid ${bg === "#fff" ? "#dadce0" : "transparent"};border-radius:10px;padding:12px 14px;margin-bottom:10px;break-inside:avoid">${title ? `<div style="font-size:16px;font-weight:500;color:#202124;margin-bottom:6px">${title}</div>` : ""}<div style="font-size:14.5px;color:#202124;line-height:1.55">${lines}</div></div>`;
const ck = (t, on) => `<div style="display:flex;align-items:center;gap:8px">${m(on ? "check_box" : "check_box_outline_blank", 20, on ? "#5f6368" : "#5f6368")}<span style="${on ? "text-decoration:line-through;color:#5f6368" : ""}">${t}</span></div>`;

// баркод EAN-13 (валидна контролна цифра)
function ean13(code12) {
  const sum = [...code12].reduce((a, c, i) => a + +c * (i % 2 ? 3 : 1), 0);
  const d = code12 + ((10 - (sum % 10)) % 10);
  const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const G = L.map((c) => [...c].reverse().join("").split("").map((b) => (b === "1" ? "1" : "0")).join("")).map((c) => c);
  const Rr = L.map((c) => [...c].map((b) => (b === "1" ? "0" : "1")).join(""));
  const Gg = Rr.map((c) => [...c].reverse().join(""));
  const par = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"][+d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (par[i - 1] === "L" ? L : Gg)[+d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += Rr[+d[i]];
  bits += "101";
  void G;
  return { digits: d, bits };
}
function barcodeSvg(code12, w = 250, h = 84) {
  const { digits, bits } = ean13(code12);
  const bw = w / bits.length;
  const guard = (i) => i < 3 || (i >= 45 && i < 50) || i >= 92;
  let rects = "";
  for (let i = 0; i < bits.length; i++) if (bits[i] === "1") rects += `<rect x="${(i * bw).toFixed(2)}" y="0" width="${bw.toFixed(2)}" height="${guard(i) ? h : h - 10}" fill="#111"/>`;
  return `<svg width="${w}" height="${h + 14}" viewBox="0 0 ${w} ${h + 14}" style="display:block"><rect width="${w}" height="${h + 14}" fill="#fff"/>${rects}<text x="0" y="${h + 11}" font-family="Roboto" font-size="12" fill="#111">${digits[0]}</text><text x="${(4 * bw).toFixed(1)}" y="${h + 11}" font-family="Roboto" font-size="12" textLength="${(41 * bw).toFixed(1)}" lengthAdjust="spacing" fill="#111">${digits.slice(1, 7)}</text><text x="${(50 * bw).toFixed(1)}" y="${h + 11}" font-family="Roboto" font-size="12" textLength="${(41 * bw).toFixed(1)}" lengthAdjust="spacing" fill="#111">${digits.slice(7)}</text></svg>`;
}
// QR-подобна матрица (за касова бележка; не носи данни)
function qrLike(n = 25, px = 3) {
  let seed = 7, cells = "";
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const finder = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let on;
    if (finder(x, y)) {
      const fx = x % (n - 7 > 0 ? 1 : 1), lx = x < 8 ? x : x - (n - 8), ly = y < 8 ? y : y - (n - 8);
      void fx;
      on = lx === 7 || ly === 7 ? false : lx === 0 || ly === 0 || lx === 6 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
    } else on = rnd() > 0.52;
    if (on) cells += `<rect x="${x * px}" y="${y * px}" width="${px}" height="${px}"/>`;
  }
  return `<svg width="${n * px}" height="${n * px}" viewBox="0 0 ${n * px} ${n * px}" fill="#222" shape-rendering="crispEdges">${cells}</svg>`;
}

// ═════════════════════════ ИНТЕРНЕТ / БРАУЗЪР ═════════════════════════
S["bookmark-add"] = chromeScreen(SITE, portalPage(), { menu: chromeMenu({ ringIcon: "star" }) },
  tip("Докоснете звездичката „Добави отметка“ горе в менюто — сайтът се запазва в отметките", "left:14px;top:590px;width:290px"));

S["bookmarks-list"] = (() => {
  const rows = [["З", "За Бобов дол — граждански портал", SITE, 0, 1], ["П", "Прогноза за времето — Дупница", "vreme.example.bg", 3], ["А", "Аптеки на дежурство", "dezhurni-apteki.example.bg", 2], ["Т", "Разписание на автобусите", "avtogara.example.bg", 5], ["Н", "Новини от региона", "novini-region.example.bg", 1], ["Р", "Шопска салата — рецепта", "vkusno-u-doma.example.bg", 4], ["Т", "ТВ на живо", "tvplanina.example.bg", 6], ["Б", "Моята банка — вход", "moyata-banka.example.bg", 2]];
  return scr(`<div style="display:flex;align-items:center;padding:8px 6px 8px 8px;gap:4px;flex-shrink:0">${m("arrow_back", 24, "#444746")}<div style="flex:1;font-size:21px;margin-left:12px;color:#1f1f1f">Отметки</div>${m("search", 24, "#444746")}<div style="width:40px;display:flex;justify-content:center">${m("more_vert", 24, "#444746")}</div></div>
  <div style="padding:2px 18px 10px;font-size:13px;color:#5f6368">Мобилни отметки</div>
  <div style="flex:1;background:#fff">${rows.map(([l, t, u, c, h]) => `<div class="${ringed(h)}" style="display:flex;align-items:center;gap:16px;padding:10px 6px 10px 18px;${h ? "border-radius:12px;margin:2px 8px;padding-left:10px;" : ""}"><div style="width:36px;height:36px;border-radius:50%;background:${AVC[c]};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:16px">${l}</div><div style="flex:1;min-width:0"><div style="font-size:15.5px;color:#1f1f1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t}</div><div style="font-size:13px;color:#5f6368">${u}</div></div>${m("more_vert", 22, "#5f6368")}</div>`).join("")}</div>`,
    tip("Менюто ⋮ → „Отметки“ отваря този списък. Докоснете сайта.", "left:14px;top:590px;width:300px"));
})();

S["new-tab"] = chromeScreen(SITE, portalPage(), { menu: chromeMenu({ ringItem: "Нов раздел" }), ringMenu: 0 },
  tip("„Нов раздел“ отваря празна страница. Между разделите превключвате от иконата с цифрата", "left:14px;top:590px;width:300px"));

S["close-tab"] = (() => {
  const card = (title, c, body, ring) => `<div style="background:#f0f4f9;border-radius:16px;padding:8px;overflow:hidden"><div style="display:flex;align-items:center;gap:8px;padding:2px 2px 8px"><div style="width:20px;height:20px;border-radius:50%;background:${c};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${title[0]}</div><div style="flex:1;font-size:13px;color:#1f1f1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${title}</div><div class="${ringed(ring)}" style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center">${m("close", 18, "#444746")}</div></div><div style="height:176px;border-radius:10px;overflow:hidden;background:#fff;position:relative">${body}</div></div>`;
  const mini = (hd, photoName, pos, lines) => `<div style="background:${hd};height:24px"></div><div style="height:70px">${ph(photoName, pos)}</div><div style="padding:8px">${lines}</div>`;
  const ln = (w) => `<div style="height:6px;border-radius:3px;background:#dadce0;width:${w}%;margin-bottom:6px"></div>`;
  return scr(`<div style="display:flex;align-items:center;padding:8px 10px;gap:6px;flex-shrink:0"><div style="flex:1;display:flex;gap:6px"><div style="width:52px;height:36px;border-radius:18px 0 0 18px;background:#d3e3fd;display:flex;align-items:center;justify-content:center">${m("tab", 22, "#001d35", 1)}</div><div style="width:52px;height:36px;border-radius:0 18px 18px 0;background:#f0f4f9;display:flex;align-items:center;justify-content:center;margin-left:-6px">${m("tab_inactive", 22, "#444746")}</div></div>${m("add", 26, "#444746")}<div style="width:40px;display:flex;justify-content:center">${m("more_vert", 24, "#444746")}</div></div>
  <div style="flex:1;background:#fff;padding:6px 12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:start">
    ${card("За Бобов дол", "#212f8a", mini("#212f8a", "poppy", "50% 60%", ln(90) + ln(70) + ln(80)), 0)}
    ${card("Спечелете награда!", "#b3261e", `<div style="background:#fff3e0;height:100%;padding:12px;text-align:center"><div style="font-size:12px;font-weight:700;color:#b3261e;margin-top:20px">Поздравления!</div><div style="font-size:10px;color:#444;margin:6px 0">Вие бяхте избран за награда</div><div style="background:#e8710a;color:#fff;border-radius:6px;font-size:10px;padding:6px;margin-top:8px">Вземи наградата</div></div>`, 1)}
    ${card("Прогноза за времето", "#188038", mini("#188038", "lake", "50% 50%", ln(60) + ln(85)), 0)}
    ${card("Рецепти — шопска салата", "#e8710a", mini("#e8710a", "tomato", "50% 50%", ln(75) + ln(55)), 0)}</div>`,
    tip("Докоснете ✕ на ненужния раздел (или го плъзнете настрани) — така го затваряте", "left:14px;top:560px;width:290px"), "#fff");
})();

// Презареждане: страницата е леко „дръпната“ надолу, в менюто също има бутон за презареждане
S["refresh"] = scr(`${chromeBar(SITE, { progress: true })}<div style="flex:1;position:relative;background:#f8f9fa">
  ${abs("left:50%;top:14px;margin-left:-22px;z-index:15", `<div style="width:44px;height:44px;border-radius:50%;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center">${m("autorenew", 26, "#1a73e8")}</div>`)}
  <div style="position:absolute;left:0;right:0;top:70px;bottom:0;display:flex;flex-direction:column;background:#fff;box-shadow:0 -2px 8px rgba(0,0,0,.12)">${portalPage()}</div></div>`,
  tip("Плъзнете страницата надолу — или докоснете ⋮ и стрелката ↻", "left:50%;top:500px;transform:translateX(-50%);width:290px"));

S["zoom-page"] = (() => {
  const finger = (x, y) => abs(`left:${x - 30}px;top:${y - 30}px;width:60px;height:60px;border-radius:50%;background:rgba(66,133,244,.30);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(66,133,244,.55);z-index:15`, "");
  const art = `<div style="flex:1;background:#fff;padding:16px 18px;overflow:hidden"><div style="font-size:30px;font-weight:700;color:#1f1f1f;line-height:1.2">Аптеки с дежурство през ноември</div><div style="font-size:13px;color:#5f6368;margin:8px 0 14px">30 октомври 2026</div><div style="font-size:25px;color:#1f1f1f;line-height:1.5">Дежурната аптека в града работи до 22:00 ч. всеки ден, а през почивните дни — до 20:00 ч. Телефон за връзка: 0888 123 456.</div></div>`;
  const arrow = (x, y, rot) => abs(`left:${x}px;top:${y}px;z-index:14;transform:rotate(${rot}deg)`, m("arrow_forward", 30, "#d32f2f"));
  return scr(`${chromeBar(SITE)}${art}${finger(135, 380)}${finger(262, 290)}${arrow(64, 408, 135)}${arrow(300, 232, -45)}`,
    tip("Допрете с два пръста и ги раздалечете — текстът става по-голям", "left:50%;bottom:34px;transform:translateX(-50%);width:290px"));
})();

S["translate-page"] = (() => {
  const en = `<div style="flex:1;background:#fff;overflow:hidden"><div style="background:#2e4a3d;color:#fff;padding:12px 16px;font-weight:700;font-size:17px">Mountain Walks Journal</div><div style="height:150px">${ph("lake", "50% 55%")}</div><div style="padding:14px 16px"><div style="font-size:23px;font-weight:700;color:#1f1f1f;line-height:1.25">Autumn in the hills: a gentle walking guide</div><div style="font-size:15px;color:#3c4043;line-height:1.55;margin-top:10px">The best time to visit the valley is early in the morning, when the mist lifts from the river and the paths are still quiet. Bring a warm jacket and plenty of water.</div></div></div>`;
  return scr(`${chromeBar("mountain-walks.example.com")}${en}${chromeMenu({ ringItem: "Преведи…" })}`,
    tip("Менюто ⋮ → „Преведи…“ → изберете „Български“. Преводът не винаги е перфектен, но се разбира", "left:14px;top:300px;max-width:200px", { arrow: "r", at: "36%" }));
})();
S["translate-page"] = S["translate-page"].replace("left:14px;top:300px", "left:14px;top:600px;width:300px");

S["save-image"] = (() => {
  const page = `<div style="flex:1;background:#fff;padding:12px 14px;overflow:hidden"><div style="font-size:22px;font-weight:700;color:#1f1f1f;line-height:1.25;margin-bottom:10px">Цъфтящите макове край града</div><div style="border-radius:8px;overflow:hidden;height:210px">${ph("poppy", "50% 55%")}</div><div style="font-size:15px;color:#3c4043;line-height:1.5;margin-top:10px">Всяка пролет полетата по пътя към Дупница се обличат в червено.</div></div>`;
  const sheet = abs("left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;z-index:20;padding:8px 0 10px;box-shadow:0 -4px 20px rgba(0,0,0,.25)",
    `<div style="width:32px;height:4px;border-radius:2px;background:#c4c7c5;margin:2px auto 8px"></div><div style="display:flex;gap:12px;padding:6px 18px 12px;border-bottom:1px solid #e3e3e3;align-items:center"><div style="width:44px;height:44px;border-radius:8px;overflow:hidden">${ph("poppy")}</div><div style="font-size:13px;color:#5f6368;line-height:1.3">${SITE}/snimki/poppy.jpg</div></div>` +
    [["open_in_new", "Отваряне на изображението в нов раздел"], ["content_copy", "Копиране на изображението"], ["download", "Изтегляне на изображението"], ["share", "Споделяне на изображението"], ["image_search", "Търсене с Google Lens"]].map(([ic, t], i) => `<div class="${i === 2 ? "ring" : ""}" style="display:flex;align-items:center;gap:18px;height:50px;padding:0 20px;${i === 2 ? "border-radius:12px;margin:0 8px;background:#e8f0fe;padding:0 12px;" : ""}">${m(ic, 24, i === 2 ? "#0b57d0" : "#444746")}<span style="font-size:15.5px;color:${i === 2 ? "#0b57d0" : "#1f1f1f"};font-weight:${i === 2 ? 500 : 400}">${t}</span></div>`).join(""));
  return scr(`${chromeBar(SITE)}${page}${abs("inset:0;background:rgba(0,0,0,.32);z-index:10", "")}${sheet}`,
    tip("Задръжте пръст върху снимката → „Изтегляне на изображението“", "left:50%;top:150px;transform:translateX(-50%);width:270px;z-index:30"));
})();

S["clear-history"] = (() => {
  const cb = (on, t, d, ring) => `<div class="${ringed(ring)}" style="display:flex;gap:14px;align-items:flex-start;padding:14px 18px;${ring ? "border-radius:12px;margin:2px 8px;padding:12px 10px;" : ""}">${m(on ? "check_box" : "check_box_outline_blank", 26, on ? "#0b57d0" : "#444746", on)}<div><div style="font-size:16px;color:#1f1f1f">${t}</div><div style="font-size:13.5px;color:#5f6368;margin-top:2px;line-height:1.35">${d}</div></div></div>`;
  return scr(`<div style="display:flex;align-items:center;padding:8px 8px 8px 10px;gap:12px;flex-shrink:0">${m("arrow_back", 24, "#444746")}<div style="font-size:20px;color:#1f1f1f">Изчистване на данните за сърфирането</div></div>
  <div style="display:flex;border-bottom:1px solid #e3e3e3;flex-shrink:0"><div style="flex:1;text-align:center;padding:12px;color:#0b57d0;font-weight:500;border-bottom:3px solid #0b57d0;font-size:15px">Основни</div><div style="flex:1;text-align:center;padding:12px;color:#5f6368;font-size:15px">Разширени</div></div>
  <div style="padding:14px 18px 6px;font-size:13px;color:#5f6368">Времеви диапазон</div>
  <div style="margin:0 18px 6px;border:1px solid #c4c7c5;border-radius:8px;height:50px;display:flex;align-items:center;padding:0 14px;font-size:16px;color:#1f1f1f;justify-content:space-between">През цялото време${m("arrow_drop_down", 24, "#444746")}</div>
  ${cb(1, "История на сърфирането", "Изчиства историята във всички устройства, в които сте влезли в профила си.", 1)}
  ${cb(1, "Бисквитки и данни за сайтове", "Ще бъдете отписани от повечето сайтове.", 0)}
  ${cb(1, "Кеширани изображения и файлове", "Освобождава малко място на телефона.", 0)}
  <div style="flex:1"></div>
  <div style="padding:12px 18px 14px;display:flex;justify-content:flex-end;gap:10px"><div style="height:44px;padding:0 22px;border-radius:22px;color:#0b57d0;font-weight:500;font-size:15px;display:flex;align-items:center">Отказ</div><div class="ring" style="height:44px;padding:0 24px;border-radius:22px;background:#0b57d0;color:#fff;font-weight:500;font-size:15px;display:flex;align-items:center">Изчистване на данните</div></div>`,
    tip("Пътят: ⋮ → „История“ → „Изчисти данните за сърфиране“. Отметнете „История“ и потвърдете.", "left:50%;top:420px;transform:translateX(-50%);width:300px"));
})();

S["downloads"] = (() => {
  const row = (th, name, meta, ring) => `<div class="${ringed(ring)}" style="display:flex;align-items:center;gap:14px;padding:9px 16px;${ring ? "border-radius:12px;margin:2px 8px;padding:9px 8px;" : ""}"><div style="width:48px;height:48px;border-radius:8px;overflow:hidden;background:#f1f3f4;display:flex;align-items:center;justify-content:center;flex-shrink:0">${th}</div><div style="flex:1;min-width:0"><div style="font-size:16px;color:#1f1f1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div><div style="font-size:13px;color:#5f6368;margin-top:1px">${meta}</div></div>${m("more_vert", 22, "#5f6368")}</div>`;
  const pdf = `<div style="width:48px;height:48px;background:#fce8e6;display:flex;align-items:center;justify-content:center">${m("picture_as_pdf", 28, "#d93025", 1)}</div>`;
  const mp3 = `<div style="width:48px;height:48px;background:#e8f0fe;display:flex;align-items:center;justify-content:center">${m("music_note", 28, "#1a73e8", 1)}</div>`;
  return scr(`<div style="display:flex;align-items:center;padding:8px 6px 8px 10px;gap:12px;flex-shrink:0">${m("arrow_back", 24, "#444746")}<div style="flex:1;font-size:22px;color:#1f1f1f">Изтегляния</div>${m("search", 24, "#444746")}${m("sort", 24, "#444746")}${m("more_vert", 24, "#444746")}</div>
  <div style="display:flex;gap:8px;padding:2px 14px 10px;flex-shrink:0">${["Изображения", "Документи", "Аудио"].map((t, i) => `<div style="height:32px;border-radius:8px;border:1px solid #c4c7c5;display:flex;align-items:center;padding:0 12px;font-size:14px;color:#1f1f1f">${t}</div>`).join("")}</div>
  <div style="padding:6px 18px;font-size:13px;color:#5f6368">Днес</div>
  ${row(ph("poppy", "50% 60%"), "makove-bobov-dol.jpg", "10:24 · 1,2 MB", 1)}${row(pdf, "smetka-tok-noemvri.pdf", "09:58 · 238 KB", 0)}
  <div style="padding:10px 18px 6px;font-size:13px;color:#5f6368">Тази седмица</div>
  ${row(ph("sunflower", "50% 40%"), "slunchogledi.jpg", "28 окт. · 2,0 MB", 0)}${row(mp3, "narodna-pesen.mp3", "27 окт. · 3,4 MB", 0)}${row(pdf, "recepta-boba.pdf", "26 окт. · 512 KB", 0)}
  <div style="flex:1"></div>
  <div style="background:#f3f6fc;height:66px;display:flex;justify-content:space-around;align-items:center;font-size:12px;color:#1f1f1f">${[["home", "Начало", 0], ["folder", "Прегледи", 1], ["share", "Споделяне", 0]].map(([i, t, a]) => `<div style="text-align:center"><div style="width:62px;height:30px;border-radius:15px;background:${a ? "#d3e3fd" : "none"};display:flex;align-items:center;justify-content:center;margin:0 auto 2px">${m(i, 24, "#1f1f1f", a)}</div>${t}</div>`).join("")}</div>`,
    tip("„Файлове“ → папка „Изтегляния“ → докоснете файла", "left:50%;top:462px;transform:translateX(-50%);width:290px"));
})();

// ═════════════════════════ ИМЕЙЛ (Gmail) ═════════════════════════
S["mail-delete"] = scr(`${gmailOpenBar({ ringDelete: 1 })}${gmailMessage({ subject: "Големи намаления до 50% само днес", letter: "М", color: 4, who: "Магазин Промоции", date: "28 окт.", body: "Здравейте,<br><br>Само до края на седмицата — специални цени на избрани стоки за дома. Вижте всички оферти в нашия онлайн магазин.<br><br>Ако не искате да получавате такива писма, отпишете се от връзката най-долу." })}`,
  tip("Отворете писмото → натиснете кошчето в лентата горе. Писмото отива в „Кошче“", "left:50%;top:330px;transform:translateX(-50%);width:290px"));

S["mail-sent"] = (() => {
  const items = [["inbox", "Входящи", "12"], ["star", "Със звезда", ""], ["schedule", "Отложени", ""], ["label_important", "Важни", ""], ["send", "Изпратени", ""], ["schedule_send", "Планирани", ""], ["outbox", "Изходящи", ""], ["draft", "Чернови", "2"], ["mail", "Всички писма", ""], ["report", "Спам", ""], ["delete", "Кошче", ""]];
  const drawer = abs("left:0;top:0;bottom:0;width:318px;background:#f0f4f9;border-radius:0 16px 16px 0;z-index:20;padding:14px 12px;box-shadow:4px 0 20px rgba(0,0,0,.25)",
    `<div style="display:flex;align-items:center;gap:10px;padding:4px 14px 14px"><div style="width:30px;height:30px">${appIcon("gmail", { size: 30, label: false })}</div><span style="font-size:22px;color:#444746">Gmail</span></div>` +
    `<div style="height:44px;display:flex;align-items:center;padding:0 16px;gap:14px;font-size:14px;color:#1f1f1f;font-weight:500">${m("all_inbox", 22, "#444746")}Всички входящи</div><div style="border-top:1px solid #dadce0;margin:6px 4px"></div>` +
    items.map(([ic, t, b]) => { const h = t === "Изпратени"; return `<div class="${h ? "ring" : ""}" style="height:46px;border-radius:23px;display:flex;align-items:center;padding:0 16px;gap:14px;font-size:14.5px;color:${h ? "#001d35" : "#1f1f1f"};font-weight:${h ? 700 : 500};background:${h ? "#d3e3fd" : "none"}">${m(ic, 22, h ? "#001d35" : "#444746", h)}<span style="flex:1">${t}</span><span style="font-size:13px">${b}</span></div>`; }).join(""));
  return scr(`${gmailTop()}<div style="flex:1;overflow:hidden">${INBOX.map((r, i) => gmRow(r, i)).join("")}</div>${gmailBottom}${abs("inset:0;background:rgba(0,0,0,.34);z-index:10", "")}${drawer}`,
    tip("Менюто ☰ горе вляво → „Изпратени“", "left:70px;top:352px;width:230px;z-index:40", { arrow: "u", at: "36%" }));
})();
S["mail-search"] = (() => {
  const hi = (t) => t.replace(/(аптека|Аптека)/g, '<b style="color:#1f1f1f">$1</b>');
  const res = [["А", "Аптека „Здраве“", "Поръчката Ви е готова", "Можете да я вземете до 18:00 ч. днес. Аптека „Здраве“ е до центъра.", "пон.", 1], ["А", "Аптека „Здраве“", "Рецептата Ви е обработена", "Здравейте, рецептата е в аптека „Здраве“.", "12 окт.", 0], ["Д", "Доктор Иванова", "Лекарства от аптека", "Можете да ги вземете от всяка аптека.", "3 окт.", 0]];
  return scr(`<div style="padding:8px 12px 6px;flex-shrink:0"><div class="ring" style="height:50px;border-radius:25px;background:#e9eef6;display:flex;align-items:center;padding:0 12px 0 14px;gap:14px">${m("arrow_back", 24, "#444746")}<span style="flex:1;font-size:17px;color:#1f1f1f">аптека</span>${m("close", 24, "#444746")}</div></div>
  <div style="padding:6px 18px;font-size:13px;color:#5f6368">Резултати</div>
  <div style="flex:1;overflow:hidden">${res.map(([l, w, s, sn, t, u], i) => gmRow([l, w, s, hi(sn), t, u], i, { c: 1 })).join("")}</div>${keyboard()}`,
    tip("Докоснете „Търсене в имейла“ и напишете дума от писмото", "left:50%;top:316px;transform:translateX(-50%);width:290px;z-index:40"));
})();

S["mail-forward"] = scr(`${gmailOpenBar()}${gmailMessage({ subject: "Сметка за ток — ноември 2026", letter: "Е", color: 2, who: "Електроснабдяване", date: "28 окт.", ringMore: 1, body: "Здравейте,<br><br>Към това писмо е приложена Вашата сметка за ноември. Сумата за плащане е <b>24,85 €</b> със срок до 05.11.2026 г.<div style='margin-top:14px;display:inline-flex;align-items:center;gap:10px;border:1px solid #dadce0;border-radius:12px;padding:10px 14px'>" + m("picture_as_pdf", 26, "#d93025", 1) + "<div><div style='font-size:14px'>smetka-noemvri.pdf</div><div style='font-size:12px;color:#5f6368'>238 KB</div></div></div>" })}
  ${popupMenu("right:14px;top:166px", ["Отговори на всички", "Препрати", "Добави звезда", "Отбележи като непрочетено"], 1, 236)}`,
  tip("Менюто ⋮ до писмото → „Препрати“, после въведете адреса и „Изпрати“", "left:14px;top:420px;max-width:300px"));

S["mail-add-contact"] = (() => {
  const card = abs("left:22px;right:22px;top:130px;background:#fff;border-radius:24px;box-shadow:0 8px 30px rgba(0,0,0,.3);z-index:20;padding:22px 20px 14px;text-align:center",
    `${abs("right:12px;top:12px", m("close", 22, "#444746"))}<div style="display:flex;justify-content:center">${gAv("Н", 1, 72)}</div><div style="font-size:20px;color:#1f1f1f;margin-top:10px;font-weight:500">Николай Стоянов</div><div style="font-size:14px;color:#5f6368;margin-top:2px">nikolay.stoyanov@example.com</div>
     <div style="display:flex;gap:10px;margin-top:18px;justify-content:center"><div class="ring" style="height:42px;border-radius:21px;background:#d3e3fd;color:#001d35;font-size:14.5px;font-weight:500;display:flex;align-items:center;gap:8px;padding:0 16px">${m("person_add", 20, "#001d35", 1)}Добави в контакти</div></div>
     <div style="display:flex;gap:10px;margin-top:10px;justify-content:center"><div style="height:42px;border-radius:21px;border:1px solid #c4c7c5;color:#0b57d0;font-size:14.5px;font-weight:500;display:flex;align-items:center;gap:8px;padding:0 16px">${m("mail", 20, "#0b57d0")}Ново писмо</div></div>`);
  return scr(`${gmailOpenBar()}${gmailMessage({ subject: "Снимките от разходката", letter: "Н", color: 1, who: "Николай Стоянов", date: "27 окт.", ringAvatar: 1, body: "Здравей,<br><br>Пращам ти снимките от разходката, както се разбрахме. Времето беше чудесно!<br><br>Прегръдки,<br>Николай" })}${abs("inset:0;background:rgba(0,0,0,.32);z-index:10", "")}${card}`,
    tip("Докоснете кръгчето с инициала → „Добави в контакти“", "left:50%;top:448px;transform:translateX(-50%);width:290px;z-index:40", { arrow: "u", at: "50%" }));
})();

// ═════════════════════════ КАРТИ ═════════════════════════
const V17 = { cx: 73912.55, cy: 48476.5 };
// екран на карта: плочките са под лентата за състоянието (698px), интерфейсът е в 660px кутия
const mapScreen = (mapLayer, ui, tips = "") =>
  phone(`<div style="margin-top:-38px;height:698px;position:relative;overflow:hidden;background:${MAPBG}">${mapLayer}<div style="position:absolute;left:0;right:0;top:38px;height:660px">${ui}</div></div>${tips}`, "#fff", "#0b0b0b");
const scrim = abs("inset:0;background:rgba(0,0,0,.32);z-index:10", "");
// Android „Споделяне“ (Pixel): хора + приложения
const shareSheet = (preview, ringApp = "Viber") => {
  const people = [["М", "Мария Петрова", 0], ["И", "Иван", 1], ["Е", "Елена", 2], ["П", "Петър", 3]];
  const apps = [["viber", "Viber"], ["messenger", "Messenger"], ["whatsapp", "WhatsApp"], ["messages", "Съобщения"], ["gmail", "Gmail"]];
  return abs("left:0;right:0;bottom:0;background:#f3f6fc;border-radius:28px 28px 0 0;z-index:20;padding:10px 0 12px;box-shadow:0 -4px 24px rgba(0,0,0,.3)",
    `<div style="width:36px;height:4px;border-radius:2px;background:#c4c7c5;margin:0 auto 12px"></div>${preview}
     <div style="padding:0 20px 8px;font-size:13px;color:#5f6368">Хора</div>
     <div style="display:flex;gap:6px;padding:0 12px 14px">${people.map(([l, n, c]) => `<div style="width:86px;text-align:center;font-size:12.5px;color:#1f1f1f"><div style="display:flex;justify-content:center;position:relative;width:56px;margin:0 auto 6px">${gAv(l, c, 56)}<div style="position:absolute;right:-4px;bottom:-4px;width:22px;height:22px;border-radius:50%;background:#7360F2;border:2px solid #f3f6fc;display:flex;align-items:center;justify-content:center">${appIcon("viber", { size: 14, label: false })}</div></div>${n}</div>`).join("")}</div>
     <div style="padding:0 20px 8px;font-size:13px;color:#5f6368">Приложения</div>
     <div style="display:flex;gap:4px;padding:0 10px 10px">${apps.map(([n, l]) => `<div class="${ringed(l === ringApp)}" style="width:74px;padding:6px 0;border-radius:16px;text-align:center;font-size:12px;color:#1f1f1f">${appIcon(n, { size: 52, label: false })}<div style="margin-top:6px">${l}</div></div>`).join("")}</div>`);
};

S["my-location"] = (() => {
  const mp = osm(17, V17.cx, V17.cy, 390, 698);
  const [x, y] = mp.pt(73912.74, 48476.23);
  return mapScreen(`${mp.html}${blueDot(x, y)}`, `${mapsTop()}${myLocFab(1)}${OSM_CR("left:6px;bottom:68px")}${mapsNav}`,
    tip("Докоснете кръгчето долу вдясно — картата се центрира върху синята точка (това сте Вие)", "left:14px;top:508px;width:220px;z-index:40", { arrow: "r", at: "54%" }));
})();

S["share-location"] = (() => {
  const mp = osm(17, V17.cx, V17.cy, 390, 698);
  const [x, y] = mp.pt(73912.74, 48476.0);
  const preview = `<div style="display:flex;gap:12px;padding:0 20px 14px;align-items:center"><div style="width:56px;height:56px;border-radius:12px;overflow:hidden;position:relative;flex-shrink:0">${osm(17, 73912.7, 48476.3, 56, 56, .5).html}${abs("left:20px;top:20px;width:16px;height:16px;border-radius:50%;background:#4285f4;border:2.5px solid #fff", "")}</div><div style="min-width:0"><div style="font-size:16px;color:#1f1f1f;font-weight:500">Моето местоположение</div><div style="font-size:13px;color:#5f6368">maps.app.example/bobov-dol</div></div></div>`;
  return mapScreen(`${mp.html}${blueDot(x, y - 110)}${scrim}`, `${OSM_CR("left:6px;top:6px")}${shareSheet(preview)}`,
    tip("„Сподели местоположение“ → изберете Viber или Messenger и близкия човек → „Изпрати“", "left:50%;top:196px;transform:translateX(-50%);width:290px;z-index:40"));
})();

S["transit"] = (() => {
  // z12 плочки, мащаб .62: Бобов дол (2309.77,1514.88) → Дупница (2311.02,1516.41); пътят е по OSM (през Мламолово и Дяково)
  const w = 390, h = 292, sc = 0.62;
  const mp = osm(12, 2310.46, 1515.64, w, h, sc);
  const pts = [[295, 338], [330, 400], [368, 470], [405, 492], [450, 485], [520, 478], [590, 500], [655, 525], [690, 580], [698, 640], [720, 720], [765, 780], [815, 830], [828, 880], [795, 915], [775, 925]]
    .map(([px, py]) => mp.pt(2309 + px / 384, 1514 + py / 384));
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
  const path = "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" L");
  const pin = (x, y, c, ic) => abs(`left:${x - 13}px;top:${y - 13}px;z-index:6`, `<div style="width:26px;height:26px;border-radius:50%;background:${c};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center">${ic}</div>`);
  const tabs = [["directions_car", 0], ["directions_transit", 1], ["directions_walk", 0], ["local_taxi", 0], ["directions_bike", 0]].map(([i, a]) => `<div class="${ringed(a)}" style="width:62px;height:40px;border-radius:20px;display:flex;align-items:center;justify-content:center;background:${a ? "#d3e3fd" : "transparent"}">${m(i, 24, a ? "#001d35" : "#5f6368", a)}</div>`).join("");
  const card = (t1, t2, d, first) => `<div style="display:flex;gap:12px;padding:11px 16px;border-bottom:1px solid #e8eaed;${first ? "background:#f8fbff" : ""}"><div style="width:36px;height:36px;border-radius:10px;background:#1a73e8;display:flex;align-items:center;justify-content:center;flex-shrink:0">${m("directions_bus", 22, "#fff", 1)}</div><div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:17px;color:#1f1f1f;font-weight:500">${t1}</span><span style="font-size:17px;color:#188038;font-weight:500">${d}</span></div><div style="font-size:13px;color:#5f6368;margin-top:2px">${t2}</div></div></div>`;
  return phone(`<div style="height:660px;display:flex;flex-direction:column;background:#fff;position:relative;overflow:hidden">
    <div style="background:#fff;padding:8px 12px 0;flex-shrink:0"><div style="display:flex;align-items:center;gap:8px"><div style="width:40px;display:flex;justify-content:center">${m("arrow_back", 24, "#444746")}</div><div style="flex:1"><div style="height:40px;border-radius:10px;background:#f1f3f4;display:flex;align-items:center;padding:0 12px;gap:10px;font-size:15px;color:#1a73e8">${m("my_location", 18, "#1a73e8")}Вашето местоположение</div><div style="height:40px;border-radius:10px;background:#f1f3f4;display:flex;align-items:center;padding:0 12px;gap:10px;font-size:15px;color:#1f1f1f;margin-top:6px">${m("location_on", 18, "#d93025", 1)}Дупница</div></div>${m("swap_vert", 24, "#444746")}</div>
      <div style="display:flex;justify-content:center;margin:8px 0 6px;gap:2px">${tabs}</div></div>
    <div style="height:${h}px;position:relative;flex-shrink:0;background:${MAPBG}">${mp.html}<svg style="position:absolute;inset:0;z-index:4" width="${w}" height="${h}"><path d="${path}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="#1a73e8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 9"/></svg>
      ${pin(x1, y1, "#fff", `<span style="width:10px;height:10px;border-radius:50%;background:#4285f4"></span>`)}${pin(x2, y2, "#d93025", m("circle", 8, "#fff", 1))}${OSM_CR("left:6px;bottom:6px")}</div>
    <div style="flex:1;overflow:hidden;background:#fff"><div style="padding:8px 16px 2px;font-size:13px;color:#5f6368">Тръгване сега · днес</div>
      ${card("14:20 – 14:56", "Автобус · Автогара Бобов дол → Автогара Дупница", "36 мин", 1)}${card("15:10 – 15:46", "Автобус · Автогара Бобов дол → Автогара Дупница", "36 мин", 0)}${card("16:00 – 16:38", "Автобус · Автогара Бобов дол → Автогара Дупница", "38 мин", 0)}</div></div>${tip("Иконата на автобуса — маршрути и часове. Изберете най-подходящия", "left:18px;top:352px;width:230px;z-index:40")}`, "#fff", "#0b0b0b");
})();

// ═════════════════════════ ВСЕКИДНЕВИЕ ═════════════════════════
S["notes"] = (() => {
  const grid = `<div style="columns:2;column-gap:10px;padding:4px 12px;flex:1;overflow:hidden">
    ${keepCard("", "Купи хляб и мляко<br>Обади се на лекаря<br>Плати тока до петък", "#fff475")}
    ${keepCard("Лекарства", "Сутрин: 1 таблетка след закуска<br>Вечер: капки за очи")}
    ${keepCard("Телефони", "Доктор Иванова<br>0888 123 456<br>Аптека „Здраве“")}
    ${keepCard("Пазар", ck("хляб", 1) + ck("сирене") + ck("домати"), "#ccff90")}
    ${keepCard("Рожден ден", "Мария — 14 ноември<br>Да купя цветя", "#aecbfa")}</div>`;
  return scr(`<div style="padding:8px 12px 6px;flex-shrink:0"><div style="height:50px;border-radius:25px;background:#f1f3f4;display:flex;align-items:center;padding:0 8px 0 18px;gap:14px;box-shadow:0 1px 2px rgba(0,0,0,.12)">${m("menu", 24, "#5f6368")}<span style="flex:1;font-size:16px;color:#5f6368">Търсене в бележките</span>${m("grid_view", 22, "#5f6368")}<div style="width:32px;height:32px;border-radius:50%;background:#188038;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:14px">И</div></div></div>
    ${grid}<div style="height:56px;background:#fff;display:flex;align-items:center;padding:0 16px;gap:26px;flex-shrink:0;box-shadow:0 -1px 4px rgba(0,0,0,.12)">${m("check_box", 24, "#5f6368")}${m("brush", 24, "#5f6368")}${m("mic", 24, "#5f6368")}${m("image", 24, "#5f6368")}</div>${abs("right:16px;bottom:30px;z-index:10", `<div class="ring" style="width:60px;height:60px;border-radius:18px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,.3)"><svg width="30" height="30" viewBox="0 0 24 24"><path d="M11 3h2v8h8v2h-8v8h-2v-8H3v-2h8z" fill="#fbbc04"/></svg></div>`)}`,
    tip("Натиснете „+“ за нова бележка и пишете (или диктувайте с микрофона)", "left:12px;top:480px;width:230px;z-index:40", { arrow: "r", at: "60%" }), "#fff");
})();

S["calendar-event"] = (() => {
  const row = (ic, t, sub, o = {}) => `<div style="display:flex;align-items:center;gap:20px;padding:0 20px;height:${o.h || 56}px;${o.border ? "border-bottom:1px solid #e3e3e3;" : ""}">${m(ic, 24, "#444746")}<div style="flex:1"><div style="font-size:16px;color:#1f1f1f">${t}</div>${sub ? `<div style="font-size:13px;color:#5f6368">${sub}</div>` : ""}</div>${o.right || ""}</div>`;
  return scr(`<div style="display:flex;align-items:center;padding:8px 14px 8px 10px;flex-shrink:0"><div style="width:44px;display:flex;justify-content:center">${m("close", 26, "#444746")}</div><div style="flex:1"></div><div class="ring" style="height:40px;padding:0 24px;border-radius:20px;background:#0b57d0;color:#fff;font-size:15px;font-weight:500;display:flex;align-items:center">Запази</div></div>
    <div style="padding:6px 20px 8px 64px;font-size:26px;color:#1f1f1f;border-bottom:1px solid #e3e3e3;height:62px;display:flex;align-items:center">Преглед при лекаря</div>
    <div style="display:flex;gap:8px;padding:12px 20px 12px 64px;flex-shrink:0">${["Събитие", "Задача", "Напомняне"].map((t, i) => `<div style="height:32px;border-radius:16px;padding:0 14px;display:flex;align-items:center;font-size:14px;${i === 0 ? "background:#d3e3fd;color:#001d35;font-weight:500" : "border:1px solid #c4c7c5;color:#444746"}">${t}</div>`).join("")}</div>
    ${row("schedule", "Цял ден", "", { right: `<span class="tg"><i></i></span>`, border: 0 })}
    <div style="display:flex;align-items:center;gap:20px;padding:0 20px;height:72px"><span style="width:24px"></span><div style="flex:1"><div style="font-size:16px;color:#1f1f1f;height:34px;display:flex;align-items:center">пн, 2 ноември 2026</div><div style="font-size:16px;color:#1f1f1f;height:34px;display:flex;align-items:center">10:30 ч.</div></div><div style="text-align:right"><div style="height:34px"></div><div style="font-size:16px;color:#1f1f1f;height:34px;display:flex;align-items:center">11:00 ч.</div></div></div>
    ${row("public", "Часова зона: Източноевропейско време", "", { border: 1 })}
    ${row("notifications", "30 минути преди", "Известие", { border: 0 })}${row("add", "Добавяне на известие", "", {})}
    ${row("location_on", "Добавяне на местоположение", "", {})}${row("notes", "Добавяне на описание", "", {})}`,
    tip("Напишете какво е събитието, изберете дата и час → „Запази“", "left:50%;top:96px;transform:translateX(-50%);width:290px;z-index:40", { arrow: "d", at: "80%" })); 
})();
S["calendar-event"] = S["calendar-event"].replace("left:50%;top:96px;transform:translateX(-50%);width:290px", "left:50%;top:540px;transform:translateX(-50%);width:290px").replace(/ ar ar-d/, "").replace("--ax:80%;","");

// Часовник (Pixel, тъмна тема)
const CLK = { bg: "#131314", fg: "#e3e3e3", pill: "#2d2f31" };
const clockNav = (active) => `<div style="background:#1e1f20;height:70px;display:flex;justify-content:space-around;align-items:center;flex-shrink:0;font-size:11.5px;color:#c4c7c5">${[["alarm", "Будилник"], ["schedule", "Часовник"], ["hourglass_empty", "Таймер"], ["timer", "Хронометър"], ["bedtime", "Заспиване"]].map(([i, t]) => { const a = t === active; return `<div style="text-align:center;width:70px"><div style="width:58px;height:30px;border-radius:15px;background:${a ? "#004a77" : "none"};display:flex;align-items:center;justify-content:center;margin:0 auto 3px">${m(i, 24, a ? "#c2e7ff" : "#c4c7c5", a)}</div><span style="color:${a ? "#fff" : "#c4c7c5"}">${t}</span></div>`; }).join("")}</div>`;
S["timer"] = (() => {
  const key = (t) => `<div style="height:62px;border-radius:31px;background:${CLK.pill};display:flex;align-items:center;justify-content:center;font-size:28px;color:#e3e3e3">${t}</div>`;
  return scr(`<div style="height:196px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:20px;color:#e3e3e3;gap:8px;font-size:58px;font-weight:300;flex-shrink:0"><span style="color:#8e918f">00<span style="font-size:22px">ч</span></span><span style="color:#a8c7fa">10<span style="font-size:22px">м</span></span><span style="color:#8e918f">00<span style="font-size:22px">с</span></span></div>
    <div style="flex:1;padding:0 26px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px 18px;align-content:start;position:relative">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", m("backspace", 28, "#e3e3e3")].map(key).join("")}</div>
    ${abs("left:0;right:0;bottom:84px;display:flex;justify-content:center", `<div class="ring" style="height:60px;border-radius:30px;padding:0 30px;background:#a8c7fa;color:#062e6f;font-size:19px;font-weight:500;display:flex;align-items:center;gap:10px">${m("play_arrow", 28, "#062e6f", 1)}Старт</div>`)}${clockNav("Таймер")}`,
    tip("Нагласете минутите → „Старт“. Когато звънне, ястието е готово", "left:50%;top:166px;transform:translateX(-50%);width:270px;z-index:40", { arrow: "u", at: "50%" }), CLK.bg, "#e3e3e3");
})();
S["timer"] = S["timer"].replace("top:166px", "top:36px").replace('class="tip ar ar-u"', 'class="tip ar ar-d"');

S["stopwatch"] = (() => {
  const lap = (n, d, t) => `<div style="display:flex;justify-content:space-between;padding:12px 26px;border-bottom:1px solid #2d2f31;font-size:17px;color:#e3e3e3"><span style="color:#8e918f">Кръг ${n}</span><span>+${d}</span><span>${t}</span></div>`;
  return scr(`<div style="height:210px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><div style="font-size:70px;font-weight:300;color:#e3e3e3;letter-spacing:-1px;font-variant-numeric:tabular-nums">00:42<span style="font-size:42px;color:#a8c7fa">,80</span></div></div>
    <div style="flex:1;overflow:hidden;border-top:1px solid #2d2f31">${lap(2, "00:23,41", "00:42,80")}${lap(1, "00:19,39", "00:19,39")}</div>
    ${abs("left:0;right:0;bottom:86px;display:flex;justify-content:center;align-items:center;gap:12px;z-index:5", `<div class="ring" style="height:52px;border-radius:26px;padding:0 14px;background:${CLK.pill};color:#e3e3e3;font-size:15px;display:flex;align-items:center;gap:6px">${m("refresh", 22, "#e3e3e3")}Нулиране</div><div class="ring" style="height:60px;border-radius:30px;padding:0 24px;background:#f2b8b5;color:#601410;font-size:19px;font-weight:500;display:flex;align-items:center;gap:10px">${m("pause", 28, "#601410", 1)}Стоп</div><div style="width:52px;height:52px;border-radius:26px;background:${CLK.pill};display:flex;align-items:center;justify-content:center">${m("flag", 24, "#e3e3e3")}</div>`)}${clockNav("Хронометър")}`,
    tip("„Старт“ започва да мери, „Стоп“ спира, „Нулиране“ връща на нула", "left:50%;top:230px;transform:translateX(-50%);width:290px;z-index:40", { arrow: "u", at: "50%" }).replace("top:230px", "top:222px"), CLK.bg, "#e3e3e3");
})();
S["stopwatch"] = S["stopwatch"].replace("top:222px", "top:394px").replace('class="tip ar ar-u"', 'class="tip ar ar-d"');

S["translate-word"] = (() => {
  return scr(`<div style="display:flex;align-items:center;padding:8px 14px 8px 12px;gap:12px;flex-shrink:0"><div style="width:30px;height:30px">${appIcon("translate", { size: 30, label: false })}</div><div style="flex:1;font-size:21px;color:#1f1f1f">Преводач</div>${m("history", 24, "#444746")}${m("more_vert", 24, "#444746")}</div>
    <div style="display:flex;align-items:center;height:56px;margin:0 8px;border-radius:28px;background:#f0f4f9;flex-shrink:0"><div style="flex:1;text-align:center;font-size:16px;color:#0b57d0;font-weight:500">Английски</div>${m("swap_horiz", 24, "#444746")}<div style="flex:1;text-align:center;font-size:16px;color:#0b57d0;font-weight:500">Български</div></div>
    <div style="margin:12px 12px 0;border-radius:22px;background:#fff;border:1px solid #dadce0;padding:14px 16px;flex-shrink:0"><div style="display:flex;justify-content:space-between;color:#5f6368;font-size:13px">Английски${m("close", 20, "#5f6368")}</div><div style="font-size:30px;color:#1f1f1f;margin:6px 0 8px;line-height:1.2">Good morning</div><div style="display:flex;gap:14px;color:#5f6368">${m("volume_up", 22, "#5f6368")}${m("mic", 22, "#5f6368")}</div></div>
    <div style="margin:10px 12px 0;border-radius:22px;background:#e8f0fe;padding:14px 16px;flex-shrink:0"><div style="color:#5f6368;font-size:13px">Български</div><div style="font-size:30px;color:#0b57d0;margin:6px 0 8px;line-height:1.2">Добро утро</div><div style="display:flex;gap:16px;align-items:center" class="ringx">${m("volume_up", 22, "#444746")}${m("content_copy", 22, "#444746")}${m("star", 22, "#444746")}${m("share", 22, "#444746")}<span class="ring ringr" style="margin-left:auto;display:flex;padding:3px">${m("mic", 22, "#0b57d0", 1)}</span></div></div>
    <div style="flex:1"></div>${keyboard()}`,
    tip("Изберете езиците, напишете или продиктувайте думата — преводът се показва веднага", "left:50%;top:228px;transform:translateX(-50%);width:290px;z-index:40", { arrow: "u", at: "50%" }));
})();
S["translate-word"] = S["translate-word"].replace("top:228px", "top:446px");

S["ring-phone"] = (() => {
  return scr(`<div style="display:flex;align-items:center;padding:8px 14px 8px 12px;gap:12px;flex-shrink:0">${m("arrow_back", 24, "#444746")}<div style="flex:1;font-size:21px;color:#1f1f1f">Намери устройството</div>${m("more_vert", 24, "#444746")}</div>
    <div style="height:196px;position:relative;flex-shrink:0;background:${MAPBG}">${osm(17, 73912.7, 48476.4, 390, 196).html}${abs("left:178px;top:70px;z-index:5", `<div style="width:44px;height:44px;border-radius:50%;background:#1a73e8;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4)">${m("smartphone", 24, "#fff", 1)}</div>`)}${abs("left:150px;top:42px;width:100px;height:100px;border-radius:50%;border:2px solid rgba(26,115,232,.45);z-index:4", "")}${OSM_CR("left:6px;bottom:6px")}</div>
    <div style="padding:18px 20px 8px;flex-shrink:0"><div style="font-size:24px;color:#1f1f1f">Моят телефон</div><div style="font-size:14px;color:#5f6368;margin-top:4px;line-height:1.4">Последно видян сега · Вкъщи<br>Батерия 64% · Wi-Fi „Дом“</div></div>
    <div style="display:flex;gap:10px;padding:10px 16px;flex-shrink:0">${[["volume_up", "Звънни", 1], ["lock", "Заключи", 0], ["delete_forever", "Изтрий", 0]].map(([i, t, h]) => `<div class="${ringed(h)}" style="flex:1;height:84px;border-radius:20px;background:${h ? "#d3e3fd" : "#f0f4f9"};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:14.5px;color:#1f1f1f;font-weight:${h ? 500 : 400}">${m(i, 28, h ? "#001d35" : "#444746", h)}${t}</div>`).join("")}</div>
    <div style="margin:6px 16px;border-radius:18px;background:#e8f5e9;padding:14px 16px;display:flex;align-items:center;gap:14px;color:#0a3d1f;font-size:14.5px;line-height:1.35">${m("notifications_active", 26, "#188038", 1)}<span>Телефонът звъни на пълна сила до 5 минути, дори да е на тих режим.</span></div>
    <div style="flex:1"></div>`,
    tip("Натиснете „Звънни“ — телефонът издава звук, за да го намерите", "left:50%;top:372px;transform:translateX(-50%);width:270px;z-index:40", { arrow: "u", at: "20%" }));
})();
S["ring-phone"] = S["ring-phone"].replace("left:50%;top:372px;transform:translateX(-50%);width:270px", "left:50%;top:536px;transform:translateX(-50%);width:290px").replace(" ar ar-u","");

S["night-mode"] = (() => {
  const tile = (ic, t, sub, on, ring) => `<div class="${ringed(ring)}" style="height:68px;border-radius:34px;background:${on ? "#a8c7fa" : "#303134"};display:flex;align-items:center;gap:12px;padding:0 14px 0 16px;color:${on ? "#062e6f" : "#e3e3e3"}">${m(ic, 24, on ? "#062e6f" : "#e3e3e3", on)}<div style="min-width:0"><div style="font-size:15.5px;font-weight:500;white-space:nowrap">${t}</div><div style="font-size:12.5px;opacity:.85;white-space:nowrap">${sub}</div></div></div>`;
  return scr(`<div style="padding:16px 22px 6px;color:#e3e3e3;flex-shrink:0"><div style="font-size:44px;font-weight:300;line-height:1">21:14</div><div style="font-size:15px;margin-top:4px;color:#c4c7c5">пет, 30 октомври</div></div>
    <div style="padding:14px 18px 6px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;flex-shrink:0">
      ${tile("wifi", "Интернет", "Дом", 1, 0)}${tile("bluetooth", "Bluetooth", "Изключен", 0, 0)}${tile("do_not_disturb_on", "Не безпокойте", "Изключено", 0, 0)}${tile("flashlight_on", "Фенерче", "Изключено", 0, 0)}${tile("screen_rotation", "Авт. завъртане", "Изключено", 0, 0)}${tile("bedtime", "Нощен режим", "Включено", 1, 1)}${tile("battery_saver", "Батерия", "Изключено", 0, 0)}${tile("dark_mode", "Тъмна тема", "Изключено", 0, 0)}</div>
    <div style="padding:14px 22px;display:flex;align-items:center;gap:14px;flex-shrink:0">${m("brightness_medium", 24, "#c4c7c5")}<div style="flex:1;height:8px;border-radius:4px;background:#444746;position:relative"><div style="width:38%;height:8px;border-radius:4px;background:#a8c7fa"></div><div style="position:absolute;left:38%;top:-8px;width:6px;height:24px;border-radius:3px;background:#a8c7fa"></div></div></div>
    <div style="flex:1;padding:6px 30px;display:flex;justify-content:center;gap:6px;align-items:flex-start">${[1, 0].map((a) => `<span style="width:7px;height:7px;border-radius:50%;background:${a ? "#e3e3e3" : "#5f6368"}"></span>`).join("")}</div>`,
    tip("Плъзнете надолу от горния край → „Нощен режим“ — вечер екранът е по-мек за очите", "left:50%;top:456px;transform:translateX(-50%);width:290px;z-index:40", { arrow: "u", at: "28%" }), "#1f1f1f", "#e3e3e3", "#1f1f1f");
})();
S["night-mode"] = S["night-mode"].replace("left:50%;top:456px;transform:translateX(-50%);width:290px", "left:50%;top:470px;transform:translateX(-50%);width:300px").replace(" ar ar-u","");

S["shopping-list"] = (() => {
  const it = (t, on) => `<div style="display:flex;align-items:center;gap:16px;padding:0 18px;height:46px">${m(on ? "check_box" : "check_box_outline_blank", 24, "#5f6368")}<span style="font-size:17px;color:${on ? "#5f6368" : "#202124"};${on ? "text-decoration:line-through" : ""}">${t}</span></div>`;
  return scr(`<div style="display:flex;align-items:center;padding:8px 8px 8px 8px;flex-shrink:0"><div style="width:44px;display:flex;justify-content:center">${m("arrow_back", 24, "#5f6368")}</div><div style="flex:1"></div>${m("push_pin", 24, "#5f6368")}<span style="width:14px"></span>${m("add_alert", 24, "#5f6368")}<span style="width:14px"></span>${m("archive", 24, "#5f6368")}<span style="width:8px"></span></div>
    <div style="padding:8px 20px 8px;font-size:23px;color:#202124;font-weight:500">Пазар</div>
    ${it("Домати", 0)}${it("Сирене", 0)}${it("Яйца", 0)}${it("Кафе", 0)}
    <div style="display:flex;align-items:center;gap:16px;padding:0 18px;height:46px">${m("add", 24, "#5f6368")}<span style="font-size:17px;color:#5f6368">Елемент от списъка</span></div>
    <div style="display:flex;align-items:center;gap:12px;padding:6px 18px;height:46px;color:#5f6368;font-size:15px;border-top:1px solid #e3e3e3;margin-top:6px">${m("expand_more", 24, "#5f6368")}2 отметнати елемента</div>
    ${it("Хляб", 1)}${it("Мляко", 1)}
    <div style="flex:1"></div><div style="height:50px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;color:#5f6368;font-size:12.5px;border-top:1px solid #eee">${m("add_box", 24, "#5f6368")}<span>Редактирано днес, 18:02</span>${m("more_vert", 24, "#5f6368")}</div>`,
    tip("Пишете продуктите един по един. Чукнете кутийката, щом купите", "left:50%;top:326px;transform:translateX(-50%);width:270px;z-index:40", { arrow: "u", at: "20%" }));
})();
S["shopping-list"] = S["shopping-list"].replace("left:50%;top:326px;transform:translateX(-50%);width:270px", "left:50%;top:520px;transform:translateX(-50%);width:290px").replace(" ar ar-u","");

// ═════════════════════════ БЕЗОПАСНОСТ / ПАРИ ═════════════════════════
S["find-device"] = (() => {
  const mp = osm(17, V17.cx, V17.cy - 0.1, 390, 698);
  const [x, y] = mp.pt(73912.8, 48476.05);
  const sheet = abs("left:0;right:0;bottom:0;background:#fff;border-radius:28px 28px 0 0;z-index:20;padding:10px 0 14px;box-shadow:0 -3px 18px rgba(0,0,0,.28)",
    `<div style="width:36px;height:4px;border-radius:2px;background:#c4c7c5;margin:0 auto 12px"></div><div style="display:flex;align-items:center;gap:14px;padding:0 20px 14px"><div style="width:46px;height:46px;border-radius:50%;background:#d3e3fd;display:flex;align-items:center;justify-content:center">${m("smartphone", 26, "#0b57d0", 1)}</div><div style="flex:1"><div style="font-size:19px;color:#1f1f1f">Моят телефон</div><div style="font-size:13px;color:#5f6368;margin-top:2px">Вкъщи · видян преди 5 мин · батерия 64%</div></div></div>
     <div style="display:flex;gap:10px;padding:0 16px 6px">${[["volume_up", "Звънни", 1], ["lock", "Заключи", 1], ["delete_forever", "Изтрий", 0]].map(([i, t, h]) => `<div class="${ringed(h)}" style="flex:1;height:76px;border-radius:18px;background:${h ? "#d3e3fd" : "#f0f4f9"};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-size:14px;color:#1f1f1f">${m(i, 26, h ? "#001d35" : "#444746", h)}${t}</div>`).join("")}</div>`);
  const layer = `${mp.html}${abs(`left:${x - 54}px;top:${y - 54}px;width:108px;height:108px;border-radius:50%;background:rgba(26,115,232,.14);border:1.5px solid rgba(26,115,232,.5);z-index:4`, "")}${abs(`left:${x - 24}px;top:${y - 24}px;z-index:6`, `<div style="width:48px;height:48px;border-radius:50%;background:#1a73e8;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.45)">${m("smartphone", 26, "#fff", 1)}</div>`)}`;
  const top = abs("left:10px;right:10px;top:10px;z-index:10", `<div style="height:50px;border-radius:25px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;padding:0 16px;gap:12px">${m("arrow_back", 24, "#444746")}<span style="flex:1;font-size:17px;color:#1f1f1f">Намери устройството</span>${m("more_vert", 24, "#444746")}</div>`);
  return mapScreen(layer, `${top}${OSM_CR("left:6px;top:68px")}${sheet}`, tip("От друг телефон или компютър: „Намери устройството“ → „Звънни“ или „Заключи“", "left:50%;top:84px;transform:translateX(-50%);width:290px;z-index:40"));
})();

S["2fa"] = (() => {
  const body = `<div style="flex:1;background:#fff;padding:96px 22px 0;overflow:hidden"><div style="font-size:30px;letter-spacing:-1px;font-weight:500;color:#4285f4;font-family:'Roboto'"><span style="color:#4285f4">G</span><span style="color:#ea4335">o</span><span style="color:#fbbc04">o</span><span style="color:#4285f4">g</span><span style="color:#34a853">l</span><span style="color:#ea4335">e</span></div>
    <div style="font-size:26px;color:#1f1f1f;margin-top:16px;line-height:1.2">Двуетапна проверка</div>
    <div style="font-size:15px;color:#444746;margin-top:10px;line-height:1.45">Google изпрати SMS с код на телефона Ви •••&nbsp;•••&nbsp;456. Въведете го, за да потвърдите, че това сте Вие.</div>
    <div class="ring" style="margin-top:22px;height:58px;border:2px solid #0b57d0;border-radius:8px;display:flex;align-items:center;padding:0 14px;font-size:22px;color:#1f1f1f;letter-spacing:2px;position:relative"><span style="position:absolute;left:10px;top:-10px;background:#fff;padding:0 5px;font-size:12.5px;color:#0b57d0;letter-spacing:0">Въведете кода</span><span style="color:#5f6368;margin-right:8px">G-</span>482913</div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:18px;font-size:14.5px;color:#1f1f1f">${m("check_box", 24, "#0b57d0", 1)}Не питай отново на това устройство</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:26px"><span style="color:#0b57d0;font-size:14.5px;font-weight:500">Изпрати нов код</span><div style="height:42px;padding:0 26px;border-radius:21px;background:#0b57d0;color:#fff;font-size:15px;font-weight:500;display:flex;align-items:center">Напред</div></div></div>`;
  const notif = abs("left:8px;right:8px;top:62px;z-index:30;background:#f3f6fc;border-radius:22px;padding:12px 16px;box-shadow:0 4px 18px rgba(0,0,0,.28);display:flex;gap:12px;align-items:center", `<div style="width:28px;height:28px">${appIcon("messages", { size: 28, label: false })}</div><div style="flex:1;min-width:0"><div style="font-size:12.5px;color:#5f6368">Съобщения · 0888 000 111</div><div style="font-size:14.5px;color:#1f1f1f;margin-top:1px">G-482913 е Вашият код за потвърждение в Google. Не го споделяйте.</div></div>`);
  return scr(`${chromeBar("accounts.google.com", { mic: false })}${body}${notif}`,
    tip("Освен паролата, въведете кода от SMS. Никому не го казвайте", "left:50%;top:530px;transform:translateX(-50%);width:300px;z-index:40"));
})();


S["fake-prize"] = (() => {
  const page = `<div style="flex:1;background:#2b2b3a;position:relative;overflow:hidden"><div style="position:absolute;inset:0;background:repeating-linear-gradient(135deg,#2b2b3a 0 18px,#303045 18px 36px)"></div>
    <div style="position:absolute;left:16px;right:16px;top:46px;background:#fff;border-radius:16px;padding:24px 20px 20px;text-align:center;box-shadow:0 12px 36px rgba(0,0,0,.5)">
      <div style="width:70px;height:70px;border-radius:50%;background:#fff3e0;margin:0 auto 10px;display:flex;align-items:center;justify-content:center">${m("redeem", 42, "#e8710a", 1)}</div>
      <div style="font-size:24px;font-weight:700;color:#c62828;line-height:1.2">Поздравления! Вие бяхте избран!</div>
      <div style="font-size:15px;color:#3c4043;margin:12px 0 6px;line-height:1.4">Вие сте посетител номер 1 000 000 и печелите нов смартфон. Остават още <b style="color:#c62828">04:59</b> минути.</div>
      <div style="font-size:13px;color:#5f6368;margin-bottom:16px">За да получите наградата, въведете данните на картата си и платете 1,99 € за доставка.</div>
      <div style="background:#e8710a;color:#fff;font-weight:700;font-size:17px;padding:14px;border-radius:10px">ВЗЕМИ НАГРАДАТА</div></div></div>`;
  return scr(`${chromeBar("pechalba-nagradi.example", { insecure: true, ringTabs: 1, tabs: 4 })}${page}`,
    tip("Фалшива печалба — измама. Затворете раздела и не плащайте нищо, не давайте данни за карта", "left:50%;top:420px;transform:translateX(-50%);width:300px;z-index:40", { arrow: "d", at: "88%" }));
})();
S["fake-prize"] = S["fake-prize"].replace("left:50%;top:420px;transform:translateX(-50%);width:300px", "left:50%;top:476px;transform:translateX(-50%);width:300px").replace(" ar ar-d","");

S["bill-barcode"] = (() => {
  return scr(`<div style="background:#1b5e4b;color:#fff;padding:12px 16px 14px;flex-shrink:0;display:flex;align-items:center;gap:14px">${m("arrow_back", 24, "#fff")}<div style="flex:1;font-size:19px;font-weight:500">Сметка за ток</div>${m("more_vert", 24, "#fff")}</div>
    <div style="flex:1;background:#f2f5f4;padding:14px;overflow:hidden"><div style="background:#fff;border-radius:16px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.12)">
      <div style="display:flex;justify-content:space-between;font-size:14px;color:#5f6368"><span>Електроснабдяване</span><span>ноември 2026</span></div>
      <div style="font-size:34px;font-weight:700;color:#1f1f1f;margin:6px 0 2px">24,85 €</div><div style="font-size:14px;color:#5f6368">Платете до 05.11.2026 г.</div>
      <div style="border-top:1px dashed #c4c7c5;margin:14px 0 10px"></div>
      <div style="display:flex;justify-content:space-between;font-size:14px;color:#444746;line-height:1.7"><span>Клиентски номер</span><span style="color:#1f1f1f;font-weight:500">1048 5731 20</span></div>
      <div style="display:flex;justify-content:space-between;font-size:14px;color:#444746;line-height:1.7"><span>Документ №</span><span style="color:#1f1f1f;font-weight:500">0123456789</span></div></div>
      <div class="ring" style="background:#fff;border-radius:16px;margin-top:14px;padding:16px 0 12px;display:flex;flex-direction:column;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,.12)">${barcodeSvg("380012345678", 270, 92)}<div style="font-size:13px;color:#5f6368;margin-top:10px">Покажете баркода на касата</div></div>
      </div>`,
    tip("Покажете баркода на касата — касиерът го сканира и плащате", "left:50%;top:384px;transform:translateX(-50%);width:280px;z-index:40", { arrow: "d", at: "50%" }));
})();
S["bill-barcode"] = S["bill-barcode"].replace("top:384px", "top:430px").replace(" ar ar-d","");

// банково приложение (измислено)
const BNK = { bg: "#0b2a4a", ac: "#1e88e5" };
const bankLogo = `<span style="display:inline-flex;width:30px;height:30px;border-radius:9px;background:#fff;align-items:center;justify-content:center">${m("account_balance", 20, "#0b2a4a", 1)}</span>`;
S["bank-balance"] = (() => {
  const mv = (ic, t, d, v, pos) => `<div style="display:flex;align-items:center;gap:14px;padding:11px 18px"><div style="width:42px;height:42px;border-radius:50%;background:#eef2f7;display:flex;align-items:center;justify-content:center">${m(ic, 22, "#0b2a4a")}</div><div style="flex:1"><div style="font-size:15px;color:#1f1f1f">${t}</div><div style="font-size:12.5px;color:#6b7280">${d}</div></div><div style="font-size:15px;font-weight:500;color:${pos ? "#188038" : "#1f1f1f"}">${v}</div></div>`;
  return scr(`<div style="background:${BNK.bg};color:#fff;padding:12px 18px 70px;flex-shrink:0"><div style="display:flex;align-items:center;gap:10px">${bankLogo}<div style="flex:1;font-size:17px;font-weight:500">Моята банка</div>${m("notifications", 24, "#fff")}${m("settings", 24, "#fff")}</div><div style="font-size:14px;margin-top:20px;opacity:.85">Добър вечер, Иван</div></div>
    <div style="margin:-56px 14px 0;background:#fff;border-radius:18px;padding:16px 18px;box-shadow:0 4px 16px rgba(0,0,0,.18);position:relative;z-index:2;flex-shrink:0"><div style="font-size:13px;color:#6b7280;display:flex;justify-content:space-between">Разплащателна сметка ${m("visibility", 20, "#6b7280")}</div><div class="ring" style="display:inline-block;font-size:34px;font-weight:700;color:#0b2a4a;margin:6px 0 4px;border-radius:8px;padding:0 4px;margin-left:-4px">1 248,30 €</div><div style="font-size:12.5px;color:#6b7280;letter-spacing:.3px">BG00 XXXX 0000 0000 0000 00</div>
      <div style="display:flex;justify-content:space-around;margin-top:16px">${[["north_east", "Превод"], ["receipt_long", "Плащане"], ["credit_card", "Карти"], ["history", "Движения"]].map(([i, t]) => `<div style="text-align:center;font-size:12.5px;color:#1f1f1f"><div style="width:48px;height:48px;border-radius:50%;background:#e3f0fd;display:flex;align-items:center;justify-content:center;margin:0 auto 5px">${m(i, 24, BNK.ac)}</div>${t}</div>`).join("")}</div></div>
    <div style="padding:16px 18px 4px;font-size:15px;font-weight:500;color:#1f1f1f;flex-shrink:0">Последни движения</div>
    <div style="flex:1;overflow:hidden">${mv("local_pharmacy", "Аптека „Здраве“", "29 окт.", "−14,80 €")}${mv("bolt", "Електроснабдяване", "28 окт.", "−24,85 €")}${mv("payments", "Пенсия", "25 окт.", "+612,40 €", 1)}</div>`,
    tip("След вход с код или пръстов отпечатък виждате баланса. Никому не казвайте кода", "left:50%;top:540px;transform:translateX(-50%);width:300px;z-index:40"), "#f6f8fb", "#ffffff", "#f6f8fb", BNK.bg);
})();


S["bank-transfer"] = (() => {
  const fld = (l, v, o = {}) => `<div style="margin:0 16px 12px;border:1.5px solid ${o.focus ? BNK.ac : "#cfd6df"};border-radius:10px;padding:8px 14px;position:relative;background:#fff"><div style="font-size:12px;color:${o.focus ? BNK.ac : "#6b7280"}">${l}</div><div style="font-size:17px;color:#1f1f1f;margin-top:2px;${o.mono ? "letter-spacing:.4px" : ""}">${v}</div></div>`;
  return scr(`<div style="background:${BNK.bg};color:#fff;padding:12px 14px;flex-shrink:0;display:flex;align-items:center;gap:14px">${m("arrow_back", 24, "#fff")}<div style="flex:1;font-size:19px;font-weight:500">Превод</div></div>
    <div style="flex:1;background:#f6f8fb;padding-top:16px;overflow:hidden">
      <div style="margin:0 16px 14px;background:#fff;border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;font-size:14px;color:#6b7280"><div style="flex:1">От сметка<div style="font-size:15px;color:#1f1f1f;margin-top:2px">Разплащателна · 1 248,30 €</div></div>${m("expand_more", 22, "#6b7280")}</div>
      ${fld("Получател", "Мария Петрова")}${fld("IBAN на получателя", "BG00 XXXX 0000 0000 0000 01", { mono: 1 })}${fld("Сума", "50,00 €", { focus: 1 })}${fld("Основание", "Подарък")}
      <div style="margin:4px 16px 12px;display:flex;gap:10px;align-items:flex-start;background:#fff4e5;border-radius:10px;padding:10px 12px;font-size:13px;color:#7a4a00;line-height:1.4">${m("warning", 20, "#e8710a", 1)}<span>Проверете два пъти IBAN и сумата. Не превеждайте пари по молба на непознат.</span></div>
      <div style="padding:6px 16px"><div class="ring" style="height:52px;border-radius:26px;background:${BNK.ac};color:#fff;font-size:17px;font-weight:500;display:flex;align-items:center;justify-content:center">Потвърди превода</div></div></div>`,
    tip("Въведете IBAN и сума → проверете → „Потвърди превода“ (често с код по SMS)", "left:50%;top:560px;transform:translateX(-50%);width:300px;z-index:40"), "#f6f8fb", "#ffffff", "#f6f8fb", BNK.bg);
})();


// ═════════════════════════ ПАЗАРУВАНЕ ═════════════════════════
S["return-item"] = (() => {
  return scr(`<div style="background:#fff;padding:10px 14px;display:flex;align-items:center;gap:14px;flex-shrink:0;border-bottom:1px solid #e5e7eb">${m("arrow_back", 24, "#1f1f1f")}<div style="flex:1;font-size:19px;font-weight:500;color:#1f1f1f">Моите поръчки</div>${m("help", 24, "#1f1f1f")}</div>
    <div style="flex:1;background:#f4f5f7;padding:12px;overflow:hidden"><div style="background:#fff;border-radius:14px;padding:14px">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:#6b7280"><span>Поръчка № 4821937</span><span style="color:#188038;font-weight:500">Доставена 24.10.2026</span></div>
      <div style="display:flex;gap:14px;margin-top:14px;padding-bottom:14px;border-bottom:1px solid #eee"><div style="width:84px;height:84px;border-radius:10px;overflow:hidden;background:#f1f3f4;flex-shrink:0">${ph("kettle", "50% 50%")}</div><div><div style="font-size:16px;font-weight:500;color:#1f1f1f;line-height:1.25">Медна кана за чай 1,5 л</div><div style="font-size:13px;color:#6b7280;margin-top:4px">Количество: 1</div><div style="font-size:17px;font-weight:700;color:#1f1f1f;margin-top:8px">59,90 €</div></div></div>
      <div style="display:flex;gap:10px;align-items:center;font-size:13.5px;color:#444746;margin:12px 0">${m("event_available", 22, "#1a73e8")}<span>Можете да върнете стоката до <b>07.11.2026</b> (14 дни от получаването).</span></div>
      <div class="ring" style="height:48px;border-radius:24px;background:#1a73e8;color:#fff;font-size:16px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px">${m("assignment_return", 22, "#fff")}Заяви връщане</div>
      <div style="height:48px;border-radius:24px;border:1px solid #cfd6df;color:#1a73e8;font-size:16px;font-weight:500;display:flex;align-items:center;justify-content:center;margin-top:10px">Свържи се с магазина</div></div>
      <div style="padding:14px 6px;font-size:13px;color:#6b7280;line-height:1.5">Запазете стоката в добър вид и в оригиналната опаковка. Парите се връщат след получаване на пратката.</div></div>`,
    tip("Отворете поръчката → „Заяви връщане“ → изберете причина и изпратете пратката", "left:50%;top:500px;transform:translateX(-50%);width:290px;z-index:40"), "#fff", "#0b0b0b", "#f4f5f7");
})();

S["compare-prices"] = (() => {
  const offer = (shop, p, dl, tot, best) => `<div class="${ringed(best)}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;${best ? "border-radius:14px;margin:4px 8px;background:#f1faf3;" : "border-bottom:1px solid #eee;"}"><div style="flex:1"><div style="font-size:16px;color:#1f1f1f;font-weight:500">${shop}</div><div style="font-size:13px;color:#5f6368;margin-top:2px">${dl}</div></div><div style="text-align:right"><div style="font-size:18px;font-weight:700;color:${best ? "#188038" : "#1f1f1f"}">${p}</div><div style="font-size:12px;color:#5f6368">общо ${tot}</div></div></div>`;
  return scr(`${chromeBar("google.com/search?q=медна+кана+за+чай", { mic: false })}
    <div style="display:flex;gap:18px;padding:10px 16px 0;border-bottom:1px solid #e3e3e3;font-size:14.5px;color:#5f6368;flex-shrink:0;overflow:hidden;white-space:nowrap"><span style="padding-bottom:10px">Всички</span><span style="padding-bottom:10px">Изображения</span><span style="padding-bottom:8px;color:#0b57d0;font-weight:500;border-bottom:3px solid #0b57d0">Пазаруване</span><span style="padding-bottom:10px">Видеа</span><span style="padding-bottom:10px">Новини</span></div>
    <div style="display:flex;gap:14px;padding:14px 16px;align-items:center;flex-shrink:0"><div style="width:90px;height:90px;border-radius:12px;overflow:hidden;background:#f1f3f4;flex-shrink:0">${ph("kettle")}</div><div><div style="font-size:18px;color:#1f1f1f;font-weight:500;line-height:1.25">Медна кана за чай 1,5 л</div><div style="font-size:13.5px;color:#5f6368;margin-top:4px">★★★★☆ 4,4 · 312 отзива</div><div style="font-size:15px;color:#1f1f1f;margin-top:6px">от <b>54,90 €</b></div></div></div>
    <div style="padding:4px 16px 6px;font-size:13px;color:#5f6368">Къде да купите (3 магазина)</div>
    <div style="flex:1;overflow:hidden">${offer("Уют Дом", "54,90 €", "Доставка 3,99 €", "58,89 €", 1)}${offer("Домашен свят", "59,90 €", "Безплатна доставка", "59,90 €", 0)}${offer("Уют Маркет", "52,00 €", "Доставка 9,90 €", "61,90 €", 0)}</div>`,
    tip("Сравнете цената и доставката заедно — зеленото е най-евтино общо", "left:50%;top:480px;transform:translateX(-50%);width:280px;z-index:40"));
})();

S["receipt-warranty"] = (() => {
  const rc = (l, r) => `<div style="display:flex;justify-content:space-between"><span>${l}</span><span>${r}</span></div>`;
  const receipt = `<div style="width:232px;background:linear-gradient(90deg,#f6f5f1,#fbfaf7 30%,#fbfaf7 70%,#f1f0eb);padding:18px 16px 20px;font-family:'DejaVu Sans Mono','Roboto',monospace;font-size:11.5px;line-height:1.5;color:#2a2a2a;transform:rotate(-2.5deg);box-shadow:0 18px 30px rgba(0,0,0,.45),0 2px 4px rgba(0,0,0,.3);position:relative;clip-path:polygon(0 0,100% 0,100% calc(100% - 7px),96% 100%,92% calc(100% - 7px),88% 100%,84% calc(100% - 7px),80% 100%,76% calc(100% - 7px),72% 100%,68% calc(100% - 7px),64% 100%,60% calc(100% - 7px),56% 100%,52% calc(100% - 7px),48% 100%,44% calc(100% - 7px),40% 100%,36% calc(100% - 7px),32% 100%,28% calc(100% - 7px),24% 100%,20% calc(100% - 7px),16% 100%,12% calc(100% - 7px),8% 100%,4% calc(100% - 7px),0 100%)">
    <div style="text-align:center;font-weight:700;font-size:13px">УЮТ ДОМ ЕООД</div><div style="text-align:center;font-size:10.5px">ЕИК 000000000<br>гр. Дупница, ул. „Примерна“ 1</div><div style="border-top:1px dashed #888;margin:8px 0"></div>
    ${rc("Кана за чай, мед", "")}${rc("1 x 54,90", "54,90 Б")}${rc("Доставка", "3,99 Б")}<div style="border-top:1px dashed #888;margin:8px 0"></div>
    ${rc("<b>ОБЩА СУМА</b>", "<b>58,89 EUR</b>")}${rc("ДДС Б 20%", "9,82")}${rc("Карта", "58,89")}<div style="border-top:1px dashed #888;margin:8px 0"></div>
    <div style="text-align:center;font-size:10.5px">Гаранция: 24 месеца<br>30.10.2026 10:14 · Бон № 0004711</div><div style="display:flex;justify-content:center;margin-top:8px">${qrLike(25, 3)}</div><div style="text-align:center;font-size:10px;margin-top:6px">ФИСКАЛЕН БОН</div></div>`;
  const desk = `<div style="position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 30%,#8a6a4a 0,#6b4f34 55%,#4a3523 100%)"></div><div style="position:absolute;inset:0;background:repeating-linear-gradient(92deg,rgba(0,0,0,.07) 0 2px,rgba(255,255,255,.03) 2px 9px,rgba(0,0,0,.05) 9px 11px);mix-blend-mode:multiply"></div>`;
  return scr(`<div style="flex:1;position:relative;background:#4a3523;display:flex;align-items:center;justify-content:center;overflow:hidden">${desk}<div style="position:relative">${receipt}</div>
      ${abs("left:30px;right:30px;top:60px;bottom:60px;z-index:3;border:2px solid rgba(255,255,255,.0)", "")}</div>
    <div style="background:#000;height:150px;position:relative;flex-shrink:0"><div style="display:flex;justify-content:center;gap:22px;padding-top:12px;color:#fff;font-size:14px"><span style="opacity:.6">Видео</span><span style="font-weight:700;color:#fff">Снимка</span><span style="opacity:.6">Портрет</span></div>
      <div style="display:flex;align-items:center;justify-content:space-around;padding:16px 30px 0"><div style="width:52px;height:52px;border-radius:12px;overflow:hidden;border:2px solid #fff">${ph("buns")}</div><div class="ring" style="width:76px;height:76px;border-radius:50%;background:#fff;border:5px solid #000;box-shadow:0 0 0 3px #fff"></div>${m("flip_camera_android", 32, "#fff")}</div></div>`,
    tip("Снимайте касовата бележка веднага — тя е гаранцията Ви. Пазете и оригинала", "left:50%;top:14px;transform:translateX(-50%);width:290px;z-index:40"), "#000", "#fff");
})();

// ═════════════════════════ ЗАБАВЛЕНИЕ ═════════════════════════
S["radio"] = (() => {
  const st = (n, f, c) => `<div style="display:flex;align-items:center;gap:12px;padding:8px 18px"><div style="width:44px;height:44px;border-radius:8px;background:${c};display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700">${f}</div><div style="flex:1;font-size:15px;color:#e8eaed">${n}</div>${m("favorite", 22, "#9aa0a6", 1)}</div>`;
  return scr(`<div style="display:flex;align-items:center;padding:6px 10px;color:#e8eaed;flex-shrink:0">${m("keyboard_arrow_down", 30, "#e8eaed")}<div style="flex:1;text-align:center;font-size:13px;color:#bdc1c6">Слушате радио</div>${m("more_vert", 24, "#e8eaed")}</div>
    <div style="margin:10px 34px 0;aspect-ratio:1;border-radius:18px;background:linear-gradient(160deg,#ff9a3c,#e0407c 55%,#512da8);position:relative;overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,.5);flex-shrink:0"><div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.07) 0 2px,transparent 2px 10px)"></div><div style="position:absolute;left:20px;top:18px;color:#fff;font-size:20px;font-weight:700;letter-spacing:.3px">Радио<br>Лято</div><div style="position:absolute;left:20px;bottom:14px;color:#fff;font-size:58px;font-weight:700;line-height:1">98,4</div><div style="position:absolute;right:20px;bottom:20px;color:#fff;font-size:20px;font-weight:500">FM</div></div>
    <div style="padding:20px 28px 0;flex-shrink:0"><div style="font-size:22px;color:#fff;font-weight:500">Радио Лято 98,4</div><div style="font-size:14px;color:#9aa0a6;margin-top:3px">На живо · Народна музика</div></div>
    <div style="padding:14px 28px 0;flex-shrink:0"><div style="height:4px;border-radius:2px;background:#5f6368;position:relative"><div style="width:100%;height:4px;border-radius:2px;background:#e0407c"></div></div><div style="display:flex;justify-content:space-between;font-size:12px;color:#9aa0a6;margin-top:6px"><span>На живо</span><span>${m("wifi", 14, "#9aa0a6")} Wi-Fi</span></div></div>
    <div style="display:flex;align-items:center;justify-content:center;gap:34px;padding:8px 0 0;flex-shrink:0">${m("skip_previous", 38, "#e8eaed", 1)}<div class="ring ringr" style="width:72px;height:72px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center">${m("play_arrow", 46, "#202124", 1)}</div>${m("skip_next", 38, "#e8eaed", 1)}</div>
    <div style="flex:1"></div><div style="border-top:1px solid #303134;padding:6px 0 4px">${st("Радио Рила FM", "FM", "#00897b")}</div>`,
    tip("Изберете станция и натиснете големия бутон „Пусни“. Работи през интернет", "left:50%;top:408px;transform:translateX(-50%);width:270px;z-index:40", { arrow: "d", at: "50%" }), "#202124", "#ffffff");
})();
S["radio"] = S["radio"].replace("top:408px", "top:566px").replace(" ar ar-d","");

S["audiobook"] = (() => {
  const cover = `<div style="margin:6px 70px 0;aspect-ratio:2/3;border-radius:8px;background:linear-gradient(170deg,#6b2d1e,#3a160e);position:relative;overflow:hidden;box-shadow:0 14px 34px rgba(0,0,0,.55);flex-shrink:0;max-height:300px"><div style="position:absolute;inset:10px;border:1.5px solid rgba(233,196,106,.7)"></div><div style="position:absolute;left:0;right:0;top:44px;text-align:center;color:#e9c46a;font-family:'Noto Serif','DejaVu Serif',serif;font-size:13px;letter-spacing:3px">ИВАН ВАЗОВ</div><div style="position:absolute;left:0;right:0;top:100px;text-align:center;color:#f4e4bc;font-family:'Noto Serif','DejaVu Serif',serif;font-size:30px;font-weight:700;line-height:1.1">Под<br>игото</div><div style="position:absolute;left:0;right:0;bottom:30px;text-align:center;color:#e9c46a;font-size:11px;letter-spacing:2px">РОМАН</div></div>`;
  return scr(`<div style="display:flex;align-items:center;padding:6px 10px;flex-shrink:0">${m("keyboard_arrow_down", 30, "#e8eaed")}<div style="flex:1;text-align:center;font-size:13px;color:#bdc1c6">Аудиокнига</div>${m("more_vert", 24, "#e8eaed")}</div>${cover}
    <div style="padding:16px 26px 0;text-align:center;flex-shrink:0"><div style="font-size:20px;color:#fff;font-weight:500">Под игото</div><div style="font-size:14px;color:#9aa0a6;margin-top:3px">Иван Вазов · Глава 3</div></div>
    <div style="padding:14px 26px 0;flex-shrink:0"><div style="height:4px;border-radius:2px;background:#5f6368;position:relative"><div style="width:30%;height:4px;border-radius:2px;background:#8ab4f8"></div><div style="position:absolute;left:30%;top:-5px;width:14px;height:14px;border-radius:50%;background:#8ab4f8;margin-left:-7px"></div></div><div style="display:flex;justify-content:space-between;font-size:12px;color:#9aa0a6;margin-top:8px"><span>12:40</span><span>−29:30</span></div></div>
    <div style="display:flex;align-items:center;justify-content:center;gap:24px;padding-top:8px;flex-shrink:0">${m("replay_10", 34, "#e8eaed")}${m("skip_previous", 34, "#e8eaed", 1)}<div class="ring ringr" style="width:68px;height:68px;border-radius:50%;background:#8ab4f8;display:flex;align-items:center;justify-content:center">${m("pause", 40, "#062e6f", 1)}</div>${m("skip_next", 34, "#e8eaed", 1)}${m("forward_30", 34, "#e8eaed")}</div>
    <div style="display:flex;justify-content:space-around;padding:14px 20px 0;color:#bdc1c6;font-size:13px;flex-shrink:0"><span style="border:1px solid #5f6368;border-radius:14px;padding:4px 12px">1,0×</span><span style="display:flex;align-items:center;gap:4px">${m("bedtime", 18, "#bdc1c6")}Таймер за сън</span><span style="display:flex;align-items:center;gap:4px">${m("list", 18, "#bdc1c6")}Глави</span></div>`,
    tip("Изберете книга и натиснете „Пусни“. По-добре със слушалки", "left:50%;top:446px;transform:translateX(-50%);width:260px;z-index:40", { arrow: "d", at: "50%" }), "#202124", "#ffffff");
})();
S["audiobook"] = S["audiobook"].replace("top:446px", "top:604px").replace(" ar ar-d","");

S["tv-online"] = (() => {
  const ch = (n, t, c, on) => `<div class="${ringed(on)}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;${on ? "border-radius:12px;margin:2px 8px;background:#eef2fb;" : "border-bottom:1px solid #eee;"}"><div style="width:68px;height:36px;border-radius:6px;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;letter-spacing:.3px">${n}</div><div style="flex:1"><div style="font-size:15px;color:#1f1f1f;font-weight:500">${t[0]}</div><div style="font-size:12.5px;color:#5f6368">${t[1]}</div></div>${on ? `<span style="font-size:11px;font-weight:700;color:#fff;background:#d93025;border-radius:4px;padding:2px 6px">НА ЖИВО</span>` : ""}</div>`;
  const player = `<div style="height:220px;position:relative;background:#000;flex-shrink:0">${ph("lake", "50% 55%")}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,0) 30%,rgba(0,0,0,0) 60%,rgba(0,0,0,.65))"></div>
    <div style="position:absolute;left:12px;top:10px;background:#d93025;color:#fff;font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px">НА ЖИВО</div><div style="position:absolute;right:12px;top:8px;color:#fff;font-size:12px;opacity:.9;text-align:right;font-weight:700;letter-spacing:1px">ТВ ПЛАНИНА</div>
    <div class="ring ringr" style="position:absolute;left:50%;top:50%;margin:-32px 0 0 -32px;width:64px;height:64px;border-radius:50%;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center">${m("play_arrow", 42, "#fff", 1)}</div>
    <div style="position:absolute;left:12px;right:12px;bottom:10px;display:flex;align-items:center;gap:12px;color:#fff;font-size:12px">${m("play_arrow", 22, "#fff", 1)}${m("volume_up", 22, "#fff")}<span style="flex:1"></span><span>НА ЖИВО</span>${m("fullscreen", 24, "#fff")}</div></div>`;
  return scr(`${chromeBar("tvplanina.example.bg/na-jivo", { mic: false })}${player}<div style="padding:12px 16px 6px;flex-shrink:0"><div style="font-size:18px;font-weight:700;color:#1f1f1f">Новини в 20:00</div><div style="font-size:13px;color:#5f6368;margin-top:2px">ТВ Планина · излъчва се сега</div></div><div style="padding:4px 16px;font-size:13px;color:#5f6368">Канали</div>
    <div style="flex:1;overflow:hidden">${ch("ПЛАНИНА", ["ТВ Планина", "Новини"], "#1f5f4a", 1)}${ch("РОДНО", ["Родно ТВ", "Сериал"], "#7a2e2e", 0)}${ch("ЗЛАТНО", ["ТВ Златно", "Музика"], "#9a6a12", 0)}</div>`,
    tip("Изберете телевизия → натиснете „Пусни“. За дълго гледане — през Wi-Fi", "left:50%;top:540px;transform:translateX(-50%);width:270px;z-index:40"));
})();

S["recipes"] = (() => {
  const card = (p, pos, t, s) => `<div style="width:150px;flex-shrink:0"><div style="height:104px;border-radius:12px;overflow:hidden">${ph(p, pos)}</div><div style="font-size:14px;color:#1f1f1f;margin-top:6px;line-height:1.25">${t}</div><div style="font-size:12px;color:#5f6368">${s}</div></div>`;
  const res = (p, pos, t, site, meta, ring) => `<div class="${ringed(ring)}" style="display:flex;gap:12px;padding:12px 14px;${ring ? "border-radius:14px;margin:3px 8px;padding:10px 8px;background:#f8fbff;" : "border-bottom:1px solid #eee;"}"><div style="flex:1;min-width:0"><div style="font-size:12.5px;color:#444746">${site}</div><div style="font-size:17px;color:#1a0dab;line-height:1.25;margin:2px 0 4px">${t}</div><div style="font-size:13px;color:#5f6368">${meta}</div></div><div style="width:84px;height:84px;border-radius:10px;overflow:hidden;flex-shrink:0">${ph(p, pos)}</div></div>`;
  return scr(`${chromeBar("google.com/search?q=шопска+салата+рецепта", { mic: false })}
    <div style="display:flex;gap:18px;padding:10px 16px 0;border-bottom:1px solid #e3e3e3;font-size:14.5px;color:#5f6368;flex-shrink:0;white-space:nowrap;overflow:hidden"><span style="padding-bottom:8px;color:#0b57d0;font-weight:500;border-bottom:3px solid #0b57d0">Всички</span><span style="padding-bottom:10px">Видеа</span><span style="padding-bottom:10px">Изображения</span><span style="padding-bottom:10px">Новини</span></div>
    <div style="padding:12px 16px 6px;font-size:16px;color:#1f1f1f;font-weight:500;flex-shrink:0">Рецепти</div>
    <div style="display:flex;gap:10px;padding:0 16px 8px;overflow:hidden;flex-shrink:0">${card("tomato", "50% 50%", "Шопска салата", "15 мин · ★ 4,8")}${card("applecake", "50% 50%", "Ябълков сладкиш", "50 мин · ★ 4,6")}${card("buns", "50% 50%", "Канелени кифли", "2 ч · ★ 4,7")}</div>
    <div style="flex:1;overflow:hidden">${res("tomato", "50% 50%", "Шопска салата — класическа рецепта стъпка по стъпка", "vkusno-u-doma.example.bg", "★★★★★ 4,8 · 15 мин · 4 порции", 1)}${res("buns", "50% 50%", "Как да изберем домати за истинска шопска салата", "gotvim-lesno.example.bg", "★★★★☆ 4,5 · видео рецепта · 8:12", 0)}</div>`,
    tip("Напишете ястието + „рецепта“ и изберете видео или сайт. Запазете в отметки", "left:50%;top:545px;transform:translateX(-50%);width:290px;z-index:40"));
})();

S["solitaire"] = (() => {
  const SU = {
    h: ["#d32f2f", `<path d="M12 21.5l-1.4-1.3C5.4 15.5 2 12.4 2 8.6 2 5.5 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.5 22 8.6c0 3.8-3.4 6.9-8.6 11.6z"/>`],
    d: ["#d32f2f", `<path d="M12 1.5L20.5 12 12 22.5 3.5 12z"/>`],
    s: ["#1b1b1b", `<path d="M12 2C8 7 3 10 3 14.2c0 2.3 1.8 4 4 4 1.5 0 2.7-.7 3.5-1.8-.2 2-.9 3.6-2.5 5.1h8c-1.6-1.5-2.3-3.1-2.5-5.1.8 1.1 2 1.8 3.5 1.8 2.2 0 4-1.7 4-4C21 10 16 7 12 2z"/>`],
    c: ["#1b1b1b", `<circle cx="12" cy="7" r="4.6"/><circle cx="6.4" cy="14.2" r="4.6"/><circle cx="17.6" cy="14.2" r="4.6"/><path d="M12 11 L9.6 22h4.8z"/>`],
  };
  const suit = (s, z) => `<svg width="${z}" height="${z}" viewBox="0 0 24 24" fill="${SU[s][0]}">${SU[s][1]}</svg>`;
  const W = 47, Hc = 66;
  const face = (r, s, top, left, ring) => `<div class="${ringed(ring)}" style="position:absolute;left:${left}px;top:${top}px;width:${W}px;height:${Hc}px;border-radius:6px;background:linear-gradient(180deg,#fff,#f4f4f4);box-shadow:0 1px 2px rgba(0,0,0,.45);color:${SU[s][0]}"><div style="position:absolute;left:5px;top:3px;font-size:16px;font-weight:700;line-height:1;font-family:'Roboto'">${r}</div><div style="position:absolute;left:5px;top:21px">${suit(s, 11)}</div><div style="position:absolute;right:5px;bottom:5px">${suit(s, 24)}</div></div>`;
  const back = (top, left) => `<div style="position:absolute;left:${left}px;top:${top}px;width:${W}px;height:${Hc}px;border-radius:6px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.45);padding:3px"><div style="width:100%;height:100%;border-radius:4px;background:repeating-linear-gradient(45deg,#1e4fa8 0 4px,#2a62c4 4px 8px)"></div></div>`;
  const slot = (left, top, s) => `<div style="position:absolute;left:${left}px;top:${top}px;width:${W}px;height:${Hc}px;border-radius:6px;border:2px solid rgba(255,255,255,.28);background:rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;opacity:.9">${s ? `<span style="opacity:.35">${suit(s, 22).replace(SU[s][0], "#fff")}</span>` : ""}</div>`;
  const colL = (i) => 10 + i * 53;
  const cols = [[0, ["K", "d"]], [1, ["7", "s"]], [2, ["Q", "h"]], [3, ["9", "c"]], [4, ["4", "d"], ["3", "s"]], [5, ["J", "h"], ["10", "c"], ["9", "h"]], [6, ["K", "h"]]];
  let tab = "";
  const backs = [0, 1, 2, 3, 4, 5, 6];
  cols.forEach(([i, ...cs]) => {
    let top = 112;
    for (let b = 0; b < backs[i]; b++) { tab += back(top, colL(i)); top += 13; }
    cs.forEach(([r, s], k) => { tab += face(r, s, top, colL(i), i === 5 && k === 2); top += 25; });
  });
  return scr(`<div style="display:flex;align-items:center;padding:6px 12px;color:#fff;flex-shrink:0;gap:10px;background:rgba(0,0,0,.25)">${m("arrow_back", 24, "#fff")}<div style="flex:1;font-size:17px;font-weight:500">Пасианс</div><span style="font-size:13px;opacity:.9">Ходове: 18</span><span style="font-size:13px;opacity:.9;margin-left:8px">02:41</span></div>
    <div style="flex:1;position:relative;background:radial-gradient(120% 90% at 50% 20%,#2f9a5a,#1d6e3f 60%,#145530)">${back(14, colL(0))}${face("8", "h", 14, colL(1))}${slot(colL(3), 14, "h")}${face("A", "d", 14, colL(4))}${slot(colL(5), 14, "s")}${slot(colL(6), 14, "c")}${tab}
      <div style="position:absolute;left:14px;top:96px;color:rgba(255,255,255,.7);font-size:11px"></div></div>
    <div style="height:56px;background:rgba(0,0,0,.28);display:flex;align-items:center;justify-content:space-around;color:#fff;font-size:12.5px;flex-shrink:0">${[["undo", "Назад"], ["lightbulb", "Съвет"], ["autorenew", "Нова игра"], ["settings", "Настройки"]].map(([i, t]) => `<div style="text-align:center">${m(i, 24, "#fff")}<div>${t}</div></div>`).join("")}</div>`,
    tip("Местете картите с пръст по правилата — за разтуха. Намерете играта в Play Маркет", "left:50%;top:92px;transform:translateX(-50%);width:290px;z-index:40", { arrow: "d", at: "50%" }), "#145530", "#ffffff");
})();
S["solitaire"] = S["solitaire"].replace("left:50%;top:92px;transform:translateX(-50%);width:290px", "left:50%;top:440px;transform:translateX(-50%);width:300px").replace(" ar ar-d","");

S["ebook"] = (() => {
  const page = `<div style="flex:1;background:#fbf7ec;padding:22px 26px 0;overflow:hidden;font-family:'Noto Serif','DejaVu Serif',serif;color:#2b2418"><div style="font-size:13px;color:#8a7e66;text-align:center;font-family:'Roboto'">Христо Ботев · Хаджи Димитър</div>
    <div style="font-size:21px;line-height:1.75;margin-top:22px">Тоз, който падне в бой за свобода,<br>той не умира: него жалеят<br>земя и небо, звяр и природа<br>и певци песни за него пеят.</div></div>`;
  const panel = abs("left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;z-index:20;padding:12px 22px 20px;box-shadow:0 -4px 20px rgba(0,0,0,.25)",
    `<div style="width:36px;height:4px;border-radius:2px;background:#c4c7c5;margin:0 auto 12px"></div><div style="font-size:16px;color:#1f1f1f;font-weight:500;margin-bottom:14px">Вид на текста</div>
     <div class="ring" style="display:flex;align-items:center;gap:14px;padding:8px 10px;border-radius:14px"><span style="font-size:14px;color:#1f1f1f;font-family:'Roboto'">А</span><div style="flex:1;height:4px;background:#c4c7c5;border-radius:2px;position:relative"><div style="width:72%;height:4px;background:#0b57d0;border-radius:2px"></div><div style="position:absolute;left:72%;top:-8px;margin-left:-10px;width:20px;height:20px;border-radius:50%;background:#0b57d0"></div></div><span style="font-size:28px;color:#1f1f1f;font-family:'Roboto'">А</span></div>
     <div style="display:flex;gap:10px;margin-top:14px">${[["Ден", "#fff", "#1f1f1f", 0], ["Сепия", "#fbf7ec", "#2b2418", 1], ["Нощ", "#1b1b1b", "#e8eaed", 0]].map(([t, bg, fg, a]) => `<div style="flex:1;height:52px;border-radius:14px;background:${bg};color:${fg};border:${a ? "2px solid #0b57d0" : "1px solid #c4c7c5"};display:flex;align-items:center;justify-content:center;font-size:15px">${t}</div>`).join("")}</div>`);
  return scr(`<div style="background:#fbf7ec;display:flex;align-items:center;padding:6px 10px;flex-shrink:0;color:#5f5645">${m("arrow_back", 24, "#5f5645")}<div style="flex:1"></div>${m("text_fields", 26, "#5f5645")}${m("bookmark_border", 24, "#5f5645")}<span style="width:6px"></span>${m("more_vert", 24, "#5f5645")}</div>${page}${abs("left:0;right:0;bottom:0;height:34px;background:#fbf7ec;display:flex;align-items:center;justify-content:center;font-size:12px;color:#8a7e66", "Стр. 24 от 180")}${panel}`,
    tip("Уголемете буквите от „Аа“ и изберете удобен фон. Нощем — тъмен режим", "left:50%;top:62px;transform:translateX(-50%);width:290px;z-index:40"), "#fbf7ec", "#2b2418");
})();
S["ebook"] = S["ebook"].replace("left:50%;top:62px;transform:translateX(-50%);width:290px", "left:50%;top:352px;transform:translateX(-50%);width:300px").replace("z-index:40\"","z-index:40\"");

S["movies"] = (() => {
  const ytTop = `<div style="background:#fff;display:flex;align-items:center;padding:6px 14px;gap:10px;flex-shrink:0;position:relative;z-index:2"><div style="width:30px;height:30px">${appIcon("youtube", { size: 30, label: false })}</div><span style="font-size:19px;font-weight:700;letter-spacing:-.5px;color:#0f0f0f;flex:1">YouTube</span>${m("cast", 24, "#0f0f0f")}${m("notifications", 24, "#0f0f0f")}${m("search", 24, "#0f0f0f")}</div>`;
  void ytTop;
  const sug = (p, pos, t, ch) => `<div style="display:flex;gap:10px;padding:6px 14px"><div style="width:150px;height:84px;border-radius:8px;overflow:hidden;position:relative;flex-shrink:0">${ph(p, pos)}<span style="position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.8);color:#fff;font-size:11px;padding:1px 4px;border-radius:3px">1:24:10</span></div><div style="min-width:0"><div style="font-size:14px;color:#0f0f0f;line-height:1.25;font-weight:500">${t}</div><div style="font-size:12px;color:#606060;margin-top:3px">${ch}</div></div></div>`;
  return scr(`<div style="height:220px;background:#000;position:relative;flex-shrink:0">${ph("lake", "50% 50%")}<div style="position:absolute;inset:0;background:rgba(0,0,0,.28)"></div>
    <div style="position:absolute;left:10px;top:8px;color:#fff">${m("keyboard_arrow_down", 30, "#fff")}</div><div style="position:absolute;right:12px;top:10px;display:flex;gap:16px">${m("closed_caption", 22, "#fff")}${m("settings", 22, "#fff")}</div>
    <div style="position:absolute;left:50%;top:50%;margin:-26px 0 0 -26px;width:52px;height:52px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center">${m("pause", 32, "#fff", 1)}</div>
    <div style="position:absolute;left:12px;right:12px;bottom:26px;display:flex;justify-content:space-between;color:#fff;font-size:12px"><span>12:41 / 1:24:10</span><span class="ring" style="display:flex;border-radius:6px;padding:1px">${m("fullscreen", 24, "#fff")}</span></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.3)"><div style="width:16%;height:4px;background:#f00"></div></div></div>
    <div style="padding:12px 14px 6px;flex-shrink:0;background:#fff"><div style="font-size:17px;font-weight:500;color:#0f0f0f;line-height:1.25">Стар български филм — цял филм</div><div style="font-size:12.5px;color:#606060;margin-top:3px">48 хил. гледания · преди 2 години</div>
      <div style="display:flex;gap:10px;margin-top:12px;overflow:hidden"><span style="background:#f2f2f2;border-radius:18px;padding:8px 14px;font-size:13.5px;display:flex;align-items:center;gap:6px">${m("thumb_up", 18, "#0f0f0f")}2,1 хил.</span><span style="background:#f2f2f2;border-radius:18px;padding:8px 14px;font-size:13.5px;display:flex;align-items:center;gap:6px">${m("share", 18, "#0f0f0f")}Сподели</span><span style="background:#f2f2f2;border-radius:18px;padding:8px 14px;font-size:13.5px;display:flex;align-items:center;gap:6px">${m("download", 18, "#0f0f0f")}Изтегли</span></div></div>
    <div style="flex:1;overflow:hidden;background:#fff;padding-top:6px;border-top:8px solid #f2f2f2;margin-top:8px">${sug("sunflower", "50% 50%", "Български филми — класика · цял филм", "Кино архив")}${sug("poppy", "50% 40%", "Стара комедия — цял филм с превод", "Кино архив")}</div>`,
    tip("Напишете заглавието → изберете цял филм → иконата в ъгъла пуска цял екран", "left:50%;top:560px;transform:translateX(-50%);width:290px;z-index:40"));
})();

S["photo-timer"] = (() => {
  const view = `<div style="position:absolute;inset:0">${ph("lake", "50% 60%")}</div>`;
  const timerRow = abs("left:0;right:0;top:56px;z-index:8;display:flex;justify-content:center", `<div style="background:rgba(0,0,0,.55);border-radius:26px;padding:6px 8px;display:flex;gap:6px;align-items:center;color:#fff;font-size:15px">${[["Изкл.", 0], ["2 с", 0], ["5 с", 0], ["10 с", 1]].map(([t, a]) => `<div class="${ringed(a)}" style="height:38px;min-width:58px;border-radius:19px;padding:0 12px;display:flex;align-items:center;justify-content:center;background:${a ? "#fff" : "transparent"};color:${a ? "#000" : "#fff"};font-weight:${a ? 700 : 400}">${t}</div>`).join("")}</div>`);
  return scr(`<div style="flex:1;position:relative;background:#000;overflow:hidden">${view}
    <div style="position:absolute;left:0;right:0;top:0;height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;z-index:7;background:linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,0))">${m("flash_off", 24, "#fff")}<span style="position:relative">${m("timer", 24, "#fff")}<span style="position:absolute;right:-9px;top:-5px;background:#fff;color:#000;border-radius:7px;font-size:9px;font-weight:700;padding:1px 3px">10</span></span>${m("aspect_ratio", 24, "#fff")}${m("motion_photos_on", 24, "#fff")}${m("settings", 24, "#fff")}</div>${timerRow}
    ${abs("left:50%;top:48%;margin:-60px 0 0 -60px;z-index:5;width:120px;height:120px;border-radius:50%;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font-size:76px;font-weight:300", "10")}
    <div style="position:absolute;left:0;right:0;bottom:0;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.6));padding:0 0 4px;z-index:7"><div style="display:flex;justify-content:center;gap:22px;color:#fff;font-size:14px;margin-bottom:10px"><span style="opacity:.7">Видео</span><span style="font-weight:700;border-bottom:2px solid #fff;padding-bottom:2px">Снимка</span><span style="opacity:.7">Портрет</span></div>
      <div style="display:flex;align-items:center;justify-content:space-around;padding:0 30px 16px"><div style="width:48px;height:48px;border-radius:10px;overflow:hidden;border:2px solid #fff">${ph("poppy")}</div><div style="width:72px;height:72px;border-radius:50%;border:4px solid #fff;display:flex;align-items:center;justify-content:center"><div style="width:58px;height:58px;border-radius:50%;background:#fff"></div></div>${m("cached", 32, "#fff")}</div></div></div>`,
    tip("Камера → иконата на таймера → изберете 5 или 10 секунди → натиснете снимане и влезте в кадър", "left:50%;top:106px;transform:translateX(-50%);width:300px;z-index:40", { arrow: "u", at: "60%" }), "#000", "#fff");
})();
S["photo-timer"] = S["photo-timer"].replace("top:106px", "top:118px");

S["group-video"] = (() => {
  const tile = (l, n, c, mute) => `<div style="border-radius:14px;background:#1f2c34;position:relative;display:flex;align-items:center;justify-content:center"><div style="width:84px;height:84px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:400">${l}</div><div style="position:absolute;left:8px;bottom:8px;background:rgba(0,0,0,.45);color:#fff;font-size:12.5px;padding:2px 8px;border-radius:10px;display:flex;align-items:center;gap:4px">${mute ? m("mic_off", 14, "#fff") : ""}${n}</div></div>`;
  return scr(`<div style="display:flex;align-items:center;padding:8px 12px;gap:12px;color:#fff;flex-shrink:0">${m("keyboard_arrow_down", 28, "#fff")}<div style="flex:1"><div style="font-size:17px;font-weight:500">Семейство</div><div style="font-size:12.5px;opacity:.75">04:12 · 4 участници</div></div>${m("person_add", 24, "#fff")}</div>
    <div style="flex:1;padding:4px 6px 8px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:6px">${tile("М", "Мария", "#6a4fb3", 0)}${tile("И", "Иван", "#1e7fc4", 1)}${tile("Е", "Елена", "#2e9d6b", 0)}${tile("Аз", "Вие", "#c4691f", 0)}</div>
    <div style="background:#0b141a;height:96px;flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:16px;padding-bottom:8px"><div style="width:52px;height:52px;border-radius:50%;background:#2a3942;display:flex;align-items:center;justify-content:center">${m("more_horiz", 26, "#fff")}</div><div class="ring ringr" style="width:52px;height:52px;border-radius:50%;background:#2a3942;display:flex;align-items:center;justify-content:center">${m("videocam", 26, "#fff", 1)}</div><div style="width:52px;height:52px;border-radius:50%;background:#2a3942;display:flex;align-items:center;justify-content:center">${m("volume_up", 26, "#fff")}</div><div style="width:52px;height:52px;border-radius:50%;background:#2a3942;display:flex;align-items:center;justify-content:center">${m("mic", 26, "#fff", 1)}</div><div style="width:52px;height:52px;border-radius:50%;background:#e53935;display:flex;align-items:center;justify-content:center;transform:rotate(135deg)">${m("call", 26, "#fff", 1)}</div></div>`,
    tip("Докоснете видеокамерата в груповия чат — всички се виждат едновременно. Дръжте телефона стабилно", "left:50%;top:60px;transform:translateX(-50%);width:300px;z-index:40"), "#0b141a", "#ffffff");
})();

// ═════════════════════════ СНИМКИ ═════════════════════════
const PH_GRID = [["poppy", "50% 50%"], ["lake", "30% 50%"], ["sunflower", "50% 40%"], ["applecake", "50% 50%"], ["cat", "50% 40%"], ["buns", "50% 50%"], ["tomato", "50% 50%"], ["forest", "50% 50%"], ["poppy", "20% 60%"], ["lake", "80% 50%"], ["sunflower", "30% 70%"], ["monastery", "50% 50%"]];
function gThumb([p, pos], o = {}) {
  return `<div style="position:relative;aspect-ratio:1;overflow:hidden;background:#e8eaed">${ph(p, pos)}${o.check ? `<div style="position:absolute;left:6px;top:6px;width:22px;height:22px;border-radius:50%;background:#0b57d0;border:2px solid #fff;display:flex;align-items:center;justify-content:center">${m("check", 16, "#fff", 0)}</div><div style="position:absolute;inset:0;background:rgba(11,87,208,.12);border:3px solid #0b57d0"></div>` : o.empty ? `<div style="position:absolute;left:6px;top:6px;width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.5)"></div>` : ""}${o.badge ? `<div style="position:absolute;left:5px;bottom:5px;background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:1px 6px;border-radius:9px">${o.badge}</div>` : ""}</div>`;
}
const photoViewerBar = (o = {}) => `<div style="display:flex;align-items:center;padding:8px 10px;flex-shrink:0;background:#fff">${m("arrow_back", 24, "#1f1f1f")}<div style="flex:1;text-align:center;font-size:13px;color:#444746">${o.title || "30 окт. 2026"}</div>${m("cast", 22, "#444746")}<span style="width:12px"></span>${m("more_vert", 24, o.ringMore ? "#0b57d0" : "#1f1f1f")}</div>`;
const photoBottomBar = (ringDel) => `<div style="height:64px;background:#fff;display:flex;justify-content:space-around;align-items:center;flex-shrink:0;font-size:11.5px;color:#1f1f1f">${[["share", "Сподели", 0], ["tune", "Редактиране", 0], ["center_focus_strong", "Lens", 0], ["delete", "Изтриване", 1]].map(([i, t, d]) => `<div class="${d && ringDel ? "ring" : ""}" style="text-align:center;padding:4px 10px;border-radius:12px">${m(i, 24, "#1f1f1f")}<div style="margin-top:2px">${t}</div></div>`).join("")}</div>`;

S["photo-delete"] = scr(`${photoViewerBar()}<div style="flex:1;background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden">${ph("poppy", "50% 50%", "100%", "100%")}</div>${photoBottomBar(1)}`,
  tip("Отворете снимката → кошчето „Изтриване“ → потвърдете", "left:50%;top:62px;transform:translateX(-50%);width:270px;z-index:40", { arrow: "u", at: "50%" }));
S["photo-delete"] = S["photo-delete"].replace("left:50%;top:62px;transform:translateX(-50%);width:270px", "left:104px;top:536px;width:262px").replace("ar-u", "ar-d").replace("--ax:50%", "--ax:86%");

S["set-wallpaper"] = (() => {
  return scr(`<div style="display:flex;align-items:center;padding:8px 10px;flex-shrink:0;background:#fff">${m("arrow_back", 24, "#1f1f1f")}<div style="flex:1"></div><span class="ring ringr" style="display:flex;padding:4px">${m("more_vert", 24, "#1f1f1f")}</span></div>
    <div style="flex:1;background:#fff;position:relative;overflow:hidden">${ph("sunflower", "50% 45%")}</div>
    <div style="height:58px;background:#fff;display:flex;justify-content:space-around;align-items:center;flex-shrink:0">${["favorite_border", "edit", "share", "delete"].map((i) => m(i, 26, "#1f1f1f")).join("")}</div>
    ${popupMenu("right:10px;top:46px", ["Подробности", "Задай като тапет", "Слайдшоу", "Копиране в албум"], 1, 232)}`,
    tip("Отворете снимката → ⋮ → „Задай като тапет“, изберете заключен или начален екран", "left:12px;top:204px;width:150px;z-index:40", { arrow: "r", at: "40%" }));
})();
S["set-wallpaper"] = S["set-wallpaper"].replace("left:12px;top:204px;width:150px", "left:14px;top:112px;width:150px");

S["create-album"] = (() => {
  const sel = [1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0];
  return scr(`<div style="display:flex;align-items:center;padding:8px 12px 8px 8px;gap:8px;flex-shrink:0">${m("close", 24, "#1f1f1f")}<div style="flex:1;font-size:19px;color:#1f1f1f;margin-left:8px">Нов албум</div><div class="ring" style="height:38px;padding:0 20px;border-radius:19px;background:#0b57d0;color:#fff;font-size:14.5px;font-weight:500;display:flex;align-items:center">Добави</div></div>
    <div style="padding:6px 18px 12px;flex-shrink:0"><div style="font-size:26px;color:#1f1f1f;border-bottom:2px solid #0b57d0;padding-bottom:6px">Есенни разходки</div><div style="font-size:12.5px;color:#5f6368;margin-top:6px">Име на албума</div></div>
    <div style="padding:0 18px 8px;font-size:14px;color:#1f1f1f;font-weight:500;flex-shrink:0">Избрани: 4</div>
    <div style="flex:1;overflow:hidden;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px;align-content:start">${PH_GRID.slice(0, 9).map((g, i) => gThumb(g, sel[i] ? { check: 1 } : { empty: 1 })).join("")}</div>`,
    tip("Дайте име → изберете снимки → „Добави“", "left:50%;top:116px;transform:translateX(-50%);width:230px;z-index:40", { arrow: "u", at: "80%" }));
})();
S["create-album"] = S["create-album"].replace("left:50%;top:116px;transform:translateX(-50%);width:230px", "left:50%;top:566px;transform:translateX(-50%);width:300px").replace(" ar ar-u","");

S["photo-restore"] = (() => {
  const items = PH_GRID.slice(0, 6).map((g, i) => gThumb(g, i === 0 ? { check: 1, badge: "29 дни" } : { badge: `${30 - i - 2} дни` }));
  return scr(`<div style="display:flex;align-items:center;padding:8px 10px;gap:12px;flex-shrink:0">${m("arrow_back", 24, "#1f1f1f")}<div style="flex:1;font-size:21px;color:#1f1f1f">Наскоро изтрити</div>${m("more_vert", 24, "#1f1f1f")}</div>
    <div style="margin:4px 14px 10px;padding:12px 14px;border-radius:14px;background:#f0f4f9;font-size:13.5px;color:#444746;line-height:1.4;display:flex;gap:10px;flex-shrink:0">${m("info", 20, "#0b57d0", 1)}<span>Изтритите снимки се пазят тук 30 дни, след което изчезват завинаги.</span></div>
    <div style="flex:1;overflow:hidden;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px;align-content:start">${items.join("")}</div>
    <div style="height:68px;background:#f3f6fc;display:flex;align-items:center;justify-content:space-around;flex-shrink:0;padding:0 16px"><div class="ring" style="height:44px;padding:0 26px;border-radius:22px;background:#0b57d0;color:#fff;font-size:15px;font-weight:500;display:flex;align-items:center;gap:8px">${m("restore_from_trash", 22, "#fff")}Възстанови</div><div style="height:44px;padding:0 22px;border-radius:22px;border:1px solid #c4c7c5;color:#b3261e;font-size:15px;font-weight:500;display:flex;align-items:center;gap:8px">${m("delete_forever", 22, "#b3261e")}Изтрий</div></div>`,
    tip("„Наскоро изтрити“ → изберете снимката → „Възстанови“", "left:50%;top:70px;transform:translateX(-50%);width:270px;z-index:40", { arrow: "d", at: "50%" }));
})();
S["photo-restore"] = S["photo-restore"].replace("left:50%;top:70px;transform:translateX(-50%);width:270px", "left:50%;top:420px;transform:translateX(-50%);width:300px").replace(" ar ar-d","");

S["slideshow"] = (() => {
  return scr(`<div style="display:flex;align-items:center;padding:8px 10px;gap:12px;flex-shrink:0">${m("arrow_back", 24, "#1f1f1f")}<div style="flex:1;font-size:21px;color:#1f1f1f">Есенни разходки</div>${m("search", 24, "#1f1f1f")}<span class="ring ringr" style="display:flex;padding:4px">${m("more_vert", 24, "#1f1f1f")}</span></div>
    <div style="flex:1;overflow:hidden;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px;align-content:start">${PH_GRID.map((g) => gThumb(g)).join("")}</div>
    ${popupMenu("right:10px;top:48px", ["Редактиране", "Слайдшоу", "Сортиране", "Настройки на албума"], 1, 232)}`,
    tip("Отворете албум → ⋮ → „Слайдшоу“ — снимките се сменят сами; докоснете, за да спрете", "left:14px;top:128px;width:150px;z-index:40", { arrow: "r", at: "40%" }));
})();
S["slideshow"] = S["slideshow"].replace("left:14px;top:128px;width:150px", "left:50%;top:584px;transform:translateX(-50%);width:300px").replace(" ar ar-r","");

S["photo-share"] = (() => {
  const people = [["М", "Мария", 0], ["И", "Иван", 1], ["Е", "Елена", 2], ["П", "Петър", 3]];
  const sheet = abs("left:0;right:0;bottom:0;background:#f3f6fc;border-radius:28px 28px 0 0;z-index:20;padding:10px 0 12px;box-shadow:0 -4px 24px rgba(0,0,0,.3)",
    `<div style="width:36px;height:4px;border-radius:2px;background:#c4c7c5;margin:0 auto 12px"></div><div style="display:flex;gap:12px;padding:0 20px 14px;align-items:center"><div style="width:56px;height:56px;border-radius:12px;overflow:hidden;flex-shrink:0">${ph("sunflower", "50% 45%")}</div><div><div style="font-size:16px;color:#1f1f1f;font-weight:500">1 изображение</div><div style="font-size:13px;color:#5f6368">slunchogledi.jpg · 2,0 MB</div></div></div>
     <div style="padding:0 20px 8px;font-size:13px;color:#5f6368">Хора</div><div style="display:flex;gap:6px;padding:0 12px 14px">${people.map(([l, n, c]) => `<div style="width:86px;text-align:center;font-size:12.5px;color:#1f1f1f"><div style="display:flex;justify-content:center;margin-bottom:6px">${gAv(l, c, 56)}</div>${n}</div>`).join("")}</div>
     <div style="padding:0 20px 8px;font-size:13px;color:#5f6368">Приложения</div><div style="display:flex;gap:4px;padding:0 10px 10px">${[["viber", "Viber", 1], ["messenger", "Messenger", 0], ["whatsapp", "WhatsApp", 0], ["messages", "Съобщения", 0], ["gmail", "Gmail", 0]].map(([n, l, h]) => `<div class="${ringed(h)}" style="width:74px;padding:6px 0;border-radius:16px;text-align:center;font-size:12px;color:#1f1f1f">${appIcon(n, { size: 52, label: false })}<div style="margin-top:6px">${l}</div></div>`).join("")}</div>`);
  return scr(`${photoViewerBar()}<div style="flex:1;background:#fff;overflow:hidden">${ph("sunflower", "50% 45%")}</div>${photoBottomBar(0)}${abs("inset:0;background:rgba(0,0,0,.34);z-index:10", "")}${sheet}`,
    tip("Отворете снимката → „Сподели“ → изберете приложение (напр. Viber) и човека → „Изпрати“", "left:50%;top:80px;transform:translateX(-50%);width:290px;z-index:40"));
})();

S["photo-zoom"] = (() => {
  const finger = (x, y) => abs(`left:${x - 32}px;top:${y - 32}px;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(0,0,0,.25);z-index:15`, "");
  const arrow = (x, y, rot) => abs(`left:${x}px;top:${y}px;z-index:14;transform:rotate(${rot}deg)`, m("arrow_forward", 34, "#fff"));
  return scr(`<div style="flex:1;background:#000;position:relative;overflow:hidden"><div style="position:absolute;left:-380px;top:-280px;width:1100px;height:850px">${P("sunflower", { w: "100%", h: "100%", style: "object-position:50% 50%" })}</div>
    ${finger(135, 360)}${finger(270, 240)}${arrow(70, 400, 135)}${arrow(302, 192, -45)}
    ${abs("left:0;right:0;top:0;padding:10px 12px;display:flex;align-items:center;gap:12px;color:#fff;background:linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,0));z-index:10", `${m("arrow_back", 24, "#fff")}<div style="flex:1"></div>${m("more_vert", 24, "#fff")}`)}</div>`,
    tip("Сложете два пръста върху снимката и ги раздалечете — приближава. Съберете ги — връща размера", "left:50%;bottom:24px;transform:translateX(-50%);width:300px;z-index:40"), "#000", "#fff");
})();

render(S).catch((e) => { console.error(e); process.exit(1); });
