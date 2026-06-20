// Генератор на „мокъп" екрани за ръководствата „Как да…" (Viber, Messenger,
// WhatsApp, Facebook). Това са СТИЛИЗИРАНИ пресъздавания на интерфейса — близки
// до реалния вид, за да разпознаят възрастните хората какво да търсят, но НЕ са
// официални екрани на съответните компании. Важният бутон е подчертан в червено.
//
// Стартиране (от папката zabobovdol/):  node scripts/howto-mockups/gen.js
// Изходните PNG-та отиват в public/kak-da/ и се качват в хранилището.
const { chromium } = require("playwright");
const path = require("node:path");
const OUT = path.resolve(__dirname, "../../public/kak-da");

const FONT = `-apple-system,'Segoe UI','DejaVu Sans','Liberation Sans',sans-serif`;

function phone(inner, bg = "#ffffff", scHl = "#0b0b0b") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box;font-family:${FONT};-webkit-font-smoothing:antialiased}
  body{background:#e9edf2;display:flex;justify-content:center;padding:18px}
  .phone{width:390px;border-radius:34px;overflow:hidden;background:${bg};
    box-shadow:0 14px 40px rgba(2,8,23,.22);border:1px solid #d5dbe3}
  .status{height:30px;display:flex;align-items:center;justify-content:space-between;
    padding:0 20px;font-size:13px;font-weight:600;color:${scHl}}
  .status .right{display:flex;gap:6px;align-items:center}
  .bar{width:16px;height:10px;border:1.5px solid currentColor;border-radius:2px;position:relative}
  .bar:after{content:"";position:absolute;right:-3px;top:2.5px;width:2px;height:4px;background:currentColor;border-radius:1px}
  .bar i{position:absolute;inset:1.5px;right:5px;background:currentColor;border-radius:1px}
  .screen{min-height:660px;display:flex;flex-direction:column;position:relative}
  .grow{flex:1}
  .ring{box-shadow:0 0 0 4px #ef4444, 0 0 0 9px rgba(239,68,68,.25)}
  .ringr{border-radius:999px}
  .tip{position:absolute;font-size:12.5px;font-weight:700;color:#fff;background:#ef4444;
    padding:5px 11px;border-radius:9px;box-shadow:0 4px 10px rgba(0,0,0,.22);z-index:5;text-align:center;max-width:260px}
  .red{color:#ef4444}
  </style></head><body><div class="phone">
    <div class="status"><span>9:41</span><span class="right">5G<span class="bar"><i></i></span></span></div>
    <div class="screen">${inner}</div>
  </div></body></html>`;
}

// ── икони (inline SVG) ──
const I = {
  back: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  phone: `<svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.4 0 .8-.3 1l-2.2 2.3z"/></svg>`,
  video: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h11a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zm15 3l3-2v10l-3-2V9z"/></svg>`,
  plus: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></svg>`,
  cam: `<svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4l-1.5 2H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-3.5L15 4H9zm3 5a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"/></svg>`,
  mic: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 003-3V6a3 3 0 00-6 0v5a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.9V21h2v-3.1A7 7 0 0019 11h-2z"/></svg>`,
  send: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2-7-8-3z"/></svg>`,
  smile: `<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke-linecap="round"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>`,
  thumb: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M2 10h3v10H2V10zm6 10c-.8 0-1.5-.7-1.5-1.5V10c0-.4.2-.8.4-1l5-5.5c.3.2.5.5.5.9V8h5.5c1 0 1.8.9 1.6 1.9l-1.4 8c-.2 1-1 1.7-2 1.7H8z"/></svg>`,
  pin: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>`,
  person: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 6v2h18v-2c0-3.5-4-6-9-6z"/></svg>`,
  download: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M5 21h14"/></svg>`,
  search: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4" stroke-linecap="round"/></svg>`,
  bell: `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2.5 2.5 0 002.45-2h-4.9A2.5 2.5 0 0012 22zm7-5l-1.5-1.6V11a5.5 5.5 0 00-4-5.3V5a1.5 1.5 0 00-3 0v.7A5.5 5.5 0 006.5 11v4.4L5 17v1h14v-1z"/></svg>`,
  lock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 10V7a6 6 0 1112 0v3h1a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1h1zm2 0h8V7a4 4 0 10-8 0v3z"/></svg>`,
};

const av = (l, c, s = 38) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(s*0.42)}px;flex-shrink:0">${l}</div>`;
const hdr = (bg, fg, name, sub, sfg = fg) => `<div style="background:${bg};color:${fg};padding:8px 12px;display:flex;align-items:center;gap:10px${bg==='#fff'?';border-bottom:1px solid #f0f0f0':''}">
  <span>${I.back}</span>${av(name[0], sfg==='#fff'?'rgba(255,255,255,.3)':'#90caf9')}
  <div style="flex:1"><div style="font-weight:700;font-size:16px;color:${bg==='#fff'?'#111':fg}">${name}</div>
    <div style="font-size:12px;opacity:.85;color:${bg==='#fff'?'#65676b':fg}">${sub}</div></div>
  <span>${I.video}</span><span>${I.phone}</span></div>`;
const tip = (text, css) => `<div class="tip" style="${css}">${text}</div>`;

// ───────────────────────── ЕКРАНИ ─────────────────────────
const S = {};

// VIBER — писане
S["viber-pisane"] = phone(`
  ${hdr("#7360f2","#fff","Мария (дъщеря)","в мрежата")}
  <div class="grow" style="background:#ece9f7;padding:14px 12px;display:flex;flex-direction:column;gap:10px">
    <div style="align-self:center;background:#d7d0ee;color:#5b4a9e;font-size:11px;padding:3px 10px;border-radius:10px">Днес</div>
    <div style="align-self:flex-start;max-width:74%;background:#fff;padding:8px 12px;border-radius:14px 14px 14px 4px;font-size:15px;color:#1b1b1b;box-shadow:0 1px 1px rgba(0,0,0,.06)">Здравей, мамо! Как си днес? ❤️</div>
    <div style="align-self:flex-end;max-width:74%;background:#e7ddff;padding:8px 12px;border-radius:14px 14px 4px 14px;font-size:15px;color:#1b1b1b">Добре съм, миличка.<span style="display:block;text-align:right;font-size:10px;color:#8a7fb5;margin-top:2px">13:12 ✓✓</span></div>
  </div>
  <div style="background:#fff;padding:9px 10px;display:flex;align-items:center;gap:9px;border-top:1px solid #eee">
    <span style="color:#8a8a8a">${I.plus}</span>
    <div style="flex:1;background:#f0f0f3;border-radius:20px;padding:9px 14px;color:#1b1b1b;font-size:15px;display:flex;justify-content:space-between;align-items:center">До скоро!<span style="color:#9a9a9a">${I.smile}</span></div>
    <div class="ring ringr" style="background:#7360f2;color:#fff;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center">${I.send}</div>
  </div>
  ${tip("Натиснете стрелката, за да изпратите","right:8px;bottom:64px")}
`);

// VIBER — гласово
S["viber-glasovo"] = phone(`
  ${hdr("#7360f2","#fff","Мария (дъщеря)","в мрежата")}
  <div class="grow" style="background:#ece9f7;padding:14px 12px;display:flex;flex-direction:column;gap:12px">
    <div style="align-self:flex-start;max-width:80%;background:#fff;padding:10px 12px;border-radius:14px;display:flex;align-items:center;gap:10px;box-shadow:0 1px 1px rgba(0,0,0,.06)">
      <div style="width:34px;height:34px;border-radius:50%;background:#7360f2;color:#fff;display:flex;align-items:center;justify-content:center">▶</div>
      <div style="flex:1;height:3px;background:#d7d0ee;border-radius:2px;position:relative"><span style="position:absolute;left:0;top:-4px;width:11px;height:11px;border-radius:50%;background:#7360f2"></span></div>
      <span style="font-size:12px;color:#7a7a7a">0:08</span></div>
    <div style="align-self:center;color:#6b5fa8;font-size:13px;text-align:center;max-width:80%">Гласовото е по-лесно от писане — просто говорите.</div>
  </div>
  <div style="background:#fff;padding:9px 10px;display:flex;align-items:center;gap:9px;border-top:1px solid #eee">
    <span style="color:#8a8a8a">${I.plus}</span>
    <div style="flex:1;background:#f0f0f3;border-radius:20px;padding:9px 14px;color:#9a9a9a;font-size:15px">Съобщение…</div>
    <span style="color:#8a8a8a">${I.cam}</span>
    <div class="ring ringr" style="background:#7360f2;color:#fff;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center">${I.mic}</div>
  </div>
  ${tip("Задръжте микрофона и говорете","right:6px;bottom:64px")}
`);

// VIBER — нова група
S["viber-grupa"] = phone(`
  <div style="background:#7360f2;color:#fff;padding:12px;display:flex;align-items:center;gap:12px">
    <span>${I.back}</span><div style="flex:1;font-weight:700;font-size:17px">Нова група</div></div>
  <div style="background:#fff;padding:12px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:12px">
    ${av("📷","#e0dcf5",44)}<div style="flex:1;color:#9a9a9a;font-size:15px;border-bottom:1px solid #eee;padding-bottom:6px">Име на групата</div></div>
  <div style="padding:10px 14px;color:#7360f2;font-weight:700;font-size:13px;background:#f7f6fc">ИЗБЕРЕТЕ УЧАСТНИЦИ</div>
  <div class="grow" style="background:#fff">
    ${["Мария (дъщеря)|#b39ddb|1","Иван (син)|#90caf9|1","Елена (сестра)|#a5d6a7|0","Петър (зет)|#ffcc80|0"].map(r=>{const[n,c,on]=r.split("|");return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid #f3f3f3">${av(n[0],c)}<div style="flex:1;font-size:15px;color:#1b1b1b">${n}</div><div style="width:22px;height:22px;border-radius:50%;border:2px solid ${on==='1'?'#7360f2':'#cfcfcf'};background:${on==='1'?'#7360f2':'#fff'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px">${on==='1'?'✓':''}</div></div>`}).join("")}
  </div>
  <div style="position:absolute;right:18px;bottom:24px"><div class="ring ringr" style="background:#7360f2;color:#fff;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px">→</div></div>
  ${tip("Изберете хората с отметка,<br>после натиснете стрелката","right:16px;bottom:92px")}
