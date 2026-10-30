// Група „zdrave“ — ръководства за здраве, първа помощ и грижа за близък.
// Екраните на телефона (Телефон, Часовник, Календар, Chrome, бележки, приложение за здраве) пресъздават
// познатия Android вид; уебстраниците/документите са ИЗМИСЛЕН дизайн с явно примерни данни.
// Истинските снимки (само CC0/PDM) са в assets/zdrave/, лицензите — в assets/credits/zdrave.md.
// Червените бележки казват САМО това, което пише в стъпките на ръководството.
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-zdrave.js   (ONLY=име1,име2 за избрани)
const path = require("node:path");
const fs = require("node:fs");
const { phone, scene, tip: _tip, render, ms, photo, ASSETS } = require("./_shell");

const ZD = path.join(ASSETS, "zdrave");
const have = (f) => fs.existsSync(path.join(ZD, f));
const img = (f, o = {}) => photo(path.isAbsolute(f) ? f : path.join(ZD, f), o);
const tip = (t, css = "", o) => _tip(t, /left:50%/.test(css) ? css + ";transform:translateX(-50%);width:max-content" : css, o);
const S = {};

const G = { on: "#1f1f1f", sub: "#444746", gray: "#5f6368", pri: "#0b57d0", priC: "#d3e3fd", sc: "#f0f4f9", pill: "#e9eef6", line: "#e3e3e3", red: "#b3261e", grn: "#146c2e" };
const ic = (n, o = {}) => ms(n, { size: 24, ...o });
const wrap = (inner, o = {}) => `<div style="height:${o.h || 660}px;display:flex;flex-direction:column;position:relative;overflow:hidden;${o.css || ""}">${inner}</div>`;
const spacer = `<div style="flex:1;min-height:0"></div>`;
const ph = (inner, bg = "#fff", sc = "#1f1f1f", o) => phone(inner, bg, sc, o);
const letter = (t, c, s = 40, fs) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${fs || Math.round(s * 0.45)}px;flex-shrink:0">${t}</div>`;
const ringBox = (css = "") => `<div class="ring" style="position:absolute;${css}"></div>`;
const credit = (t) => `<div style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:12px;color:#64748b">${t}</div>`;

// ───────────────────────── Телефон: клавиатура / повикване ─────────────────────────
const dialKey = (d, sub = "") => `<div style="height:74px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:32px;color:${G.on};line-height:1">${d}</div><div style="font-size:11px;letter-spacing:2px;color:${G.gray};height:13px">${sub}</div></div>`;
function keypad() {
  const k = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]];
  return `<div style="display:grid;grid-template-columns:repeat(3,1fr);padding:0 22px">${k.map(([d, s]) => dialKey(d, s)).join("")}</div>`;
}
const callBtn = (ring) => `<div class="${ring ? "ring" : ""}" style="width:72px;height:72px;border-radius:${ring ? 24 : 36}px;background:#1b8a4b;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2)">${ic("call", { size: 32, fill: 1, color: "#fff" })}</div>`;

// 1) h-povikam-lineyka — набран 112 в клавиатурата на Телефон
S["zdrave-112-nabirane"] = ph(wrap(`
  <div style="height:72px;flex-shrink:0"></div>
  <div style="text-align:center;font-size:48px;color:${G.on};letter-spacing:1px;height:84px;line-height:84px">112</div>
  <div style="text-align:center;font-size:14px;color:${G.red};height:24px">Спешен номер</div>
  <div style="height:22px"></div>
  ${keypad()}
  <div style="display:flex;justify-content:center;padding-top:6px">${callBtn(true)}</div>
  ${spacer}
  ${tip("Наберете 112<br>и изчакайте да вдигнат", "left:50%;top:30px", { arrow: "d", at: "50%" })}
`), "#fff", "#1f1f1f");

// 2) h-speshni-telefoni — заключен телефон, „Спешно повикване“
S["zdrave-speshno-zaklyuchen"] = ph(wrap(`
  <div style="position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 0%,#2b3340 0%,#161a21 60%,#0c0e12 100%)"></div>
  <div style="position:relative;color:#fff;display:flex;flex-direction:column;height:100%">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 22px 0">
      <div style="font-size:20px;color:#e8eaed">Спешно повикване</div>${ic("lock", { size: 20, fill: 1, color: "#c4c7cf" })}
    </div>
    <div style="text-align:center;font-size:54px;letter-spacing:2px;height:100px;line-height:100px;margin-top:66px">112</div>
    <div style="text-align:center;font-size:14px;color:#9aa0a6;margin-bottom:12px">Безплатно · без кредит · денонощно</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);padding:0 30px;color:#fff">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => `<div style="height:66px;display:flex;align-items:center;justify-content:center;font-size:30px">${d}</div>`).join("")}</div>
    <div style="display:flex;justify-content:center;margin-top:8px"><div style="width:72px;height:72px;border-radius:36px;background:#1b8a4b;display:flex;align-items:center;justify-content:center">${ic("call", { size: 32, fill: 1, color: "#fff" })}</div></div>
  </div>
  ${tip("112 — единен европейски<br>спешен номер", "left:50%;top:56px", { arrow: "d", at: "50%" })}
  ${tip("Работи и при заключен телефон,<br>и без кредит", "left:50%;bottom:6px", { arrow: "u", at: "50%" })}
`), "#0c0e12", "#ffffff");

// 3) h2-kakvo-da-pravia-padnal — „Любими“ в Телефон: близък и 112
S["zdrave-padnal-zvanene"] = ph(wrap(`
  <div style="margin:8px 16px;height:52px;border-radius:26px;background:${G.pill};display:flex;align-items:center;padding:0 16px;gap:14px;flex-shrink:0">${ic("search", { color: G.sub })}<span style="flex:1;font-size:16px;color:${G.sub}">Търсене на контакти</span></div>
  <div style="padding:14px 20px 6px;font-size:14px;color:${G.gray}">Любими</div>
  <div style="display:flex;gap:14px;padding:6px 16px 4px">
    ${[["Мария (дъщеря)", "М", "#a142f4", 1], ["Иван (син)", "И", "#188038"], ["Личен лекар", "Л", "#12a4af"]].map(([n, l, c, r]) => `<div style="width:104px;text-align:center"><div class="${r ? "ring" : ""}" style="margin:0 auto;width:76px;height:76px;border-radius:50%;${r ? "" : ""}">${letter(l, c, 76, 34)}</div><div style="font-size:13px;margin-top:8px;color:${G.on}">${n}</div></div>`).join("")}
  </div>
  <div style="padding:22px 20px 8px;font-size:14px;color:${G.gray}">Скорошни</div>
  ${[["Мария (дъщеря)", "Изходящо · вчера, 18:20", "#a142f4", "М"], ["112", "Спешен номер · понеделник", "#d93025", "!"], ["Иван (син)", "Входящо · 12 окт.", "#188038", "И"]].map(([n, s, c, l]) => `<div style="display:flex;align-items:center;gap:16px;padding:9px 20px">${letter(l, c, 44, 20)}<div style="flex:1"><div style="font-size:17px;color:${G.on}">${n}</div><div style="font-size:13px;color:${G.gray};margin-top:2px">${s}</div></div>${ic("call", { size: 22, color: G.gray })}</div>`).join("")}
  ${spacer}
  <div style="height:80px;background:${G.sc};display:flex;align-items:flex-start;padding-top:12px;flex-shrink:0">${[["star", "Любими", 1], ["schedule", "Скорошни"], ["contacts", "Контакти"], ["dialpad", "Клавиатура"]].map(([n, l, a]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:64px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;${a ? `background:${G.priC}` : ""}">${ic(n, { fill: a ? 1 : 0, color: a ? "#041e49" : G.sub })}</div><div style="font-size:12px;font-weight:${a ? 600 : 500};color:${a ? G.on : G.sub}">${l}</div></div>`).join("")}</div>
  ${tip("Звъннете на близък или на 112", "left:16px;top:228px;width:max-content", { arrow: "u", at: "17%" })}
