// Страница „Сложете сайта на телефона“ (/instaliraj): 7 фотореалистични екранни снимки вместо
// схематичните SVG. Chrome за Android и Safari за iPhone показват истинския горен край на нашия
// сайт (assets/instaliraj/home-top.png — снимка на началната страница), а началният екран е с
// нашата икона сред други реални икони. Изход: public/instaliraj/*.png (нова папка).
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-instaliraj.js
//   ONLY=android-menu,iphone-share node scripts/howto-mockups/gen-instaliraj.js
// Обновяване на снимката на сайта: виж assets/credits/instaliraj.md.
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { phone, tip, ms, appIcon, ASSETS } = require("./_shell");

const OUT = path.resolve(__dirname, "../../public/instaliraj");
const furl = (...p) => pathToFileURL(path.join(...p)).href;
const SITE_SHOT = furl(ASSETS, "instaliraj", "home-top.png");
const WALL = furl(ASSETS, "instaliraj", "wallpaper-earth.jpg");
const OUR_ICON = pathToFileURL(path.resolve(__dirname, "../../public/icon-512-maskable.png")).href;
const OUR_ICON_IOS = pathToFileURL(path.resolve(__dirname, "../../public/icon-512.png")).href;
const NAME = "За Бобов дол";
const DOMAIN = "zabobovdol.carbonstealth.eu";
const PAGE_TOP = "#f3efe6"; // цветът на горния край на сайта (за лентата за състоянието)

// ───────── общи части ─────────
const page = (h) => `<div style="height:${h}px;overflow:hidden;background:#fff"><img alt="" src="${SITE_SHOT}" style="display:block;width:390px;height:auto"></div>`;
const scrim = (top, bottom, a = 0.42) => `<div style="position:absolute;z-index:35;left:0;right:0;top:-${top}px;bottom:-${bottom}px;background:rgba(0,0,0,${a})"></div>`;
const ringBox = (inner, css) => `<div class="ring" style="display:flex;align-items:center;justify-content:center;${css}">${inner}</div>`;

// Икона на приложението ни: Chrome (WebAPK) я маскира по формата на лаунчера; iOS — по плочка.
function ourIcon(size, system, ring, label, labelColor = "#fff", shadow = true) {
  const r = system === "ios" ? size * 0.225 : size * 0.34;
  const src = system === "ios" ? OUR_ICON_IOS : OUR_ICON;
  const fs = system === "ios" ? 11.5 : 12;
  return `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:6px;width:72px">
    <div class="${ring ? "ring" : ""}" style="width:${size}px;height:${size}px;border-radius:${r}px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.2),0 3px 8px -2px rgba(0,0,0,.25);background:#fff"><img alt="" src="${src}" style="width:100%;height:100%;display:block"></div>
    ${label ? `<div style="font-size:${fs}px;line-height:1.15;color:${labelColor};white-space:nowrap;${shadow ? "text-shadow:0 1px 3px rgba(0,0,0,.65)" : ""}">${label}</div>` : ""}</div>`;
}

// ───────── Android · Chrome ─────────
function chromeBar(ringMenu) {
  const more = `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center">${ms("more_vert", { size: 24, color: "#444746" })}</div>`;
  return `<div style="height:56px;background:#fff;display:flex;align-items:center;padding:0 4px 0 12px;gap:2px;flex:0 0 auto;border-bottom:1px solid #e3e6ea">
    <div style="flex:1;height:42px;border-radius:21px;background:#f0f4f9;display:flex;align-items:center;gap:8px;padding:0 6px">
      <span style="width:32px;height:32px;border-radius:50%;background:#e2e8f1;display:flex;align-items:center;justify-content:center">${ms("tune", { size: 19, color: "#444746" })}</span>
      <span style="font-size:15.5px;color:#1f1f1f;letter-spacing:.1px;white-space:nowrap">${DOMAIN}</span>
    </div>
    <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center"><span style="width:22px;height:22px;border:2px solid #444746;border-radius:5px;font-size:12px;font-weight:700;color:#444746;display:flex;align-items:center;justify-content:center">1</span></div>
    ${ringMenu ? ringBox(more, "width:40px;height:40px;border-radius:50%;margin-right:0") : more}
  </div>`;
}
const chromePage = (ringMenu) => `${chromeBar(ringMenu)}${page(604)}`;