`);

// VIBER — меню „прикачи" (локация/контакт/снимка)
S["viber-prikachi"] = phone(`
  ${hdr("#7360f2","#fff","Иван (син)","в мрежата")}
  <div class="grow" style="background:#ece9f7"></div>
  <div style="background:#fff;border-top:1px solid #eee;padding:16px 14px">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;text-align:center;font-size:12px;color:#444">
      ${[["📷","Камера","#f0f0f3",0],["🖼️","Галерия","#f0f0f3",0],["📍","Локация","#ffe2e2",1],["👤","Контакт","#ffe2e2",1],["📄","Файл","#f0f0f3",0],["🎵","Музика","#f0f0f3",0],["😊","Стикер","#f0f0f3",0],["⋯","Още","#f0f0f3",0]].map(([e,l,bg,hl])=>`<div><div class="${hl?'ring ringr':''}" style="width:54px;height:54px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 5px">${e}</div>${l}</div>`).join("")}
    </div>
  </div>
  ${tip("„Локация“ праща къде сте,<br>„Контакт“ праща телефон на човек","left:50%;top:230px;transform:translateX(-50%)")}
`);

// VIBER — блокиране (екран с информация за контакта)
S["viber-blok"] = phone(`
  <div style="background:#7360f2;color:#fff;padding:12px;display:flex;align-items:center;gap:12px">
    <span>${I.back}</span><div style="flex:1;font-weight:700;font-size:16px">Информация</div></div>
  <div style="background:#fff;padding:22px 12px;text-align:center;border-bottom:8px solid #eef0f2">
    ${av("Н","#bdbdbd",72)}<div style="font-weight:700;font-size:19px;margin-top:10px;color:#1b1b1b">Непознат номер</div>
    <div style="color:#8a8a8a;font-size:14px">+359 88 ... ... </div></div>
  <div class="grow" style="background:#fff">
    ${[["Съобщение","#1b1b1b",0],["Аудио разговор","#1b1b1b",0],["Изключи звука","#1b1b1b",0],["Блокирай и докладвай","#ef4444",1]].map(([l,c,hl])=>`<div class="${hl?'ring':''}" style="padding:15px 16px;border-bottom:1px solid #f3f3f3;font-size:16px;color:${c};font-weight:${hl?700:500};${hl?'border-radius:10px;margin:4px 8px;':''}">${l}</div>`).join("")}
  </div>
  ${tip("Натиснете „Блокирай“ —<br>човекът няма да Ви пише повече","left:50%;top:300px;transform:translateX(-50%)")}
