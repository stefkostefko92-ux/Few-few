// Група „Безопасност“: измами, онлайн безопасност, общуване и всекидневие, забавление и хобита (38 ръководства).
// Реалистични екрани на Android (Google Messages, Gmail, Chrome, Viber, YouTube, Google Phone, Play Маркет,
// Facebook, Календар) + истинска снимка (CC0) за измамник на вратата. Всички имена, номера и адреси са
// измислени; домейните на измамите са явно фалшиви и не съвпадат с истински фирми. Червените бележки
// повтарят стъпките на ръководствата.
// Активи: scripts/howto-mockups/assets/bezopasnost/ (+ преизползвани CC0 от assets/apps, assets/more, assets/messaging);
// източници и лицензи: assets/credits/bezopasnost.md
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-bezopasnost.js   (ONLY=име1,име2 — само избрани)
const path = require("node:path");
const fs = require("node:fs");
const { phone, scene, ms, tip: _tip, appIcon, photo, render, ASSETS } = require("./_shell");

const tip = (t, css = "", o) => {
  if (/left:50%/.test(css)) {
    if (!/width/.test(css)) css += ";width:max-content";
    if (!/transform/.test(css)) css += ";transform:translateX(-50%)";
  }
  return _tip(t, css, o);
};
const S = {};
const H = 700;
const W = (inner, h = H, css = "") => `<div style="position:relative;height:${h}px;overflow:hidden;${css}">${inner}</div>`;
const asset = (...p) => path.join(ASSETS, ...p);
const img = (rel, o = {}) => photo(asset(rel), o);
const ic = (n, o = {}) => ms(n, { size: 24, ...o });
const circ = (size, bg, inner, extra = "") =>
  `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;${extra}">${inner}</div>`;
const person = (size = 40, bg = "#dde3ea", fg = "#5f6368") => circ(size, bg, ms("person", { size: size * 0.62, fill: 1, color: fg }));
const letter = (t, c, s = 40) => circ(s, c, `<span style="color:#fff;font-size:${Math.round(s * 0.45)}px;font-weight:500">${t}</span>`);
const link = (t) => `<span style="color:#0b57d0;text-decoration:underline;word-break:break-all">${t}</span>`;
const G = { on: "#1f1f1f", sub: "#444746", gray: "#5f6368", pill: "#e9eef6", red: "#b3261e" };

// ───────────────────────── Общи екрани ─────────────────────────
// Google Messages: разговор. o: {sender, bubbles:[{html,time,ring}], tips}
function gmsg({ sender, bubbles, tips = "", day = "Днес · 11:32" }) {
  const bub = bubbles.map((b, i) => `
    <div style="align-self:flex-start;max-width:84%">
      <div ${b.ring ? 'class="ring"' : ""} style="background:#e8edf5;color:#1f1f1f;padding:11px 16px;border-radius:${b.ring ? 20 : i === 0 ? "20px 20px 20px 6px" : "6px 20px 20px 6px"};font-size:16px;line-height:1.4">${b.html}</div>
      ${b.time ? `<div style="font-size:11.5px;color:#5f6368;margin:5px 0 0 6px">${b.time}</div>` : ""}
    </div>`).join("");
  return phone(W(`
    <div style="display:flex;align-items:center;gap:8px;padding:4px 14px 6px 8px;height:64px">
      <span style="padding:8px;display:flex">${ms("arrow_back", { size: 24 })}</span>${person(40)}
      <div style="flex:1;font-size:18px;font-weight:500;color:#1f1f1f">${sender}</div>${ms("call", { size: 24 })}<span style="width:6px"></span>${ms("more_vert", { size: 24 })}
    </div>
    <div style="padding:16px 14px;display:flex;flex-direction:column;gap:6px">
      <div style="align-self:center;font-size:12px;color:#5f6368;margin-bottom:10px">${day}</div>${bub}
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;padding:6px 12px 10px;display:flex;align-items:center;gap:10px">
      ${circ(44, "#e8edf5", ms("add", { size: 26, color: "#444746" }))}
      <div style="flex:1;height:44px;border-radius:22px;background:#e8edf5;display:flex;align-items:center;padding:0 16px;font-size:16px;color:#5f6368">Текстово съобщение<span style="flex:1"></span>${ms("mic", { size: 22, color: "#444746", fill: 1 })}</div>
    </div>${tips}`), "#fff");
}

// Chrome (Android): горна лента с адрес.
function chromeBar(url, secure = true, ring = false) {
  const ico = secure ? ms("tune", { size: 20, color: "#444746" }) : ms("warning", { size: 20, fill: 1, color: "#b3261e" });
  const label = secure ? "" : `<span style="color:#b3261e;font-size:14px;font-weight:500">Не е защитено</span><span style="width:1px;height:16px;background:#c4c7c5"></span>`;
  return `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px 8px 14px;background:#fff">
    <div ${ring ? 'class="ring"' : ""} style="flex:1;height:44px;border-radius:22px;background:#eef1f6;display:flex;align-items:center;gap:8px;padding:0 14px;font-size:15.5px;color:#1f1f1f;overflow:hidden;white-space:nowrap">${ico}${label}<span>${url}</span></div>
    <div style="width:26px;height:26px;border:2px solid #444746;border-radius:7px;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;color:#444746">1</div>
    ${ms("more_vert", { size: 24, color: "#444746" })}
  </div><div style="height:1px;background:#e1e3e6"></div>`;
}

// Gmail: отворено писмо. o: {subject, name, addr, ring (адресът), when, body, tips, letterBg, extra}
function gmail({ subject, name, addr, when = "07:48", body, tips = "", ringAddr = true, initial = "Б", color = "#c5221f" }) {
  return phone(W(`
    <div style="display:flex;align-items:center;height:64px;padding:0 8px;gap:14px"><span style="padding:8px;display:flex">${ic("arrow_back", { color: G.on })}</span><div style="flex:1"></div>${ic("archive", { color: G.on })}${ic("delete", { color: G.on })}${ic("mail", { color: G.on })}${ic("more_vert", { color: G.on })}</div>
    <div style="padding:6px 18px 0;font-size:21px;line-height:1.3;color:${G.on}">${subject}</div>
    <div style="display:flex;align-items:flex-start;gap:12px;padding:16px 18px 6px">${letter(initial, color, 40)}
      <div style="flex:1;min-width:0"><div style="font-size:15px;color:${G.on};font-weight:500">${name}</div>
        <div ${ringAddr ? 'class="ring"' : ""} style="display:inline-block;font-size:13.5px;color:${G.gray};margin-top:2px;${ringAddr ? "padding:2px 8px;margin-left:-8px;border-radius:8px" : ""}">${addr}</div>
        <div style="font-size:13px;color:${G.gray};margin-top:3px">до мен ${ms("expand_more", { size: 16, color: G.gray })}</div></div>
      <span style="font-size:12px;color:${G.gray}">${when}</span></div>
    <div style="padding:10px 18px;margin-top:${ringAddr ? 46 : 0}px;font-size:15.5px;line-height:1.55;color:${G.on}">${body}</div>${tips}`), "#fff");
}