function menuItem(icon, text, hl) {
  const body = `<div style="height:48px;display:flex;align-items:center;gap:18px;padding:0 16px">${ms(icon, { size: 24, color: "#444746" })}<span style="font-size:15.5px;color:#1f1f1f;white-space:nowrap">${text}</span></div>`;
  return hl ? `<div class="ring" style="margin:2px 6px;border-radius:12px;background:#eaf1fb">${body.replace("padding:0 16px", "padding:0 10px")}</div>` : body;
}
function chromeMenu() {
  const top = ["arrow_forward", "star", "download", "info", "refresh"].map((n, i) => `<div style="flex:1;display:flex;justify-content:center">${ms(n, { size: 24, color: i === 0 ? "#c4c7c5" : "#444746", outlined: false })}</div>`).join("");
  return `<div style="position:absolute;z-index:36;top:2px;right:8px;width:312px;background:#f9fafd;border-radius:14px;box-shadow:0 0 0 .5px rgba(0,0,0,.14),0 4px 8px rgba(0,0,0,.14),0 12px 28px rgba(0,0,0,.2);padding:4px 0 6px">
    <div style="height:52px;display:flex;align-items:center;padding:0 8px;border-bottom:1px solid #e3e6ea;margin-bottom:4px">${top}</div>
    ${menuItem("add", "Нов раздел")}
    ${menuItem("domino_mask", "Нов раздел „инкогнито“")}
    ${menuItem("history", "Хронология")}
    ${menuItem("bookmark_star", "Отметки")}
    ${menuItem("share", "Споделяне…")}
    ${menuItem("search", "Търсене в страницата")}
    ${menuItem("install_mobile", "Инсталиране на приложението", true)}
    ${menuItem("desktop_windows", "Настолен сайт")}
    ${menuItem("settings", "Настройки")}
  </div>`;
}

function androidConfirm() {
  return `${chromeBar(false)}${page(604)}
  ${scrim(38, 26)}
  <div style="position:absolute;z-index:36;left:24px;right:24px;top:208px;background:#f3f6fb;border-radius:28px;padding:24px 24px 20px;box-shadow:0 8px 32px rgba(0,0,0,.3)">
    <div style="font-size:20px;color:#1f1f1f;line-height:1.25;white-space:nowrap">Инсталиране на приложението</div>
    <div style="display:flex;align-items:center;gap:14px;margin-top:20px">
      <img alt="" src="${OUR_ICON}" style="width:52px;height:52px;border-radius:18px">
      <div><div style="font-size:16px;font-weight:500;color:#1f1f1f">${NAME}</div><div style="font-size:14px;color:#5f6368;margin-top:2px">${DOMAIN}</div></div>
    </div>
    <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:26px">
      <div style="height:40px;padding:0 16px;display:flex;align-items:center;font-size:14.5px;font-weight:500;color:#0b57d0">Отказ</div>
      <div class="ring" style="height:40px;padding:0 22px;border-radius:20px;background:#0b57d0;color:#fff;display:flex;align-items:center;font-size:14.5px;font-weight:500">Инсталиране</div>
    </div>
  </div>`;
}

// ───────── Начален екран ─────────
function androidHome() {
  const sh = "text-shadow:0 1px 3px rgba(0,0,0,.6)";
  const a = (n) => appIcon(n, { size: 56, os: "android", labelColor: "#fff" });
  const cell = (h) => `<div style="display:flex;justify-content:center;${sh}">${h}</div>`;
  const rows = [
    ["google", "gmail", "maps", "youtube"],
    ["photos", "calendar", "viber", "facebook"],
    ["spotify", "files", "clock", "OURS"],
  ];
  const grid = rows.map((r) => `<div style="display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:22px">${r.map((n) => cell(n === "OURS" ? ourIcon(56, "android", true, NAME) : a(n))).join("")}</div>`).join("");
  const dock = ["phone", "messages", "chrome", "camera"].map((n) => cell(appIcon(n, { size: 56, os: "android", label: false }))).join("");
  return `<div style="padding:34px 10px 0;color:#fff;flex:1;display:flex;flex-direction:column">
    <div style="padding:0 18px;${sh}"><div style="font-size:24px;font-weight:400">пт, 30 окт.</div><div style="font-size:15px;margin-top:3px;display:flex;align-items:center;gap:6px">${ms("cloud", { size: 18, fill: 1, color: "#fff" })} 11°C</div></div>
    <div style="height:46px"></div>${grid}
    <div class="grow"></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:16px">${dock}</div>
    <div style="height:52px;border-radius:26px;background:rgba(255,255,255,.93);margin:0 6px 14px;display:flex;align-items:center;padding:0 16px;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.3)">
      <svg viewBox="0 0 48 48" width="24" height="24"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
      <div style="flex:1"></div>${ms("mic", { size: 24, fill: 1, color: "#4285F4" })}${ms("photo_camera", { size: 24, color: "#5f6368" })}
    </div>
  </div>`;
}