`);

// VIBER — изтриване на съобщение (задържане → меню)
S["viber-iztrij"] = phone(`
  ${hdr("#7360f2","#fff","Иван (син)","в мрежата")}
  <div class="grow" style="background:#ece9f7;padding:14px 12px;position:relative">
    <div style="align-self:flex-end;margin-left:auto;max-width:74%;width:fit-content;background:#e7ddff;padding:8px 12px;border-radius:14px;font-size:15px;color:#1b1b1b;box-shadow:0 0 0 3px rgba(115,96,242,.4)">Това съобщение е с грешка</div>
    <div style="position:absolute;right:14px;top:62px;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:hidden;width:180px">
      ${[["Отговори",0],["Копирай",0],["Препрати",0],["Изтрий",1]].map(([l,hl])=>`<div class="${hl?'ring':''}" style="padding:12px 16px;font-size:15px;color:${hl?'#ef4444':'#1b1b1b'};font-weight:${hl?700:500};border-bottom:1px solid #f3f3f3;${hl?'border-radius:8px;':''}">${l}</div>`).join("")}
    </div>
  </div>
  <div style="background:#fff;padding:9px 10px;display:flex;align-items:center;gap:9px;border-top:1px solid #eee">
    <span style="color:#8a8a8a">${I.plus}</span><div style="flex:1;background:#f0f0f3;border-radius:20px;padding:9px 14px;color:#9a9a9a;font-size:15px">Съобщение…</div><span style="color:#8a8a8a">${I.mic}</span></div>
  ${tip("Задръжте пръст върху съобщението,<br>после изберете „Изтрий“","left:14px;bottom:74px")}