`), G.sc, "#1f1f1f");

// ───────────────────────── Повикване към институция (патронаж, асистент, дневен център) ─────────────────────────
function callScreen(name, num, who, sub, tipHtml, tipCss) {
  return ph(wrap(`
    <div style="position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 0%,#39414f 0%,#1d222b 55%,#0e1116 100%)"></div>
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;height:100%;color:#fff">
      <div style="margin-top:58px;font-size:30px;text-align:center;padding:0 24px;line-height:1.2">${name}</div>
      <div style="font-size:17px;color:#c5cad3;margin-top:8px">${num}</div>
      <div style="font-size:15px;color:#9aa4b2;margin-top:6px">${sub}</div>
      <div style="margin-top:40px">${letter(who, "#5f7a99", 124, 56)}</div>
      ${spacer}
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px 0;width:300px;text-align:center;font-size:12px;color:#d7dbe2;margin-bottom:34px">
        ${[["mic_off", "Без звук"], ["dialpad", "Клавиатура"], ["volume_up", "Високоговорител"]].map(([n, l]) => `<div><div style="width:58px;height:58px;margin:0 auto 6px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center">${ic(n, { size: 26, color: "#fff" })}</div>${l}</div>`).join("")}
      </div>
      <div style="width:72px;height:72px;border-radius:50%;background:#f0443a;display:flex;align-items:center;justify-content:center;margin-bottom:46px">${ic("call_end", { size: 34, fill: 1, color: "#fff" })}</div>
    </div>
    ${tip(tipHtml, tipCss, { arrow: "u", at: "50%" })}
  `), "#0e1116", "#ffffff");
}
// 4) g-patronazh-za-blizak
S["zdrave-patronazh-obazhdane"] = callScreen("Община Бобов дол<br>Социален патронаж", "02 123 4567 (пример)", "О", "Обаждане…", "Обадете се в общината/Социално<br>подпомагане за патронаж", "left:50%;top:372px");
// 5) g-lichen-asistent-blizak
S["zdrave-asistent-obazhdane"] = callScreen("Дирекция „Социално<br>подпомагане“", "02 123 4568 (пример)", "С", "Обаждане…", "Обадете се в Социално подпомагане<br>и опишете нуждата", "left:50%;top:372px");
// 6) g-dnevni-centrove
S["zdrave-dnevni-centrove-pitane"] = callScreen("Социално подпомагане<br>(дневен център)", "02 123 4569 (пример)", "С", "Обаждане…", "Питайте в общината/Социално<br>подпомагане за дневен център", "left:50%;top:372px");

// ───────────────────────── Часовник: аларми за лекарства ─────────────────────────
const alarm = (time, label, days, on, ring) => `<div class="${ring ? "ring" : ""}" style="margin:4px 14px;padding:14px 20px;border-radius:22px;background:${on ? "#e0e8f6" : G.sc};display:flex;align-items:center;gap:12px">
  <div style="flex:1"><div style="font-size:44px;line-height:1.05;color:${on ? G.on : G.gray};letter-spacing:-1px">${time}</div><div style="font-size:14px;color:${G.sub};margin-top:4px">${label} · ${days}</div></div>
  <span class="tg${on ? " on" : ""}"><i></i></span></div>`;
// 7) g-organiz-lekarstva-blizak (стъпка 4 — напомняне/аларма за всеки прием)
S["zdrave-alarmi-lekarstva"] = ph(wrap(`
  <div style="display:flex;align-items:center;padding:8px 20px 6px;height:64px;flex-shrink:0"><div style="flex:1;font-size:26px;color:${G.on}">Аларма</div>${ic("more_vert", { color: G.sub })}</div>
  ${alarm("8:00", "Лекарства — сутрин", "Всеки ден", 1, 1)}
  ${alarm("13:00", "Лекарства — обед", "Всеки ден", 1)}
  ${alarm("20:00", "Лекарства — вечер", "Всеки ден", 1)}
  ${alarm("7:30", "Измерване на кръвно", "Пон – Пет", 0)}
  ${spacer}
  <div style="position:absolute;right:20px;bottom:104px;width:64px;height:64px;border-radius:20px;background:#c2e7ff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2)">${ic("add", { size: 32, color: "#001d35" })}</div>
  <div style="height:80px;background:${G.sc};display:flex;align-items:flex-start;padding-top:12px;flex-shrink:0">${[["alarm", "Аларма", 1], ["public", "Часовник"], ["timer", "Таймер"], ["timer_play", "Хронометър"]].map(([n, l, a]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:64px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;${a ? `background:${G.priC}` : ""}">${ic(n, { fill: a ? 1 : 0, color: a ? "#041e49" : G.sub })}</div><div style="font-size:12px;color:${a ? G.on : G.sub}">${l}</div></div>`).join("")}</div>
  ${tip("Сложете напомняне (аларма)<br>за всеки прием", "right:98px;top:506px", { arrow: "r", at: "50%" })}
`), "#fff", "#1f1f1f");

// 8) h2-san-bezsanie — режим за сън (Часовник)
S["zdrave-rezhim-san"] = ph(wrap(`
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,#101a33 0%,#0b1226 55%,#070b17 100%)"></div>
  <div style="position:relative;color:#e8eaf6;display:flex;flex-direction:column;height:100%">
    <div style="display:flex;align-items:center;gap:12px;padding:8px 18px;height:64px">${ic("arrow_back", { color: "#e8eaf6" })}<div style="font-size:22px">Режим за сън</div></div>
    <div style="margin:14px 18px;padding:22px 20px;border-radius:26px;background:rgba(255,255,255,.07)">
      <div style="display:flex;align-items:center;gap:14px">${ic("bedtime", { size: 30, fill: 1, color: "#a8c7fa" })}<div style="flex:1"><div style="font-size:14px;color:#aab3d0">Лягане</div><div style="font-size:40px;letter-spacing:-1px">22:30</div></div></div>
      <div style="height:1px;background:rgba(255,255,255,.12);margin:16px 0"></div>
      <div style="display:flex;align-items:center;gap:14px">${ic("wb_sunny", { size: 30, fill: 1, color: "#f9d16b" })}<div style="flex:1"><div style="font-size:14px;color:#aab3d0">Ставане</div><div style="font-size:40px;letter-spacing:-1px">6:30</div></div></div>
      <div style="display:flex;gap:7px;margin-top:18px">${["П", "В", "С", "Ч", "П", "С", "Н"].map((d) => `<div style="flex:1;height:38px;border-radius:19px;background:#a8c7fa;color:#0b1226;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500">${d}</div>`).join("")}</div>
    </div>
    <div style="margin:0 18px;display:flex;flex-direction:column;gap:0;border-radius:22px;background:rgba(255,255,255,.07);overflow:hidden">
      ${[["do_not_disturb_on", "Не безпокойте", 1], ["contrast", "Тъмен режим", 1], ["screen_lock_portrait", "Сив екран", 1]].map(([n, l, on]) => `<div style="display:flex;align-items:center;gap:14px;padding:15px 20px;border-bottom:1px solid rgba(255,255,255,.07)">${ic(n, { fill: 1, color: "#a8c7fa" })}<div style="flex:1;font-size:16px">${l}</div><span class="tg on"><i></i></span></div>`).join("")}
    </div>
  </div>
  ${tip("Лягайте и ставайте<br>по едно и също време", "left:50%;top:536px", { arrow: "u", at: "50%" })}
`), "#0b1226", "#ffffff");

// ───────────────────────── Chrome (уеб страница на кабинет — ИЗМИСЛЕН дизайн) ─────────────────────────
function chrome(url, inner, o = {}) {
  return `<div style="background:#fff;padding:6px 12px 8px;display:flex;align-items:center;gap:8px;flex-shrink:0">
    <div style="flex:1;height:44px;border-radius:22px;background:${G.sc};display:flex;align-items:center;padding:0 14px;gap:9px">${ic("lock", { size: 17, fill: 1, color: G.sub })}<span style="flex:1;font-size:15px;color:${G.on};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${url}</span></div>
    <div style="width:34px;height:34px;border-radius:8px;border:2px solid #444746;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:${G.on}">1</div>${ic("more_vert", { color: G.on })}</div>
  <div style="flex:1;min-height:0;overflow:hidden;position:relative;background:${o.bg || "#fff"}">${inner}</div>`;
}
// 9) kak-da-zapazya-chas-pri-lichen-lekar-onlayn
const slot = (t, sel, dis) => `<div style="height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:500;${sel ? "background:#0f766e;color:#fff" : dis ? "background:#f1f3f4;color:#b0b5ba;text-decoration:line-through" : "border:1.5px solid #cfd8dc;color:#1f2933"}">${t}</div>`;
S["zdrave-zapisvane-chas-onlayn"] = ph(wrap(chrome("kabinet-primeren.example.bg/zapazi-chas", `
  <div style="background:#0f766e;color:#fff;padding:16px 18px 14px"><div style="font-size:13px;opacity:.85">Кабинет за първична помощ (примерен сайт)</div><div style="font-size:22px;font-weight:700;margin-top:3px">Запазване на час</div></div>
  <div style="padding:14px 18px 0">
    <div style="font-size:14px;color:#52606d;margin-bottom:6px">Накратко опишете оплакването</div>
    <div style="height:50px;border:1.5px solid #cfd8dc;border-radius:10px;padding:11px 12px;font-size:16px;color:#1f2933">Кашлица и леко повишена температура</div>
    <div style="font-size:14px;color:#52606d;margin:14px 0 8px">Изберете ден</div>
    <div style="display:flex;gap:8px">${[["Пон", "2"], ["Вто", "3"], ["Сря", "4"], ["Чет", "5"], ["Пет", "6"]].map(([d, n], i) => `<div style="flex:1;height:60px;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;${i === 1 ? "background:#0f766e;color:#fff" : "border:1.5px solid #cfd8dc;color:#1f2933"}"><div style="font-size:13px">${d}</div><div style="font-size:21px;font-weight:600">${n}</div></div>`).join("")}</div>
    <div style="font-size:14px;color:#52606d;margin:14px 0 8px">Свободни часове</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${slot("9:00", 0, 1)}${slot("9:30", 0)}${slot("10:00", 1)}${slot("10:30", 0, 1)}${slot("11:00", 0)}${slot("11:30", 0)}</div>
    <div style="height:50px;border-radius:25px;background:#0f766e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;margin-top:18px">Запази час</div>
  </div>`) + tip("Изберете свободен ден и час", "left:50%;top:526px", { arrow: "u", at: "50%" })), "#fff");

// ───────────────────────── Стъпки (приложение „Здраве“) ─────────────────────────
// 10) h-krachki
const bars = [48, 62, 35, 70, 58, 80, 66];
S["zdrave-krachki-prilozhenie"] = ph(wrap(`
  <div style="padding:10px 20px 0;height:64px;display:flex;align-items:center;font-size:26px;color:${G.on}">Здраве</div>
  <div style="margin:6px 16px;padding:22px;border-radius:28px;background:#e8f5e9;display:flex;flex-direction:column;align-items:center">
    <div style="font-size:15px;color:#2e5a35;margin-bottom:12px">Стъпки днес</div>
    <div style="position:relative;width:200px;height:200px">
      <svg width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="86" fill="none" stroke="#c8e6c9" stroke-width="16"/><circle cx="100" cy="100" r="86" fill="none" stroke="#2e7d32" stroke-width="16" stroke-linecap="round" stroke-dasharray="${(2 * Math.PI * 86 * 0.64).toFixed(1)} 999" transform="rotate(-90 100 100)"/></svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">${ic("directions_walk", { size: 34, color: "#2e7d32", fill: 1 })}<div style="font-size:40px;font-weight:500;color:${G.on};letter-spacing:-1px">3 842</div><div style="font-size:13px;color:${G.gray}">цел: 6 000</div></div>
    </div>
  </div>
  <div style="margin:6px 16px;padding:16px 18px;border-radius:24px;background:${G.sc}">
    <div style="font-size:15px;color:${G.on};margin-bottom:12px">Тази седмица</div>
    <div style="display:flex;align-items:flex-end;gap:10px;height:96px">${bars.map((b, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;justify-content:flex-end;height:100%"><div style="width:100%;height:${b}px;border-radius:8px;background:${i === 6 ? "#2e7d32" : "#a5d6a7"}"></div><div style="font-size:12px;color:${G.gray}">${"ПВСЧПСН"[i]}</div></div>`).join("")}</div>
  </div>
  ${spacer}
  ${tip("Отворете приложението —<br>показва стъпките за деня", "left:50%;top:522px", { arrow: "u", at: "50%" })}
`), "#fff", "#1f1f1f");

// 11) h2-kakvo-znachi-kravno — дневник на кръвното, ориентири по ръководството
const bpRow = (d, v, p, col) => `<div style="display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid ${G.line}"><div style="width:10px;height:10px;border-radius:50%;background:${col}"></div><div style="flex:1;font-size:15px;color:${G.gray}">${d}</div><div style="font-size:19px;font-weight:500;color:${G.on}">${v}</div><div style="width:76px;text-align:right;font-size:14px;color:${G.gray}">пулс ${p}</div></div>`;
S["zdrave-kravno-chisla"] = ph(wrap(`
  <div style="padding:10px 20px 0;height:64px;display:flex;align-items:center;gap:12px;font-size:24px;color:${G.on}">${ic("arrow_back")}Кръвно налягане</div>
  <div style="margin:6px 16px;padding:20px 22px;border-radius:28px;background:#e8f0fe;text-align:center">
    <div style="font-size:14px;color:${G.sub}">Последно измерване · днес, 8:10</div>
    <div style="font-size:64px;font-weight:500;color:${G.on};letter-spacing:-2px;line-height:1.15;margin-top:6px">120<span style="color:${G.gray}">/</span>80</div>
    <div style="font-size:15px;color:${G.sub}">горно · долно · <b>пулс 72</b></div>
  </div>
  <div style="margin:8px 16px 0;border-radius:20px;background:${G.sc};padding:6px 0">
    ${[["#2e7d32", "Около 120/80", "добро"], ["#ef6c00", "Постоянно над 140/90", "повишено — говорете с лекар"], ["#1565c0", "Под 90/60", "ниско — ако прилошава, седнете и пийте вода"]].map(([c, a, b]) => `<div style="display:flex;gap:12px;padding:9px 16px"><div style="width:12px;height:12px;border-radius:4px;background:${c};margin-top:4px;flex-shrink:0"></div><div style="font-size:14.5px;color:${G.on};line-height:1.3"><b>${a}</b> — ${b}</div></div>`).join("")}
  </div>
  <div style="padding:14px 18px 4px;font-size:14px;color:${G.gray}">Дневник</div>
  ${bpRow("вчера, 19:40", "124/82", 74, "#2e7d32")}
  ${bpRow("вчера, 8:05", "118/79", 70, "#2e7d32")}
  ${bpRow("пон, 8:12", "126/84", 73, "#2e7d32")}
`), "#fff", "#1f1f1f");
S["zdrave-kravno-chisla"] = S["zdrave-kravno-chisla"].replace("</div></div></div></div></body>", "</div></div></div></div></body>");

// 12) g-pochivka-grizheshtiya — Календар: смени между близките
const ev = (c, t) => `<div style="background:${c};color:#fff;border-radius:6px;padding:3px 6px;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;margin-bottom:3px">${t}</div>`;
const dayCell = (n, evs = "", mute) => `<div style="border-right:1px solid ${G.line};border-bottom:1px solid ${G.line};padding:4px 3px;min-height:76px"><div style="font-size:13px;text-align:center;color:${mute ? "#9aa0a6" : G.on};margin-bottom:4px">${n}</div>${evs}</div>`;
S["zdrave-smeni-kalendar"] = ph(wrap(`
  <div style="padding:8px 20px 0;height:60px;display:flex;align-items:center;gap:16px;font-size:24px;color:${G.on}">${ic("menu")}<div style="flex:1">Ноември</div>${ic("search")}</div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid ${G.line}">${"ПВСЧПСН".split("").map((d) => `<div style="text-align:center;font-size:12px;color:${G.gray};padding:6px 0">${d}</div>`).join("")}</div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid ${G.line};border-left:1px solid ${G.line}">
    ${dayCell(2, ev("#188038", "Мария"))}${dayCell(3, ev("#188038", "Мария"))}${dayCell(4, ev("#1a73e8", "Иван"))}${dayCell(5, ev("#1a73e8", "Иван"))}${dayCell(6, ev("#a142f4", "Съсед"))}${dayCell(7, ev("#188038", "Мария"))}${dayCell(8, ev("#188038", "Мария"))}
    ${dayCell(9, ev("#1a73e8", "Иван"))}${dayCell(10, ev("#1a73e8", "Иван"))}${dayCell(11, ev("#188038", "Мария"))}${dayCell(12, ev("#a142f4", "Съсед"))}${dayCell(13, ev("#1a73e8", "Иван"))}${dayCell(14, ev("#188038", "Мария"))}${dayCell(15, ev("#188038", "Мария"))}
    ${dayCell(16)}${dayCell(17)}${dayCell(18)}${dayCell(19)}${dayCell(20)}${dayCell(21)}${dayCell(22)}
  </div>
  <div style="margin:16px 16px 0;padding:14px 16px;border-radius:18px;background:${G.sc};display:flex;gap:14px;align-items:center"><div style="width:10px;height:44px;border-radius:5px;background:#1a73e8"></div><div style="flex:1"><div style="font-size:17px;color:${G.on}">Смяна — Иван</div><div style="font-size:14px;color:${G.gray};margin-top:2px">9 ноември · 8:00 – 14:00</div></div></div>
  ${spacer}
  ${tip("Молете други близки<br>за редовна смяна", "left:50%;top:430px", { arrow: "d", at: "50%" })}
`), "#fff", "#1f1f1f");

// 13) g-grizha-za-suprug — дневник на състоянието в „Бележки“
S["zdrave-dnevnik-sastoyanie"] = ph(wrap(`
  <div style="padding:8px 16px 0;height:60px;display:flex;align-items:center;gap:12px;color:${G.on}">${ic("arrow_back")}<div style="flex:1"></div>${ic("push_pin")}${ic("more_vert")}</div>
  <div style="padding:6px 22px 0;font-size:28px;color:${G.on};line-height:1.2">Състояние на Петър</div>
  <div style="padding:4px 22px 14px;font-size:13px;color:${G.gray}">Днес, 9:20</div>
  <div style="padding:0 22px;font-size:17px;color:${G.on};line-height:1.55">
    <b>Пон</b> — кръвно 128/84, спа добре, обядва с апетит.<br>
    <b>Вто</b> — леко главоболие сутринта, лекарствата взети в 8:00 и 20:00.<br>
    <b>Сря</b> — разходка до двора, без оплаквания.<br>
    <b>Чет</b> — кашлица вечерта; да питам лекаря.<br>
    <div style="margin-top:16px;padding:12px 14px;border-radius:14px;background:#fff8e1;font-size:15px"><b>За прегледа:</b> въпроси към лекаря и записаните по-горе стойности.</div>
  </div>
  ${spacer}
  ${tip("Спазвайте указанията на лекаря<br>и записвайте състоянието", "left:50%;top:446px", { arrow: "u", at: "50%" })}
  <div style="position:absolute;right:18px;bottom:104px;width:56px;height:56px;border-radius:18px;background:#fbbc04;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2)">${ic("edit", { size: 26, color: "#3c2e00", fill: 1 })}</div>
`), "#fff", "#1f1f1f");

// 14) h2-samota-nastroenie — видео разговор с близки (лица няма — букви)
S["zdrave-samota-video"] = ph(wrap(`
  <div style="position:absolute;inset:0;background:linear-gradient(160deg,#2c3e50 0%,#1b2733 100%)"></div>
  <div style="position:relative;height:100%;display:flex;flex-direction:column;color:#fff">
    <div style="display:flex;align-items:center;gap:12px;padding:10px 18px;height:60px">${ic("keyboard_arrow_down", { color: "#fff" })}<div style="flex:1;text-align:center;font-size:17px">Семейство — видео разговор</div>${ic("group_add", { color: "#fff" })}</div>
    <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:150px;align-content:start;gap:10px;padding:8px 12px 0">
      ${[["М", "#a142f4", "Мария"], ["И", "#188038", "Иван"], ["Н", "#d93025", "Ники (внук)"], ["Т", "#12a4af", "Теодора"]].map(([l, c, n]) => `<div style="border-radius:22px;background:rgba(255,255,255,.08);position:relative;display:flex;align-items:center;justify-content:center;height:150px">${letter(l, c, 78, 36)}<div style="position:absolute;left:12px;bottom:10px;font-size:14px;background:rgba(0,0,0,.35);padding:3px 10px;border-radius:12px">${n}</div></div>`).join("")}
    </div>
    <div style="display:flex;justify-content:center;gap:18px;padding:22px 0 30px">${[["mic", "#3c4043"], ["videocam", "#3c4043"], ["screen_share", "#3c4043"], ["call_end", "#d93025"]].map(([n, c]) => `<div style="width:60px;height:60px;border-radius:30px;background:${c};display:flex;align-items:center;justify-content:center">${ic(n, { size: 28, fill: 1, color: "#fff" })}</div>`).join("")}</div>
  </div>
  ${tip("Поддържайте контакт с близки<br>(обаждания, видео разговори)", "left:50%;top:408px", { arrow: "d", at: "50%" })}
`), "#1b2733", "#ffffff");

// 15/16) календарни събития — профилактичен преглед и ваксина против грип
function eventScreen(title, when, extra, tipHtml, tipCss, ar, rows) {
  return ph(wrap(`
    <div style="display:flex;align-items:center;gap:14px;padding:8px 16px;height:60px;color:${G.on}">${ic("close")}<div style="flex:1"></div><div style="height:40px;padding:0 24px;border-radius:20px;background:${G.pri};color:#fff;display:flex;align-items:center;font-size:15px;font-weight:500">Запази</div></div>
    <div style="padding:6px 24px 16px;font-size:30px;color:${G.on};line-height:1.2;border-bottom:1px solid ${G.line}">${title}</div>
    ${rows.map(([n, a, b]) => `<div style="display:flex;gap:20px;padding:15px 24px;border-bottom:1px solid ${G.line}">${ic(n, { color: G.sub })}<div><div style="font-size:17px;color:${G.on}">${a}</div>${b ? `<div style="font-size:14px;color:${G.gray};margin-top:2px">${b}</div>` : ""}</div></div>`).join("")}
    ${spacer}
    ${tip(tipHtml, tipCss, { arrow: ar, at: "50%" })}
  `), "#fff", "#1f1f1f");
}
S["zdrave-profilaktichen-pregled-chas"] = eventScreen("Профилактичен преглед — личен лекар", "", "", "Запишете час за годишен профилактичен<br>преглед при личния лекар", "left:50%;top:420px", "u", [["schedule", "вторник, 18 ноември", "9:30 – 10:00"], ["location_on", "Кабинет на личния лекар (пример)", ""], ["notifications", "1 ден преди", "Напомняне"], ["notes", "Носете лична карта", ""]]);
S["zdrave-grip-vaksina-chas"] = eventScreen("Ваксина против грип — разговор с лекаря", "", "", "Питайте личния лекар<br>дали е подходяща за вас", "left:50%;top:420px", "u", [["schedule", "сряда, 12 ноември", "10:30 – 11:00"], ["location_on", "Кабинет на личния лекар (пример)", ""], ["notifications", "1 ден преди", "Напомняне"]]);

// ───────────────────────── Хартиени / печатни предмети (измислен дизайн, примерни данни) ─────────────────────────
const deskBg = "radial-gradient(120% 100% at 30% 0%,#e9dcc6 0%,#d9c7a8 55%,#c9b48f 100%)";
const paperShadow = "box-shadow:0 1px 1px rgba(60,40,10,.25),0 10px 24px -6px rgba(60,40,10,.4),0 24px 40px -18px rgba(60,40,10,.35)";
const fridgeBg = "linear-gradient(100deg,#e9edf0 0%,#f7f9fa 35%,#eef1f3 70%,#dde2e6 100%)";
const magnet = (c, css = "") => `<div style="position:absolute;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8 0,${c} 40%,#000a 150%);box-shadow:0 3px 5px rgba(0,0,0,.4);${css}"></div>`;

// 17) h2-priznaci-insult — карта „Лице – Ръце – Реч“ на вратата на хладилника
const fast = (n, head, text, c) => `<div style="display:flex;gap:16px;padding:14px 0;border-bottom:1.5px solid #e6e0d6"><div style="width:62px;height:62px;border-radius:16px;background:${c};display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(n, { size: 36, color: "#fff", fill: 1 })}</div><div><div style="font-size:21px;font-weight:700;color:#1d2b3a">${head}</div><div style="font-size:16px;color:#34414f;line-height:1.35;margin-top:2px">${text}</div></div></div>`;
S["zdrave-insult-lice-race-rech"] = scene(`
  <div style="position:relative;width:520px;height:640px">
    <div style="position:absolute;left:50px;top:26px;width:420px;padding:22px 26px 20px;background:#fffdf8;border-radius:6px;transform:rotate(-1.2deg);${paperShadow}">
      <div style="font-size:25px;font-weight:800;color:#1d2b3a;letter-spacing:-.3px;line-height:1.15">Инсулт: Лице – Ръце – Реч</div>
      ${fast("sentiment_satisfied", "Лице", "Помолете човека да се усмихне. Едната страна увисва ли?", "#c2410c")}
      ${fast("front_hand", "Ръце", "Помолете го да вдигне двете ръце. Едната пада ли надолу?", "#0f766e")}
      ${fast("record_voice_over", "Реч", "Помолете го да каже простичко изречение. Говорът завален или неразбираем ли е?", "#1d4ed8")}
      <div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#fde8e8;font-size:17px;font-weight:700;color:#9b1c1c;line-height:1.3">При дори един съмнителен признак — звъннете на 112 веднага.</div>
    </div>
    ${magnet("#d32f2f", "left:244px;top:6px")}
    ${tip("Направете трите проверки:<br>усмивка, вдигане на ръце,<br>кратко изречение", "left:50%;top:572px", { arrow: "u", at: "50%" })}
  </div>`, { w: 520, h: 640, pad: 0, bg: fridgeBg });


// 18) h2-priznaci-infarkt — карта със признаците (дословно от ръководството)
const sign = (n, t, c = "#b91c1c") => `<div style="display:flex;gap:14px;align-items:center;padding:11px 0;border-bottom:1.5px solid #e6e0d6"><div style="width:48px;height:48px;border-radius:14px;background:${c};display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(n, { size: 28, color: "#fff", fill: 1 })}</div><div style="font-size:17px;color:#1d2b3a;line-height:1.3">${t}</div></div>`;
S["zdrave-infarkt-priznaci"] = scene(`
  <div style="position:relative;width:520px;height:560px">
    <div style="position:absolute;left:50px;top:26px;width:420px;padding:22px 26px 20px;background:#fffdf8;border-radius:6px;transform:rotate(1deg);${paperShadow}">
      <div style="font-size:25px;font-weight:800;color:#1d2b3a;letter-spacing:-.3px;line-height:1.15">Признаци на инфаркт</div>
      ${sign("monitor_heart", "Болка, натиск или стягане в средата на гърдите")}
      ${sign("accessibility_new", "Болка, която „плъзва“ към лявата ръка, врата, челюстта или гърба", "#c2410c")}
      ${sign("water_drop", "Студена пот, гадене, силна слабост", "#0f766e")}
      ${sign("air", "Задух", "#1d4ed8")}
      <div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:#fde8e8;font-size:17px;font-weight:700;color:#9b1c1c;line-height:1.3">При съмнение звъннете НЕЗАБАВНО на 112.</div>
    </div>
    ${magnet("#1d4ed8", "left:245px;top:6px")}
    ${tip("При съмнение звъннете<br>незабавно на 112", "left:50%;top:492px", { arrow: "u", at: "50%" })}
  </div>`, { w: 520, h: 560, pad: 0, bg: fridgeBg });

// 19) h2-koga-lekar-koga-112
const col = (c, head, lines) => `<div style="flex:1;border-radius:12px;background:#fff;padding:16px 16px 14px;border-top:8px solid ${c};box-shadow:0 1px 3px rgba(0,0,0,.15)"><div style="font-size:24px;font-weight:800;color:${c};margin-bottom:10px">${head}</div>${lines.map((l) => `<div style="font-size:15px;line-height:1.35;color:#1d2b3a;padding:7px 0;border-top:1px solid #eee">${l}</div>`).join("")}</div>`;
S["zdrave-koga-lekar-koga-112"] = scene(`
  <div style="position:relative;width:620px;height:440px">
    <div style="position:absolute;left:20px;top:26px;width:580px;padding:18px;background:#fffdf8;border-radius:6px;transform:rotate(-.8deg);${paperShadow}">
      <div style="display:flex;gap:14px">
        ${col("#c62828", "На 112", ["Болка в гърдите, задух, признаци на инсулт, силно кървене, загуба на съзнание", "Тежка злополука, отравяне, високо неовладяно кръвно със симптоми"])}
        ${col("#0f766e", "При личен лекар", ["Настинка, леки болки, хронични оплаквания, рецепти"])}
      </div>
      <div style="margin-top:14px;font-size:16px;color:#34414f;text-align:center">При съмнение — обадете се и питайте.</div>
    </div>
    ${magnet("#d32f2f", "left:285px;top:6px")}
    ${tip("При съмнение — обадете се<br>и питайте", "left:50%;top:352px", { arrow: "u", at: "50%" })}
  </div>`, { w: 620, h: 440, pad: 0, bg: fridgeBg });

// 20) g-proverka-izmami-blizak — бележка до телефона
S["zdrave-izmami-belezhka"] = scene(`
  <div style="position:relative;width:520px;height:450px">
    <div style="position:absolute;left:70px;top:30px;width:380px;padding:26px 28px 24px;background:linear-gradient(160deg,#fff6a8,#ffee75);transform:rotate(-2deg);box-shadow:0 2px 3px rgba(80,60,0,.25),0 14px 22px -8px rgba(80,60,0,.4)">
      <div style="font-size:24px;font-weight:800;color:#3b3200;line-height:1.2">Ако звънят „от банката“ или „от полицията“:</div>
      <div style="margin-top:14px;font-size:19px;color:#3b3200;line-height:1.4">
        <div>✗ Банка и полиция <b>не искат кодове и пари</b> по телефон.</div>
        <div style="margin-top:8px">✓ Затварям и се обаждам на <b>Мария</b>.</div>
      </div>
      <div style="margin-top:14px;font-size:16px;color:#6b5a00">Мария: 0888 123 456 (пример)</div>
    </div>
    ${magnet("#1d4ed8", "left:245px;top:12px")}
    ${tip("Сложете на видно място<br>бележка с правилата", "left:50%;top:388px", { arrow: "u", at: "50%" })}
  </div>`, { w: 520, h: 450, pad: 0, bg: fridgeBg });

// 21) h-chas-specialist-napravlenie — хартиено направление (ИЗМИСЛЕН образец)
const fld = (l, v, w = "100%") => `<div style="width:${w};border-bottom:1.2px solid #9aa7b4;padding:3px 0 3px;margin-bottom:10px"><div style="font-size:10.5px;color:#6b7785">${l}</div><div style="font-size:16px;color:#1d2b3a;min-height:20px">${v}</div></div>`;
S["zdrave-napravlenie-specialist"] = scene(`
  <div style="position:relative;width:560px;height:540px">
    <div style="position:absolute;left:40px;top:24px;width:480px;padding:26px 30px 24px;background:#fffefb;transform:rotate(1.2deg);${paperShadow}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:23px;font-weight:800;color:#1d2b3a">НАПРАВЛЕНИЕ</div><div style="font-size:12px;color:#6b7785">за консултация със специалист (примерен образец)</div></div><div style="font-size:12px;color:#6b7785;text-align:right">№ 0000000<br>дата: 03.11.2026</div></div>
      <div style="height:14px"></div>
      ${fld("Пациент", "Иван Петров (примерно име)")}
      ${fld("Личен лекар", "д-р А. Иванова (примерно име)")}
      <div style="position:relative">${fld("Към специалист", "Кардиолог")}<div class="ring" style="position:absolute;left:-8px;right:-8px;top:-4px;height:56px;border-radius:12px"></div></div>
      ${fld("Диагноза / причина", "Оплаквания от сърцебиене")}
      <div style="position:relative">${fld("Важи до", "03.12.2026")}<div class="ring" style="position:absolute;left:-8px;width:200px;top:-4px;height:56px;border-radius:12px"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:14px;font-size:12px;color:#6b7785"><div style="border-top:1.2px solid #9aa7b4;width:170px;padding-top:4px">подпис на лекаря</div><div style="width:92px;height:92px;border-radius:50%;border:2.5px solid #3a5aa8;opacity:.65;color:#3a5aa8;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;transform:rotate(-14deg);margin-top:-30px">печат<br>(пример)</div></div>
    </div>
    ${tip("Питайте за какъв специалист е<br>и какъв е срокът на направлението", "left:50%;top:480px", { arrow: "u", at: "50%" })}
  </div>`, { w: 560, h: 540, pad: 0, bg: deskBg });

// 22) h-pregled-podgotovka — лист „Какво да нося“
const chk = (t) => `<div style="display:flex;gap:12px;align-items:flex-start;padding:7px 0"><div style="width:22px;height:22px;border:2px solid #3a5aa8;border-radius:5px;margin-top:2px;flex-shrink:0;display:flex;align-items:center;justify-content:center">${ic("check", { size: 18, color: "#3a5aa8", weight: 700 })}</div><div style="font-size:18px;color:#1d2b3a;line-height:1.3">${t}</div></div>`;
S["zdrave-podgotovka-pregled"] = scene(`
  <div style="position:relative;width:560px;height:480px">
    <div style="position:absolute;left:50px;top:24px;width:460px;padding:26px 30px 22px;background:repeating-linear-gradient(#fffefb 0 31px,#d6e2f2 31px 32px);transform:rotate(-1deg);${paperShadow}">
      <div style="font-size:25px;font-weight:800;color:#1d2b3a;margin-bottom:8px">Какво да нося на преглед</div>
      ${chk("Лична карта и здравна книжка/документи")}
      ${chk("Списъка с лекарства и алергии")}
      ${chk("Предишни изследвания и решения")}
      ${chk("Оплакванията и въпросите ми — записани предварително")}
      ${chk("При изследване на гладно — да не ям сутринта")}
      ${chk("Да дойда малко по-рано")}
    </div>
    ${tip("Запишете оплакванията<br>и въпросите си предварително", "left:50%;top:412px", { arrow: "u", at: "50%" })}
  </div>`, { w: 560, h: 480, pad: 0, bg: deskBg });

// 23) g-dokumenti-na-blizak — папка с подредени документи
S["zdrave-dokumenti-papka"] = scene(`
  <div style="position:relative;width:580px;height:530px">
    <div style="position:absolute;left:60px;top:70px;width:460px;height:380px;border-radius:10px;background:linear-gradient(160deg,#e3c98f,#d2b274);box-shadow:0 18px 30px -10px rgba(60,40,10,.5)">
      ${[["Лични", 0, "#b3261e"], ["Здравни", 118, "#1565c0"], ["Пенсия", 236, "#2e7d32"]].map(([t, x, c]) => `<div style="position:absolute;left:${x + 14}px;top:-30px;width:110px;height:34px;border-radius:9px 9px 0 0;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600">${t}</div>`).join("")}
      <div style="position:absolute;left:22px;right:22px;top:26px;bottom:20px;display:flex;flex-direction:column;gap:-6px">
        ${["Здравна книжка и епикризи", "Решение за пенсия", "Лична карта (копие, пример)", "Рецепти и изследвания"].map((t, i) => `<div style="height:70px;margin-bottom:-14px;border-radius:6px;background:#fffefb;box-shadow:0 -2px 4px rgba(0,0,0,.12);padding:12px 16px;font-size:17px;color:#1d2b3a;transform:rotate(${[-.6, .5, -.3, .4][i]}deg)">${t}</div>`).join("")}
      </div>
    </div>
    ${tip("Подредете документите му<br>на едно място", "left:50%;top:466px", { arrow: "u", at: "50%" })}
  </div>`, { w: 580, h: 530, pad: 0, bg: deskBg });


// ───────────────────────── Истински снимки (CC0/PD) с червен контур и бележка ─────────────────────────
// photoScene(файл, ширина, височина, [контури], [бележки], снимка-кредит, [height на сцената под снимката])
function photoScene(file, w, h, rings, tips, creditText, pb = 34) {
  const rs = rings.map(([l, t, rw, rh, rad]) => `<div class="ring" style="position:absolute;left:${l}px;top:${t}px;width:${rw}px;height:${rh}px;border-radius:${rad == null ? 18 : rad}px"></div>`).join("");
  const ts = tips.map(([txt, css, o]) => tip(txt, css, o)).join("");
  return scene(`<div style="position:relative;width:${w}px;padding-bottom:${pb}px">
    ${img(file, { w, h, radius: 16, style: "box-shadow:0 18px 40px rgba(15,23,42,.28)" })}${rs}${ts}
    ${credit(creditText)}
  </div>`, { pad: 28 });
}

// 24) h2-merya-kravno
S["zdrave-kravno-merene"] = photoScene("kravno-merene.jpg", 640, 443,
  [[216, 2, 172, 152, 26], [388, 292, 86, 46, 14]],
  [["Маншет на голата ръка,<br>на 2–3 см над лакътя", "left:14px;top:70px", { arrow: "r", at: "50%" }],
   ["Натиснете бутона „Старт“", "left:160px;top:350px", { arrow: "r", at: "50%" }]],
  "Снимка: Beendy234, Wikimedia Commons (CC0) · лого размито");


// 25) h2-merya-temperatura
S["zdrave-termometar"] = photoScene("temperatura.jpg", 640, 267,
  [[66, 226, 62, 46, 16], [442, 96, 120, 70, 16]],
  [["Върхът — в средата<br>на сухата подмишница", "left:20px;top:282px", { arrow: "u", at: "28%" }],
   ["Прочетете числото<br>на екрана", "left:420px;top:282px", { arrow: "u", at: "45%" }]],
  "Снимка: Wikimedia Commons (CC0) · надписите на производителя са размити", 130);


// ───────────────────────── Печатни карти „на хладилника/масата“ (дословно по стъпките) ─────────────────────────
// card(заглавие, [[икона, текст]], {foot, tipText, color, bg, rot, pin, photo:{file,h}, cols})
function card(title, items, o = {}) {
  const { foot, tipText, color = "#c2410c", bg = fridgeBg, rot = -1, pin = "#d32f2f", photo, w = 440, tipAt = "50%" } = o;
  const rows = items.map(([n, t], i) => `<div style="display:flex;gap:14px;align-items:center;padding:10px 0;${i ? "border-top:1.5px solid #e6e0d6" : ""}"><div style="width:44px;height:44px;border-radius:13px;background:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(n, { size: 26, color: "#fff", fill: 1 })}</div><div style="font-size:16.5px;color:#1d2b3a;line-height:1.3">${t}</div></div>`).join("");
  const ph = photo ? `<div style="margin:-22px -26px 14px;height:${photo.h}px;overflow:hidden;border-radius:6px 6px 0 0">${img(photo.file, { w: w, h: photo.h, style: photo.style || "" })}</div>` : "";
  const body = `<div style="position:absolute;left:30px;top:26px;width:${w}px;padding:${photo ? 22 : 38}px 26px 18px;background:#fffdf8;border-radius:6px;transform:rotate(${rot}deg);${paperShadow}">
    ${ph}<div style="font-size:24px;font-weight:800;color:#1d2b3a;letter-spacing:-.3px;line-height:1.15;margin-bottom:6px">${title}</div>${rows}
    ${foot ? `<div style="margin-top:12px;padding:11px 14px;border-radius:10px;background:#fde8e8;font-size:16px;font-weight:700;color:#9b1c1c;line-height:1.3">${foot}</div>` : ""}</div>`;
  return { body, w: w + 60 };
}
function cardScene(title, items, o = {}) {
  const c = card(title, items, o);
  const body = c.body.replace("position:absolute;left:30px;top:26px;width:" + (c.w - 60) + "px;", "position:relative;margin:26px 30px 0;width:" + (c.w - 60) + "px;");
  return scene(`<div style="position:relative;width:${c.w}px;padding-bottom:26px">${body}
    ${magnet(o.pin || "#d32f2f", `left:${c.w / 2 - 15}px;top:6px`)}
    ${o.tipText ? `<div style="text-align:center;margin-top:30px">${tip(o.tipText, "position:relative;display:inline-block", { arrow: "u", at: "50%" })}</div>` : ""}</div>`, { w: c.w, pad: 0, bg: o.bg || fridgeBg });
}
const deskCard = { bg: deskBg, pin: "#1d4ed8" };

S["zdrave-zadavyane-hvatka"] = cardScene("Задавяне: какво правя", [
  ["back_hand", "Наведете го напред и нанесете 5 силни удара с длан между плешките."],
  ["accessibility_new", "Ако не помогне, застанете зад него и обхванете кръста с ръце."],
  ["sports_mma", "Сложете юмрук малко над пъпа и го хванете с другата ръка."],
  ["arrow_upward", "Дръпнете силно навътре и нагоре — 5 пъти (хватка на Хаймлих)."],
  ["repeat", "Редувайте 5 удара по гърба и 5 натискания, докато блокажът излезе."]],
  { foot: "Ако човекът изпадне в безсъзнание — звъннете 112 и следвайте указанията на оператора.", tipText: "Редувайте 5 удара по гърба<br>и 5 натискания", color: "#c2410c" });
S["zdrave-kravotechenie-nos"] = cardScene("Кръв от носа", [
  ["airline_seat_recline_normal", "Седнете и наведете главата леко НАПРЕД (не назад)."],
  ["pinch", "Стиснете меката част на носа (под костта) с палец и показалец."],
  ["timer", "Дишайте през устата и дръжте стиснато 10 минути, без да пускате."],
  ["ac_unit", "Може да сложите студен компрес върху носа."]],
  { foot: "Не си бъркайте и не се секнете силно няколко часа след това.", tipText: "Главата леко напред — не назад", color: "#0f766e", bg: deskBg, pin: "#1d4ed8" });


const MOREA = (f) => path.join(ASSETS, "more", f);
S["zdrave-izgaryane-ohlazhdane"] = cardScene("Леко изгаряне", [
  ["do_not_disturb_on", "Махнете пръстени и часовник близо до мястото, преди да отече."],
  ["water_drop", "Дръжте изгореното под хладка течаща вода 15–20 минути."],
  ["do_not_touch", "Не пукайте мехурите."],
  ["healing", "Подсушете внимателно и покрийте с чиста, нелепкава марля."]],
  { foot: "НЕ слагайте масло, паста за зъби или лед.", tipText: "Хладка течаща вода — 15–20 минути", color: "#0369a1", ...deskCard });
S["zdrave-malka-rana"] = cardScene("Малка рана или порязване", [
  ["wash", "Измийте ръцете си, преди да пипате раната."],
  ["compress", "Притиснете с чиста марля, докато спре кървенето."],
  ["water_drop", "Измийте раната с чиста вода (и сапун около нея)."],
  ["sanitizer", "Подсушете и сложете дезинфектант, ако имате."],
  ["healing", "Покрийте с лепенка или марля."],
  ["event_repeat", "Сменяйте превръзката всеки ден и при намокряне."]],
  { tipText: "Притиснете с чиста марля,<br>докато спре кървенето", color: "#0f766e" });
S["zdrave-priloshavane"] = cardScene("На някого му прилошее или припадне", [
  ["airline_seat_flat", "Ако усеща, че ще припадне — нека седне или легне веднага."],
  ["elderly", "Повдигнете краката му малко нагоре."],
  ["air", "Осигурете чист въздух, разхлабете тесни дрехи."],
  ["hotel", "Ако е в безсъзнание, но диша — обърнете го настрани."],
  ["visibility", "Останете до него и следете дишането."]],
  { foot: "Ако НЕ диша нормално — звъннете на 112 и следвайте указанията.", tipText: "Повдигнете краката му малко нагоре", color: "#7c3aed", ...deskCard });
S["zdrave-lekarstva-pravilno"] = cardScene("Лекарствата — правилно и безопасно", [
  ["menu_book", "Четете указанието: доза, колко пъти и кога (преди/след храна)."],
  ["medication", "Ползвайте кутийка за дни/часове, за да не се бъркате."],
  ["block", "Не спирайте и не променяйте дозата без лекар."],
  ["no_drinks", "Не смесвайте с алкохол."],
  ["stethoscope", "Питайте лекаря/аптекаря за взаимодействия между лекарства."],
  ["child_care", "Пазете лекарствата на сухо, далеч от деца."]],
  { tipText: "Не променяйте дозата сами", color: "#0f766e" });
S["zdrave-srok-lekarstva"] = cardScene("Срок на годност на лекарство", [
  ["event_available", "Намерете срока на годност на опаковката (изписан с дата)."],
  ["block", "Ако датата е минала — не го приемайте."],
  ["opacity", "Гледайте и срока след отваряне (за капки, сиропи)."],
  ["recycling", "Изхвърляйте старите лекарства правилно (в аптека приемат)."],
  ["inventory_2", "Не пазете разпилени таблетки без опаковка."]],
  { tipText: "Ако датата е минала — не го приемайте", color: "#b91c1c", ...deskCard });
S["zdrave-voda"] = cardScene("Вода през деня", [
  ["local_drink", "Пийте вода редовно през деня, не наведнъж."],
  ["wb_sunny", "В жега и при температура пийте повече."],
  ["visibility", "Дръжте чаша/бутилка на видно място като напомняне."],
  ["soup_kitchen", "Чай и супи също се броят за течности."],
  ["coffee", "Ограничете много кафе и сладки напитки."],
  ["stethoscope", "Питайте лекаря, ако имате бъбречни/сърдечни ограничения."]],
  { tipText: "Чаша вода на видно място", color: "#0369a1" });
S["zdrave-zhega"] = cardScene("В горещините", [
  ["schedule", "Стойте на хладно през най-горещите часове (11–17 ч)."],
  ["local_drink", "Пийте вода редовно."],
  ["checkroom", "Носете леки, светли дрехи и шапка навън."],
  ["window", "Проветрявайте сутрин и вечер, дръпвайте пердетата през деня."],
  ["warning", "Признаци за прегряване: замайване, гадене, силна слабост — охладете се и почивайте."]],
  { foot: "При обърканост или загуба на съзнание — звъннете на 112.", tipText: "Хладно през 11–17 ч", color: "#c2410c", ...deskCard });
S["zdrave-padane-doma"] = cardScene("Риск от падане у дома", [
  ["texture", "Махнете килимчета и кабели, в които може да се спънете."],
  ["lightbulb", "Осигурете добро осветление, особено нощем по пътя до тоалетната."],
  ["accessible", "Сложете дръжки в банята и до стълбите."],
  ["steps", "Носете стабилни обувки/чехли, не хлъзгави чорапи."],
  ["shelves", "Дръжте нужните неща на удобна височина."],
  ["directions_walk", "Движете се без бързане."]],
  { tipText: "Дръжки в банята и до стълбите", color: "#0f766e" });
S["zdrave-navitsi"] = cardScene("Прости навици за здраве", [
  ["directions_walk", "Движете се всеки ден (дори кратка разходка)."],
  ["restaurant", "Хранете се редовно и разнообразно, пийте вода."],
  ["bedtime", "Спете достатъчно и в постоянен режим."],
  ["groups", "Поддържайте контакт с хора — против самотата."],
  ["medication", "Вземайте лекарствата си редовно."],
  ["stethoscope", "Ходете на профилактични прегледи."]],
  { photo: { file: MOREA("apple.jpg"), h: 130, style: "object-position:50% 38%" }, tipText: "Движете се всеки ден", color: "#15803d", ...deskCard });
S["zdrave-zubi-protezi"] = cardScene("Зъби и протеза", [
  ["dentistry", "Мийте зъбите два пъти дневно с мека четка."],
  ["nightlight", "Протезата чистете всеки ден и я вадете нощем (в чаша с вода/разтвор)."],
  ["water_drop", "Изплаквайте устата след хранене."],
  ["event", "Ходете на зъболекар при болка или разклатена протеза."],
  ["stethoscope", "При рани в устата, които не минават — на лекар."]],
  { tipText: "Два пъти дневно, с мека четка", color: "#0369a1" });
S["zdrave-ochi"] = cardScene("Зрение и очи", [
  ["ophthalmology", "Ходете на очен лекар редовно (особено при диабет/високо кръвно)."],
  ["eyeglasses", "Носете подходящи очила и ги дръжте чисти."],
  ["light_mode", "При четене осигурявайте добра светлина."],
  ["sunny", "Пазете очите от силно слънце (слънчеви очила)."],
  ["priority_high", "При внезапно влошаване, петна или болка — на лекар бързо."]],
  { tipText: "Подходящи очила и добра светлина", color: "#7c3aed", ...deskCard });
S["zdrave-sluh"] = cardScene("Слух и слухов апарат", [
  ["hearing", "При влошен слух отидете на специалист (УНГ/слухов)."],
  ["cleaning_services", "Почиствайте слуховия апарат внимателно по упътването."],
  ["battery_charging_full", "Сменяйте батериите навреме."],
  ["do_not_touch", "Не си бъркайте в ушите с твърди предмети."],
  ["volume_down", "Намалете силно силните шумове."],
  ["flashlight_on", "Може да включите светкавица при звънене на телефона."]],
  { tipText: "Сменяйте батериите навреме", color: "#0f766e" });
S["zdrave-hranene"] = cardScene("Здравословно хранене", [
  ["nutrition", "Яжте повече зеленчуци, плодове и пълнозърнести храни."],
  ["no_food", "Намалете солта, мазното и сладкото."],
  ["set_meal", "Включете белтъчини (риба, яйца, млечни, боб)."],
  ["local_drink", "Пийте достатъчно вода."],
  ["schedule", "Хранете се редовно, на по-малки порции."],
  ["stethoscope", "Съобразявайте с лекаря при диабет/кръвно/бъбреци."]],
  { photo: { file: MOREA("bread.jpg"), h: 140, style: "object-position:50% 60%" }, tipText: "Повече зеленчуци, плодове и пълнозърнести храни", color: "#b45309" });
S["zdrave-uprazhneniya"] = cardScene("Леки упражнения", [
  ["directions_walk", "Кратки разходки всеки ден."],
  ["chair", "Леки упражнения седнал (ръце, крака, рамене)."],
  ["balance", "Упражнения за равновесие (държейки се за стол)."],
  ["self_improvement", "Разтягане сутрин."],
  ["block", "Не насилвайте при болка."],
  ["stethoscope", "Питайте лекаря какви движения са подходящи за вас."]],
  { tipText: "Не насилвайте при болка", color: "#15803d", ...deskCard });
S["zdrave-aptechka"] = cardScene("Домашна аптечка", [
  ["healing", "Лепенки, марли, бинт и дезинфектант."],
  ["thermostat", "Термометър."],
  ["medication", "Болкоуспокояващо (напр. парацетамол), ако нямате противопоказание."],
  ["medication_liquid", "Лекарствата, които приемате редовно (резерв)."],
  ["list_alt", "Списък с вашите лекарства и алергии."],
  ["call", "Важни телефони (112, личен лекар)."],
  ["event_available", "Проверявайте сроковете 1–2 пъти годишно."]],
  { tipText: "Проверявайте сроковете 1–2 пъти годишно", color: "#b91c1c" });
S["zdrave-studa-zimata"] = cardScene("Студ и измръзване", [
  ["checkroom", "Обличайте се на пластове и носете шапка и ръкавици."],
  ["thermostat", "Отоплявайте дома до приятна температура."],
  ["directions_walk", "Движете се, за да се топлите."],
  ["ice_skating", "Внимавайте на лед навън (стабилни обувки, бавно)."],
  ["warning", "При силно зачервяване/изтръпване на крайник — стоплете бавно и потърсете лекар."],
  ["diversity_3", "Проверявайте възрастни близки и съседи в студа."]],
  { photo: { file: MOREA("socks.jpg"), h: 150, style: "object-position:50% 40%" }, tipText: "Обличайте се на пластове", color: "#0369a1", ...deskCard });

// @@MORE

// @@END
render(S).catch((e) => { console.error(e); process.exit(1); });