// iOS: плочки на системните приложения
const iosTile = (bg, glyph, size = 60) => `<div style="width:${size}px;height:${size}px;border-radius:${size * 0.225}px;background:${bg};display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.18),0 3px 8px -2px rgba(0,0,0,.2)">${glyph}</div>`;
const iosCal = (s = 60) => iosTile("#fff", `<div style="text-align:center;line-height:1"><div style="font-size:${s * 0.17}px;font-weight:600;color:#ff3b30;letter-spacing:.2px">пт</div><div style="font-size:${s * 0.54}px;font-weight:300;color:#111;margin-top:1px">30</div></div>`, s);
const IOS = {
  calendar: () => iosCal(),
  youtube: () => appIcon("youtube", { size: 60, os: "ios", label: false }),
  gmail: () => appIcon("gmail", { size: 60, os: "ios", label: false }),
  settings: () => iosTile("linear-gradient(#a8aab0,#6f7177)", ms("settings", { size: 38, fill: 1, color: "#fff" })),
  mail: () => iosTile("linear-gradient(#3aa0ff,#0a6cf0)", ms("mail", { size: 36, fill: 1, color: "#fff" })),
  notes: () => iosTile("linear-gradient(#ffe27a 0 34%,#fff 34%)", ms("edit_note", { size: 36, color: "#d9a400" })),
  clock: () => iosTile("#000", ms("schedule", { size: 40, color: "#fff" })),
  weather: () => iosTile("linear-gradient(#3b8de6,#79c0f5)", ms("partly_cloudy_day", { size: 38, fill: 1, color: "#fff" })),
  wallet: () => iosTile("#000", ms("account_balance_wallet", { size: 34, fill: 1, color: "#fff" })),
  whatsapp: () => appIcon("whatsapp", { size: 60, os: "ios", label: false }),
  viber: () => appIcon("viber", { size: 60, os: "ios", label: false }),
  facebook: () => appIcon("facebook", { size: 60, os: "ios", label: false }),
  phone: () => iosTile("linear-gradient(#5be07a,#27c04a)", ms("call", { size: 36, fill: 1, color: "#fff" })),
  messages: () => iosTile("linear-gradient(#5be07a,#27c04a)", ms("chat_bubble", { size: 36, fill: 1, color: "#fff" })),
  safari: () => appIcon("safari", { size: 60, os: "ios", label: false }),
  camera: () => iosTile("linear-gradient(#d6d7da,#8f9196)", ms("photo_camera", { size: 36, fill: 1, color: "#222" })),
  appstore: () => appIcon("appstore", { size: 60, os: "ios", label: false }),
};
function iosLabeled(inner, label) {
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-shadow:0 1px 3px rgba(0,0,0,.55)">${inner}<div style="font-size:11.5px;color:#fff;line-height:1;white-space:nowrap">${label}</div></div>`;
}
function iphoneHome() {
  const L = { calendar: "Календар", youtube: "YouTube", gmail: "Gmail", settings: "Настройки", mail: "Поща", notes: "Бележки", clock: "Часовник", weather: "Времето", whatsapp: "WhatsApp", viber: "Viber", facebook: "Facebook", wallet: "Портфейл", appstore: "App Store" };
  const rows = [
    ["calendar", "youtube", "gmail", "weather"],
    ["clock", "notes", "mail", "settings"],
    ["whatsapp", "viber", "facebook", "wallet"],
    ["appstore", "OURS", null, null],
  ];
  const grid = rows.map((r) => `<div style="display:grid;grid-template-columns:repeat(4,1fr);justify-items:center;margin-bottom:26px;height:80px">${r.map((n) => n === "OURS" ? iosLabeledOurs() : n ? iosLabeled(IOS[n](), L[n]) : "<div></div>").join("")}</div>`).join("");
  const dock = ["phone", "safari", "messages", "camera"].map((n) => IOS[n]()).join("");
  return `<div style="padding:22px 0 0;flex:1;display:flex;flex-direction:column">
    <div style="height:8px"></div>${grid}
    <div class="grow"></div>
    <div style="margin:0 auto 12px;height:34px;width:108px;border-radius:17px;background:rgba(255,255,255,.3);color:#fff;font-size:13.5px;display:flex;align-items:center;justify-content:center;gap:5px;backdrop-filter:blur(8px)">${ms("search", { size: 15, color: "#fff", weight: 500 })}Търсене</div>
    <div style="margin:0 12px 6px;height:92px;border-radius:34px;background:rgba(255,255,255,.28);display:grid;grid-template-columns:repeat(4,1fr);justify-items:center;align-items:center">${dock}</div>
  </div>`;
}
function iosLabeledOurs() {
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;text-shadow:0 1px 3px rgba(0,0,0,.55)">
    <div class="ring" style="width:60px;height:60px;border-radius:13.5px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.2),0 3px 8px -2px rgba(0,0,0,.25)"><img alt="" src="${OUR_ICON_IOS}" style="width:100%;height:100%;display:block"></div>
    <div style="font-size:11.5px;color:#fff;line-height:1;white-space:nowrap">${NAME}</div></div>`;
}

// ───────── iPhone · Safari ─────────
function safariBar(ringShare, extra = "") {
  const ic = (n, c = "#007aff", s = 28) => ms(n, { size: s, color: c, weight: 400, outlined: true });
  const share = `<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center">${ic("ios_share")}</div>`;
  return `<div style="position:relative;background:#f7f7f8;border-top:.5px solid #cfcfd4;flex:0 0 auto;padding:6px 0 0">
    <div style="margin:0 12px;height:46px;border-radius:13px;background:#e9e9ed;display:flex;align-items:center;padding:0 12px;gap:8px">
      <span style="font-size:15px;color:#111;font-weight:500;letter-spacing:-.3px">A<span style="font-size:20px;vertical-align:-1px">A</span></span>
      <div style="flex:1;text-align:center;font-size:16px;color:#111;white-space:nowrap">${DOMAIN}</div>
      ${ms("refresh", { size: 20, color: "#111" })}
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);justify-items:center;align-items:center;height:48px">
      ${ic("chevron_left")}${ic("chevron_right", "#c7c7cc")}
      ${ringShare ? ringBox(share, "width:46px;height:46px;border-radius:50%") : share}
      ${ic("menu_book")}${ic("filter_none", "#007aff", 25)}
    </div>${extra}</div>`;
}
const safariPage = (ringShare) => `<div style="position:absolute;left:0;right:0;bottom:-30px;height:30px;background:#f7f7f8"></div><div style="position:absolute;left:0;right:0;top:-54px;height:54px;background:${PAGE_TOP}"></div><div class="grow" style="display:flex;flex-direction:column;min-height:0"><div style="height:${660 - 6 - 46 - 48 - 1 - 0}px;overflow:hidden;background:#fff"><img alt="" src="${SITE_SHOT}" style="display:block;width:390px;height:auto"></div>${safariBar(ringShare)}</div>`;