`);

// VIBER — прочетено (легенда на отметките)
S["viber-procheteno"] = phone(`
  ${hdr("#7360f2","#fff","Мария (дъщеря)","в мрежата")}
  <div class="grow" style="background:#ece9f7;padding:18px 14px;display:flex;flex-direction:column;gap:16px">
    <div style="align-self:flex-end;background:#e7ddff;padding:8px 12px;border-radius:14px;font-size:15px;color:#1b1b1b">Добро утро! <span style="font-size:11px;color:#9a9a9a">✓</span></div>
    <div style="align-self:flex-end;background:#e7ddff;padding:8px 12px;border-radius:14px;font-size:15px;color:#1b1b1b">Как си? <span style="font-size:11px;color:#9a9a9a">✓✓</span></div>
    <div style="align-self:flex-end;background:#e7ddff;padding:8px 12px;border-radius:14px;font-size:15px;color:#1b1b1b">Обичам те ❤️ <span style="font-size:11px;color:#7360f2">✓✓</span></div>
    <div style="background:#fff;border-radius:14px;padding:14px;margin-top:8px;font-size:14px;color:#444;box-shadow:0 2px 8px rgba(0,0,0,.08)">
      <div style="display:flex;gap:8px;margin-bottom:8px"><b style="color:#9a9a9a">✓</b> Изпратено</div>
      <div style="display:flex;gap:8px;margin-bottom:8px"><b style="color:#9a9a9a">✓✓</b> Доставено (стигна до телефона)</div>
      <div style="display:flex;gap:8px"><b style="color:#7360f2">✓✓</b> <span><b style="color:#7360f2">Лилаво</b> = човекът го <b>прочете</b></span></div>
    </div>
  </div>
`);

// VIBER — емоджи/стикери
S["viber-emoji"] = phone(`
  ${hdr("#7360f2","#fff","Елена (сестра)","в мрежата")}
  <div style="background:#ece9f7;padding:12px;flex:0 0 auto;min-height:140px"><div style="align-self:flex-start;background:#fff;padding:8px 12px;border-radius:14px;font-size:15px;color:#1b1b1b;width:fit-content;box-shadow:0 1px 1px rgba(0,0,0,.06)">Честит празник! 🎉</div></div>
  <div style="background:#fff;padding:9px 10px;display:flex;align-items:center;gap:9px;border-top:1px solid #eee">
    <span style="color:#8a8a8a">${I.plus}</span><div style="flex:1;background:#f0f0f3;border-radius:20px;padding:9px 14px;color:#9a9a9a;font-size:15px">Съобщение…</div>
    <div class="ring ringr" style="color:#7360f2;display:flex;padding:3px">${I.smile}</div></div>
  <div style="background:#f7f6fc;padding:14px 12px;border-top:1px solid #eee">
    <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:30px;justify-content:center">😀 😍 👍 ❤️ 🎉 🌹 ☀️ 😂 🙏 😘 👏 🥰</div>
  </div>
  ${tip("Натиснете усмихнатото лице,<br>после изберете картинка","right:60px;bottom:230px")}