// Viber (Android): чат. o: {name, sub, msgs:[{out,html|photo,time,ring}], input, tips, unknown}
const VP = "#7360F2";
function viber({ name, sub, msgs, input = "Напишете съобщение", tips = "", unknown = false, avatar, ringVideo = false, sendRing = false, typed = false }) {
  const bub = msgs.map((m) => {
    const out = !!m.out;
    const body = m.photo
      ? `<div style="border-radius:16px;overflow:hidden;${m.ring ? "" : ""}">${img(m.photo, { w: 236, h: 160 })}</div>`
      : `<div ${m.ring ? 'class="ring"' : ""} style="background:${out ? VP : "#fff"};color:${out ? "#fff" : "#1b1b1f"};padding:10px 14px;border-radius:${m.ring ? 18 : out ? "18px 18px 4px 18px" : "18px 18px 18px 4px"};font-size:16px;line-height:1.38;box-shadow:0 1px 1px rgba(40,30,90,.12)">${m.html}</div>`;
    return `<div style="align-self:${out ? "flex-end" : "flex-start"};max-width:80%">${body}${m.time ? `<div style="font-size:11px;color:#8a88a0;margin:3px 6px 0;text-align:${out ? "right" : "left"}">${m.time}</div>` : ""}</div>`;
  }).join("");
  return phone(W(`
    <div style="background:${VP};color:#fff;display:flex;align-items:center;gap:10px;padding:6px 14px 8px 8px;height:64px">
      <span style="display:flex">${ms("arrow_back", { size: 24, color: "#fff" })}</span>
      ${avatar || circ(40, "rgba(255,255,255,.28)", ms("person", { size: 26, fill: 1, color: "#fff" }))}
      <div style="flex:1;min-width:0"><div style="font-size:17.5px;font-weight:500;line-height:1.15">${name}</div>${sub ? `<div style="font-size:12.5px;opacity:.85;margin-top:1px">${sub}</div>` : ""}</div>
      <span ${ringVideo ? 'class="ring ringr"' : ""} style="display:flex;padding:5px">${ms("videocam", { size: 26, fill: 1, color: "#fff" })}</span>${ms("call", { size: 24, fill: 1, color: "#fff" })}
    </div>
    ${unknown ? `<div style="background:#fff;padding:10px 16px;font-size:13.5px;color:#4a4a5a;border-bottom:1px solid #e6e4f2;display:flex;gap:10px;align-items:center">${ms("info", { size: 20, fill: 1, color: VP })}Този номер не е във Вашите контакти</div>` : ""}
    <div style="position:absolute;inset:${unknown ? 112 : 64}px 0 66px 0;background:#efedf8;padding:12px 12px;display:flex;flex-direction:column;gap:7px;justify-content:flex-end">
      <div style="align-self:center;font-size:12px;color:#7b7990;margin-bottom:2px">Днес</div>${bub}</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:66px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 12px;border-top:1px solid #e6e4f2">
      ${ms("add_circle", { size: 28, color: "#7b7990" })}
      <div style="flex:1;min-height:42px;border-radius:21px;background:#f2f1f8;padding:0 14px;display:flex;align-items:center;font-size:15.5px;color:${typed ? "#1b1b1f" : "#8a88a0"};line-height:1.25">${input}</div>
      ${typed ? `<span ${sendRing ? 'class="ring ringr"' : ""} style="display:flex;padding:6px;background:${VP};border-radius:50%">${ms("send", { size: 22, fill: 1, color: "#fff" })}</span>` : ms("mic", { size: 26, color: "#7b7990" })}
    </div>${tips}`), "linear-gradient(#7360F2 0,#7360F2 38px,#fff 38px)", "#fff");
}

// Google търсене в Chrome (мобилно). o: {q, results:[...], tips}
const gLogo = `<span style="font-size:25px;font-weight:500;letter-spacing:-.5px"><span style="color:#4285f4">G</span><span style="color:#ea4335">o</span><span style="color:#fbbc05">o</span><span style="color:#4285f4">g</span><span style="color:#34a853">l</span><span style="color:#ea4335">e</span></span>`;
function gsearch({ q, body, tips = "" }) {
  return phone(W(`
    ${chromeBar("google.com", true)}
    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px 8px">${gLogo}
      <div style="flex:1;height:42px;border-radius:21px;border:1px solid #dadce0;box-shadow:0 1px 4px rgba(32,33,36,.18);display:flex;align-items:center;padding:0 14px;font-size:15px;color:#202124;white-space:nowrap;overflow:hidden">${q}</div></div>
    <div style="display:flex;gap:20px;padding:0 16px;border-bottom:1px solid #e3e3e3;font-size:14px;color:#5f6368;height:38px;align-items:center"><span style="color:#1a73e8;border-bottom:3px solid #1a73e8;height:38px;display:flex;align-items:center">Всички</span><span>Изображения</span><span>Видео</span><span>Новини</span></div>
    ${body}${tips}`), "#fff");
}
const gres = (site, url, title, text, o = {}) => `<div ${o.ring ? 'class="ring"' : ""} style="padding:12px 16px 12px;${o.ring ? "margin:4px 8px;padding:10px 8px;border-radius:14px;" : ""}">
  <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:#202124;margin-bottom:3px">${circ(26, "#f1f3f4", `<span style="font-size:12px;color:#5f6368;font-weight:500">${site[0].toUpperCase()}</span>`)}<div style="line-height:1.2"><div>${site}</div><div style="color:#5f6368;font-size:12px">${url}</div></div></div>
  <div style="font-size:18.5px;color:#1a0dab;line-height:1.28;margin:3px 0 4px">${title}</div>
  <div style="font-size:14px;color:#4d5156;line-height:1.45">${text}</div></div>`;

// YouTube (Android)
const ytBar = (text) => `<div style="display:flex;align-items:center;gap:6px;padding:4px 10px 6px 6px;height:56px">${ic("arrow_back", { color: "#0f0f0f" })}
  <div style="flex:1;height:40px;border-radius:20px;background:#f2f2f2;display:flex;align-items:center;padding:0 14px;font-size:16px;color:#0f0f0f;margin-left:6px;white-space:nowrap;overflow:hidden">${text}</div>
  <span style="display:flex;width:40px;height:40px;border-radius:50%;background:#f2f2f2;align-items:center;justify-content:center">${ic("mic", { fill: 1, color: "#0f0f0f", size: 22 })}</span></div>`;
const ytItem = (photoRel, dur, title, meta, o = {}) => `<div style="margin-bottom:14px">
  <div ${o.ring ? 'class="ring"' : ""} style="position:relative;${o.ring ? "margin:4px 8px;border-radius:14px;overflow:visible" : ""}">${img(photoRel, { w: o.ring ? 364 : 390, h: 150, radius: o.ring ? 12 : 0 })}
    <span style="position:absolute;right:${o.ring ? 8 : 8}px;bottom:8px;background:rgba(0,0,0,.82);color:#fff;font-size:12px;font-weight:500;padding:2px 5px;border-radius:4px">${dur}</span></div>
  <div style="display:flex;gap:12px;padding:10px 14px 0">${circ(36, o.avc || "#8a6d3b", `<span style="color:#fff;font-size:15px;font-weight:500">${o.av || "Х"}</span>`)}
    <div style="flex:1"><div style="font-size:15.5px;color:#0f0f0f;line-height:1.3;font-weight:500">${title}</div><div style="font-size:12.5px;color:#606060;margin-top:3px">${meta}</div></div>${ic("more_vert", { size: 20, color: "#0f0f0f" })}</div></div>`;

// Facebook (Android)
const FB = "#1877f2";
const fbPic = (rel, s = 56) => `<div style="width:${s}px;height:${s}px;border-radius:50%;overflow:hidden;flex-shrink:0">${img(rel, { w: s, h: s })}</div>`;
const fbTop = (title) => `<div style="display:flex;align-items:center;gap:14px;padding:8px 14px;height:56px;background:#fff;border-bottom:1px solid #e4e6eb">${ic("arrow_back", { color: "#050505" })}<div style="font-size:20px;font-weight:700;color:#050505">${title}</div></div>`;

// Сайтът на „За Бобов дол“ в Chrome (нашият собствен — тук е позволен)
const BR = "#212f8a";
const siteHead = (url, nav) => `${chromeBar(url, true)}
  <div style="background:#fff;display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #e2e8f0">
    ${circ(32, BR, ms("location_city", { size: 20, fill: 1, color: "#fff" }))}<div style="font-family:'Noto Serif','DejaVu Serif',Georgia,serif;font-size:19px;font-weight:700;color:${BR};flex:1">За Бобов дол</div>${ic("menu", { color: "#334155" })}</div>`;
const SERIF = "font-family:'Noto Serif','DejaVu Serif',Georgia,serif";
const btnB = (t, ring) => `<div ${ring ? 'class="ring"' : ""} style="background:${BR};color:#fff;font-weight:600;font-size:16.5px;border-radius:12px;padding:14px 20px;text-align:center">${t}</div>`;

