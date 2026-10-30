// Споделена основа за генераторите на картинките „Как да…“ (HTML → Playwright → PNG).
// Реалистичен смартфон (Android по подразбиране, {os:'ios'} за iPhone), Material Symbols
// икони, локални шрифтове и активи (без мрежа), банкноти и монети на ЕЦБ.
// Старото API е запазено: phone(inner,bg,scHl), I, av, tip, navTitle, setRow, toggle, render, OUT.
// Описание на новите помощници: scripts/howto-mockups/README.md. Източници/лицензи: assets/CREDITS.md.
const { chromium } = require("playwright");
const sharp = require("sharp");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

const OUT = path.resolve(__dirname, "../../public/kak-da");
const ASSETS = path.join(__dirname, "assets");
const DSF = 2; // deviceScaleFactor на render() — пази се в синхрон с правилото за банкнотите

const furl = (...p) => pathToFileURL(path.join(...p)).href;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// ───────────────────────── Шрифтове ─────────────────────────
const LATIN = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const CYR = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
function faces(family, dir, prefix, weights) {
  return weights.flatMap((w) => [["latin", LATIN], ["cyrillic", CYR]].map(([s, r]) =>
    `@font-face{font-family:'${family}';font-weight:${w};font-style:normal;font-display:block;src:url('${furl(ASSETS, "fonts", dir, `${prefix}-${s}-${w}-normal.woff2`)}') format('woff2');unicode-range:${r}}`)).join("");
}
const FONT_CSS = [
  faces("Roboto", "roboto", "roboto", [400, 500, 700]),
  faces("Inter", "inter", "inter", [400, 500, 600, 700]),
  `@font-face{font-family:'Material Symbols Rounded';font-weight:100 700;font-style:normal;font-display:block;src:url('${furl(ASSETS, "fonts/material-symbols/material-symbols-rounded.woff2")}') format('woff2')}`,
  `@font-face{font-family:'Material Symbols Outlined';font-weight:100 700;font-style:normal;font-display:block;src:url('${furl(ASSETS, "fonts/material-symbols/material-symbols-outlined.woff2")}') format('woff2')}`,
].join("\n");

// ───────────────────────── Икони (Material Symbols) ─────────────────────────
// ms('wifi', {size:24, fill:0|1, color:'#fff', weight:400, outlined:false})
function ms(name, o = {}) {
  const { size = 24, fill = 0, color, weight = 400, outlined = false, style = "" } = o;
  const fam = outlined ? "Material Symbols Outlined" : "Material Symbols Rounded";
  return `<span class="ms" style="font-family:'${fam}';font-size:${size}px;${color ? `color:${color};` : ""}font-variation-settings:'FILL' ${fill},'wght' ${weight},'GRAD' 0,'opsz' ${Math.min(48, Math.max(20, size))};${style}">${name}</span>`;
}
// Запазените ключове на I.* (+ нови). Наследяват цвета на текста.
const I = {
  back: `<span class="only-and">${ms("arrow_back", { size: 24 })}</span><span class="only-ios">${ms("arrow_back_ios_new", { size: 20, weight: 500 })}</span>`,
  phone: ms("call", { size: 22, fill: 1 }),
  video: ms("videocam", { size: 24, fill: 1 }),
  plus: ms("add", { size: 26 }),
  cam: ms("photo_camera", { size: 24, fill: 1 }),
  mic: ms("mic", { size: 22, fill: 1 }),
  send: ms("send", { size: 22, fill: 1 }),
  search: ms("search", { size: 22 }),
  clip: ms("attach_file", { size: 22 }),
  trash: ms("delete", { size: 22, fill: 1 }),
  reply: ms("reply", { size: 22 }),
  star: ms("star", { size: 22, fill: 1 }),
  pin: ms("location_on", { size: 22, fill: 1 }),
  play: ms("play_arrow", { size: 28, fill: 1 }),
  wifi: ms("wifi", { size: 24 }),
  bell: ms("notifications", { size: 22, fill: 1 }),
  globe: ms("language", { size: 22 }),
  lock: ms("lock", { size: 18, fill: 1 }),
  qr: ms("qr_code_2", { size: 40 }),
  download: ms("download", { size: 22 }),
  thumb: ms("thumb_up", { size: 22, fill: 1 }),
  smile: ms("mood", { size: 24 }),
  // нови
  more: ms("more_vert", { size: 24 }),
  menu: ms("menu", { size: 24 }),
  close: ms("close", { size: 24 }),
  check: ms("check", { size: 22, weight: 500 }),
  home: ms("home", { size: 24, fill: 1 }),
  settings: ms("settings", { size: 24, fill: 1 }),
  person: ms("person", { size: 24, fill: 1 }),
  mail: ms("mail", { size: 24, fill: 1 }),
  share: ms("share", { size: 22 }),
  edit: ms("edit", { size: 22 }),
  heart: ms("favorite", { size: 22, fill: 1 }),
  chevron: ms("chevron_right", { size: 22 }),
  expand: ms("expand_more", { size: 22 }),
  info: ms("info", { size: 22, fill: 1 }),
  camera: ms("photo_camera", { size: 24, fill: 1 }),
  gallery: ms("image", { size: 24, fill: 1 }),
  ms, // I.ms('name', opts) — пряк достъп
};