`);

// VIBER — заглушаване на чат
S["viber-zaglushi"] = phone(`
  <div style="background:#7360f2;color:#fff;padding:12px;display:flex;align-items:center;gap:12px">
    <span>${I.back}</span><div style="flex:1;font-weight:700;font-size:16px">Семейна група</div></div>
  <div class="grow" style="background:#fff;display:flex;align-items:center;justify-content:center;padding:20px">
    <div style="background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.16);width:100%;overflow:hidden">
      <div style="padding:16px;font-weight:700;font-size:16px;color:#1b1b1b;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f0f0f0"><span style="color:#7360f2">${I.bell}</span> Заглуши известията</div>
      ${[["За 1 час",0],["За 8 часа",0],["До утре сутрин",0],["Завинаги",1]].map(([l,hl])=>`<div class="${hl?'ring':''}" style="padding:14px 18px;font-size:16px;color:#1b1b1b;border-bottom:1px solid #f6f6f6;${hl?'border-radius:10px;margin:4px 8px;font-weight:700;':''}">${l}</div>`).join("")}
    </div>
  </div>
  ${tip("Изберете колко време<br>да мълчи групата","left:50%;bottom:120px;transform:translateX(-50%)")}
`);

// MESSENGER — чат + гласово
S["messenger"] = phone(`
  <div style="background:#fff;color:#0084ff;padding:8px 12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f0f0f0">
    <span>${I.back}</span>${av("И","#0084ff")}<div style="flex:1"><div style="font-weight:700;font-size:16px;color:#111">Иван (син)</div><div style="font-size:12px;color:#65676b">Активен сега</div></div><span>${I.phone}</span><span>${I.video}</span></div>
  <div class="grow" style="background:#fff;padding:14px 12px;display:flex;flex-direction:column;gap:8px">
    <div style="align-self:flex-start;max-width:74%;background:#f0f0f0;padding:9px 13px;border-radius:18px;font-size:15px;color:#050505">Мамо, гледай внучето 👶</div>
    <div style="align-self:flex-end;max-width:74%;background:linear-gradient(135deg,#00b2ff,#006aff);color:#fff;padding:9px 13px;border-radius:18px;font-size:15px">Колко е сладък! 😍<span style="display:block;text-align:right;font-size:10px;opacity:.8;margin-top:2px">Доставено</span></div>
  </div>
  <div style="background:#fff;padding:9px 10px;display:flex;align-items:center;gap:12px;border-top:1px solid #f0f0f0">
    <span style="color:#0084ff">${I.plus}</span><span style="color:#0084ff">${I.cam}</span>
    <div class="ring ringr" style="color:#0084ff;display:flex;padding:2px">${I.mic}</div>
    <div style="flex:1;background:#f0f0f3;border-radius:20px;padding:9px 14px;color:#9a9a9a;font-size:15px">Съобщение…</div><span style="color:#0084ff">${I.thumb}</span></div>
  ${tip("Микрофон = гласово съобщение","left:60px;bottom:64px")}
`);

// WHATSAPP — чат
S["whatsapp"] = phone(`
  ${hdr("#075e54","#fff","Елена (сестра)","на линия")}
  <div class="grow" style="background:#e5ddd5;padding:14px 12px;display:flex;flex-direction:column;gap:9px">
    <div style="align-self:flex-start;max-width:76%;background:#fff;padding:8px 12px;border-radius:10px 10px 10px 2px;font-size:15px;color:#111;box-shadow:0 1px 1px rgba(0,0,0,.08)">Добро утро! Как е времето? ☀️</div>
    <div style="align-self:flex-end;max-width:76%;background:#dcf8c6;padding:8px 12px;border-radius:10px 10px 2px 10px;font-size:15px;color:#111;box-shadow:0 1px 1px rgba(0,0,0,.08)">Слънчево и топло! 🌞<span style="display:block;text-align:right;font-size:10px;color:#4fae5a;margin-top:2px">08:30 ✓✓</span></div>
  </div>
  <div style="background:#f0f0f0;padding:9px 10px;display:flex;align-items:center;gap:9px">
    <div style="flex:1;background:#fff;border-radius:22px;padding:9px 14px;color:#9a9a9a;font-size:15px;display:flex;justify-content:space-between;align-items:center">Съобщение<span style="display:flex;gap:14px;color:#8a8a8a">${I.smile}${I.cam}</span></div>
    <div class="ring ringr" style="background:#25d366;color:#fff;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center">${I.mic}</div></div>
  ${tip("Зеленото приложение е WhatsApp","right:8px;bottom:66px")}