function listRow(label, icon, hl, last) {
  const body = `<div style="height:46px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:16.5px;color:#000;${last || hl ? "" : "border-bottom:.5px solid #dcdce0;"}"><span>${label}</span>${ms(icon, { size: 24, color: "#000", outlined: true })}</div>`;
  return hl ? `<div class="ring" style="border-radius:10px;margin:0 0">${body}</div>` : body;
}
function iphoneShareSheet() {
  const contact = (ini, name, c) => `<div style="width:72px;text-align:center"><div style="width:56px;height:56px;border-radius:50%;background:${c};margin:0 auto 6px;color:#fff;font-size:20px;font-weight:500;display:flex;align-items:center;justify-content:center">${ini}</div><div style="font-size:11.5px;color:#111">${name}</div></div>`;
  const app = (n, l) => `<div style="width:72px;text-align:center"><div style="display:flex;justify-content:center;margin-bottom:6px">${n}</div><div style="font-size:11.5px;color:#111">${l}</div></div>`;
  const airdrop = `<div style="width:72px;text-align:center"><div style="width:56px;height:56px;border-radius:50%;background:#fff;margin:0 auto 6px;display:flex;align-items:center;justify-content:center">${ms("wifi_tethering", { size: 32, color: "#007aff" })}</div><div style="font-size:11.5px;color:#111">AirDrop</div></div>`;
  return `${safariPageDim()}
  <div style="position:absolute;z-index:36;left:0;right:0;top:44px;bottom:-30px;background:#f2f2f6;border-radius:14px 14px 0 0;overflow:hidden;padding-top:6px">
    <div style="width:36px;height:5px;border-radius:3px;background:#c4c4c8;margin:0 auto 8px"></div>
    <div style="display:flex;align-items:center;gap:12px;padding:6px 16px 12px">
      <img alt="" src="${OUR_ICON_IOS}" style="width:44px;height:44px;border-radius:10px;border:.5px solid #d8d8dc">
      <div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:600;color:#000">${NAME}</div><div style="font-size:13px;color:#8a8a8e;margin-top:1px;white-space:nowrap">${DOMAIN} <span style="color:#007aff">Опции ›</span></div></div>
      <div style="width:30px;height:30px;border-radius:50%;background:#e1e1e5;display:flex;align-items:center;justify-content:center">${ms("close", { size: 18, color: "#6e6e73", weight: 500 })}</div>
    </div>
    <div style="display:flex;gap:4px;padding:6px 10px 10px">${airdrop}${contact("МП", "Мария", "linear-gradient(#b4b7bd,#8e9198)")}${contact("ГН", "Георги", "linear-gradient(#e6b36b,#c58a3d)")}${contact("НК", "Нели", "linear-gradient(#8fc1a6,#5c9a7c)")}</div>
    <div style="display:flex;gap:4px;padding:6px 10px 12px">${app(IOS.messages().replace(/60px/g, "56px"), "Съобщения")}${app(appIcon("whatsapp", { size: 56, os: "ios", label: false }), "WhatsApp")}${app(appIcon("viber", { size: 56, os: "ios", label: false }), "Viber")}${app(IOS.mail().replace(/60px/g, "56px"), "Поща")}</div>
    <div style="margin:0 16px;background:#fff;border-radius:12px">
      ${listRow("Копиране", "content_copy")}
      ${listRow("Добави към отметки", "menu_book")}
      ${listRow("Намери на страницата", "search")}
      ${listRow("Добави към начален екран", "add_box", true)}
      ${listRow("Маркиране", "edit")}
      ${listRow("Отпечатване", "print", false, true)}
    </div>
  </div>`;
}
const safariPageDim = () => `<div style="position:absolute;left:0;right:0;top:0;bottom:0;display:flex;flex-direction:column">${page(660 - 6 - 46 - 48 - 1)}${safariBar(false)}</div>${scrim(54, 30)}`;