// ───────────────────────── Лента за състоянието / долна лента ─────────────────────────
const SVG_SIGNAL_A = (c) => `<svg width="15" height="15" viewBox="0 0 24 24"><path d="M2 22 22 2v20z" fill="${c}"/></svg>`;
const SVG_WIFI_A = (c) => `<svg width="16" height="16" viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z" fill="${c}"/></svg>`;
const SVG_BAT_A = (c, pct) => `<svg width="11" height="17" viewBox="0 0 11 17"><rect x="3.5" y="0" width="4" height="2" rx=".8" fill="${c}"/><rect x="1" y="1.6" width="9" height="14.4" rx="2.2" fill="none" stroke="${c}" stroke-opacity=".45" stroke-width="1.2"/><rect x="1.6" y="${(2.2 + (13.2 * (100 - pct)) / 100).toFixed(1)}" width="7.8" height="${((13.2 * pct) / 100).toFixed(1)}" rx="1.6" fill="${c}"/></svg>`;
const SVG_SIGNAL_I = (c) => `<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx=".9" fill="${c}"/><rect x="5" y="5.5" width="3" height="6.5" rx=".9" fill="${c}"/><rect x="10" y="2.8" width="3" height="9.2" rx=".9" fill="${c}"/><rect x="15" y="0" width="3" height="12" rx=".9" fill="${c}"/></svg>`;
const SVG_WIFI_I = (c) => `<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.3 0 4.4.9 6 2.4.1.1.3.1.4 0l1-1c.1-.1.1-.3 0-.4C13.9 1.3 11.3.2 8.5.2S3.1 1.3 1.1 3.3c-.1.1-.1.3 0 .4l1 1c.1.1.3.1.4 0 1.6-1.5 3.7-2.4 6-2.4zm0 3.9c1.2 0 2.3.4 3.2 1.2.1.1.3.1.4 0l1-1c.1-.1.1-.3 0-.4a7 7 0 00-9.2 0c-.1.1-.1.3 0 .4l1 1c.1.1.3.1.4 0 .9-.8 2-1.2 3.2-1.2zm2 2.5c.1-.1.1-.3 0-.4a4 4 0 00-4 0c-.1.1-.1.3 0 .4l1.8 1.8c.1.1.3.1.4 0z" fill="${c}"/></svg>`;
const SVG_BAT_I = (c, pct) => `<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="22" height="12" rx="3.6" fill="none" stroke="${c}" stroke-opacity=".4"/><rect x="2" y="2" width="${(19 * pct / 100).toFixed(1)}" height="9" rx="2.2" fill="${c}"/><path d="M24 4.3v4.4c.9-.3 1.6-1.2 1.6-2.2S24.9 4.6 24 4.3z" fill="${c}" fill-opacity=".45"/></svg>`;

// Лентата за състоянието. o: {os, dark (светли икони върху тъмно), color, time, battery}
function statusBar(o = {}) {
  const { os: system = "android", dark = false, time = "9:41", battery = 87 } = o;
  const c = o.color || (dark ? "#ffffff" : "#0b0b0b");
  if (system === "ios") {
    return `<div class="status ios-status" style="color:${c}"><span class="st-time">${time}</span><span class="st-right">${SVG_SIGNAL_I(c)}${SVG_WIFI_I(c)}${SVG_BAT_I(c, battery)}</span></div>`;
  }
  return `<div class="status and-status" style="color:${c}"><span class="st-time">${time}</span><span class="st-right">${SVG_WIFI_A(c)}${SVG_SIGNAL_A(c)}<span class="st-pct">${battery}%</span>${SVG_BAT_A(c, battery)}</span></div>`;
}
// Долна лента за жестове (Android) / индикатор „начало“ (iOS).
function navBar(o = {}) {
  const { os: system = "android", dark = false } = o;
  const c = o.color || (dark ? "#ffffff" : "#0b0b0b");
  return `<div class="navbar ${system === "ios" ? "ios-nav" : "and-nav"}"><i style="background:${c}"></i></div>`;
}
// светъл ли е цветът (за „dark“ лента: светли икони върху тъмен фон)
const isLight = (c) => {
  let h = String(c).trim().toLowerCase();
  if (h === "white") return true;
  h = h.replace("#", "");
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}/.test(h)) return false;
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