// Keep (бележка)
function keep(bg, title, items, foot = "", tips = "") {
  return phone(W(`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px 4px;height:60px">${ic("arrow_back", { color: "#3c4043" })}<div style="display:flex;gap:26px">${ic("keep", { color: "#3c4043" })}${ic("notification_add", { color: "#3c4043" })}${ic("archive", { color: "#3c4043" })}</div></div>
    <div style="padding:14px 24px 0;font-size:27px;font-weight:500;color:#202124;line-height:1.2">${title}</div>
    <div style="padding:16px 24px 0">${items.map(([b, r]) => `<div style="display:flex;gap:14px;margin-bottom:16px;align-items:flex-start"><span style="width:20px;height:20px;border:2px solid #5f6368;border-radius:4px;flex-shrink:0;margin-top:3px"></span><div style="font-size:17.5px;line-height:1.38;color:#202124"><b style="font-weight:600">${b}</b> ${r}</div></div>`).join("")}</div>
    ${foot ? `<div style="margin:6px 24px 0;border-top:1px solid rgba(0,0,0,.14);padding-top:14px;font-size:16px;color:#3c4043;line-height:1.45">${foot}</div>` : ""}
    <div style="position:absolute;left:0;right:0;bottom:0;height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;color:#5f6368">${ic("add_box")}${ic("palette")}<span style="font-size:13px">Редактирана днес, 10:05</span>${ic("more_vert")}</div>${tips}`), bg);
}

// ═══════════ ИЗМАМИ ═══════════

// kak-da-razpoznavam-onlayn-izmami — спешно съобщение от непознат
S["bezopasnost-spesha-viber"] = viber({
  name: "+359 888 123 457", sub: "Не е запазен", unknown: true,
  msgs: [
    { html: "Здравейте! Обажда се отдел „Сигурност“. Сметката Ви е в опасност.", time: "09:41" },
    { ring: true, html: "<b>СПЕШНО!</b> Преведете още сега <b>1 500 €</b> по „защитена сметка“, иначе парите ще бъдат загубени! Не казвайте на никого.", time: "09:41" },
    { html: "Чакам потвърждение до 10 минути!!!", time: "09:42" },
  ],
  tips: tip("Непознат номер, бързане и страх — знак за измама. Спрете и се обадете на близък", "left:50%;top:106px;width:320px", { arrow: "u", at: "30%" }),
});

// falshivi-imejli-fishing
S["bezopasnost-fishing-imejl"] = gmail({
  subject: "Акаунтът Ви ще бъде спрян — потвърдете данните",
  name: "Банка Пример — Сигурност", addr: "sigurnost@bankaprimer-support.top",
  body: `Уважаеми клиент,<br><br>Засякохме необичайна дейност. <b>Ако не потвърдите данните си до 24 часа, акаунтът Ви ще бъде спрян.</b><br><br><div class="ring" style="display:inline-block;background:#1a73e8;color:#fff;padding:12px 22px;border-radius:6px;font-weight:600;font-size:15px">Потвърди данните сега</div><br><br><span style="color:#5f6368;font-size:13.5px">Екип „Сигурност“</span>`,
  tips: tip("Странен адрес — не е на банката", "left:18px;top:192px;width:220px", { arrow: "u", at: "24%" }) +
    tip("Заплаха + бутон за данни = фишинг.<br>Не натискайте; маркирайте като спам", "left:50%;top:472px;width:310px", { arrow: "u", at: "36%" }),
});

// zlatni-pravila-bezopasnost
S["bezopasnost-zlatni-pravila"] = keep("#e2f3d6", "Златни правила", [
  ["Никога", "не давам ПИН, пароли и кодове от SMS."],
  ["Не бързам —", "измамниците нарочно ме пришпорват."],
  ["Затварям", "и звъня сам на официален телефон, за да проверя."],
  ["Не давам пари", "на непознат до дома ми."],
  ["При съмнение", "питам близък или звъня на 112."],
], "Банка, полиция и НОИ никога не искат по телефона ПИН, парола, код от SMS или да теглите/превеждате пари „за проверка“.");

// kak-rabotyat-bankata-policiyata
S["bezopasnost-vhodyashto"] = phone(W(`
  <div style="height:100%;color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:60px">
    <div style="font-size:15px;opacity:.75;margin-bottom:22px">Входящо повикване</div>
    ${circ(104, "rgba(255,255,255,.14)", ms("person", { size: 66, fill: 1, color: "rgba(255,255,255,.75)" }))}
    <div style="font-size:27px;margin-top:22px;text-align:center;line-height:1.2">„Банка Пример —<br>Сигурност“</div>
    <div style="font-size:16px;opacity:.7;margin-top:8px">+359 2 400 5517 · Непознат номер</div>
    <div style="flex:1"></div>
    <div style="display:flex;gap:96px;padding-bottom:64px">
      <div style="text-align:center">${circ(74, "#ea3d33", ms("call_end", { size: 36, fill: 1, color: "#fff" }), "box-shadow:0 0 0 3px #d32f2f,0 0 0 5px rgba(255,255,255,.92)")}<div style="margin-top:12px;font-size:14px;opacity:.9">Отхвърляне</div></div>
      <div style="text-align:center">${circ(74, "#2fb454", ms("call", { size: 36, fill: 1, color: "#fff" }))}<div style="margin-top:12px;font-size:14px;opacity:.9">Отговор</div></div>
    </div>
  </div>
  ${tip("Банка не иска ПИН, парола или код по телефона. Полиция не иска да теглите пари. Никой не праща куриер за пари от дома Ви", "left:50%;top:342px;width:320px")}
  ${tip("Затворете и звъннете сами на официалния номер", "left:50%;top:462px;width:290px;transform:translateX(-50%)", { arrow: "d", at: "26%" })}
`), "radial-gradient(120% 70% at 50% 0%,#2a3140 0%,#14171d 62%,#0c0e12 100%)", "#fff");

// kakvo-da-pravya-ako-me-e-strah — любими контакти
S["bezopasnost-lyubimi"] = phone(W(`
  <div style="padding:14px 20px 4px;font-size:30px;font-weight:400;color:#1f1f1f;height:70px;display:flex;align-items:center;justify-content:space-between">Любими${ic("more_vert", { color: G.on })}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 16px">
    ${[["М", "#8c5bd6", "Мария", "дъщеря", true], ["И", "#1f8a70", "Иван", "син", false], ["Б", "#1a73e8", "Банка", "номер от гърба на картата", true], ["112", "#d93025", "112", "спешен номер", true]].map(([l, c, n, s, r]) => `
      <div ${r ? 'class="ring"' : ""} style="border-radius:22px;background:#f3f4f9;padding:16px 14px 14px;display:flex;flex-direction:column;align-items:center;gap:8px;min-height:160px;${r ? "margin:3px" : ""}">
        ${circ(72, c, `<span style="color:#fff;font-size:${l.length > 2 ? 26 : 32}px;font-weight:500">${l}</span>`)}
        <div style="font-size:17px;color:#1f1f1f;font-weight:500">${n}</div><div style="font-size:13px;color:#5f6368;text-align:center;line-height:1.25">${s}</div></div>`).join("")}
  </div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:80px;background:#f0f4f9;display:flex;padding-top:12px">
    ${[["star", "Любими", 1], ["history", "Скорошни", 0], ["contacts", "Контакти", 0]].map(([n, l, a]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:64px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;${a ? "background:#d3e3fd" : ""}">${ic(n, { fill: a ? 1 : 0, color: a ? "#041e49" : G.sub })}</div><div style="font-size:12px;color:${a ? G.on : G.sub};font-weight:${a ? 600 : 500}">${l}</div></div>`).join("")}</div>
  ${tip("Затворете разговора, после звъннете на близък, на банката (да блокира картата) и на 112", "left:50%;top:420px;width:320px;transform:translateX(-50%)", { arrow: "u", at: "30%" })}