function iphoneConfirm() {
  return `${safariPageDim()}
  <div style="position:absolute;z-index:36;left:0;right:0;top:34px;bottom:-30px;background:#f2f2f6;border-radius:14px 14px 0 0">
    <div style="height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 16px;border-bottom:.5px solid #d6d6da">
      <span style="font-size:17px;color:#007aff;width:62px">Отказ</span>
      <span style="font-size:15.5px;font-weight:600;color:#000;white-space:nowrap">Добави към начален екран</span>
      <span class="ring" style="width:74px;text-align:center;font-size:17px;font-weight:600;color:#007aff;padding:5px 0;border-radius:18px;margin-right:-4px;background:#f2f2f6">Добави</span>
    </div>
    <div style="margin:52px 16px 0;background:#fff;border-radius:12px;display:flex;align-items:center;gap:14px;padding:14px 16px">
      <img alt="" src="${OUR_ICON_IOS}" style="width:62px;height:62px;border-radius:14px;border:.5px solid #d8d8dc">
      <div style="flex:1;min-width:0"><div style="font-size:17px;color:#000;padding-bottom:8px;border-bottom:.5px solid #dcdce0">${NAME}</div><div style="font-size:14px;color:#8a8a8e;padding-top:8px;white-space:nowrap;overflow:hidden">https://${DOMAIN}/</div></div>
    </div>
    <div style="margin:12px 28px 0;font-size:13px;line-height:1.35;color:#6e6e73">Иконата ще бъде добавена на началния екран, за да можете бързо да отваряте този уебсайт.</div>
  </div>`;
}