// ───────────────────────── CSS на устройството ─────────────────────────
const BASE_CSS = `
${FONT_CSS}
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent}
body{font-family:'Roboto','Noto Sans','DejaVu Sans',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body.os-ios{font-family:'Inter','Noto Sans','DejaVu Sans',sans-serif;letter-spacing:-.01em}
.ms{display:inline-block;line-height:1;letter-spacing:normal;text-transform:none;white-space:nowrap;word-wrap:normal;direction:ltr;font-style:normal;font-weight:normal;font-feature-settings:'liga';-webkit-font-feature-settings:'liga';vertical-align:middle;flex-shrink:0;user-select:none}
.os-android .only-ios,.os-ios .only-and{display:none!important}
/* сцена: неутрален мек фон, върху който се снима устройството или друг предмет */
.stage,.scene{display:inline-block;padding:22px 22px 30px;background:radial-gradient(120% 90% at 50% 0%,#f6f7f9 0%,#e6e9ee 60%,#dadee5 100%)}
/* устройство */
.phone{position:relative;width:402px;padding:2px;border-radius:50px;
  background:linear-gradient(135deg,#e9ecef 0%,#8d939b 14%,#3b3f45 32%,#1b1d21 50%,#5d636b 72%,#c9cdd3 90%,#8d939b 100%);
  box-shadow:0 0 0 .5px rgba(0,0,0,.55),0 1px 1px rgba(15,23,42,.16),0 6px 12px -3px rgba(15,23,42,.22),0 22px 36px -10px rgba(15,23,42,.38),0 46px 70px -22px rgba(15,23,42,.32)}
.phone:before,.phone:after{content:"";position:absolute;width:4px;border-radius:2px;background:linear-gradient(90deg,#4a4f56,#c3c7cd 45%,#6b7078);box-shadow:0 1px 2px rgba(0,0,0,.3)}
.os-android .phone:before{right:-3px;top:150px;height:64px}
.os-android .phone:after{right:-3px;top:232px;height:34px}
.os-ios .phone{border-radius:56px}
.os-ios .phone:before{left:-3px;top:140px;height:50px}
.os-ios .phone:after{right:-3px;top:170px;height:82px}
.bezel{border-radius:48px;padding:5px;background:#050506;position:relative;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07)}
.os-ios .bezel{border-radius:54px;padding:6px}
.display{position:relative;border-radius:43px;overflow:hidden;width:390px}
.os-ios .display{border-radius:48px}
.display:after{content:"";position:absolute;inset:0;pointer-events:none;z-index:50;background:linear-gradient(112deg,rgba(255,255,255,.085) 0%,rgba(255,255,255,.03) 24%,rgba(255,255,255,0) 25%)}
.cam{position:absolute;z-index:40;top:12px;left:50%;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#2f3b52 0,#0b0e14 38%,#000 70%);box-shadow:0 0 0 2px #000,0 0 0 2.5px rgba(255,255,255,.06)}
.island{position:absolute;z-index:40;top:11px;left:50%;width:118px;height:34px;margin-left:-59px;border-radius:20px;background:#000}
.island:after{content:"";position:absolute;right:15px;top:11px;width:12px;height:12px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#1c2536 0,#080b12 45%,#000 75%)}
.status{display:flex;align-items:center;justify-content:space-between;position:relative;z-index:30}
.and-status{height:38px;padding:4px 24px 0 26px;font-size:14px;font-weight:500;letter-spacing:.1px}
.ios-status{height:54px;padding:10px 32px 0 40px;font-size:16px;font-weight:600;letter-spacing:-.2px}
.st-right{display:flex;align-items:center;gap:6px}
.and-status .st-right{gap:5px}.st-pct{font-size:12.5px;font-weight:500;margin:0 -1px 0 1px}
.screen{min-height:660px;display:flex;flex-direction:column;position:relative}
.grow{flex:1}
.navbar{height:26px;display:flex;align-items:center;justify-content:center;position:relative;z-index:30}
.navbar i{display:block;width:112px;height:4.5px;border-radius:3px;opacity:.85}
.ios-nav{height:30px}.ios-nav i{width:138px;height:5px;margin-top:8px}
/* учебни анотации */
.ring{box-shadow:0 0 0 3px #d32f2f,0 0 0 5px rgba(255,255,255,.92)!important}
.ringr{border-radius:999px}
.tip{position:absolute;font-size:13px;font-weight:600;line-height:1.3;color:#fff;background:#d32f2f;padding:6px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.28);z-index:60;text-align:center;max-width:280px}
.tip.ar:after{content:"";position:absolute;width:0;height:0;border:7px solid transparent}
.tip.ar-d:after{top:100%;left:var(--ax,50%);margin-left:-7px;border-top-color:#d32f2f;border-bottom:0}
.tip.ar-u:after{bottom:100%;left:var(--ax,50%);margin-left:-7px;border-bottom-color:#d32f2f;border-top:0}
.tip.ar-l:after{right:100%;top:var(--ay,50%);margin-top:-7px;border-right-color:#d32f2f;border-left:0}
.tip.ar-r:after{left:100%;top:var(--ay,50%);margin-top:-7px;border-left-color:#d32f2f;border-right:0}
.red{color:#d32f2f}
/* редове в настройки */
.row{display:flex;align-items:center;gap:14px;padding:7px 16px;min-height:52px}
.row .rl{flex:1;font-size:16px;color:#1f1f1f;line-height:1.25}
.row .rr{color:#5f6368;font-size:14.5px;display:flex;align-items:center;gap:6px}
.row.ring{border-radius:12px;margin:4px 8px;padding:7px 8px}
.ric{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--t);color:var(--c);flex-shrink:0}
.os-ios .row{padding:7px 16px;min-height:48px;gap:14px;border-bottom:.5px solid #e5e5ea}
.os-ios .row .rl{color:#000;font-size:17px}.os-ios .row .rr{color:#8e8e93;font-size:17px}
.os-ios .ric{width:30px;height:30px;border-radius:7px;background:var(--s);color:#fff}
.os-ios .ric .ms{font-size:19px!important}
/* превключвател */
.tg{position:relative;flex-shrink:0;display:inline-block}
.os-android .tg{width:52px;height:32px;border-radius:16px;background:#e7e0ec;border:2px solid #79747e}
.os-android .tg i{position:absolute;top:50%;left:6px;width:16px;height:16px;margin-top:-8px;border-radius:50%;background:#79747e}
.os-android .tg.on{background:#0b57d0;border-color:#0b57d0}
.os-android .tg.on i{left:auto;right:4px;width:24px;height:24px;margin-top:-12px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.os-android .tg.on i:after{content:"";position:absolute;left:8px;top:4.5px;width:6px;height:11px;border:solid #0b57d0;border-width:0 2.2px 2.2px 0;transform:rotate(42deg) scale(.82)}
.os-ios .tg{width:51px;height:31px;border-radius:16px;background:#e9e9ea}
.os-ios .tg i{position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.15),0 1px 1px rgba(0,0,0,.16)}
.os-ios .tg.on{background:#34c759}.os-ios .tg.on i{left:auto;right:2px}
/* икона на приложение */
.appicon{display:inline-flex;flex-direction:column;align-items:center;gap:6px;width:var(--w)}
.appicon .ai{width:var(--s);height:var(--s);display:flex;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.18),0 3px 8px -2px rgba(0,0,0,.2);position:relative}
.appicon .al{font-size:12px;line-height:1.15;text-align:center;color:inherit;max-width:var(--w);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.os-ios .appicon .al{font-size:11.5px}
`;