`);

// WHATSAPP — регистрация (въвеждане на номер)
S["whatsapp-registraciya"] = phone(`
  <div style="background:#075e54;color:#fff;padding:14px;text-align:center;font-weight:700;font-size:17px">WhatsApp</div>
  <div class="grow" style="background:#fff;padding:28px 22px;text-align:center">
    <div style="font-size:17px;font-weight:700;color:#075e54;margin-bottom:8px">Въведете телефонния си номер</div>
    <div style="font-size:13px;color:#777;margin-bottom:24px">WhatsApp ще Ви изпрати SMS с код за потвърждение.</div>
    <div style="display:flex;gap:10px;justify-content:center;align-items:center;margin-bottom:8px">
      <div style="border-bottom:2px solid #25d366;padding:8px 12px;font-size:16px;color:#111">🇧🇬 +359</div>
      <div style="border-bottom:2px solid #25d366;padding:8px 16px;font-size:16px;color:#111;flex:1;text-align:left">88 123 4567</div>
    </div>
    <div style="font-size:12px;color:#999;margin-top:6px">Носете телефона си — кодът идва веднага.</div>
    <div class="ring ringr" style="background:#25d366;color:#fff;display:inline-block;padding:12px 40px;border-radius:24px;font-weight:700;font-size:16px;margin-top:30px">НАПРЕД</div>
  </div>
  ${tip("Въведете номера си и натиснете „Напред“","left:50%;bottom:150px;transform:translateX(-50%)")}
`);

// ЧАТ — запазване на снимка в галерията
S["chat-zapazi"] = phone(`
  ${hdr("#7360f2","#fff","Мария (дъщеря)","в мрежата")}
  <div class="grow" style="background:#ece9f7;padding:14px 12px;display:flex;flex-direction:column;gap:10px">
    <div style="align-self:flex-start;max-width:78%;position:relative">
      <div style="height:200px;border-radius:14px;background:linear-gradient(135deg,#ffd194,#d1913c);display:flex;align-items:center;justify-content:center;color:#fff;font-size:40px">🏖️</div>
      <div class="ring ringr" style="position:absolute;right:10px;bottom:10px;background:rgba(0,0,0,.55);color:#fff;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center">${I.download}</div>
    </div>
    <div style="align-self:flex-start;color:#6b5fa8;font-size:13px">Снимка от морето 🙂</div>
  </div>
  <div style="background:#fff;padding:9px 10px;display:flex;align-items:center;gap:9px;border-top:1px solid #eee"><span style="color:#8a8a8a">${I.plus}</span><div style="flex:1;background:#f0f0f3;border-radius:20px;padding:9px 14px;color:#9a9a9a;font-size:15px">Съобщение…</div><span style="color:#8a8a8a">${I.mic}</span></div>
  ${tip("Натиснете стрелката надолу,<br>за да я запазите в галерията","left:14px;top:150px")}
`);

// FACEBOOK — начален екран (фийд)
S["fb-feed"] = phone(`
  <div style="background:#fff;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee">
    <span style="color:#1877f2;font-weight:800;font-size:24px;letter-spacing:-.5px">facebook</span>
    <div style="display:flex;gap:8px"><span style="width:34px;height:34px;border-radius:50%;background:#e4e6eb;display:flex;align-items:center;justify-content:center;color:#444">${I.search}</span><span style="width:34px;height:34px;border-radius:50%;background:#e4e6eb;display:flex;align-items:center;justify-content:center;font-size:16px">💬</span></div></div>
  <div style="background:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:8px solid #eef0f2">${av("Б","#1877f2")}<div style="flex:1;background:#f0f2f5;border-radius:20px;padding:9px 14px;color:#65676b;font-size:15px">Какво ви се случва?</div></div>
  <div class="grow" style="background:#eef0f2;padding:10px 0">
    <div style="background:#fff;padding:12px 14px">
      <div style="display:flex;align-items:center;gap:10px">${av("Ч","#42a5f5")}<div style="flex:1"><div style="font-weight:700;font-size:15px;color:#050505">Читалище „Просвета"</div><div style="font-size:12px;color:#65676b">вчера в 18:30 · 🌍</div></div></div>
      <div style="font-size:15px;color:#050505;margin:10px 0;line-height:1.4">Утре в 11:00 ч. концерт в центъра на Бобов дол. Вход свободен! 🎶</div>
      <div style="height:150px;border-radius:10px;background:linear-gradient(135deg,#b3d4fc,#7fa8e0);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:17px">🎵 Концерт в Бобов дол</div>
      <div style="display:flex;justify-content:space-around;border-top:1px solid #eee;margin-top:10px;padding-top:8px;color:#65676b;font-size:14px;font-weight:600"><span style="display:flex;align-items:center;gap:6px;color:#1877f2">${I.thumb}Харесвам</span><span>💬 Коментар</span><span>↗ Споделяне</span></div>
    </div>
  </div>