// ───────── сглобяване ─────────
const A = (inner, bg = "#fff", sc = "#0b0b0b") => phone(inner.replace(/^/, ""), bg, sc);
const wrapScreen = (inner) => `<div style="height:660px;position:relative;display:flex;flex-direction:column;overflow:visible">${inner}</div>`;

const WALLCSS = `linear-gradient(rgba(0,0,0,.24),rgba(0,0,0,.18)), url('${WALL}') 50% 40%/auto 118% #0a1226`;
const S = {};

S["android-menu"] = phone(wrapScreen(`${chromePage(true)}
  ${tip("Натиснете трите точки ⋮", "right:10px;top:66px", { arrow: "u", at: "88%" })}`), "#fff", "#0b0b0b");

S["android-install-item"] = phone(wrapScreen(`${chromePage(false)}${chromeMenu()}
  ${tip("„Инсталиране на приложението“<br>или „Добавяне към началния екран“", "left:46px;top:508px;width:250px", { arrow: "u", at: "50%" })}`), "#fff", "#0b0b0b");

S["android-confirm"] = phone(wrapScreen(`${androidConfirm()}
  ${tip("Натиснете „Инсталиране“", "right:34px;top:428px", { arrow: "u", at: "78%" })}`), "#fff", "#0b0b0b");

S["iphone-share"] = phone(wrapScreen(`${safariPage(true)}
  ${tip("Натиснете „Сподели“", "left:123px;top:508px", { arrow: "d", at: "50%" })}`), PAGE_TOP, "#0b0b0b", { os: "ios" });

S["iphone-add-home"] = phone(wrapScreen(`${iphoneShareSheet()}
  ${tip("Натиснете „Добави към<br>начален екран“", "left:172px;top:502px", { arrow: "u", at: "30%" })}`), PAGE_TOP, "#0b0b0b", { os: "ios" });

S["iphone-confirm"] = phone(wrapScreen(`${iphoneConfirm()}
  ${tip("Натиснете „Добави“", "right:20px;top:88px", { arrow: "u", at: "74%" })}`), PAGE_TOP, "#0b0b0b", { os: "ios" });

S["home-android"] = phone(wrapScreen(`${androidHome()}
  ${tip("Новата икона<br>„За Бобов дол“", "right:18px;top:414px", { arrow: "u", at: "74%" })}`), WALLCSS, "#ffffff");

S["home-iphone"] = phone(wrapScreen(`${iphoneHome()}
  ${tip("Новата икона<br>„За Бобов дол“", "left:194px;top:352px", { arrow: "l", at: "50%" })}`), WALLCSS, "#ffffff", { os: "ios" });

// Палитра от 192 цвята + дитеринг: ~3x по-малък файл (страницата е за хора с бавен интернет).
// Ако ImageMagick (convert) липсва — остава пълният PNG.
function shrink(file) {
  try {
    execFileSync("convert", [file, "-dither", "FloydSteinberg", "-colors", "192", "-strip", `PNG8:${file}`], { stdio: "ignore" });
  } catch {
    /* няма convert — оставяме оригинала */
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "instaliraj-"));
  const browser = await chromium.launch();
  const pg = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1000, height: 1600 } });
  let ok = 0;
  const failed = [];
  for (const [name, html] of Object.entries(S)) {
    if (only && !only.has(name)) continue;
    try {
      const f = path.join(tmp, "s.html");
      fs.writeFileSync(f, html);
      await pg.goto(pathToFileURL(f).href, { waitUntil: "load" });
      await pg.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
      });
      const out = path.join(OUT, `${name}.png`);
      await (await pg.$(".stage")).screenshot({ path: out });
      shrink(out);
      ok++;
      console.log("✔", name);
    } catch (e) {
      failed.push(name);
      console.error("✖", name, "—", e.message);
    }
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nГотово: ${ok} екрана в public/instaliraj/` + (failed.length ? ` · ГРЕШКИ: ${failed.join(", ")}` : ""));
  if (failed.length) process.exitCode = 1;
}
main();