// ───────────────────────── Устройство ─────────────────────────
// phone(inner, bg, scHl, {os:'android'|'ios', time, battery, nav:true})
function phone(inner, bg = "#ffffff", scHl = "#0b0b0b", opts = {}) {
  const system = opts.os === "ios" ? "ios" : "android";
  const dark = isLight(scHl);
  const sb = statusBar({ os: system, dark, color: scHl, time: opts.time, battery: opts.battery });
  const nb = opts.nav === false ? "" : navBar({ os: system, dark, color: scHl });
  const cam = system === "ios" ? `<div class="island"></div>` : `<div class="cam"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
  <body class="os-${system}"><div class="stage"><div class="phone"><div class="bezel"><div class="display" style="background:${bg}">
    ${cam}${sb}<div class="screen">${inner}</div>${nb}
  </div></div></div></div></body></html>`;
}

// Сцена без телефон (банкноти, монети, снимки, хартия…): scene(inner, {w, h, bg, pad})
function scene(inner, o = {}) {
  const { w, h, bg, pad } = o;
  const st = [w ? `width:${w}px` : "", h ? `height:${h}px` : "", bg ? `background:${bg}` : "", pad != null ? `padding:${pad}px` : ""].filter(Boolean).join(";");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
  <body class="os-android"><div class="scene" style="${st}">${inner}</div></body></html>`;
}

// ───────────────────────── Малки градивни елементи ─────────────────────────
const av = (l, c, s = 38) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:${Math.round(s * 0.42)}px;flex-shrink:0">${l}</div>`;

// tip(text, css, {arrow:'d'|'u'|'l'|'r', at:'30%'}) — червен учебен етикет; arrow сочи към обекта.
function tip(text, css = "", o = {}) {
  const a = o.arrow ? ` ar ar-${o.arrow}` : "";
  const v = o.at ? `${o.arrow === "l" || o.arrow === "r" ? "--ay" : "--ax"}:${o.at};` : "";
  return `<div class="tip${a}" style="${v}${css}">${text}</div>`;
}
const navTitle = (bg, fg, title) => `<div style="background:${bg};color:${fg};padding:12px 16px 12px 12px;display:flex;align-items:center;gap:14px;min-height:56px"><span style="display:flex">${I.back}</span><div class="nt" style="flex:1;font-weight:500;font-size:20px;letter-spacing:0">${title}</div></div>`;

// Емоджи → Material Symbols (име, цвят-ключ). Непознато емоджи се оставя както е.
const EMOJI = {
  "⚙": ["settings", "grey"], "📶": ["wifi", "blue"], "🔵": ["bluetooth", "blue"], "🔦": ["flashlight_on", "yellow"],
  "✈": ["flight", "blue"], "🔔": ["notifications", "orange"], "☀": ["light_mode", "yellow"], "📍": ["location_on", "red"],
  "🔒": ["lock", "green"], "🔋": ["battery_full", "green"], "📱": ["smartphone", "blue"], "🖼": ["image", "purple"],
  "🟣": ["circle", "purple"], "📺": ["tv", "purple"], "📳": ["vibration", "orange"], "🚫": ["block", "red"],
  "📊": ["bar_chart", "blue"], "🌙": ["dark_mode", "purple"], "🌍": ["public", "blue"], "🛍": ["shopping_bag", "orange"],
  "🗣": ["record_voice_over", "teal"], "🗑": ["delete", "red"], "🕘": ["schedule", "blue"], "🕐": ["schedule", "blue"],
  "🔲": ["apps", "purple"], "🔤": ["text_fields", "blue"], "🔕": ["notifications_off", "red"], "🔑": ["key", "green"],
  "🔍": ["search", "blue"], "🔊": ["volume_up", "orange"], "🔆": ["brightness_medium", "yellow"], "📢": ["campaign", "orange"],
  "📘": ["menu_book", "blue"], "📉": ["trending_down", "red"], "📅": ["calendar_month", "blue"], "💬": ["chat", "green"],
  "💡": ["lightbulb", "yellow"], "👥": ["group", "blue"], "🐢": ["speed", "teal"], "🏦": ["account_balance", "blue"],
  "🎵": ["music_note", "orange"], "🎮": ["sports_esports", "purple"], "🎬": ["movie", "red"], "🎧": ["headphones", "orange"],
  "🎚": ["tune", "yellow"], "🍪": ["cookie", "orange"], "🌑": ["contrast", "grey"], "🌐": ["language", "blue"],
  "🅱": ["bluetooth", "blue"], "✓": ["check", "green"], "⚡": ["bolt", "yellow"], "☁": ["cloud", "blue"],
  "⏱": ["timer", "teal"], "⏰": ["alarm", "orange"], "⌨": ["keyboard", "grey"], "ℹ": ["info", "blue"],
  "💊": ["medication", "teal"], "🩺": ["stethoscope", "teal"], "🧪": ["science", "purple"], "💉": ["vaccines", "teal"],
  "📄": ["description", "blue"], "🔄": ["screen_rotation", "teal"], "🏠": ["home", "blue"], "👤": ["person", "blue"],
  "❤": ["favorite", "red"], "⭐": ["star", "yellow"], "📞": ["call", "green"], "✉": ["mail", "red"],
  "📷": ["photo_camera", "grey"], "📁": ["folder", "yellow"], "🔗": ["link", "blue"], "🔐": ["lock", "green"],
  "📲": ["install_mobile", "blue"], "🧾": ["receipt_long", "teal"], "💳": ["credit_card", "blue"], "📝": ["edit_note", "orange"],
  "📤": ["upload", "blue"], "📥": ["download", "blue"], "🔎": ["search", "blue"], "🆘": ["sos", "red"],
  "🌈": ["palette", "purple"], "🎨": ["palette", "purple"], "🔠": ["format_size", "blue"], "🔉": ["volume_down", "orange"],
  "🔇": ["volume_off", "red"], "⏻": ["power_settings_new", "red"],
};
const PAL = {
  blue: ["#0b57d0", "#d3e3fd", "#007aff"], orange: ["#8f4700", "#ffdcbd", "#ff9500"], yellow: ["#6d5700", "#fbe9a6", "#ffcc00"],
  green: ["#0a6c3a", "#c4eed0", "#34c759"], purple: ["#5b3aa0", "#e9ddff", "#af52de"], teal: ["#00606a", "#c2ecf0", "#30b0c7"],
  red: ["#9c2a22", "#ffd9d6", "#ff3b30"], grey: ["#44474e", "#e1e2ec", "#8e8e93"],
};
const stripVS = (s) => String(s).replace(/️/g, "");
function rowIcon(icon) {
  const key = stripVS(icon).trim();
  const m = EMOJI[key];
  if (!m) return icon; // не е емоджи от таблицата (напр. вече готов HTML) — оставя се
  const [c, t, s] = PAL[m[1]];
  const fill = ["circle", "settings", "lock", "notifications", "location_on", "bolt", "info", "call", "mail", "star", "favorite", "home", "person", "folder"].includes(m[0]) ? 1 : 0;
  return `<span class="ric" style="--c:${c};--t:${t};--s:${s}">${ms(m[0], { size: 22, fill })}</span>`;
}

// Ред в списък с настройки (Pixel/One UI на Android, групиран стил на iOS).
function setRow(icon, label, right = "", hl = false) {
  const r = right === "›" ? ms("chevron_right", { size: 22, color: "#8e8e93" }) : right;
  return `<div class="row${hl ? " ring" : ""}"><span style="display:flex">${rowIcon(icon)}</span><div class="rl">${label}</div><div class="rr">${r}</div></div>`;
}
// Превключвател: Material 3 (Android) / iOS — според os на телефона.
const toggle = (on) => `<span class="tg${on ? " on" : ""}"><i></i></span>`;

// ───────────────────────── Банкноти (ЕЦБ) ─────────────────────────
// Оригинални размери на образците „SPECIMEN“ 72 dpi (px). Правило на ЕЦБ: никога повече пиксели.
const NOTE_PX = {
  "5-front": [340, 176], "5-back": [340, 176], "10-front": [363, 190], "10-back": [360, 190],
  "20-front": [377, 204], "20-back": [377, 204], "50-front": [397, 218], "50-back": [397, 218],
  "100-front": [417, 218], "100-back": [417, 221], "200-front": [434, 218], "200-back": [434, 218],
};
// banknote(50,'front'|'back', cssWidth?, {style}) → <img>; без cssWidth — най-големият позволен размер.
function banknote(denom, side = "front", cssWidth, o = {}) {
  const key = `${denom}-${side}`;
  const px = NOTE_PX[key];
  if (!px) throw new Error(`banknote: няма образец „${key}“ (номинали 5,10,20,50,100,200; страни front|back)`);
  const max = px[0] / DSF;
  const w = cssWidth == null ? max : cssWidth;
  if (w > max + 1e-9) {
    throw new Error(`banknote(${denom},'${side}'): ширина ${w}px е над позволените ${max}px — ЕЦБ (Решение 2013/10, чл. 2) не допуска уголемяване над 72 dpi при 100% размер`);
  }
  const shadow = o.shadow === false ? "" : "filter:drop-shadow(0 1px 1px rgba(0,0,0,.25)) drop-shadow(0 4px 8px rgba(0,0,0,.18));";
  return `<img alt="" src="${furl(ASSETS, "ecb/banknotes", key + ".jpg")}" style="display:block;width:${w}px;height:auto;${shadow}${o.style || ""}">`;
}
banknote.maxWidth = (denom, side = "front") => NOTE_PX[`${denom}-${side}`][0] / DSF;

// ───────────────────────── Монети (ЕЦБ) ─────────────────────────
const COIN_MM = { "1c": 16.25, "2c": 18.75, "5c": 21.25, "10c": 19.75, "20c": 22.25, "50c": 24.25, "1e": 23.25, "2e": 25.75 };
function pngSize(file) {
  const fd = fs.openSync(file, "r"); const b = Buffer.alloc(24); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
// coin('2e', 'common'|'bg', {scale: px/мм (по подразб. 6), shadow:true, rotate:0, style})
// 1 мм реален размер = scale css px. Не уголемява над оригинала (560 px ≈ 280 css px).
function coin(denom, side = "common", o = {}) {
  const d = String(denom).replace(/\s|€/g, "").replace(/^(\d+)(евро|eur|euro)$/i, "$1e").replace(/^(\d+)(ст|цента?|cents?)$/i, "$1c");
  if (!COIN_MM[d]) throw new Error(`coin: непознат номинал „${denom}“ (1c,2c,5c,10c,20c,50c,1e,2e)`);
  if (side !== "common" && side !== "bg") throw new Error(`coin: страна „${side}“ — common|bg`);
  const { scale = 6, shadow = true, rotate = 0, style = "" } = o;
  const file = path.join(ASSETS, "ecb/coins", side, `${d}.png`);
  const [pw] = pngSize(file);
  const w = +(COIN_MM[d] * scale).toFixed(2);
  if (w * DSF > pw * 1.02) throw new Error(`coin(${d}): ${w}px е над ${(pw / DSF).toFixed(0)}px — ще е уголемена; намалете scale`);
  const sh = shadow ? "filter:drop-shadow(0 .6px .4px rgba(0,0,0,.45)) drop-shadow(0 3px 3px rgba(0,0,0,.28)) drop-shadow(0 9px 9px rgba(0,0,0,.2));" : "";
  return `<img alt="" src="${furl(file)}" style="display:block;width:${w}px;height:auto;${rotate ? `transform:rotate(${rotate}deg);` : ""}${sh}${style}">`;
}
coin.mm = COIN_MM;

// ───────────────────────── Снимки ─────────────────────────
// photo('credits/gerb.jpg' | абсолютен път, {w, h, fit:'cover', radius, style})
// Относителен път: първо assets/credits/, после assets/. Слагайте само CC0/PDM снимки + запис в CREDITS.md.
function photo(p, o = {}) {
  const cands = path.isAbsolute(p) ? [p] : [path.join(ASSETS, "credits", p), path.join(ASSETS, p), path.join(__dirname, p)];
  const f = cands.find((c) => fs.existsSync(c));
  if (!f) throw new Error(`photo: няма файл „${p}“ (търсено в assets/credits/ и assets/)`);
  const { w, h, fit = "cover", radius = 0, style = "" } = o;
  return `<img alt="" src="${furl(f)}" style="display:block;${w ? `width:${typeof w === "number" ? w + "px" : w};` : ""}${h ? `height:${typeof h === "number" ? h + "px" : h};` : ""}object-fit:${fit};${radius ? `border-radius:${radius}px;` : ""}${style}">`;
}

// ───────────────────────── Икони на приложения ─────────────────────────
const brandPath = (slug) => {
  const t = fs.readFileSync(path.join(ASSETS, "brands", slug + ".svg"), "utf8");
  return [...t.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
};
const brandSvg = (slug, color, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">${brandPath(slug).map((d) => `<path d="${d}"/>`).join("")}</svg>`;
const G4 = `<svg viewBox="0 0 48 48" width="__S__" height="__S__"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
// Таблица: име → {bg (CSS фон на плочката), brand (simple-icons слъг) + fg, или ms (Material Symbols), или html(size), label}
const APPS = {
  // системни (Android/Pixel стил)
  phone: { bg: "#1b8a4b", ms: "call", fg: "#fff", fill: 1, label: "Телефон" },
  contacts: { bg: "#1a73e8", ms: "person", fg: "#fff", fill: 1, label: "Контакти" },
  messages: { bg: "#1a73e8", ms: "chat", fg: "#fff", fill: 1, label: "Съобщения" },
  camera: { bg: "linear-gradient(160deg,#5f6368,#2b2d31)", ms: "photo_camera", fg: "#fff", fill: 1, label: "Камера" },
  gallery: { bg: "linear-gradient(135deg,#ff7043,#e91e63)", ms: "photo_library", fg: "#fff", fill: 1, label: "Галерия" },
  settings: { bg: "linear-gradient(160deg,#6b7280,#374151)", ms: "settings", fg: "#fff", fill: 1, label: "Настройки" },
  clock: { bg: "#202124", ms: "schedule", fg: "#8ab4f8", fill: 1, label: "Часовник" },
  calendar: { bg: "#fff", ms: "calendar_month", fg: "#1a73e8", fill: 1, label: "Календар" },
  calculator: { bg: "#ff7043", ms: "calculate", fg: "#fff", fill: 1, label: "Калкулатор" },
  files: { bg: "#1a73e8", ms: "folder", fg: "#fff", fill: 1, label: "Файлове" },
  notes: { bg: "#fbbc04", ms: "edit_note", fg: "#fff", fill: 1, label: "Бележки" },
  wallet: { bg: "#34a853", ms: "account_balance_wallet", fg: "#fff", fill: 1, label: "Портфейл" },
  // марки (simple-icons, CC0)
  whatsapp: { bg: "#25D366", brand: "whatsapp", fg: "#fff", label: "WhatsApp" },
  viber: { bg: "#7360F2", brand: "viber", fg: "#fff", label: "Viber" },
  facebook: { bg: "#1877F2", brand: "facebook", fg: "#fff", label: "Facebook" },
  messenger: { bg: "linear-gradient(135deg,#00B2FF 0%,#006AFF 50%,#A334FA 85%,#FF6968 100%)", brand: "messenger", fg: "#fff", label: "Messenger" },
  instagram: { bg: "radial-gradient(circle at 30% 107%,#fdf497 0,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285AEB 90%)", brand: "instagram", fg: "#fff", label: "Instagram" },
  telegram: { bg: "linear-gradient(#37AEE2,#1E96C8)", brand: "telegram", fg: "#fff", label: "Telegram" },
  signal: { bg: "#3A76F0", brand: "signal", fg: "#fff", label: "Signal" },
  tiktok: { bg: "#000", brand: "tiktok", fg: "#fff", label: "TikTok" },
  snapchat: { bg: "#FFFC00", brand: "snapchat", fg: "#000", label: "Snapchat" },
  x: { bg: "#000", brand: "x", fg: "#fff", label: "X" },
  youtube: { bg: "#fff", brand: "youtube", fg: "#FF0000", scale: 0.74, label: "YouTube" },
  gmail: { bg: "#fff", brand: "gmail", fg: "#EA4335", scale: 0.66, label: "Gmail" },
  maps: { bg: "#fff", brand: "googlemaps", fg: "#EA4335", scale: 0.66, label: "Карти" },
  translate: { bg: "#4285F4", brand: "googletranslate", fg: "#fff", scale: 0.62, label: "Translate" },
  photos: { bg: "#fff", brand: "googlephotos", fg: "#EA4335", scale: 0.68, label: "Снимки" },
  drive: { bg: "#fff", brand: "googledrive", fg: "#1FA463", scale: 0.66, label: "Drive" },
  meet: { bg: "#fff", brand: "googlemeet", fg: "#00897B", scale: 0.66, label: "Meet" },
  lens: { bg: "#fff", brand: "googlelens", fg: "#4285F4", scale: 0.66, label: "Lens" },
  assistant: { bg: "#fff", brand: "googleassistant", fg: "#4285F4", scale: 0.66, label: "Асистент" },
  gpay: { bg: "#fff", brand: "googlepay", fg: "#5F6368", scale: 0.72, label: "G Pay" },
  spotify: { bg: "#000", brand: "spotify", fg: "#1DB954", label: "Spotify" },
  netflix: { bg: "#000", brand: "netflix", fg: "#E50914", scale: 0.6, label: "Netflix" },
  zoom: { bg: "#0B5CFF", brand: "zoom", fg: "#fff", label: "Zoom" },
  revolut: { bg: "#000", brand: "revolut", fg: "#fff", label: "Revolut" },
  paypal: { bg: "#fff", brand: "paypal", fg: "#003087", scale: 0.62, label: "PayPal" },
  waze: { bg: "#33CCFF", brand: "waze", fg: "#fff", label: "Waze" },
  firefox: { bg: "#fff", brand: "firefox", fg: "#FF7139", label: "Firefox" },
  opera: { bg: "#fff", brand: "opera", fg: "#FF1B2D", label: "Opera" },
  duckduckgo: { bg: "#DE5833", brand: "duckduckgo", fg: "#fff", label: "DuckDuckGo" },
  appstore: { bg: "linear-gradient(#18C7FB,#1B6FF0)", brand: "appstore", fg: "#fff", label: "App Store" },
  safari: { bg: "#fff", brand: "safari", fg: "#0A84FF", scale: 0.8, label: "Safari" },
  // многоцветни — рисувани
  chrome: { bg: "#fff", label: "Chrome", html: (s) => `<div style="width:${s * 0.62}px;height:${s * 0.62}px;border-radius:50%;background:conic-gradient(from 60deg,#fbbc04 0 120deg,#34a853 120deg 240deg,#ea4335 240deg 360deg);display:flex;align-items:center;justify-content:center"><div style="width:${s * 0.3}px;height:${s * 0.3}px;border-radius:50%;background:#4285f4;border:${Math.max(2, s * 0.045)}px solid #fff"></div></div>` },
  google: { bg: "#fff", label: "Google", html: (s) => G4.replace(/__S__/g, Math.round(s * 0.58)) },
  play: { bg: "#fff", label: "Play Маркет", html: (s) => `<svg width="${s * 0.58}" height="${s * 0.58}" viewBox="0 0 24 24"><path d="M3.6 1.8l11.2 10.2L3.6 22.2c-.4-.3-.6-.8-.6-1.4V3.2c0-.6.2-1.1.6-1.4z" fill="#00C3FF"/><path d="M14.8 12l3.3-3.3L5 1.4c-.5-.3-1-.3-1.4.4z" fill="#00F076"/><path d="M14.8 12L3.6 22.2c.4.3.9.3 1.4 0l13.1-7.4z" fill="#FF3A44"/><path d="M18.1 8.7L14.8 12l3.3 3.3 3.2-1.8c.9-.5.9-1.9 0-2.4z" fill="#FFD000"/></svg>` },
};
// appIcon('whatsapp', {size:56, label:true, os:'android'|'ios', badge:3, color:'#fff'})
function appIcon(name, o = {}) {
  const a = APPS[name];
  if (!a) throw new Error(`appIcon: непознато „${name}“. Налични: ${Object.keys(APPS).join(", ")}`);
  const { size = 56, os: sys = "android", badge, labelColor } = o;
  const label = o.label === false ? "" : typeof o.label === "string" ? o.label : a.label;
  const r = sys === "ios" ? size * 0.225 : size * 0.3;
  let glyph = "";
  if (a.brand) glyph = brandSvg(a.brand, a.fg, Math.round(size * (a.scale || 0.56)));
  else if (a.ms) glyph = ms(a.ms, { size: Math.round(size * 0.58), fill: a.fill || 0, color: a.fg });
  else if (a.html) glyph = a.html(size);
  const w = Math.max(size, label ? 66 : size);
  const bd = badge ? `<span style="position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;border-radius:10px;background:#d32f2f;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;box-shadow:0 0 0 2px #fff;z-index:2">${badge}</span>` : "";
  return `<div class="appicon" style="--w:${w}px;--s:${size}px;${labelColor ? `color:${labelColor};` : ""}"><div style="position:relative;width:${size}px;height:${size}px"><div class="ai" style="border-radius:${r}px;background:${a.bg}">${glyph}</div>${bd}</div>${label ? `<div class="al">${label}</div>` : ""}</div>`;
}
appIcon.names = Object.keys(APPS);

// ───────────────────────── Рендер ─────────────────────────
// render({име: html}) → public/kak-da/<име>.webp. ONLY=име1,име2 ограничава (за бърза итерация).
async function render(screens) {
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "howto-"));
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: DSF, viewport: { width: 1000, height: 1600 } });
  let ok = 0; const failed = [];
  for (const [name, html] of Object.entries(screens)) {
    if (only && !only.has(name)) continue;
    try {
      // Фрагментите (без <!doctype>) се увиват автоматично в рамката на телефон.
      const full = html.trimStart().startsWith("<!doctype") ? html : phone(html);
      const f = path.join(tmp, "s.html");
      fs.writeFileSync(f, full);
      await page.goto(pathToFileURL(f).href, { waitUntil: "load" });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
      });
      const el = (await page.$(".stage")) || (await page.$(".scene")) || (await page.$(".phone"));
      if (!el) throw new Error("няма .stage/.scene/.phone");
      // WebP вместо PNG: снимките вътре правят PNG-то ~0,5–1,8 MB, а WebP (q82) е
      // ~8 пъти по-лек при същия вид — важно за хората с мобилни данни.
      const png = await el.screenshot();
      await sharp(png).webp({ quality: 82, effort: 6 }).toFile(path.join(OUT, `${name}.webp`));
      ok++;
      console.log("✔", name);
    } catch (e) {
      failed.push(name);
      console.error("✖", name, "—", e.message);
    }
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\nГотово: ${ok} екрана в public/kak-da/` + (failed.length ? ` · ГРЕШКИ (${failed.length}): ${failed.join(", ")}` : ""));
  if (failed.length) process.exitCode = 1;
}

module.exports = {
  phone, scene, I, av, tip, navTitle, setRow, toggle, render, OUT,
  ms, statusBar, navBar, banknote, coin, photo, appIcon, ASSETS, DSF,
};