`), "#fff");

// safe-proverya-link
S["bezopasnost-skraten-link"] = gmsg({
  sender: "+44 7700 900145",
  bubbles: [{ ring: true, time: "14:07", html: `Имате нова гласова поща (2 мин.). Чуйте я тук:<br>${link("http://sl1nk.top/aK29x")}` }],
  day: "Днес · 14:07",
  tips: tip("Неочакван, съкратен и странен адрес — не го натискайте. Потърсете сайта сами в Google", "left:50%;top:300px;width:310px;transform:translateX(-50%)", { arrow: "u", at: "30%" }),
});

// safe-lichni-danni
S["bezopasnost-iskat-danni"] = viber({
  name: "Кристиан", sub: "+359 877 000 214", unknown: true,
  msgs: [
    { html: "Добър ден! Спечелихте ваучер за 200 €.", time: "16:20" },
    { ring: true, html: "За да го получите, пратете ми снимка на личната си карта и ЕГН-то си.", time: "16:20" },
  ],
  tips: tip("Не давайте ЕГН и не пращайте снимки на документи на непознати", "left:50%;top:150px;width:310px;transform:translateX(-50%)"),
});

// x-virus-telefon
S["bezopasnost-fals-virus"] = phone(W(`
  ${chromeBar("telefon-chistach.top", false)}
  <div style="background:linear-gradient(180deg,#b3261e 0,#7d1a14 100%);color:#fff;height:660px;padding:26px 22px;text-align:center">
    ${ms("warning", { size: 64, fill: 1, color: "#ffd54f" })}
    <div style="font-size:28px;font-weight:800;line-height:1.15;margin-top:8px">ВНИМАНИЕ!<br>Телефонът Ви е заразен с 5 вируса!</div>
    <div style="font-size:16.5px;line-height:1.4;margin:16px 0 18px;opacity:.95">Батерията ще се повреди след 2 минути, а данните Ви ще бъдат откраднати.</div>
    <div style="background:rgba(255,255,255,.18);border-radius:8px;height:14px;overflow:hidden;margin:0 6px 22px"><div style="width:86%;height:100%;background:#ffd54f"></div></div>
    <div class="ring" style="display:inline-block;background:#2fb454;color:#fff;font-weight:800;font-size:20px;padding:16px 34px;border-radius:10px">ПОЧИСТИ СЕГА</div>
  </div>
  ${tip("Не натискайте! Самото предупреждение е измама — затворете страницата", "left:50%;top:480px;width:300px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

// x-antivirus
S["bezopasnost-play-zashtita"] = phone(W(`
  <div style="display:flex;align-items:center;gap:20px;padding:10px 16px 10px 14px;height:64px;color:#1f1f1f">${ic("arrow_back")}<div style="font-size:22px">Play Защита</div></div>
  <div style="margin:6px 16px 14px;border-radius:28px;background:#e6f4ea;padding:26px 20px 22px;text-align:center">
    ${circ(84, "#188038", ms("verified_user", { size: 48, fill: 1, color: "#fff" }), "margin:0 auto 14px")}
    <div style="font-size:21px;color:#0d652d;font-weight:500">Устройството е защитено</div>
    <div style="font-size:14.5px;color:#3c4043;margin-top:6px;line-height:1.4">Не са намерени вредни приложения</div>
    <div style="font-size:13px;color:#5f6368;margin-top:14px">Последна проверка: днес, 8:15</div>
    <div style="display:inline-block;margin-top:16px;border:1px solid #747775;color:#0b57d0;font-size:14.5px;font-weight:500;padding:10px 26px;border-radius:20px">Сканиране</div></div>
  <div style="display:flex;align-items:center;gap:16px;padding:14px 22px"><div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f">Проверка на приложения с Play Защита</div><div style="font-size:14px;color:#5f6368;margin-top:2px">Проверява приложенията, които инсталирате</div></div><span class="tg on"><i></i></span></div>
  <div style="padding:6px 22px 0;font-size:13.5px;color:#5f6368;line-height:1.45">Приложенията от Play Маркет се проверяват. Затова ги сваляйте само оттам.</div>
  ${tip("Сваляйте само от Play Store и дръжте телефона обновен — платен антивирус обикновено не е нужен", "left:50%;top:520px;width:320px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

// x-opasni-prilozheniya
S["bezopasnost-play-stranitsa"] = phone(W(`
  <div style="display:flex;align-items:center;gap:12px;padding:8px 14px;height:60px">${ic("arrow_back")}<div style="flex:1"></div>${ic("search")}${ic("more_vert")}</div>
  <div style="display:flex;gap:16px;padding:6px 20px 0;align-items:center">
    <div style="width:76px;height:76px;border-radius:18px;background:linear-gradient(160deg,#ffca28,#f57c00);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.25)">${ms("flashlight_on", { size: 46, fill: 1, color: "#fff" })}</div>
    <div><div style="font-size:23px;font-weight:500;color:#202124;line-height:1.2">Ярък фенер</div><div style="font-size:14.5px;color:#01875f;font-weight:500;margin-top:4px">Пример Софт ООД</div><div style="font-size:12.5px;color:#5f6368;margin-top:2px">Съдържа реклами</div></div></div>
  <div class="ring" style="display:flex;margin:22px 10px 0;padding:12px 4px;border-radius:14px;text-align:center;color:#202124">
    <div style="flex:1;border-right:1px solid #dadce0"><div style="font-size:16px;font-weight:500">4,6 ${ms("star", { size: 14, fill: 1, color: "#202124" })}</div><div style="font-size:12px;color:#5f6368;margin-top:3px">12 хил. отзива</div></div>
    <div style="flex:1;border-right:1px solid #dadce0"><div style="font-size:16px;font-weight:500">1 млн.+</div><div style="font-size:12px;color:#5f6368;margin-top:3px">Изтегляния</div></div>
    <div style="flex:1"><div style="font-size:16px;font-weight:500">3+</div><div style="font-size:12px;color:#5f6368;margin-top:3px">Възраст</div></div></div>
  <div style="margin:74px 20px 0;background:#01875f;color:#fff;border-radius:22px;text-align:center;padding:12px;font-size:15.5px;font-weight:500">Инсталиране</div>
  <div style="padding:22px 20px 0;display:flex;align-items:center;gap:10px;font-size:19px;color:#202124;font-weight:500;justify-content:space-between">Относно приложението${ic("arrow_forward")}</div>
  <div style="padding:8px 20px 0;font-size:14.5px;color:#5f6368;line-height:1.5">Прост и ярък фенер за телефона. Включва се с едно докосване.</div>
  <div style="padding:20px 20px 0;display:flex;align-items:center;gap:10px;font-size:19px;color:#202124;font-weight:500;justify-content:space-between">Безопасност на данните${ic("arrow_forward")}</div>
  <div style="margin:8px 20px 0;border:1px solid #dadce0;border-radius:14px;padding:12px 14px;font-size:13.5px;color:#5f6368;line-height:1.45">Този софтуер може да иска достъп до камера и местоположение.</div>
  ${tip("Вижте оценките и броя изтегляния преди инсталиране", "left:50%;top:238px;width:300px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

// i-iztegliam-bezopasno
S["bezopasnost-prikachen-fayl"] = gmail({
  subject: "Фактура за Вашата поръчка № 48213", name: "Куриер Експрес", addr: "info@kurier-srochno.top", ringAddr: false, initial: "К", color: "#188038", when: "11:02",
  body: `Здравейте,<br>Прикачили сме фактурата и документите за доставка. Отворете ги веднага, за да получите пратката.<br><br>
  <div class="ring" style="display:flex;align-items:center;gap:12px;border:1px solid #dadce0;border-radius:12px;padding:12px 14px;width:290px">${circ(40, "#fbbc04", ms("folder_zip", { size: 24, fill: 1, color: "#fff" }), "border-radius:8px")}<div><div style="font-size:15px;color:#202124">Faktura_48213.zip</div><div style="font-size:12.5px;color:#5f6368">1,2 MB</div></div></div>`,
  tips: tip("Не поръчвали сте? Не отваряйте неочаквани файлове от имейл", "left:50%;top:446px;width:300px;transform:translateX(-50%)", { arrow: "u", at: "34%" }),
});

// s-egov-bezopasnost
S["bezopasnost-egov-adres"] = phone(W(`
  ${chromeBar("egov.bg", true, true)}
  <div style="background:#1b3f7a;color:#fff;padding:74px 20px 22px"><div style="font-size:13.5px;opacity:.85">Портал за електронни услуги</div><div style="${SERIF};font-size:27px;font-weight:700;line-height:1.2;margin-top:4px">Електронни административни услуги</div></div>
  <div style="padding:18px 16px"><div style="height:48px;border:1px solid #c9d1de;border-radius:10px;display:flex;align-items:center;gap:10px;padding:0 14px;color:#64748b;font-size:15.5px">${ic("search", { color: "#64748b" })}Търсене на услуга</div>
    <div style="margin-top:14px;background:#1b3f7a;color:#fff;text-align:center;border-radius:10px;padding:14px;font-size:16.5px;font-weight:600">Вход</div>
    <div style="margin-top:18px;font-size:15px;color:#334155;line-height:1.5;border-top:1px solid #e2e8f0;padding-top:14px">Влизайте с ПИК или електронен подпис. Не споделяйте кодовете си с никого.</div></div>
  ${tip("Влизайте само през официалния egov.bg — не през линк от съобщение", "left:50%;top:70px;width:310px;transform:translateX(-50%)", { arrow: "u", at: "20%" })}
`), "#fff");

// s-kakvo-da-pravia-izmama — набиране на 112
S["bezopasnost-nabirane-112"] = phone(W(`
  <div style="height:150px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px"><div style="font-size:46px;color:#1f1f1f;letter-spacing:2px">112</div></div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px 0;padding:6px 28px 0;text-align:center">
    ${[["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]].map(([n, l]) => `<div style="height:76px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:32px;color:#1f1f1f;line-height:1">${n}</div><div style="font-size:11px;color:#5f6368;letter-spacing:1px;height:13px;margin-top:2px">${l}</div></div>`).join("")}</div>
  <div style="display:flex;justify-content:center;margin-top:12px"><div class="ring" style="width:76px;height:76px;border-radius:50%;background:#188038;display:flex;align-items:center;justify-content:center">${ms("call", { size: 36, fill: 1, color: "#fff" })}</div></div>
  ${tip("Подайте сигнал на 112 или в районното управление", "left:50%;top:100px;width:300px;transform:translateX(-50%)")}
`), "#fff");

// iz-kakvo-ako-me-izmamiha — доказателства
S["bezopasnost-dokazatelstva"] = gmsg({
  sender: "+44 7700 900482",
  bubbles: [
    { time: "10:31", html: "Добър ден, от банката сме. Сметката Ви е атакувана. Кажете ни кода от SMS-а." },
    { ring: true, time: "10:33", html: "Преведете <b>900 €</b> на сметка BG00 XXXX 0000 0000 за защита. Бързо!" },
  ],
  day: "Днес · 10:31",
  tips: tip("Не изтривайте — запазете съобщенията и номерата като доказателство и подайте сигнал", "left:50%;top:330px;width:310px;transform:translateX(-50%)", { arrow: "u", at: "34%" }),
});

// ═══════════ ИНТЕРНЕТ И ОНЛАЙН БЕЗОПАСНОСТ ═══════════

// i-falshivi-novini
S["bezopasnost-falshiva-novina"] = phone(W(`
  ${chromeBar("novini-sega.top", false)}
  <div style="background:#fff;padding:12px 16px 0">
    <div style="background:#d32f2f;color:#fff;font-size:13px;font-weight:700;padding:3px 8px;display:inline-block;border-radius:3px">ШОК</div>
    <div class="ring" style="margin:10px 0 0;padding:6px 8px;border-radius:10px"><div style="font-size:25px;font-weight:800;line-height:1.18;color:#111">ШОКИРАЩО!!! Правителството скри това от Вас — вижте преди да го ИЗТРИЯТ!</div></div>
    <div class="ring" style="display:inline-block;margin:12px 0 10px;padding:3px 9px;border-radius:8px;font-size:13.5px;color:#5f6368">Публикувано: 14.03.2019 г. · Автор: Редакция</div>
  </div>
  ${img("more/village.jpg", { w: 390, h: 200 })}
  <div style="padding:12px 16px;font-size:15.5px;line-height:1.5;color:#222">Споделете с всички, които познавате! Само днес разкриваме „тайната“, която никой не иска да чуете…</div>
  ${tip("Крещящо заглавие и непознат сайт — не вярвайте. Проверете датата: старо може да се представя за ново", "left:50%;top:296px;width:300px;transform:translateX(-50%)", { arrow: "u", at: "30%" })}
`), "#fff");

// i-proveria-tvardenie
S["bezopasnost-proveri-google"] = gsearch({
  q: "вярно ли е, че сме в еврозоната",
  body: `${gres("Новини Пример", "novinipimer.example › икономика", "България е в еврозоната от 1 януари 2026 г.", "От началото на годината еврото е официалната валута в България…", { ring: true })}
    ${gres("Вестник Пример", "vestnikpimer.example › евро", "Еврото в България — какво се промени за хората", "Цените се обявяват в евро и лева до края на периода на двойно обозначаване…", { ring: true })}
    ${gres("Икономика Пример", "ikonomikapimer.example › статии", "Кога влизаме в еврозоната? Отговори на въпроси", "Преглед на процеса и на ключовите дати за въвеждане на единната валута…")}`,
  tips: tip("Потвърждават ли го няколко сериозни източника? Не вярвайте на един непознат сайт", "left:50%;top:608px;width:310px;transform:translateX(-50%)"),
});

// i-obshtestven-wifi-bezopasnost
S["bezopasnost-wifi-spisak"] = phone(W(`
  <div style="display:flex;align-items:center;gap:20px;padding:10px 16px 10px 14px;height:64px;color:#1f1f1f">${ic("arrow_back")}<div style="font-size:22px">Интернет</div></div>
  <div style="display:flex;align-items:center;gap:16px;padding:12px 22px"><div style="flex:1;font-size:17px;color:#1f1f1f">Wi-Fi</div><span class="tg on"><i></i></span></div>
  <div style="padding:10px 22px 4px;font-size:14px;color:#0b57d0;font-weight:500">Свързана мрежа</div>
  <div style="display:flex;align-items:center;gap:18px;padding:10px 22px">${ic("wifi", { color: "#0b57d0", fill: 1 })}<div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f">Home-4F2A</div><div style="font-size:13.5px;color:#5f6368">Свързано</div></div>${ic("lock", { color: "#5f6368", size: 20 })}</div>
  <div style="padding:14px 22px 4px;font-size:14px;color:#0b57d0;font-weight:500">Налични мрежи</div>
  <div class="ring" style="display:flex;align-items:center;gap:18px;padding:10px 14px;margin:2px 8px;border-radius:14px">${ic("wifi", { color: "#5f6368" })}<div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f">Cafe_Free_WiFi</div><div style="font-size:13.5px;color:#5f6368">Отворена мрежа</div></div></div>
  ${[["Lyato-Guest", true], ["TP-Link_93C1", true], ["Hotel_Guest", false]].map(([n, l]) => `<div style="display:flex;align-items:center;gap:18px;padding:10px 22px">${ic("wifi_2_bar", { color: "#5f6368" })}<div style="flex:1;font-size:16.5px;color:#1f1f1f">${n}</div>${l ? ic("lock", { color: "#5f6368", size: 20 }) : ""}</div>`).join("")}
  ${tip("Обществен Wi-Fi: за новини и съобщения — да. Банка и пазаруване — НЕ, ползвайте мобилните си данни", "left:50%;top:480px;width:320px;transform:translateX(-50%)", { arrow: "u", at: "40%" })}
`), "#fff");

// i-vazstanovya-parola2
S["bezopasnost-zabravena-parola"] = phone(W(`
  <div style="padding:40px 28px 0;text-align:center"><div style="margin-bottom:18px">${circ(64, "#e8f0fe", ms("account_circle", { size: 44, fill: 1, color: "#1a73e8" }), "margin:0 auto")}</div>
    <div style="font-size:27px;color:#1f1f1f">Вход</div><div style="font-size:15.5px;color:#444746;margin-top:6px">Влезте в акаунта си</div></div>
  <div style="padding:26px 24px 0">
    <div style="border:1px solid #747775;border-radius:6px;padding:15px 14px;font-size:16px;color:#1f1f1f;position:relative"><span style="position:absolute;top:-10px;left:10px;background:#fff;padding:0 4px;font-size:12px;color:#0b57d0">Имейл</span>ime.familiya@gmail.com</div>
    <div style="border:1px solid #747775;border-radius:6px;padding:15px 14px;font-size:16px;color:#1f1f1f;margin-top:16px;position:relative;display:flex"><span style="position:absolute;top:-10px;left:10px;background:#fff;padding:0 4px;font-size:12px;color:#444746">Парола</span><span style="flex:1;letter-spacing:3px">••••••••</span>${ic("visibility", { color: "#5f6368", size: 22 })}</div>
    <div class="ring" style="display:inline-block;margin:14px 0 0 -6px;padding:6px 10px;border-radius:10px;color:#0b57d0;font-size:15.5px;font-weight:500">Забравена парола?</div>
    <div style="display:flex;justify-content:flex-end;margin-top:32px"><div style="background:#0b57d0;color:#fff;font-size:15.5px;font-weight:500;padding:11px 26px;border-radius:20px">Напред</div></div></div>
  ${tip("Само през официалната страница или приложение. Никога — по телефона на „служител“", "left:50%;top:480px;width:310px;transform:translateX(-50%)", { arrow: "u", at: "28%" })}
`), "#fff");

// i-soc-mreji-privatnost
S["bezopasnost-poveritelnost"] = phone(W(`
  ${fbTop("Поверителност")}
  <div style="background:#f0f2f5;padding:14px 12px;height:100%">
    <div style="background:#fff;border-radius:12px;padding:16px 14px">
      <div style="font-size:17.5px;font-weight:700;color:#050505">Кой може да вижда Вашите публикации?</div>
      <div style="font-size:14px;color:#65676b;margin:4px 0 8px;line-height:1.35">Изберете аудитория за бъдещите си публикации.</div>
      ${[["public", "Публично", "Всеки във Facebook и извън него", false], ["group", "Приятели", "Само Вашите приятели", true], ["person_off", "Приятели, освен…", "Скрийте от конкретни хора", false], ["lock", "Само аз", "Само Вие ги виждате", false]].map(([i, t, s, sel]) => `
        <div ${sel ? 'class="ring"' : ""} style="display:flex;align-items:center;gap:14px;padding:11px 8px;border-radius:10px;${sel ? "margin:2px 0" : ""}">${circ(42, "#e4e6eb", ms(i, { size: 24, fill: 1, color: "#050505" }))}<div style="flex:1"><div style="font-size:16px;color:#050505;font-weight:500">${t}</div><div style="font-size:13px;color:#65676b">${s}</div></div>
        <span style="width:22px;height:22px;border-radius:50%;border:2px solid ${sel ? FB : "#8a8d91"};display:flex;align-items:center;justify-content:center">${sel ? `<i style="width:12px;height:12px;border-radius:50%;background:${FB}"></i>` : ""}</span></div>`).join("")}
    </div></div>
  ${tip("Проверете кой вижда публикациите Ви — приемайте за приятели само познати", "left:50%;top:470px;width:310px;transform:translateX(-50%)", { arrow: "u", at: "40%" })}
`), "#f0f2f5");

// i-iztriya-akaunt
S["bezopasnost-iztrivane-akaunt"] = phone(W(`
  <div style="display:flex;align-items:center;gap:20px;padding:10px 16px 10px 14px;height:64px;color:#1f1f1f">${ic("arrow_back")}<div style="font-size:22px">Акаунт</div></div>
  <div style="padding:4px 0">
    ${[["person", "Лични данни", "Име, имейл, телефон"], ["key", "Парола и вход", "Последна промяна: преди 8 месеца"], ["download", "Изтегляне на моите данни", "Запазете копие, преди да изтриете"]].map(([i, t, s]) => `<div style="display:flex;align-items:center;gap:18px;padding:12px 22px;min-height:68px">${ic(i, { color: "#444746" })}<div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f">${t}</div><div style="font-size:13.5px;color:#5f6368;margin-top:2px">${s}</div></div></div>`).join("")}
    <div style="height:1px;background:#e3e3e3;margin:8px 0"></div>
    <div style="display:flex;align-items:center;gap:18px;padding:12px 22px;min-height:68px">${ic("language", { color: "#444746" })}<div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f">Език</div><div style="font-size:13.5px;color:#5f6368;margin-top:2px">Български</div></div></div>
    <div style="height:150px"></div>
    <div class="ring" style="display:flex;align-items:center;gap:18px;padding:12px 14px;margin:0 8px;border-radius:14px;min-height:68px">${ic("delete_forever", { color: "#b3261e" })}<div style="flex:1"><div style="font-size:16.5px;color:#b3261e;font-weight:500">Изтриване на акаунт</div><div style="font-size:13.5px;color:#5f6368;margin-top:2px">Всички данни ще бъдат изтрити</div></div></div></div>
  ${tip("Първо запазете нужните данни", "left:90px;top:274px", { arrow: "u", at: "30%" })}
  ${tip("Най-долу: „Изтриване на акаунт“. Прочетете какво ще се изтрие", "left:50%;top:436px;width:300px;transform:translateX(-50%)", { arrow: "d", at: "40%" })}
`), "#fff");

// ═══════════ ОБЩУВАНЕ И ВСЕКИДНЕВИЕ ═══════════

// o-vrazka-blizki
S["bezopasnost-viber-semeystvo"] = viber({
  name: "Мария (дъщеря)", sub: "онлайн", ringVideo: true,
  avatar: circ(40, "#8c5bd6", `<span style="color:#fff;font-size:18px;font-weight:500">М</span>`),
  msgs: [
    { photo: "messaging/flowers.jpg", time: "17:48" },
    { html: "Снимка от градината ни днес, мамо!", time: "17:48" },
    { out: true, html: "Колко са красиви! Неделя вечер ще се чуем ли?", time: "17:52" },
    { html: "Да! В 19:00 ще ти звънна по видео.", time: "17:53" },
  ],
  tips: tip("Видео разговорът е най-топъл — виждате се", "right:12px;top:72px;width:230px", { arrow: "u", at: "86%" }),
});

// o-pozdrav-online
S["bezopasnost-pozdrav"] = viber({
  name: "Мария Петрова", sub: "онлайн", typed: true, sendRing: true,
  avatar: circ(40, "#1f8a70", `<span style="color:#fff;font-size:18px;font-weight:500">М</span>`),
  msgs: [{ html: "Утре е рожденият ми ден! 🙂", time: "18:10" }, { photo: "messaging/flowers.jpg", out: true, time: "" }],
  input: "Честит рожден ден, Мария! Всичко най-хубаво!",
  tips: tip("Напишете пожелание, добавете картичка и натиснете „Изпрати“", "left:50%;top:150px;width:310px"),
});

// o-pomosht-sased
S["bezopasnost-sased"] = viber({
  name: "Баба Донка (съседка)", sub: "видяна днес в 9:15",
  avatar: circ(40, "#b5651d", `<span style="color:#fff;font-size:18px;font-weight:500">Д</span>`),
  msgs: [
    { out: true, html: "Добър ден, Донке! Отивам до магазина. Да Ви взема ли нещо?", time: "10:05" },
    { html: "Ох, благодаря! Хляб и мляко, ако може.", time: "10:07" },
    { out: true, html: "Разбира се. Ще Ви ги донеса след половин час.", time: "10:08" },
    { html: "Ако имате нужда от нещо, звъннете ми — номерът ми е на хладилника.", time: "10:08" },
  ].map((m, i) => (i === 3 ? { out: true, html: "Ако Ви трябва нещо, звъннете ми по всяко време.", time: "10:09" } : m)),
  tips: tip("Предложете помощ при пазар, лекарства, дребни неща — и не се колебайте да поискате", "left:50%;top:92px;width:320px;transform:translateX(-50%)", { arrow: "u", at: "20%" }),
});

// o-chitalishte-deynosti
S["bezopasnost-chitalishte"] = phone(W(`
  ${siteHead("zabobovdol.carbonstealth.eu/sabitiya")}
  <div style="background:#eef1fb;padding:20px 16px 16px"><div style="${SERIF};font-size:27px;font-weight:700;color:${BR};line-height:1.15">Събития</div><div style="font-size:15px;color:#475569;margin-top:6px;line-height:1.4">Какво предстои в Бобов дол — групи, срещи и празници.</div></div>
  <div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;background:#f8fafc;height:100%">
    ${[["3", "ноем.", "Репетиция на женския хор", "Читалище · 17:00"], ["5", "ноем.", "Ръкоделие и приказки", "Читалище · 16:00"], ["8", "ноем.", "Беседа: спомени за миньорския труд", "Читалище · 15:00"]].map(([d, m, t, p], i) => `
      <div ${i === 0 ? 'class="ring"' : ""} style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px;display:flex;gap:14px;align-items:center;${i === 0 ? "margin:3px" : ""}">
        <div style="width:60px;border-radius:10px;background:#eef1fb;text-align:center;padding:8px 0;flex-shrink:0"><div style="${SERIF};font-size:26px;font-weight:700;color:${BR};line-height:1">${d}</div><div style="font-size:13px;color:#475569;margin-top:2px">${m}</div></div>
        <div><div style="font-size:16.5px;font-weight:600;color:#0f172a;line-height:1.25">${t}</div><div style="font-size:14px;color:#475569;margin-top:3px">${p}</div></div></div>`).join("")}
  </div>
  ${tip("Изберете нещо по интерес — хор, ръкоделие, беседи. Отидете веднъж да видите", "left:50%;top:560px;width:320px;transform:translateX(-50%)", { arrow: "u", at: "30%" })}
`), "#fff");

// o-spravia-se-samota
S["bezopasnost-sedmica"] = phone(W(`
  <div style="display:flex;align-items:center;gap:18px;padding:10px 16px 6px 16px;height:60px;color:#1f1f1f">${ic("menu")}<div style="flex:1;font-size:22px">Тази седмица</div>${ic("search")}</div>
  ${[["пт", "30", "Разходка със съседката", "10:00", "#0b8043", true], ["сб", "31", "Видео разговор с Мария", "19:00", "#8e24aa", false], ["нд", "1", "Църква — сутрешна служба", "9:00", "#039be5", false], ["пн", "2", "Ръкоделие в читалището", "16:00", "#f4511e", false], ["вт", "3", "Помощ на съседа — пазар", "10:30", "#e67c73", false]].map(([w, d, t, h, c, now]) => `
    <div style="display:flex;gap:14px;padding:10px 18px;border-top:1px solid #ececec;align-items:flex-start"><div style="width:44px;text-align:center"><div style="font-size:12px;color:#5f6368">${w}</div>${now ? circ(40, "#1a73e8", `<span style="color:#fff;font-size:20px">${d}</span>`) : `<div style="font-size:22px;color:#1f1f1f;height:40px;line-height:40px">${d}</div>`}</div>
      <div style="flex:1;background:${c};color:#fff;border-radius:12px;padding:10px 14px"><div style="font-size:16px;font-weight:500">${t}</div><div style="font-size:13px;opacity:.92;margin-top:2px">${h}</div></div></div>`).join("")}
  <div style="position:absolute;right:20px;bottom:20px;width:60px;height:60px;border-radius:18px;background:#c2e7ff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.25)">${ic("add", { size: 30, color: "#001d35" })}</div>
  ${tip("Всеки ден по нещо: разговор с близък, среща, приятно занимание", "left:50%;top:500px;width:300px;transform:translateX(-50%)", { arrow: "u", at: "30%" })}
`), "#fff");

// o-namerya-stari-priyateli
S["bezopasnost-fb-tarsene"] = phone(W(`
  <div style="display:flex;align-items:center;gap:12px;padding:8px 14px;height:56px;background:#fff;border-bottom:1px solid #e4e6eb">${ic("arrow_back", { color: "#050505" })}<div style="flex:1;height:38px;border-radius:19px;background:#f0f2f5;display:flex;align-items:center;padding:0 14px;font-size:16px;color:#050505">Георги Димитров</div></div>
  <div style="display:flex;gap:8px;padding:10px 12px;background:#fff">${["Всички", "Хора", "Снимки", "Групи"].map((t, i) => `<span style="padding:7px 14px;border-radius:18px;font-size:14.5px;font-weight:600;background:${i === 1 ? "#e7f3ff" : "#e4e6eb"};color:${i === 1 ? FB : "#050505"}">${t}</span>`).join("")}</div>
  <div style="background:#f0f2f5;height:100%;padding:8px 0">
    ${[["apps/poppy.jpg", "Георги Димитров", "Живее в Бобов дол", "14 общи приятели", true], ["more/lake.jpg", "Георги Димитров", "Живее в София", "1 общ приятел", false], ["more/rilapeak.jpg", "Георги Димитров", "Живее в Дупница", "6 общи приятели", false]].map(([p, n, s, m, r], i) => `
      <div ${r ? 'class="ring"' : ""} style="display:flex;align-items:center;gap:14px;background:#fff;padding:12px 14px;margin-bottom:${r ? 10 : 2}px;${r ? "margin:3px 8px 12px;border-radius:12px" : ""}">${fbPic(p, 62)}
        <div style="flex:1"><div style="font-size:17px;font-weight:600;color:#050505">${n}</div><div style="font-size:13.5px;color:#65676b;margin-top:1px">${s}</div><div style="font-size:13.5px;color:#65676b">${m}</div></div>
        <div style="background:#e7f3ff;color:${FB};font-weight:600;font-size:14px;padding:8px 12px;border-radius:8px">Добавяне</div></div>`).join("")}
  </div>
  ${tip("Вижте снимките и общите познати, за да сте сигурни, че е същият човек", "left:50%;top:470px;width:310px;transform:translateX(-50%)", { arrow: "u", at: "62%" })}
`), "#fff");

// o-dobrovolets-stana
S["bezopasnost-dobrovolets"] = phone(W(`
  ${siteHead("zabobovdol.carbonstealth.eu/dobrovolci")}
  <div style="background:#eef1fb;padding:22px 16px 20px"><div style="${SERIF};font-size:28px;font-weight:700;color:${BR};line-height:1.15">Доброволци в помощ</div><div style="font-size:15.5px;color:#475569;margin-top:8px;line-height:1.45">Мрежа от доброволци, които безплатно помагат на възрастните хора в Бобов дол — с телефони, документи, пазар и компания.</div></div>
  <div style="padding:16px;background:#f8fafc;height:100%"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px 16px">
    <div style="${SERIF};font-size:21px;font-weight:700;color:#0f172a">Искате да помогнете?</div>
    <div style="font-size:15.5px;color:#334155;margin:6px 0 16px;line-height:1.45">Отделете малко време за някой възрастен съсед. Запишете се за доброволец — ние ще Ви свържем.</div>
    ${btnB("Станете доброволец", true)}</div></div>
  ${tip("Натиснете „Станете доброволец“, опишете с какво можете да помогнете и оставете телефон", "left:50%;top:560px;width:320px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

// o-spodelya-spomen
const field = (l, v, tall) => `<div style="margin-bottom:12px"><div style="font-size:14.5px;font-weight:600;color:#0f172a;margin-bottom:4px">${l}</div><div style="border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:15px;color:#0f172a;background:#fff;line-height:1.4;${tall ? "height:112px" : ""}">${v}</div></div>`;
S["bezopasnost-spomen"] = phone(W(`
  ${siteHead("zabobovdol.carbonstealth.eu/spomeni/nov")}
  <div style="padding:16px 16px 0;background:#fff"><div style="${SERIF};font-size:25px;font-weight:700;color:${BR};margin-bottom:12px">Споделете спомен</div>
    ${field("Заглавие", "Хорото на площада през 70-те")}
    ${field("Вашето име", "Стоян Георгиев")}
    ${field("Спомен", "Всяка събота вечер се събирахме на площада. Свиреше акордеон, а след хорото всички пиехме лимонада…<br><span style='color:#475569'>Имам и стара снимка — ще я пратя.</span>", true)}
    ${btnB("Споделете спомена", true)}</div>
  ${tip("Напишете спомена и го подайте — ще го прегледаме и публикуваме", "left:50%;top:600px;width:310px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

// o-prazenstva-online
S["bezopasnost-sluzhba-na-zhivo"] = phone(W(`
  <div style="position:relative;height:220px;background:#000">${img("more/church.jpg", { w: 390, h: 220 })}
    <div style="position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,0) 35%,rgba(0,0,0,0) 65%,rgba(0,0,0,.55))"></div>
    <div style="position:absolute;left:10px;top:8px">${ic("keyboard_arrow_down", { size: 30, color: "#fff" })}</div>
    <div style="position:absolute;right:12px;top:8px;display:flex;gap:16px">${ic("cast", { color: "#fff" })}${ic("settings", { color: "#fff" })}</div>
    <div class="ring ringr" style="position:absolute;left:162px;top:80px;width:66px;height:66px;border-radius:50%;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">${ic("play_arrow", { size: 44, fill: 1, color: "#fff" })}</div>
    <div style="position:absolute;left:12px;right:12px;bottom:10px;display:flex;align-items:center;gap:8px;color:#fff;font-size:12px"><span style="background:#e00;border-radius:3px;padding:1px 6px;font-weight:700;font-size:11px">НА ЖИВО</span>3 124 гледат сега</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:#f00"></div></div>
  <div style="padding:14px 14px 0;color:#0f0f0f"><div style="font-size:18px;font-weight:500;line-height:1.3">Света литургия — празнична служба (на живо)</div><div style="font-size:13px;color:#606060;margin-top:5px">3 124 гледат сега · започна преди 25 мин.</div></div>
  <div style="display:flex;align-items:center;gap:12px;padding:14px">${circ(40, "#6a3b8a", `<span style="color:#fff;font-size:17px;font-weight:500">Х</span>`)}<div style="flex:1"><div style="font-size:15px;font-weight:500">Храм Пример — официален канал</div><div style="font-size:12.5px;color:#606060">8,4 хил. абонати</div></div><div style="background:#0f0f0f;color:#fff;font-size:14px;font-weight:500;padding:8px 14px;border-radius:18px">Абониране</div></div>
  <div style="display:flex;gap:10px;padding:0 14px">${[["thumb_up", "412"], ["share", "Споделяне"], ["download", "Изтегляне"]].map(([i, t]) => `<div style="display:flex;align-items:center;gap:6px;background:#f2f2f2;border-radius:18px;padding:8px 14px;font-size:14px">${ic(i, { size: 20, color: "#0f0f0f" })}${t}</div>`).join("")}</div>
  ${tip("Докоснете видеото на живо на официалния канал. Гледайте на телефона или на телевизора", "left:50%;top:480px;width:320px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

// ═══════════ ЗАБАВЛЕНИЕ И ХОБИТА ═══════════

// z-sluham-cherkva
S["bezopasnost-cherkovni-pesni"] = phone(W(`
  ${ytBar("църковни песнопения")}
  <div style="display:flex;gap:8px;padding:2px 12px 10px">${["Всички", "Музика", "На живо", "Скорошни"].map((t, i) => `<span style="padding:7px 13px;border-radius:9px;background:${i === 0 ? "#0f0f0f" : "#f2f2f2"};color:${i === 0 ? "#fff" : "#0f0f0f"};font-size:14px;font-weight:500">${t}</span>`).join("")}</div>
  ${ytItem("apps/monastery.jpg", "58:12", "Църковни песнопения — хор на манастира", "Манастирски хор Пример · 214 хил. гледания", { ring: true, av: "М", avc: "#6a3b8a" })}
  ${ytItem("more/rila.jpg", "1:02:40", "Духовна музика за спокойствие", "Православна музика Пример · 98 хил. гледания", { av: "П", avc: "#2e6f95" })}
  ${tip("Напишете „църковни песнопения“ или име на хор/манастир, изберете и пуснете", "left:50%;top:600px;width:320px;transform:translateX(-50%)")}
`), "#fff");

// z-virtualni-obikolki
S["bezopasnost-virtualna-obikolka"] = phone(W(`
  ${chromeBar("muzey-primer.example/virtualna-obikolka", true)}
  <div style="position:relative;height:290px">${img("more/rila.jpg", { w: 390, h: 290 })}
    <div style="position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.2),rgba(0,0,0,0) 40%,rgba(0,0,0,.6))"></div>
    <div style="position:absolute;left:14px;bottom:12px;right:14px;color:#fff"><div style="${SERIF};font-size:24px;font-weight:700;line-height:1.15">Виртуална обиколка</div><div style="font-size:14px;opacity:.92;margin-top:3px">Музей Пример — разгледайте залите от дома</div></div>
    <div style="position:absolute;left:10px;top:122px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center">${ic("chevron_left", { size: 30, color: "#222" })}</div>
    <div style="position:absolute;right:10px;top:122px;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center">${ic("chevron_right", { size: 30, color: "#222" })}</div></div>
  <div style="padding:16px;background:#fff"><div style="font-size:15px;color:#334155;line-height:1.45">Докоснете стрелките и разгледайте всяка зала. На екрана „цял размер“ се вижда най-добре.</div>
    <div style="display:flex;gap:10px;margin-top:14px">${["Зала 1", "Зала 2", "Зала 3"].map((t, i) => `<span style="flex:1;text-align:center;padding:11px 0;border-radius:10px;font-size:15px;font-weight:600;${i === 0 ? "background:#212f8a;color:#fff" : "background:#eef1fb;color:#212f8a"}">${t}</span>`).join("")}</div>
    <div class="ring" style="margin:18px 3px 0;padding:12px 14px;border-radius:12px;display:flex;align-items:center;gap:10px;font-size:15px;color:#0f172a;font-weight:500">${ic("fullscreen", { color: "#212f8a" })}Цял екран</div></div>
  ${tip("Отворете официалния сайт на музея и разгледайте залите от екрана", "left:50%;top:70px;width:300px;transform:translateX(-50%)", { arrow: "u", at: "30%" })}
`), "#fff");

// z-gradinarstvo-saveti
S["bezopasnost-gradina-saveti"] = gsearch({
  q: "как да отглеждам домати",
  body: `<div style="padding:14px 16px 4px"><div style="display:flex;gap:12px;align-items:stretch"><div style="position:relative;width:150px;height:96px;border-radius:12px;overflow:hidden;flex-shrink:0">${img("apps/tomato.jpg", { w: 150, h: 96 })}<span style="position:absolute;left:50%;top:50%;margin:-18px 0 0 -18px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center">${ic("play_arrow", { fill: 1, color: "#fff", size: 24 })}</span><span style="position:absolute;right:5px;bottom:5px;background:rgba(0,0,0,.8);color:#fff;font-size:11px;padding:1px 4px;border-radius:3px">8:42</span></div>
    <div style="flex:1"><div style="font-size:15.5px;color:#1a0dab;line-height:1.25">Домати от семе до реколта — видео урок</div><div style="font-size:12.5px;color:#5f6368;margin-top:4px">Градинарски съвети Пример · видео</div></div></div></div>
    ${gres("Градина Пример", "gradina.example › домати", "Как да отглеждаме домати — поливане и светлина", "Доматите обичат слънце и редовно, но умерено поливане, сутрин…", { ring: true })}
    ${gres("Моят двор", "moyatdvor.example › зеленчуци", "Съвети за цветя и зеленчуци в градината", "Кога да сеем, как да поливаме и какво да правим през есента…")}`,
  tips: tip("Потърсете растението + „как да отглеждам“, гледайте видео и следвайте указанията", "left:50%;top:560px;width:320px;transform:translateX(-50%)", { arrow: "u", at: "34%" }),
});

// z-prazni-igri-vnuci — видео разговор: „познай какво държа“ (без лица)
S["bezopasnost-igra-poznai"] = phone(W(`
  <div style="position:absolute;inset:0">${img("more/apple.jpg", { w: 390, h: 700 })}</div>
  <div style="position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,0) 22%,rgba(0,0,0,0) 62%,rgba(0,0,0,.7))"></div>
  <div style="position:absolute;left:16px;top:10px;color:#fff"><div style="font-size:19px;font-weight:500;text-shadow:0 1px 3px rgba(0,0,0,.5)">Ани (внучка)</div><div style="font-size:13.5px;opacity:.9;text-shadow:0 1px 3px rgba(0,0,0,.5)">Видео разговор · 04:12</div></div>
  <div style="position:absolute;right:14px;top:14px;width:92px;height:128px;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.45);border:2px solid rgba(255,255,255,.85)">${img("apps/kettle.jpg", { w: 92, h: 128 })}</div>
  <div style="position:absolute;left:0;right:0;bottom:30px;display:flex;justify-content:center;gap:22px">${circ(58, "rgba(255,255,255,.25)", ms("mic", { size: 28, fill: 1, color: "#fff" }))}${circ(58, "rgba(255,255,255,.25)", ms("flip_camera_android", { size: 28, color: "#fff" }))}${circ(58, "#e53935", ms("call_end", { size: 30, fill: 1, color: "#fff" }))}</div>
  ${tip("Играйте на гатанки или „познай какво държа“ — внучето показва предмет пред камерата", "left:50%;top:480px;width:320px;transform:translateX(-50%)")}
`), "#000", "#fff");

// ═══════════ ИЗМАМНИК НА ВРАТАТА — снимка ═══════════
const DOOR = "bezopasnost/door-chain.jpg";
S["bezopasnost-izmamnik-vrata"] = scene(
  `<div style="position:relative;width:360px;padding-bottom:132px">
    ${img(DOOR, { w: 360, h: 440, radius: 18, style: "box-shadow:0 18px 40px rgba(15,23,42,.28)" })}
    <div class="ring" style="position:absolute;left:112px;top:92px;width:104px;height:336px;border-radius:30px"></div>
    ${tip("Питайте кой е и защо идва — без да отваряте. Не давайте пари на вратата. Проверете на официалния телефон на фирмата", "left:50%;top:462px;width:340px;transform:translateX(-50%)", { arrow: "u", at: "36%" })}
    <div style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:12px;color:#64748b">Снимка: Jebulon, Wikimedia Commons (CC0)</div></div>`,
  { pad: 30 });

// ───────────────────────── Рендер ─────────────────────────
render(S);