`, "#eef0f2");

// FACEBOOK — харесване и коментар
S["fb-haresai"] = phone(`
  <div style="background:#fff;padding:8px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #eee"><span style="color:#1877f2;font-weight:800;font-size:24px">facebook</span></div>
  <div class="grow" style="background:#eef0f2;padding:10px 0">
    <div style="background:#fff;padding:12px 14px">
      <div style="display:flex;align-items:center;gap:10px">${av("П","#66bb6a")}<div style="flex:1"><div style="font-weight:700;font-size:15px;color:#050505">Петър Иванов</div><div style="font-size:12px;color:#65676b">преди 2 часа · 🌍</div></div></div>
      <div style="font-size:15px;color:#050505;margin:10px 0">Прибрахме реколтата! Хубава година беше 🍇</div>
      <div style="height:140px;border-radius:10px;background:linear-gradient(135deg,#a5d6a7,#66bb6a);display:flex;align-items:center;justify-content:center;font-size:40px">🍇</div>
      <div style="display:flex;align-items:center;gap:6px;color:#65676b;font-size:13px;margin-top:8px"><span style="background:#1877f2;color:#fff;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:10px">👍</span> 24 харесвания</div>
      <div style="display:flex;justify-content:space-around;border-top:1px solid #eee;margin-top:8px;padding-top:10px;font-size:15px;font-weight:600;color:#65676b">
        <span class="ring" style="display:flex;align-items:center;gap:7px;color:#1877f2;border-radius:8px;padding:4px 10px">${I.thumb} Харесвам</span>
        <span style="display:flex;align-items:center;gap:7px">💬 Коментар</span><span style="display:flex;align-items:center;gap:7px">↗ Споделяне</span></div>
    </div>
  </div>
  ${tip("Натиснете „Харесвам“ (палец),<br>за да покажете, че Ви харесва","left:14px;bottom:120px")}
`, "#eef0f2");

// FACEBOOK — публикуване
S["fb-publikuvai"] = phone(`
  <div style="background:#fff;padding:12px 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #eee">
    <span style="color:#111;font-size:20px">✕</span><div style="flex:1;font-weight:700;font-size:17px;color:#111">Създаване на публикация</div>
    <div class="ring ringr" style="background:#1877f2;color:#fff;padding:7px 20px;border-radius:8px;font-weight:700;font-size:14px">Публикувай</div></div>
  <div style="padding:12px 14px;display:flex;align-items:center;gap:10px">${av("Б","#1877f2")}<div><div style="font-weight:700;font-size:15px;color:#111">Баба Стойна</div><div style="font-size:12px;color:#1877f2;background:#e7f0fd;border-radius:6px;padding:2px 8px;display:inline-block">👥 Приятели</div></div></div>
  <div class="grow" style="padding:6px 16px;font-size:19px;color:#111">Честит празник на всички! 🌷</div>
  <div style="border-top:1px solid #eee;padding:14px 16px;display:flex;gap:22px;font-size:15px;color:#444;align-items:center">
    <span style="color:#45bd62;font-size:20px">🖼️</span> Снимка <span style="margin-left:auto;color:#f5c33b;font-size:20px">😊</span></div>
  ${tip("Напишете нещо, после натиснете<br>синия бутон „Публикувай“","right:10px;top:60px")}
`);

// FACEBOOK — намиране на приятел
S["fb-priatel"] = phone(`
  <div style="background:#fff;padding:10px 14px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #eee">
    <span>${I.back}</span><div style="flex:1;background:#f0f2f5;border-radius:20px;padding:8px 14px;color:#65676b;font-size:15px;display:flex;align-items:center;gap:8px">${I.search} Мария Петрова</div></div>
  <div class="grow" style="background:#fff">
    <div style="padding:14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #f3f3f3">
      ${av("М","#ec407a",54)}<div style="flex:1"><div style="font-weight:700;font-size:16px;color:#111">Мария Петрова</div><div style="font-size:13px;color:#65676b">5 общи приятели</div></div>
      <div class="ring ringr" style="background:#1877f2;color:#fff;padding:8px 16px;border-radius:8px;font-weight:700;font-size:13px;white-space:nowrap">+ Добави</div></div>
    <div style="padding:14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #f3f3f3">
      ${av("М","#7e57c2",54)}<div style="flex:1"><div style="font-weight:700;font-size:16px;color:#111">Мария Георгиева</div><div style="font-size:13px;color:#65676b">2 общи приятели</div></div>
      <div style="background:#e4e6eb;color:#111;padding:8px 16px;border-radius:8px;font-weight:700;font-size:13px;white-space:nowrap">+ Добави</div></div>
  </div>
  ${tip("Намерете човека по име и<br>натиснете „Добави“","right:10px;top:78px")}
