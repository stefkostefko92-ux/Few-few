// Споделени помощни функции за генераторите на „мокъп" екрани.
const { chromium } = require("playwright");
const path = require("node:path");

const FONT = `-apple-system,'Segoe UI','DejaVu Sans','Liberation Sans',sans-serif`;
const OUT = path.resolve(__dirname, "../../public/kak-da");

function phone(inner, bg = "#ffffff", scHl = "#0b0b0b") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box;font-family:${FONT};-webkit-font-smoothing:antialiased}
  body{background:#e9edf2;display:flex;justify-content:center;padding:18px}
  .phone{width:390px;border-radius:34px;overflow:hidden;background:${bg};box-shadow:0 14px 40px rgba(2,8,23,.22);border:1px solid #d5dbe3}
  .status{height:30px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;font-size:13px;font-weight:600;color:${scHl}}
  .status .right{display:flex;gap:6px;align-items:center}
  .bar{width:16px;height:10px;border:1.5px solid currentColor;border-radius:2px;position:relative}
  .bar:after{content:"";position:absolute;right:-3px;top:2.5px;width:2px;height:4px;background:currentColor;border-radius:1px}
  .bar i{position:absolute;inset:1.5px;right:5px;background:currentColor;border-radius:1px}
  .screen{min-height:660px;display:flex;flex-direction:column;position:relative}
  .grow{flex:1}
  .ring{box-shadow:0 0 0 4px #ef4444, 0 0 0 9px rgba(239,68,68,.25)}
  .ringr{border-radius:999px}
  .tip{position:absolute;font-size:12.5px;font-weight:700;color:#fff;background:#ef4444;padding:5px 11px;border-radius:9px;box-shadow:0 4px 10px rgba(0,0,0,.22);z-index:5;text-align:center;max-width:270px}
  .red{color:#ef4444}
  </style></head><body><div class="phone">
    <div class="status"><span>9:41</span><span class="right">5G<span class="bar"><i></i></span></span></div>
    <div class="screen">${inner}</div></div></body></html>`;
}

const I = {
  back: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  phone: `<svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.3 1l-2.2 2.3z"/></svg>`,
  video: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h11a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zm15 3l3-2v10l-3-2V9z"/></svg>`,
  plus: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></svg>`,
  cam: `<svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4l-1.5 2H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-3.5L15 4H9zm3 5a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"/></svg>`,
  mic: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.9V21h2v-3.1A7 7 0 0019 11h-2z"/></svg>`,
  send: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2-7-8-3z"/></svg>`,
  search: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" stroke-linecap="round"/></svg>`,
  clip: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11l-8.5 8.5a4 4 0 01-6-6L14 5a3 3 0 014 4l-8.5 8.5a1.5 1.5 0 01-2-2L13 8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  trash: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z"/></svg>`,
  reply: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 015 5v1"/></svg>`,
  star: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1L12 2z"/></svg>`,
  pin: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>`,
  play: `<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  wifi: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 18a2 2 0 110 4 2 2 0 010-4zm0-5c1.7 0 3.3.7 4.5 1.8l-1.4 1.5A4.4 4.4 0 0012 16c-1.2 0-2.3.5-3.1 1.3L7.5 15.8A6.4 6.4 0 0112 13zm0-5c3 0 5.8 1.2 7.8 3.2l-1.4 1.5A8.9 8.9 0 0012 11c-2.5 0-4.7 1-6.4 2.6L4.2 12.2A11 11 0 0112 8z"/></svg>`,
  bell: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2.5 2.5 0 002.45-2h-4.9A2.5 2.5 0 0012 22zm7-5l-1.5-1.6V11a5.5 5.5 0 00-4-5.3V5a1.5 1.5 0 00-3 0v.7A5.5 5.5 0 006.5 11v4.4L5 17v1h14v-1z"/></svg>`,
  globe: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>`,
  lock: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 10V7a6 6 0 1112 0v3h1a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h8V7a4 4 0 10-8 0v3z"/></svg>`,
  qr: `<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm10 0h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v2h-2v-2z"/></svg>`,
  download: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M5 21h14"/></svg>`,
};

const av = (l, c, s = 38) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(s*0.42)}px;flex-shrink:0">${l}</div>`;
const tip = (text, css) => `<div class="tip" style="${css}">${text}</div>`;
const navTitle = (bg, fg, title) => `<div style="background:${bg};color:${fg};padding:13px 14px;display:flex;align-items:center;gap:12px"><span>${I.back}</span><div style="flex:1;font-weight:700;font-size:17px">${title}</div></div>`;

// Ред в списък с настройки.
function setRow(icon, label, right = "", hl = false) {
  return `<div class="${hl?'ring':''}" style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid #f0f0f0;${hl?'border-radius:10px;margin:4px 8px;':''}">
    <span style="font-size:20px">${icon}</span><div style="flex:1;font-size:16px;color:#111">${label}</div><div style="color:#888;font-size:15px;display:flex;align-items:center;gap:6px">${right}</div></div>`;
}
// Превключвател (toggle).
const toggle = (on) => `<div style="width:46px;height:27px;border-radius:14px;background:${on?'#34c759':'#d1d1d6'};position:relative;flex-shrink:0"><span style="position:absolute;top:2px;${on?'right:2px':'left:2px'};width:23px;height:23px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></span></div>`;

async function render(screens) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const [name, html] of Object.entries(screens)) {
    // Фрагментите (без <!doctype>) се увиват автоматично в рамката на телефон.
    const full = html.trimStart().startsWith("<!doctype") ? html : phone(html);
    await page.setContent(full, { waitUntil: "networkidle" });
    const el = await page.$(".phone");
    await el.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log("✔", name);
  }
  await browser.close();
  console.log(`\nГотово: ${Object.keys(screens).length} екрана в public/kak-da/`);
}

module.exports = { phone, I, av, tip, navTitle, setRow, toggle, render, OUT };