`);

// FACEBOOK — поверителност (кой вижда публикациите)
S["fb-poveritelnost"] = phone(`
  <div style="background:#fff;padding:12px 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #eee">
    <span>${I.back}</span><div style="flex:1;font-weight:700;font-size:16px;color:#111">Кой вижда публикацията?</div></div>
  <div class="grow" style="background:#fff">
    <div style="padding:12px 16px;color:#65676b;font-size:13px">Изберете кой може да вижда какво публикувате.</div>
    ${[["🌍","Публично","Всеки във и извън Facebook",0],["👥","Приятели","Само Вашите приятели",1],["🔒","Само аз","Никой друг не вижда",0]].map(([e,t,d,hl])=>`<div class="${hl?'ring':''}" style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid #f3f3f3;${hl?'border-radius:10px;margin:4px 8px;':''}"><span style="font-size:22px">${e}</span><div style="flex:1"><div style="font-weight:700;font-size:16px;color:#111">${t}</div><div style="font-size:12px;color:#65676b">${d}</div></div><div style="width:22px;height:22px;border-radius:50%;border:2px solid ${hl?'#1877f2':'#cfcfcf'};background:${hl?'#1877f2':'#fff'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px">${hl?'✓':''}</div></div>`).join("")}
  </div>
  ${tip("„Приятели“ е най-безопасно —<br>само познати виждат снимките Ви","left:50%;bottom:150px;transform:translateX(-50%)")}
`);

// FACEBOOK — фалшив профил (червени флагове)
S["fb-falshiv"] = phone(`
  <div style="background:#1877f2;color:#fff;padding:12px;display:flex;align-items:center;gap:12px"><span>${I.back}</span><div style="flex:1;font-weight:700;font-size:16px">Профил</div></div>
  <div style="background:#fff;padding:20px 14px;text-align:center;border-bottom:8px solid #eef0f2">
    ${av("?","#bdbdbd",76)}<div style="font-weight:700;font-size:19px;margin-top:10px;color:#111">Ivan Petrov 2</div>
    <div class="ring" style="display:inline-block;color:#ef4444;font-size:13px;font-weight:700;margin-top:8px;border-radius:8px;padding:4px 10px">⚠ Създаден преди 3 дни</div></div>
  <div class="grow" style="background:#fff;padding:14px 16px">
    <div style="font-weight:700;color:#111;margin-bottom:10px">Признаци за фалшив профил:</div>
    ${["Съвсем нов профил, само с няколко снимки","Има 2–3 „приятели“","Праща Ви покана, без да Ви познава","Бързо иска пари или личен телефон"].map(t=>`<div style="display:flex;gap:10px;margin-bottom:10px;font-size:14px;color:#444"><span class="red" style="font-weight:800">✗</span> ${t}</div>`).join("")}
    <div style="background:#fff4f4;border:1px solid #ffd5d5;border-radius:10px;padding:12px;font-size:14px;color:#b91c1c;margin-top:6px">Не приемайте и не пращайте пари. Натиснете „⋯“ → „Докладвай профила“.</div>
  </div>
`, "#fff");

// FACEBOOK — забравена парола
S["fb-parola"] = phone(`
  <div class="grow" style="background:#fff;padding:30px 24px;text-align:center;display:flex;flex-direction:column">
    <div style="color:#1877f2;font-weight:800;font-size:30px;margin-bottom:30px">facebook</div>
    <div style="font-weight:700;font-size:17px;color:#111;margin-bottom:6px;text-align:left">Намерете профила си</div>
    <div style="font-size:13px;color:#65676b;margin-bottom:16px;text-align:left">Въведете имейла или телефона, с който сте се регистрирали.</div>
    <div style="border:1px solid #ccd0d5;border-radius:10px;padding:13px 14px;font-size:15px;color:#111;text-align:left;margin-bottom:14px">088 123 4567</div>
    <div class="ring" style="background:#1877f2;color:#fff;padding:13px;border-radius:10px;font-weight:700;font-size:16px;border-radius:10px">Търсене</div>
    <div style="margin-top:16px;color:#1877f2;font-size:14px;font-weight:600">Ще получите код по SMS</div>
  </div>
  ${tip("Въведете телефона/имейла си →<br>идва код за нова парола","left:50%;bottom:150px;transform:translateX(-50%)")}
`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const [name, html] of Object.entries(S)) {
    await page.setContent(html, { waitUntil: "networkidle" });
    const el = await page.$(".phone");
    await el.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log("✔", name);
  }
  await browser.close();
  console.log(`\nГотово: ${Object.keys(S).length} екрана в public/kak-da/`);
})();
