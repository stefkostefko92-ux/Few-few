// Ръководства „Документи и плащания“ и „Транспорт и пътуване“ — реалистични екрани и сцени.
// Уеб страниците и хартиените документи са ИЗМИСЛЕН дизайн с ясно примерни данни (без гербове/лога,
// без образци на лични карти/паспорти). Снимките (улица, пътека, проходилка…) са CC0/PD — виж
// scripts/howto-mockups/assets/credits/dokumenti.md. Карти/разписание: по src/lib/bus-schedule.ts.
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-dokumenti.js   (ONLY=име1,име2 за избрани)
const path = require("node:path");
const QRCode = require("qrcode");
const { phone, scene, tip: _tip, render, ms, photo, banknote, coin, ASSETS } = require("./_shell");
const tip = (t, css = "", o) => _tip(t, /left:50%/.test(css) && !/width/.test(css) ? css + ";width:max-content" : css, o);

const DOC = path.join(ASSETS, "dokumenti");
const img = (f, o = {}) => photo(path.join(DOC, f), o);
const S = {};

// ───────────────────────── Общи градивни елементи ─────────────────────────
const ic = (n, o = {}) => ms(n, { size: 24, ...o });
const wrap = (inner, o = {}) =>
  `<div style="height:${o.h || 660}px;display:flex;flex-direction:column;position:relative;overflow:hidden;${o.css || ""}">${inner}</div>`;
const ph = (inner, bg = "#fff", sc = "#1f1f1f", o) => phone(inner, bg, sc, o);
const G = { on: "#1f1f1f", sub: "#444746", gray: "#5f6368", pri: "#0b57d0", priC: "#d3e3fd", sc: "#f0f4f9", pill: "#e9eef6", line: "#e3e3e3", red: "#b3261e", grn: "#146c2e" };
const letter = (t, c, s = 40, fs) =>
  `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${fs || Math.round(s * 0.45)}px;font-weight:400;flex-shrink:0">${t}</div>`;
const spacer = `<div style="flex:1;min-height:0"></div>`;

function chromeBar(url, o = {}) {
  const { secure = true, ring = "", lockRing = false, tabs = 3 } = o;
  return `<div style="background:#fff;padding:6px 12px 8px;display:flex;align-items:center;gap:8px;flex-shrink:0">
    <div class="${ring}" style="flex:1;height:44px;border-radius:22px;background:${G.sc};display:flex;align-items:center;padding:0 14px;gap:9px"><span class="${lockRing ? "ring ringr" : ""}" style="display:flex;padding:3px;margin:-3px">${ic(secure ? "lock" : "warning", { size: 17, fill: 1, color: secure ? "#146c2e" : "#b3261e" })}</span><span style="flex:1;font-size:15px;color:#1f1f1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${url}</span></div>
    <div style="width:34px;height:34px;border-radius:8px;border:2px solid #444746;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#1f1f1f;margin:0 2px">${tabs}</div>${ic("more_vert", { color: G.sub })}
  </div>`;
}
const site = (url, body, o = {}) => wrap(`${chromeBar(url, o)}<div style="flex:1;min-height:0;overflow:hidden;position:relative;background:${o.bg || "#fff"}">${body}</div>`);
const siteHead = (bg, title, right = "") => `<div style="height:58px;background:${bg};color:#fff;display:flex;align-items:center;padding:0 14px;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center">${ic("account_balance", { size: 19, fill: 1, color: "#fff" })}</div><div style="flex:1;font-size:17px;font-weight:500;letter-spacing:.1px">${title}</div>${right}</div>`;
const sample = (c = "#6b7280") => `<div style="position:absolute;left:0;right:0;bottom:0;padding:8px 14px;background:#f3f4f6;color:${c};font-size:11.5px;text-align:center;border-top:1px solid #e5e7eb">Илюстрация: измислен дизайн и примерни данни</div>`;
const btn = (t, o = {}) => `<div class="${o.ring ? "ring" : ""}" style="height:${o.h || 50}px;border-radius:${o.r || 25}px;background:${o.bg || "#1f3a5f"};color:${o.fg || "#fff"};font-size:16px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px;${o.css || ""}">${o.icon ? ic(o.icon, { size: 20, color: o.fg || "#fff" }) : ""}${t}</div>`;
const abs = (css, inner) => `<div style="position:absolute;${css}">${inner}</div>`;

// ───────────────────────── Хартия и маса ─────────────────────────
const GRAIN = "url('data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%27300%27 height=%27300%27><filter id=%27n%27><feTurbulence type=%27fractalNoise%27 baseFrequency=%27.9%27 numOctaves=%272%27 seed=%274%27/><feColorMatrix values=%270 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .09 0%27/></filter><rect width=%27300%27 height=%27300%27 filter=%27url(%23n)%27/></svg>')";
const WOOD = `${GRAIN},repeating-linear-gradient(92deg,rgba(60,35,15,.07) 0 2px,rgba(255,255,255,0) 2px 9px,rgba(60,35,15,.04) 9px 11px,rgba(255,255,255,0) 11px 23px),linear-gradient(180deg,#b88a5c 0%,#a57a4e 55%,#946b43 100%)`;
const COUNTER = `${GRAIN},linear-gradient(160deg,#dfe2e6 0%,#cfd3d9 60%,#c4c9d0 100%)`;
const paper = (inner, o = {}) =>
  `<div style="position:relative;width:${o.w || 400}px;${o.h ? `height:${o.h}px;` : ""}background:${GRAIN},linear-gradient(180deg,#fff,#fbfbf9);box-shadow:0 1px 1px rgba(0,0,0,.25),0 3px 6px rgba(0,0,0,.18),0 18px 30px -6px rgba(0,0,0,.38);padding:${o.pad ?? 28}px;color:#1d2330;font-family:'Roboto',sans-serif;${o.rot ? `transform:rotate(${o.rot}deg);` : ""}${o.css || ""}">${inner}</div>`;
const mark = (css) => `<div class="ring" style="position:absolute;border-radius:6px;${css}"></div>`;
const watermark = (t = "ПРИМЕР") => `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:92px;font-weight:700;letter-spacing:8px;color:rgba(190,30,30,.07);transform:rotate(-24deg)">${t}</div>`;
const SIG = (w = 120) => `<svg width="${w}" height="40" viewBox="0 0 120 40"><path d="M4 30 C14 4 22 4 20 24 S30 34 38 16 S50 10 46 28 S62 30 70 14 S84 22 96 12 L116 26" fill="none" stroke="#1d3a8a" stroke-width="2" stroke-linecap="round"/></svg>`;
const deskScene = (inner, w, h, bg = WOOD) => scene(`<div style="position:relative;width:${w}px;height:${h}px;background:${bg};overflow:hidden">${inner}</div>`, { pad: 0 });
// Универсална „пластмасова“ карта без лице и защитни елементи — само пример къде пише срокът
const genericCard = (css = "", o = {}) => `<div style="position:absolute;${css};width:420px;height:264px;border-radius:18px;background:${GRAIN},linear-gradient(135deg,#e7edf5 0%,#cfd9e6 50%,#dbe3ee 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.3),0 14px 26px -4px rgba(0,0,0,.45);font-family:'Roboto',sans-serif;color:#25313f;overflow:hidden">
  <div style="position:absolute;left:22px;top:18px;font-size:12px;font-weight:700;letter-spacing:.6px;color:#6a7a8f">ПРИМЕРНА КАРТА — НЕ Е ДОКУМЕНТ</div>
  <div style="position:absolute;left:22px;top:52px;width:112px;height:140px;border-radius:8px;background:linear-gradient(180deg,#bcc8d8,#a9b7ca);display:flex;align-items:flex-end;justify-content:center;overflow:hidden">${ic("person", { size: 120, fill: 1, color: "#8b9cb3" })}</div>
  <div style="position:absolute;left:152px;top:56px;font-size:11px;color:#6a7a8f">Фамилия</div><div style="position:absolute;left:152px;top:70px;font-size:17px;font-weight:500">ПРИМЕРОВА</div>
  <div style="position:absolute;left:152px;top:100px;font-size:11px;color:#6a7a8f">Име</div><div style="position:absolute;left:152px;top:114px;font-size:17px;font-weight:500">МАРИЯ</div>
  <div style="position:absolute;left:152px;top:150px;font-size:11px;color:#6a7a8f">Валидна до</div><div style="position:absolute;left:152px;top:164px;font-size:21px;font-weight:700;letter-spacing:.4px">14.03.2031</div>
  <div style="position:absolute;left:22px;bottom:14px;font-size:11px;color:#7c8aa0">Лицева страна · 0000 000 000</div>
</div>`;

// ═══════════════ Документи и плащания ═══════════════

// 1. Местни данъци онлайн
S["mestni-danatsi-onlayn"] = ph(site("plashtane.obshtina.example", `
  ${siteHead("#1f4e5f", "Общински портал", ic("menu", { color: "#fff" }))}
  <div style="padding:16px 16px 0"><div style="font-size:22px;font-weight:700;color:#14303a">Местни данъци и такси</div><div style="font-size:13.5px;color:#4b5f66;margin-top:3px">Плащане с банкова карта, без опашка</div></div>
  <div style="margin:14px 16px 0"><div style="font-size:12.5px;color:#4b5f66;margin-bottom:4px">ЕГН или партиден номер</div><div style="height:48px;border-radius:10px;border:2px solid #1f4e5f;display:flex;align-items:center;padding:0 14px;font-size:17px;letter-spacing:1px;color:#14303a">0000 123 456</div></div>
  <div style="margin:14px 16px 0;border:1px solid #cfdde2;border-radius:12px;overflow:hidden">
    <div style="padding:10px 14px;background:#eef4f6;font-size:13px;font-weight:500;color:#14303a">Задължения към 30.10.2026</div>
    ${[["Данък сгради", "Година 2026 · II вноска", "38,40 €"], ["Такса смет", "Година 2026 · II вноска", "52,10 €"]].map(([a, b, c]) => `<div style="display:flex;align-items:center;padding:11px 14px;border-top:1px solid #e3ecef"><div style="flex:1"><div style="font-size:15px;color:#14303a;font-weight:500">${a}</div><div style="font-size:12px;color:#6b7c82">${b}</div></div><div style="font-size:16px;font-weight:700;color:#14303a">${c}</div></div>`).join("")}
    <div style="display:flex;justify-content:space-between;padding:12px 14px;border-top:1px solid #cfdde2;background:#f7fafb;font-size:15px;font-weight:700;color:#14303a"><span>Общо за плащане</span><span>90,50 €</span></div>
  </div>
  <div style="margin:14px 16px 0">${btn("Плащане с карта", { icon: "credit_card", bg: "#1f4e5f", ring: 1 })}</div>
  <div style="margin:10px 16px 0;display:flex;gap:8px;font-size:12.5px;color:#4b5f66;align-items:center">${ic("lock", { size: 16, fill: 1, color: "#146c2e" })}Данните на картата въвеждайте само на този официален портал</div>
  ${tip("Прегледайте сумата и за какво е,<br>после изберете „Плащане с карта“", "left:50%;top:536px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
  ${sample()}
`, { lockRing: false }), "#fff");

// 2. Каса за плащане в брой (EasyPay)
S["kasa-easypay"] = scene(`<div style="position:relative;width:760px;height:560px;background:${COUNTER};overflow:hidden">
  ${paper(`<div style="font-size:12px;color:#6b7280;margin-bottom:6px">Електроснабдяване — пример</div><div style="font-size:21px;font-weight:700;margin-bottom:12px">Сметка за ток</div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:14px"><span style="color:#6b7280">Период</span><span>октомври 2026</span><span style="color:#6b7280">Абонат</span><span>М. Примерова</span><span style="color:#6b7280">Партиден номер</span><span style="font-weight:700;font-size:16px">1234567890</span><span style="color:#6b7280">Срок за плащане</span><span>15.11.2026</span></div>
    <div style="margin-top:16px;border-top:1px solid #d6dae1;padding-top:10px;display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:14px;color:#6b7280">Сума за плащане</span><span style="font-size:26px;font-weight:700">48,70 €</span></div>
    <div style="margin-top:14px;height:54px;background:repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 4px,#111 4px 5px,#fff 5px 8px,#111 8px 11px,#fff 11px 12px)"></div><div style="font-size:11px;color:#6b7280;margin-top:5px;letter-spacing:2px">8 123456 789012</div>
    <div style="margin-top:10px;font-size:11.5px;color:#6b7280">Може да платите на каса — „EasyPay/ePay“</div>${mark("left:22px;top:128px;width:344px;height:40px")}`, { w: 390, h: 420, rot: -3, css: "position:absolute;left:34px;top:60px" })}
  <div style="position:absolute;left:470px;top:70px">${banknote(20, "front", 188)}</div>
  <div style="position:absolute;left:518px;top:164px;transform:rotate(7deg)">${banknote(10, "front", 181)}</div>
  <div style="position:absolute;left:470px;top:262px">${coin("2e", "common", { scale: 5 })}</div>
  <div style="position:absolute;left:546px;top:274px">${coin("50c", "common", { scale: 5 })}</div>
  ${paper(`<div style="font-size:13px;font-weight:700;text-align:center;letter-spacing:.5px">БЕЛЕЖКА ЗА ПЛАЩАНЕ</div><div style="border-top:1px dashed #9aa0aa;margin:8px 0"></div><div style="font-size:12.5px;line-height:1.7;color:#2b3340">Електроснабдяване (пример)<br>Партиден № 1234567890<br>Платено в брой: <b>48,70 €</b><br>30.10.2026 11:42</div><div style="border-top:1px dashed #9aa0aa;margin:8px 0"></div><div style="font-size:12px;text-align:center;font-weight:700">ПЛАТЕНО</div>`, { w: 190, pad: 16, rot: 4, css: "position:absolute;left:520px;top:326px;border-radius:0 0 3px 3px" })}
  ${tip("Подайте сметката<br>или само партидния номер", "left:36px;top:12px", { arrow: "d", at: "35%" })}
  ${tip("Платете в брой —<br>служителят въвежда плащането", "left:462px;top:16px;width:max-content", { arrow: "d", at: "40%" })}
  ${tip("Запазете бележката<br>като доказателство", "left:300px;top:488px;width:max-content", { arrow: "r", at: "50%" })}
  ${abs("left:10px;bottom:8px;font-size:11px;color:#59606b", "Банкноти: образци на ЕЦБ (SPECIMEN) · Илюстрация с примерни данни")}
</div>`, { pad: 0 });

// 3. Срок на личната карта — къде пише „Валидна до“
S["lichna-karta-srok"] = deskScene(`
  ${genericCard("left:150px;top:90px;transform:rotate(-4deg)")}
  <div class="ring" style="position:absolute;left:287px;top:236px;width:230px;height:62px;border-radius:12px;transform:rotate(-4deg)"></div>
  ${tip("Реда „Валидна до“ — на лицевата страна.<br>Ако датата наближава (до 1–2 месеца),<br>започнете подмяната", "left:50%;top:408px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "60%" })}
  ${abs("left:12px;bottom:8px;font-size:11px;color:rgba(255,255,255,.85)", "Илюстрация: универсална примерна карта, не е образец на документ")}
`, 720, 520);

// 4. Запазване на час в МВР
const dayCell = (d, st) => `<div style="height:38px;border-radius:19px;display:flex;align-items:center;justify-content:center;font-size:14.5px;${st === "x" ? "color:#b8bfc7" : st === "sel" ? "background:#1f3a5f;color:#fff;font-weight:700" : st === "free" ? "background:#e5eefb;color:#1f3a5f;font-weight:500" : "color:#9aa3ad"}">${d}</div>`;
S["chas-mvr"] = ph(site("chas.example.bg/dokumenti", `
  ${siteHead("#1f3a5f", "Запазване на час", ic("help", { color: "#fff" }))}
  <div style="padding:12px 16px 0;font-size:13px;color:#4b5b78;display:flex;gap:6px;align-items:center">${ic("location_on", { size: 17, fill: 1, color: "#1f3a5f" })}Дупница · Български документи за самоличност</div>
  <div style="margin:10px 16px 0;height:46px;border-radius:10px;border:1px solid #b9c5d8;display:flex;align-items:center;padding:0 12px;gap:10px;font-size:15px;color:#14213d">${ic("badge", { size: 20, color: "#1f3a5f" })}<span style="flex:1">Лична карта — подмяна</span>${ic("expand_more", { color: "#6b7280" })}</div>
  <div style="margin:12px 16px 0;border:1px solid #d6dde9;border-radius:12px;padding:10px 10px 8px"><div style="display:flex;align-items:center;justify-content:space-between;padding:2px 6px 8px">${ic("chevron_left", { color: "#6b7280" })}<b style="font-size:15px;color:#14213d">Ноември 2026</b>${ic("chevron_right", { color: "#1f3a5f" })}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center;font-size:11.5px;color:#6b7280;margin-bottom:2px">${["пн", "вт", "ср", "чт", "пт", "сб", "нд"].map((d) => `<div>${d}</div>`).join("")}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${[["2", "x"], ["3", "free"], ["4", "free"], ["5", "x"], ["6", "x"], ["7", "x"], ["8", "x"], ["9", "free"], ["10", "free"], ["11", "free"], ["12", "sel"], ["13", "x"], ["14", "x"], ["15", "x"]].map(([d, s]) => dayCell(d, s)).join("")}</div></div>
  <div style="margin:12px 16px 0;font-size:13.5px;color:#4b5b78">Свободни часове на 12 ноември</div>
  <div style="display:flex;gap:8px;margin:8px 16px 0">${["09:30", "10:30", "11:00", "14:15"].map((t, i) => `<div class="${i === 1 ? "ring" : ""}" style="flex:1;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;${i === 1 ? "background:#1f3a5f;color:#fff;font-weight:700" : "border:1px solid #b9c5d8;color:#14213d"}">${t}</div>`).join("")}</div>
  ${tip("Изберете свободен ден и час,<br>после въведете данните си", "left:50%;top:498px;transform:translateX(-50%)", { arrow: "u", at: "36%" })}
  ${sample()}
`), "#fff");

// 5. Електронен подпис — избор на доставчик и вид
S["elektronen-podpis"] = ph(site("podpis.example.bg", `
  ${siteHead("#2d3a8c", "Електронен подпис (КЕП)")}
  <div style="padding:16px 16px 0"><div style="font-size:22px;font-weight:700;color:#1b2160;line-height:1.2">Подписвайте документи от вкъщи</div><div style="font-size:13.5px;color:#4b5280;margin-top:6px">Заявявате с лична карта — подписът е готов за вход и подписване в е-услуги.</div></div>
  <div style="margin:14px 16px 0;display:flex;flex-direction:column;gap:10px">
    <div style="border:1.5px solid #c8cdea;border-radius:14px;padding:12px 14px;display:flex;gap:12px;align-items:center"><div style="width:44px;height:44px;border-radius:12px;background:#e9ebfa;display:flex;align-items:center;justify-content:center">${ic("usb", { color: "#2d3a8c", fill: 1 })}</div><div style="flex:1"><div style="font-size:15.5px;font-weight:700;color:#1b2160">На устройство (флашка)</div><div style="font-size:12.5px;color:#4b5280">Слагате я в компютъра</div></div>${ic("radio_button_unchecked", { color: "#8b91c4" })}</div>
    <div class="ring" style="border:1.5px solid #2d3a8c;border-radius:14px;padding:12px 14px;display:flex;gap:12px;align-items:center;background:#f3f4fd"><div style="width:44px;height:44px;border-radius:12px;background:#e0e3f9;display:flex;align-items:center;justify-content:center">${ic("smartphone", { color: "#2d3a8c", fill: 1 })}</div><div style="flex:1"><div style="font-size:15.5px;font-weight:700;color:#1b2160">В мобилно приложение</div><div style="font-size:12.5px;color:#4b5280">Подписвате от телефона</div></div>${ic("radio_button_checked", { color: "#2d3a8c" })}</div>
  </div>
  <div style="margin:14px 16px 0"><div style="font-size:13px;color:#4b5280;margin-bottom:6px">Доставчици</div>${["ПодписБГ — пример", "Е-Сертификат — пример"].map((t) => `<div style="height:40px;border-bottom:1px solid #e3e5f3;display:flex;align-items:center;justify-content:space-between;font-size:14.5px;color:#1b2160">${t}${ic("chevron_right", { color: "#8b91c4" })}</div>`).join("")}</div>
  <div style="margin:14px 16px 0">${btn("Заявете подпис", { bg: "#2d3a8c" })}</div>
  ${tip("Изберете доставчик и вид подпис —<br>на устройство или в приложение", "left:50%;top:522px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
  ${sample()}
`), "#fff");

// 8. Електронна автентикация — начини за вход
S["eavtentikaciya"] = ph(site("uslugi.example.bg/vhod", `
  ${siteHead("#1f3a5f", "Вход в електронна услуга")}
  <div style="padding:16px 16px 0"><div style="font-size:21px;font-weight:700;color:#14213d">Докажете, че сте Вие</div><div style="font-size:13.5px;color:#4b5b78;margin-top:4px">Изберете начин за вход</div></div>
  <div style="margin:14px 16px 0;display:flex;flex-direction:column;gap:10px">
    ${[["draw", "Електронен подпис (КЕП)", "Платен, на флашка или в приложение", 0], ["pin", "ПИК на НАП / НОИ", "Безплатен — достатъчен за НАП и НОИ", 1], ["contactless", "Електронна лична карта", "С четец или телефон с NFC", 0]].map(([n, t, s, hl]) => `<div class="${hl ? "ring" : ""}" style="border:1.5px solid ${hl ? "#1f3a5f" : "#cbd5e4"};background:${hl ? "#eef3fa" : "#fff"};border-radius:14px;padding:13px 14px;display:flex;gap:12px;align-items:center"><div style="width:42px;height:42px;border-radius:12px;background:#e3eaf5;display:flex;align-items:center;justify-content:center">${ic(n, { color: "#1f3a5f", fill: 1 })}</div><div style="flex:1"><div style="font-size:15.5px;font-weight:700;color:#14213d">${t}</div><div style="font-size:12.5px;color:#4b5b78">${s}</div></div>${ic("chevron_right", { color: "#6b7c99" })}</div>`).join("")}
  </div>
  <div style="margin:14px 16px 0;padding:12px 14px;border-radius:12px;background:#fff4e5;color:#7a4a00;font-size:13.5px;line-height:1.4;display:flex;gap:10px">${ic("warning", { fill: 1, color: "#b26a00" })}<div>Пазете кодовете си като пароли. Никога не ги давайте на друг по телефон.</div></div>
  ${tip("Тя гарантира, че услугата<br>знае, че сте Вие.<br>За НАП и НОИ стига безплатният ПИК", "left:50%;top:440px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
  ${sample()}
`), "#fff");

// 14. Електронен подпис — подписване в приложение
S["elektronen-podpis2"] = ph(wrap(`
  <div style="height:64px;display:flex;align-items:center;padding:0 8px 0 12px;gap:10px;flex-shrink:0;background:#2d3a8c;color:#fff">${ic("arrow_back", { color: "#fff" })}<div style="flex:1;font-size:19px;font-weight:500">Подписване</div>${ic("more_vert", { color: "#fff" })}</div>
  <div style="flex:1;min-height:0;background:#e9ebf3;padding:16px;position:relative">
    ${paper(`<div style="font-size:11px;color:#6b7280;margin-bottom:10px">Заявление_за_удостоверение.pdf</div><div style="font-size:17px;font-weight:700;margin-bottom:10px">ЗАЯВЛЕНИЕ</div>${[100, 92, 96, 70, 98, 88, 60].map((w) => `<div style="height:7px;border-radius:4px;background:#d9dde4;width:${w}%;margin-bottom:9px"></div>`).join("")}<div style="margin-top:16px;display:flex;align-items:flex-end;gap:10px"><div style="font-size:12px;color:#6b7280">Подпис:</div><div style="border-bottom:1.5px solid #8b91a8;width:150px;height:44px;display:flex;align-items:flex-end">${SIG(130)}</div></div><div style="margin-top:10px;display:inline-flex;gap:6px;align-items:center;font-size:12px;color:#146c2e;background:#e4f4e8;border-radius:10px;padding:3px 10px">${ic("verified", { size: 16, fill: 1, color: "#146c2e" })}Подписан с електронен подпис</div>`, { w: 330, pad: 22, css: "margin:0 auto;height:392px" })}
    <div style="margin-top:16px;display:flex;flex-direction:column;gap:10px">${btn("Подпиши с КЕП", { icon: "draw", bg: "#2d3a8c", ring: 1 })}</div>
  </div>
  ${tip("С подписа влизате и подписвате<br>документи в е-услуги", "left:50%;top:556px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`, { css: "background:#e9ebf3" }), "#2d3a8c", "#ffffff");

// 13. Електронна рецепта — SMS
S["elektronna-recepta2"] = ph(wrap(`
  <div style="height:64px;display:flex;align-items:center;padding:0 8px 0 4px;gap:4px;flex-shrink:0;background:#fff;border-bottom:1px solid ${G.line}">${ic("arrow_back", { color: G.on })}${letter("Л", "#188038", 36, 17)}<div style="margin-left:8px;flex:1"><div style="font-size:17px;color:${G.on}">Личен лекар</div><div style="font-size:12px;color:${G.gray}">SMS · 0888 123 456</div></div>${ic("call", { color: G.sub })}${ic("more_vert", { color: G.sub })}</div>
  <div style="flex:1;min-height:0;background:#fff;padding:18px 14px;display:flex;flex-direction:column;gap:6px">
    <div style="text-align:center;font-size:12px;color:${G.gray};margin-bottom:6px">Днес</div>
    <div style="max-width:300px;background:#f0f4f9;border-radius:20px 20px 20px 6px;padding:11px 14px;font-size:15.5px;color:${G.on};line-height:1.4">Издадена е електронна рецепта № 26-0123456 за Мария Примерова. Може да я получите в аптека, като кажете ЕГН.</div>
    <div style="font-size:11.5px;color:${G.gray};margin-left:6px">10:12</div>
    <div style="margin-top:8px;max-width:300px;background:#f0f4f9;border-radius:20px 20px 20px 6px;padding:11px 14px;font-size:15.5px;color:${G.on};line-height:1.4">Валидна до 29.11.2026.</div>
    <div style="font-size:11.5px;color:${G.gray};margin-left:6px">10:12</div>
  </div>
  ${tip("Може да получите SMS или номер.<br>Не винаги е нужен —<br>в аптеката кажете ЕГН", "left:50%;top:430px;transform:translateX(-50%)", { arrow: "u", at: "35%" })}
  <div style="height:64px;flex-shrink:0;padding:8px 12px;display:flex;align-items:center;gap:8px;background:#fff">${ic("add_circle", { color: G.sub })}<div style="flex:1;height:46px;border-radius:23px;background:${G.sc};display:flex;align-items:center;padding:0 16px;font-size:15px;color:${G.gray}">SMS съобщение</div>${ic("mic", { color: G.sub })}</div>
`), "#fff");

// 16. Адресна регистрация
S["adresna-registraciya"] = ph(site("obshtina.example/uslugi", `
  ${siteHead("#1f4e5f", "Общинска администрация", ic("menu", { color: "#fff" }))}
  <div style="padding:14px 16px 0"><div style="font-size:12.5px;color:#4b5f66">Услуги › Гражданско състояние</div><div style="font-size:22px;font-weight:700;color:#14303a;margin-top:4px">Адресна регистрация</div><div style="font-size:13.5px;color:#4b5f66;margin-top:4px">Заявление за промяна на постоянен или настоящ адрес (ГРАО)</div></div>
  <div style="margin:12px 16px 0;display:flex;gap:8px">${[["Постоянен адрес", "трайният Ви адрес"], ["Настоящ адрес", "където живеете сега"]].map(([a, b]) => `<div style="flex:1;border:1px solid #cfdde2;border-radius:12px;padding:10px 12px"><div style="font-size:14.5px;font-weight:700;color:#14303a">${a}</div><div style="font-size:12px;color:#6b7c82;margin-top:2px">${b}</div></div>`).join("")}</div>
  <div class="ring" style="margin:12px 16px 0;border-radius:14px;background:#eef4f6;padding:12px 14px"><div style="font-size:14.5px;font-weight:700;color:#14303a;margin-bottom:8px">Какво да носите</div>${["Лична карта", "Документ за жилището — нотариален акт, договор или съгласие на собственика"].map((t) => `<div style="display:flex;gap:10px;align-items:flex-start;font-size:14px;color:#14303a;margin-bottom:6px;line-height:1.35">${ic("check_circle", { size: 20, fill: 1, color: "#1f7a4d" })}<span>${t}</span></div>`).join("")}</div>
  <div style="margin:12px 16px 0;display:flex;gap:10px;align-items:center;font-size:13.5px;color:#4b5f66">${ic("info", { size: 20, color: "#1f4e5f", fill: 1 })}Адресът е важен за лична карта, гласуване и помощи.</div>
  <div style="margin:12px 16px 0">${btn("Подайте заявление в общината", { bg: "#1f4e5f", icon: "description" })}</div>
  ${tip("Питайте в общината<br>какво точно е нужно", "left:50%;top:490px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
  ${sample()}
`), "#fff");

// 18. Жалба към търговец — писмо
S["prava-potrebitel"] = ph(wrap(`
  <div style="height:64px;display:flex;align-items:center;padding:0 6px 0 8px;flex-shrink:0;background:#fff">${ic("arrow_back", { color: G.sub })}<div style="flex:1"></div>${ic("attach_file", { color: G.sub })}<div class="ring ringr" style="margin:0 8px;display:flex;padding:7px">${ic("send", { color: G.pri, fill: 1 })}</div>${ic("more_vert", { color: G.sub })}</div>
  <div style="flex:1;min-height:0;background:#fff">
    ${[["От", "m.primerova@example.com"], ["До", "reklamacii@magazin.example"], ["Тема", "Рекламация — повредена пералня, покупка от 12.10.2026"]].map(([a, b]) => `<div style="display:flex;padding:13px 16px;border-bottom:1px solid ${G.line};font-size:15px"><span style="width:48px;color:${G.gray}">${a}</span><span style="color:${G.on};flex:1">${b}</span></div>`).join("")}
    <div style="padding:14px 16px;font-size:15px;color:${G.on};line-height:1.5">Здравейте,<br>на 12.10.2026 купих пералня от Вашия магазин. След две седмици тя спря да изцентрофугира.<br><br>Моля, ремонтирайте или заменете уреда. Очаквам отговор до 14 дни.<br><br>С уважение,<br>Мария Примерова</div>
    <div style="margin:4px 16px;display:flex;gap:8px;flex-wrap:wrap">${["kasova-belezhka.jpg", "garancia.pdf"].map((t) => `<div style="height:36px;border:1px solid ${G.line};border-radius:10px;display:flex;align-items:center;gap:6px;padding:0 10px;font-size:13px;color:${G.on}">${ic(t.endsWith("pdf") ? "picture_as_pdf" : "image", { size: 18, color: "#b3261e" })}${t}</div>`).join("")}</div>
  </div>
  ${tip("Опишете проблема писмено<br>и поискайте решение.<br>Пазете бележките и копие на писмото", "left:50%;top:520px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

// ═══════════════ Транспорт и пътуване ═══════════════

// 21. Свидетел на злополука — 112
const dkey = (n, l) => `<div style="height:72px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:30px;color:${G.on};line-height:1">${n}</div><div style="font-size:10.5px;color:${G.gray};letter-spacing:1.5px;margin-top:3px;height:12px">${l || ""}</div></div>`;
S["svidetel-zlopoluka"] = ph(wrap(`
  <div style="flex:1;min-height:0;display:flex;flex-direction:column;background:#fff">
    <div style="height:74px;display:flex;align-items:center;justify-content:center;font-size:44px;color:${G.on};letter-spacing:1px;margin-top:36px">112</div>
    <div style="flex:1"></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);padding:0 30px;margin-bottom:6px">${[["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]].map(([n, l]) => dkey(n, l)).join("")}</div>
    <div style="display:flex;justify-content:center;align-items:center;height:96px;position:relative"><div class="ring ringr" style="width:68px;height:68px;border-radius:50%;background:#1e8e3e;display:flex;align-items:center;justify-content:center">${ic("call", { size: 32, fill: 1, color: "#fff" })}</div><div style="position:absolute;right:46px;top:30px">${ic("backspace", { color: G.sub })}</div></div>
  </div>
  ${tip("Звъннете на 112 и кажете<br>точното място. Опишете какво се е<br>случило и има ли пострадали", "left:50%;top:136px;transform:translateX(-50%)", { arrow: "d", at: "50%" })}
`), "#fff");

// 30. Такси по телефона — контакт
S["povikam-taksi"] = ph(wrap(`
  <div style="height:64px;display:flex;align-items:center;padding:0 8px;flex-shrink:0;background:${G.sc}">${ic("arrow_back", { color: G.on })}<div style="flex:1"></div>${ic("star", { color: G.sub })}${ic("more_vert", { color: G.sub })}</div>
  <div style="background:${G.sc};padding:6px 0 22px;display:flex;flex-direction:column;align-items:center">${letter("Т", "#e8710a", 96, 46)}<div style="font-size:26px;color:${G.on};margin-top:12px">Такси Бобов дол</div><div style="font-size:14px;color:${G.gray};margin-top:2px">Примерен контакт</div>
    <div style="display:flex;gap:30px;margin-top:20px"><div style="text-align:center"><div class="ring ringr" style="width:62px;height:62px;border-radius:50%;background:#c2e7ff;display:flex;align-items:center;justify-content:center">${ic("call", { size: 28, fill: 1, color: "#001d35" })}</div><div style="font-size:13px;margin-top:6px;color:${G.on}">Обаждане</div></div><div style="text-align:center"><div style="width:62px;height:62px;border-radius:50%;background:#e1e8f1;display:flex;align-items:center;justify-content:center">${ic("chat", { size: 26, color: G.sub })}</div><div style="font-size:13px;margin-top:6px;color:${G.on}">Съобщение</div></div></div></div>
  <div style="background:#fff;flex:1;min-height:0;padding:18px 18px 0"><div style="font-size:14px;color:${G.gray};margin-bottom:10px">Информация за контакта</div><div style="display:flex;align-items:center;gap:20px;height:58px">${ic("call", { color: G.gray })}<div><div style="font-size:17px;color:${G.on}">0888 123 456</div><div style="font-size:13px;color:${G.gray}">Мобилен</div></div></div></div>
  ${tip("Кажете адреса, на който сте,<br>и закъде отивате.<br>Питайте за колко време ще дойде", "left:50%;top:400px;transform:translateX(-50%)")}
`), "#fff");

// 31. Какво да проверя преди пътуване — билет на телефона, зареден до 100%
(async () => {
  const qr = await QRCode.toDataURL("EXAMPLE-TICKET-NOT-VALID-0001", { margin: 1, width: 360, errorCorrectionLevel: "M" });
  S["bagaj-patuvane"] = ph(wrap(`
    <div style="height:64px;display:flex;align-items:center;padding:0 12px 0 8px;gap:8px;flex-shrink:0;background:#fff">${ic("arrow_back", { color: G.on })}<div style="flex:1;font-size:19px;color:${G.on}">Моите билети</div>${ic("more_vert", { color: G.sub })}</div>
    <div style="flex:1;min-height:0;background:${G.sc};padding:14px 16px">
      <div style="background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.16)">
        <div style="background:#1f4e8c;color:#fff;padding:14px 18px"><div style="font-size:13px;opacity:.85">Автобусен билет · пример</div><div style="font-size:22px;font-weight:500;margin-top:4px">Дупница → София</div></div>
        <div style="display:flex;padding:14px 18px;gap:20px"><div><div style="font-size:12px;color:${G.gray}">Тръгване</div><div style="font-size:20px;color:${G.on};font-weight:500">08:10</div></div><div><div style="font-size:12px;color:${G.gray}">Дата</div><div style="font-size:20px;color:${G.on};font-weight:500">05.11.2026</div></div><div><div style="font-size:12px;color:${G.gray}">Място</div><div style="font-size:20px;color:${G.on};font-weight:500">14</div></div></div>
        <div style="padding:2px 0 16px;display:flex;justify-content:center"><img alt="" src="${qr}" style="width:176px;height:176px;border-radius:8px"></div>
      </div>
      <div style="margin-top:12px;background:#fff;border-radius:16px;padding:12px 16px;display:flex;align-items:center;gap:12px;font-size:14.5px;color:${G.on}">${ic("download_done", { color: "#146c2e", fill: 1 })}Билетът е свален и работи без интернет</div>
    </div>
    ${tip("Свалете билета на телефона<br>и заредете телефона напълно.<br>Вземете зарядно или powerbank", "left:50%;top:560px;transform:translateX(-50%)", { arrow: "d", at: "50%" })}
  `), "#fff", "#1f1f1f", { battery: 100 });
  main();
})();

// 27. Планиране на пътуване до лекар — разписание на автобуса (src/lib/bus-schedule.ts)
S["planiram-patuvane-lekar"] = ph(site("zabobovdol.carbonstealth.eu", `
  ${siteHead("#0f5132", "Транспорт — автобус", ic("menu", { color: "#fff" }))}
  <div style="padding:14px 16px 0"><div style="font-size:21px;font-weight:700;color:#0f2e22">Бобов дол → Дупница</div><div style="font-size:13px;color:#4b6a5c;margin-top:3px">Превозвач „Даци-Р“</div></div>
  <div style="margin:12px 16px 0;display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${["06:15", "06:45", "07:30", "08:20", "09:00", "09:50", "11:00", "12:30", "13:20", "14:00", "15:00", "16:00", "16:40", "17:30", "18:00", "19:00"].map((t) => `<div style="height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15.5px;${["07:30", "08:20"].includes(t) ? "" : ""}${t === "08:20" ? "background:#0f5132;color:#fff;font-weight:700" : "border:1px solid #c5d9cf;color:#0f2e22"}">${t}</div>`).join("")}</div>
  <div style="margin:10px 16px 0;font-size:12.5px;color:#4b6a5c;line-height:1.45">07:30, 09:50, 13:20, 14:00 и 18:00 минават през кв. „Христо Ботев“. Курсът в 11:00 минава през с. Дяково.</div>
  <div style="margin:14px 16px 0;border-radius:14px;background:#eef6f1;padding:12px 14px;display:flex;gap:12px;align-items:center"><div style="width:42px;height:42px;border-radius:50%;background:#dcebe2;display:flex;align-items:center;justify-content:center">${ic("event", { color: "#0f5132", fill: 1 })}</div><div style="flex:1"><div style="font-size:14.5px;font-weight:700;color:#0f2e22">Преглед при лекар — 5 ноември</div><div style="font-size:13px;color:#4b6a5c">Час за преглед в Дупница: 10:00</div></div></div>
  ${tip("Тръгнете с резерв от време —<br>изберете по-ранния автобус", "left:50%;top:488px;transform:translateX(-50%)", { arrow: "u", at: "62%" })}
  ${sample()}
`), "#fff");

// 28. Споделено пътуване — обяви
S["spodeleno-patuvane"] = ph(site("zabobovdol.carbonstealth.eu", `
  ${siteHead("#0f5132", "Споделено пътуване", ic("menu", { color: "#fff" }))}
  <div style="padding:14px 16px 0;display:flex;align-items:center;gap:10px"><div style="flex:1"><div style="font-size:21px;font-weight:700;color:#0f2e22">Обяви за пътуване</div><div style="font-size:13px;color:#4b6a5c">Делите разходите — по-евтино и по-приятно</div></div></div>
  <div style="padding:12px 16px 0;display:flex;flex-direction:column;gap:10px">${[["Бобов дол → Дупница", "сряда, 4 ноември · 08:00", "3 места · 2 € на човек", "Георги"], ["Бобов дол → Кюстендил", "четвъртък, 5 ноември · 09:30", "2 места · 3 € на човек", "Петър"], ["Дупница → Бобов дол", "петък, 6 ноември · 17:15", "1 място · 2 € на човек", "Анна"]].map(([a, b, c, n], i) => `<div class="${i === 0 ? "ring" : ""}" style="border:1px solid #c5d9cf;border-radius:14px;padding:11px 14px;background:#fff"><div style="display:flex;align-items:center;gap:8px;font-size:15.5px;font-weight:700;color:#0f2e22">${ic("directions_car", { size: 20, color: "#0f5132", fill: 1 })}${a}</div><div style="font-size:13.5px;color:#34473d;margin-top:4px">${b}</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px"><span style="font-size:13px;color:#4b6a5c">${c}</span><span style="display:flex;gap:6px;align-items:center;font-size:13px;color:#0f5132;font-weight:500">${ic("call", { size: 17, fill: 1, color: "#0f5132" })}Обадете се на ${n}</span></div></div>`).join("")}</div>
  <div style="margin:12px 16px 0">${btn("Пуснете своя обява", { bg: "#0f5132", icon: "add" })}</div>
  ${tip("Вижте обявите или пуснете своя.<br>Уговорете маршрут, час и дял от разходите — с обаждане", "left:50%;top:462px;transform:translateX(-50%)", { arrow: "u", at: "30%" })}
  ${sample()}
`), "#fff");

// 15. Пълномощно — какво трябва да пише
const rg = (t) => `<span class="ring" style="display:inline-block;padding:1px 6px;margin:1px 7px;border-radius:5px">${t}</span>`;
S["pulnomoshtno"] = deskScene(`
  ${paper(`${watermark()}<div style="text-align:center;font-size:24px;font-weight:700;letter-spacing:3px;margin-bottom:18px">ПЪЛНОМОЩНО</div>
    <div style="font-size:15px;line-height:2.05">Долуподписаният ${rg("Иван Петров Георгиев")}, ЕГН 0000000000 (пример), с лична карта, издадена от МВР,<br>
    <b style="letter-spacing:1px">УПЪЛНОМОЩАВАМ</b><br>
    ${rg("Мария Иванова Петрова")}, ЕГН 0000000000 (пример),<br>
    ${rg("да получава от мое име пенсията ми")} от Националния осигурителен институт.<br>
    Пълномощното е валидно ${rg("до 31.12.2026 г.")}</div>
    <div style="margin-top:22px;display:flex;justify-content:space-between;align-items:flex-end;font-size:14px;color:#4b5563"><span>Дата: 30.10.2026 г.</span><span style="display:flex;align-items:flex-end;gap:8px">Подпис: ${SIG(110)}</span></div>`,
    { w: 470, h: 470, pad: 34, css: "position:absolute;left:36px;top:36px;transform:rotate(-1.2deg)" })}
  ${tip("Кой дава право", "left:536px;top:112px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("На кого — трите имена и ЕГН", "left:536px;top:196px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("За какво точно —<br>не „за всичко“", "left:536px;top:262px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("За какъв срок", "left:536px;top:340px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("За по-важни случаи —<br>заверка при нотариус", "left:50px;top:522px;width:max-content", { arrow: "u", at: "30%" })}
  ${abs("left:12px;bottom:8px;font-size:11px;color:rgba(255,255,255,.88)", "Илюстрация: примерен документ с измислени данни")}
`, 760, 600);

// 9. Смяна на лична карта — талон за час и старата карта
S["lichna-karta-smiana"] = deskScene(`
  ${genericCard("left:24px;top:40px;transform:rotate(-5deg)")}
  ${paper(`<div style="font-size:11.5px;letter-spacing:1px;color:#6b7280;margin-bottom:4px">ТАЛОН ЗА ЗАПАЗЕН ЧАС</div><div style="font-size:19px;font-weight:700;margin-bottom:12px">Български документи за самоличност</div>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:14.5px"><span style="color:#6b7280">Услуга</span><span>Лична карта — подмяна</span><span style="color:#6b7280">Дата</span><span class="ring" style="border-radius:5px;padding:0 6px;justify-self:start;font-weight:700">12.11.2026, 10:30</span><span style="color:#6b7280">Място</span><span>Дупница (пример)</span><span style="color:#6b7280">Такса</span><span>платена онлайн</span></div>
    <div style="margin-top:14px;border-top:1px dashed #b6bcc6;padding-top:8px;font-size:12.5px;color:#4b5563">Носете старата си лична карта.</div>`,
    { w: 330, h: 270, pad: 22, css: "position:absolute;left:470px;top:150px;transform:rotate(2.5deg)" })}
  ${tip("Със старата карта —<br>в уговорения час", "left:60px;top:330px;width:max-content", { arrow: "u", at: "30%" })}
  ${tip("Платете таксата — на място или онлайн.<br>Снимка и пръстов отпечатък правят на гишето", "left:300px;top:460px;width:max-content", { arrow: "u", at: "62%" })}
  ${tip("Запазете час за подмяната", "left:470px;top:92px;width:max-content", { arrow: "d", at: "50%" })}
  ${abs("left:12px;bottom:8px;font-size:11px;color:rgba(255,255,255,.88)", "Илюстрация: примерни документи с измислени данни")}
`, 860, 560);

// 10. Изгубена лична карта — бележка от полицията
const stamp = `<div style="position:absolute;right:34px;bottom:40px;width:118px;height:118px;border-radius:50%;border:3px solid rgba(34,64,160,.55);color:rgba(34,64,160,.6);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;font-weight:700;letter-spacing:1px;transform:rotate(-14deg);text-align:center;line-height:1.5;box-shadow:inset 0 0 0 5px rgba(255,255,255,0),inset 0 0 0 7px rgba(34,64,160,.3)">ПРИМЕРНА<br>ПЕЧАТ<br>30.10.2026</div>`;
S["izgubena-lichna-karta"] = deskScene(`
  ${paper(`${watermark()}<div style="font-size:12px;letter-spacing:1px;color:#6b7280">РАЙОНЕН УЧАСТЪК — ПРИМЕР</div><div style="font-size:22px;font-weight:700;margin:6px 0 14px">Служебна бележка</div>
    <div class="ring" style="border-radius:6px;display:inline-block;padding:2px 8px;font-size:14.5px;font-weight:500">Вх. № 1234 / 30.10.2026</div>
    <div style="font-size:15px;line-height:1.85;margin-top:14px">Мария Иванова Примерова обяви в РУ на МВР, че е изгубила личната си карта.<br>Бележката се издава, за да докаже, че загубата е обявена, и за издаване на нова лична карта.</div>
    <div style="margin-top:24px;font-size:14px;color:#4b5563">Длъжностно лице: _______________</div>${stamp}`,
    { w: 450, h: 430, pad: 34, css: "position:absolute;left:40px;top:34px;transform:rotate(-1.5deg)" })}
  ${tip("Вземете бележка, че сте обявили<br>загубата — пазете я", "left:520px;top:104px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("След това запазете час<br>за нова лична карта", "left:520px;top:274px;width:max-content", { arrow: "l", at: "50%" })}
  ${abs("left:12px;bottom:8px;font-size:11px;color:rgba(255,255,255,.88)", "Илюстрация: примерен документ с измислени данни")}
`, 760, 540);

// 11. Паспорт — какво да се носи (списък)
S["pasport-smiana"] = deskScene(`
  ${paper(`<div style="font-size:21px;font-weight:700;margin-bottom:4px">Паспорт — какво да нося</div><div style="font-size:13px;color:#6b7280;margin-bottom:12px">Бележка за звеното на МВР</div>
    ${[["Записан час (онлайн или на гише)", 1], ["Лична карта", 1], ["Стар паспорт, ако имам", 1], ["Платена такса", 1]].map(([t]) => `<div style="display:flex;align-items:center;gap:14px;height:52px;border-bottom:1.5px solid #bfd4ef;font-size:17px">${ic("check_box", { size: 26, fill: 1, color: "#1d3a8a" })}<span>${t}</span></div>`).join("")}
    <div style="margin-top:14px;font-size:13.5px;color:#4b5563;line-height:1.5">Снимка и пръстов отпечатък — на място.<br>Паспорт: стандартна или бърза услуга.</div>`,
    { w: 400, h: 410, pad: 28, css: "position:absolute;left:40px;top:40px;transform:rotate(-1.5deg);background:repeating-linear-gradient(180deg,#fffef6 0 31px,#fffef6 31px 32px)" })}
  ${tip("Запазете час в МВР", "left:470px;top:90px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("Лична карта и стар паспорт", "left:470px;top:170px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("Платете таксата", "left:470px;top:274px;width:max-content", { arrow: "l", at: "50%" })}
  ${abs("left:12px;bottom:8px;font-size:11px;color:rgba(255,255,255,.88)", "Илюстрация: примерна бележка")}
`, 720, 520);

// ───────────────────────── Сцени със снимки (CC0/PD, виж credits/dokumenti.md) ─────────────────────────
const SHADOW = "box-shadow:0 18px 40px rgba(15,23,42,.28),0 3px 8px rgba(15,23,42,.18)";
const credit = (t) => `<div style="position:absolute;left:0;right:0;bottom:0;text-align:left;font-size:12px;color:#64748b">${t}</div>`;
const ringAt = (l, t, w, h, r = 14) => `<div class="ring" style="position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${h}px;border-radius:${r}px"></div>`;
const pscene = (file, w, h, extra, cr, o = {}) => scene(`<div style="position:relative;width:${o.cw || w}px;padding-bottom:${o.pb ?? 34}px">${photo(path.join(DOC, file), { w, h, radius: 16, style: SHADOW })}${extra}${credit(cr)}</div>`, { pad: 30 });

// 22. Проходилка — височина на дръжката и накрайници
S["bastun-rolator"] = pscene("walker.jpg", 420, 560, `
  ${ringAt(226, 138, 142, 62, 16)}
  ${ringAt(176, 316, 40, 40, 20)}${ringAt(293, 408, 40, 40, 20)}
  ${tip("Дръжката — на нивото на китката<br>при изправена ръка", "left:452px;top:122px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("Проверявайте гумичките<br>и накрайниците —<br>да не са изтрити", "left:452px;top:360px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("Носете стабилни обувки", "left:452px;top:480px;width:max-content")}
`, "Снимка: High Plains Drifter, Wikimedia Commons (обществено достояние)", { cw: 720 });

// 7. Информирано гласуване — урни и кабини
S["glasuvane-informirano"] = pscene("polling.jpg", 700, 394, `
  ${ringAt(498, 100, 112, 128, 12)}
  ${ringAt(248, 246, 410, 120, 12)}
  ${tip("Решете сами — не приемайте<br>пари или натиск за Вашия глас", "left:392px;top:28px;width:max-content", { arrow: "d", at: "80%" })}
  ${tip("Купуването и продаването<br>на глас е престъпление", "left:40px;top:150px;width:max-content", { arrow: "d", at: "60%" })}
  ${tip("Носете лична карта. При натиск или нередност — сигнализирайте", "left:50%;top:404px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })}
`, "Снимка: Jabbi, Wikimedia Commons (CC0)", { pb: 92 });

// 19. Пресичане на улицата — пешеходна пътека
S["presicham-ulica"] = pscene("crossing.jpg", 700, 202, `
  ${ringAt(-4, 14, 650, 96, 10)}${ringAt(18, 150, 124, 50, 10)}
  ${tip("Пресичайте само на пешеходна пътека<br>или на зелено", "left:50%;top:222px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "46%" })}
  ${tip("Спрете на бордюра: наляво, после надясно.<br>Колите да Ви виждат и да спират", "left:10px;top:284px;width:max-content", { arrow: "u", at: "14%" })}
  ${tip("Пресичайте перпендикулярно,<br>без да тичате и без телефона", "left:408px;top:284px;width:max-content")}
`, "Снимка: Andykatib, Wikimedia Commons (CC0)", { pb: 190 });

// 20. Светофар за пешеходци
S["svetofar-znaci"] = scene(`<div style="position:relative;width:680px;padding-bottom:96px">
  <div style="position:relative;display:flex;gap:20px">
    <div style="position:relative">${photo(path.join(DOC, "light-green.jpg"), { w: 330, h: 380, radius: 16, style: SHADOW })}${ringAt(192, 252, 70, 92, 14)}${tip("Зелен човек — може да пресичате,<br>но първо погледнете", "left:50%;top:14px;transform:translateX(-50%);width:max-content", { arrow: "d", at: "62%" }).replace("top:14px", "top:150px")}</div>
    <div style="position:relative">${photo(path.join(DOC, "light-red.jpg"), { w: 330, h: 380, radius: 16, style: SHADOW })}${ringAt(150, 134, 56, 62, 14)}${tip("Червен човек — чакайте<br>на тротоара", "left:50%;top:260px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })}</div>
  </div>
  ${tip("Внимавайте за завиващи коли<br>дори на зелено", "left:50%;top:402px;transform:translateX(-50%);width:max-content")}
  ${credit("Снимки: Peulle, Wikimedia Commons (CC0)")}
</div>`, { pad: 30 });

// ═══════════ Без подходяща CC0 снимка — реалистични екрани и сцени ═══════════

// 23. Вечер и лошо време — съобщение до близък
const bub = (t, me, time) => `<div style="align-self:${me ? "flex-end" : "flex-start"};max-width:290px;background:${me ? "#d3e3fd" : "#f0f4f9"};border-radius:${me ? "20px 20px 6px 20px" : "20px 20px 20px 6px"};padding:11px 14px;font-size:15.5px;color:${G.on};line-height:1.4">${t}</div><div style="align-self:${me ? "flex-end" : "flex-start"};font-size:11.5px;color:${G.gray};margin:0 6px">${time}</div>`;
S["hodia-noshtem"] = ph(wrap(`
  <div style="height:64px;display:flex;align-items:center;padding:0 8px 0 4px;gap:4px;flex-shrink:0;background:#fff;border-bottom:1px solid ${G.line}">${ic("arrow_back", { color: G.on })}${letter("М", "#a142f4", 36, 17)}<div style="margin-left:8px;flex:1"><div style="font-size:17px;color:${G.on}">Мария (дъщеря)</div><div style="font-size:12px;color:${G.gray}">0888 123 456</div></div>${ic("call", { color: G.sub })}${ic("more_vert", { color: G.sub })}</div>
  <div style="flex:1;min-height:0;background:#fff;padding:18px 14px;display:flex;flex-direction:column;gap:5px">
    <div style="text-align:center;font-size:12px;color:${G.gray};margin-bottom:6px">Днес</div>
    ${bub("Излизам до аптеката. Връщам се към 19:00. Нося фенерче, телефонът е зареден.", 1, "17:48")}
    ${bub("Добре, внимавай — навън е хлъзгаво. Звънни ми, като се прибереш.", 0, "17:49")}
  </div>
  ${tip("Кажете на близък къде отивате и носете<br>зареден телефон. Вечер — светли дрехи<br>и фенерче (или фенерчето на телефона)", "left:50%;top:372px;transform:translateX(-50%)", { arrow: "d", at: "50%" })}
  <div style="height:64px;flex-shrink:0;padding:8px 12px;display:flex;align-items:center;gap:8px;background:#fff">${ic("add_circle", { color: G.sub })}<div style="flex:1;height:46px;border-radius:23px;background:${G.sc};display:flex;align-items:center;padding:0 16px;font-size:15px;color:${G.gray}">Съобщение</div>${ic("mic", { color: G.sub })}</div>
`), "#fff", "#1f1f1f", { battery: 100 });

// 25. Колата се повреди — обаждане за пътна помощ
const fav = (n, c, sub, hl) => `<div class="${hl ? "ring" : ""}" style="display:flex;align-items:center;height:68px;padding:0 16px;gap:16px;${hl ? "border-radius:14px;margin:0 8px;padding:0 8px;background:#e8f0fe" : ""}">${letter(n[0], c, 44, 20)}<div style="flex:1"><div style="font-size:17px;color:${G.on}">${n}</div><div style="font-size:13px;color:${G.gray}">${sub}</div></div>${ic("call", { color: G.pri, fill: hl ? 1 : 0 })}</div>`;
S["pomosht-pat"] = ph(wrap(`
  <div style="margin:8px 16px;height:52px;border-radius:26px;background:${G.pill};display:flex;align-items:center;padding:0 16px;gap:14px;flex-shrink:0">${ic("search", { color: G.sub })}<span style="flex:1;font-size:16px;color:${G.sub}">Търсене на контакти</span>${letter("С", "#a142f4", 32, 15)}</div>
  <div style="padding:8px 16px 4px;font-size:14px;color:${G.pri};font-weight:500">Любими</div>
  ${fav("Пътна помощ", "#e8710a", "Мобилен · 0888 123 456", 1)}${fav("Застраховател", "#188038", "Мобилен · 0888 123 457")}${fav("Георги (син)", "#1a73e8", "Мобилен · 0888 123 458")}${fav("Спешна помощ", "#d93025", "112")}
  <div style="flex:1"></div>
  <div style="height:80px;background:${G.sc};display:flex;align-items:flex-start;padding-top:12px;flex-shrink:0">${[["star", "Любими", 1], ["schedule", "Скорошни", 0], ["contacts", "Контакти", 0], ["dialpad", "Клавиатура", 0]].map(([n, l, a]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:64px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;${a ? `background:${G.priC}` : ""}">${ic(n, { fill: a, color: a ? "#041e49" : G.sub })}</div><div style="font-size:12px;font-weight:${a ? 600 : 500};color:${a ? G.on : G.sub}">${l}</div></div>`).join("")}</div>
  ${tip("Обадете се на пътна помощ или на застрахователя.<br>При нараняване — звъннете на 112", "left:50%;top:376px;transform:translateX(-50%)", { arrow: "u", at: "30%" })}
`), "#fff");

// 26. Какво да нося в колата — бележка със списък
const kck = (t, on) => `<div style="display:flex;align-items:center;gap:12px;height:40px;font-size:16px;color:#202124">${ic(on ? "check_box" : "check_box_outline_blank", { size: 24, color: "#5f6368" })}<span>${t}</span></div>`;
S["kakvo-nosia-kola"] = ph(wrap(`
  <div style="height:64px;display:flex;align-items:center;padding:0 8px 0 8px;flex-shrink:0;background:#fff8b8">${ic("arrow_back", { color: "#202124" })}<div style="flex:1"></div>${ic("push_pin", { color: "#202124" })}${ic("notifications", { color: "#202124" })}${ic("archive", { color: "#202124" })}</div>
  <div style="flex:1;min-height:0;background:#fff8b8;padding:2px 20px">
    <div style="font-size:23px;font-weight:500;color:#202124;margin-bottom:8px">В колата</div>
    ${[["Светлоотразителна жилетка", 0], ["Предупредителен триъгълник", 0], ["Аптечка", 0], ["Пожарогасител", 0], ["Резервна гума и инструменти", 0], ["Вода, фенерче и одеяло", 0], ["Зарядно за телефона", 0], ["Телефони: пътна помощ, застраховател", 0]].map(([t, c]) => kck(t, c)).join("")}
  </div>
  <div style="height:56px;background:#fff8b8;flex-shrink:0;display:flex;align-items:center;padding:0 16px;gap:22px;border-top:1px solid rgba(0,0,0,.08)">${ic("add_box", { color: "#5f6368" })}${ic("palette", { color: "#5f6368" })}${ic("image", { color: "#5f6368" })}<div style="flex:1"></div><span style="font-size:12px;color:#5f6368">Редактирано днес</span></div>
  ${tip("Жилетката и триъгълникът са задължителни.<br>Подредете останалото по списъка", "left:50%;top:444px;transform:translateX(-50%)", { arrow: "u", at: "30%" })}
`), "#fff8b8");

// 24. Намаления за пенсионери — карта за пътуване и бележка
S["namaleniya-pensioneri"] = deskScene(`
  <div style="position:absolute;left:30px;top:50px;width:400px;height:250px;border-radius:18px;transform:rotate(-4deg);background:${GRAIN},linear-gradient(135deg,#1f6f8b 0%,#24506b 60%,#1b3f58 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.25),0 14px 26px -4px rgba(0,0,0,.5);color:#fff;font-family:'Roboto',sans-serif;overflow:hidden">
    <div style="position:absolute;left:24px;top:22px;font-size:13px;letter-spacing:1.4px;opacity:.85">КАРТА ЗА ПЪТУВАНЕ — ПРИМЕР</div>
    <div style="position:absolute;left:24px;top:48px;font-size:30px;font-weight:700">Пенсионер</div>
    <div style="position:absolute;right:24px;top:20px">${ic("directions_bus", { size: 44, fill: 1, color: "#fff" })}</div>
    <div class="ring" style="position:absolute;left:18px;top:112px;width:250px;height:50px;border-radius:12px;background:rgba(255,255,255,.14);display:flex;align-items:center;padding-left:10px;font-size:22px;font-weight:700">Намаление</div>
    <div style="position:absolute;left:24px;bottom:20px;font-size:14px;opacity:.9">Валидна до 31.12.2026 · № 000123</div>
  </div>
  ${paper(`<div style="font-size:18px;font-weight:700;margin-bottom:10px">Къде да питам</div>${["В общината — карти с намаление за пенсионери", "При превозвача на автобуса", "В БДЖ — намаления при определени условия"].map((t) => `<div style="display:flex;gap:10px;align-items:flex-start;font-size:15px;line-height:1.35;margin-bottom:9px">${ic("check_circle", { size: 22, fill: 1, color: "#1d3a8a" })}<span>${t}</span></div>`).join("")}<div style="margin-top:12px;border-top:1px dashed #b6bcc6;padding-top:9px;font-size:14px;color:#4b5563">Носете лична карта или пенсионна книжка.</div>`, { w: 330, h: 270, pad: 22, css: "position:absolute;left:470px;top:110px;transform:rotate(2deg)" })}
  ${tip("Извадете нужната карта предварително", "left:50px;top:330px;width:max-content", { arrow: "u", at: "30%" })}
  ${tip("Условията зависят от общината и превозвача", "left:480px;top:50px;width:max-content", { arrow: "d", at: "40%" })}
  ${abs("left:12px;bottom:8px;font-size:11px;color:rgba(255,255,255,.88)", "Илюстрация: примерна карта и бележка, измислени данни")}
`, 860, 440);

// 29. Достъпен транспорт — страница с възможностите
S["dostapen-transport"] = ph(site("obshtina.example/transport", `
  ${siteHead("#1f4e5f", "Достъпен транспорт", ic("menu", { color: "#fff" }))}
  <div style="padding:14px 16px 0"><div style="font-size:21px;font-weight:700;color:#14303a">Превоз за хора с увреждания</div><div style="font-size:13.5px;color:#4b5f66;margin-top:4px">Облекчения и услуги от общината и Социално подпомагане</div></div>
  <div style="margin:12px 16px 0;display:flex;flex-direction:column;gap:10px">${[["accessible", "Превоз с достъпен автомобил", "Уговаря се предварително", 0], ["percent", "Карти с намаление и винетка", "За хора с увреждания", 0], ["description", "ТЕЛК решение", "Носете го — с него имате повече права", 1], ["volunteer_activism", "Придружител или доброволец", "Помолете близък или доброволец", 0]].map(([n, t, sub, hl]) => `<div class="${hl ? "ring" : ""}" style="border:1px solid #cfdde2;border-radius:14px;padding:11px 14px;display:flex;gap:12px;align-items:center;background:${hl ? "#eef4f6" : "#fff"}"><div style="width:42px;height:42px;border-radius:12px;background:#e1edf0;display:flex;align-items:center;justify-content:center">${ic(n, { color: "#1f4e5f", fill: 1 })}</div><div style="flex:1"><div style="font-size:15.5px;font-weight:700;color:#14303a">${t}</div><div style="font-size:12.5px;color:#4b5f66">${sub}</div></div></div>`).join("")}</div>
  ${tip("Питайте в общината и уговорете<br>превоз предварително", "left:50%;top:446px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
  ${sample()}
`), "#fff");

// 17. Кои документи да пазя — папки с раздели
const folder = (i, label, sub, c1, c2, tabL) => `<div style="position:absolute;left:${30 + i * 8}px;top:${40 + i * 92}px;width:470px;height:360px;filter:drop-shadow(0 -2px 3px rgba(0,0,0,.18)) drop-shadow(0 6px 8px rgba(0,0,0,.22))">
  <div style="position:absolute;left:${tabL}px;top:0;width:170px;height:30px;border-radius:10px 10px 0 0;background:${c1};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#4a3a1c;font-family:'Roboto',sans-serif">${label}</div>
  <div style="position:absolute;left:0;top:28px;right:0;bottom:0;border-radius:0 12px 6px 6px;background:${GRAIN},linear-gradient(180deg,${c1},${c2})"><div style="position:absolute;left:22px;top:16px;background:#fffdf6;border:1px solid #d8cfb6;padding:5px 12px;font-size:14px;color:#2b2b2b;font-family:'Roboto',sans-serif;transform:rotate(-.6deg)">${sub}</div></div></div>`;
S["pazia-dokumenti"] = deskScene(`
  ${folder(0, "Завинаги", "Акт за раждане · акт за брак · нотариални актове · дипломи · решения на ТЕЛК", "#e3c58b", "#d3b073", 20)}
  ${folder(1, "Договори", "Договори и гаранции — докато важат", "#e8cf9a", "#d8b97c", 200)}
  ${folder(2, "Данъчни", "Данъчни документи — 5 години", "#e0c488", "#cfab6d", 20)}
  ${folder(3, "Бележки", "Касови бележки — докато тече гаранцията", "#e8cf9a", "#d8b97c", 200)}
  ${tip("Пазете завинаги — актове,<br>дипломи, решения на ТЕЛК", "left:548px;top:72px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("Пазете дълго — договори,<br>гаранции, данъчни (5 г.)", "left:548px;top:170px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("Подредете ги по теми в папка<br>и кажете на близък къде са", "left:548px;top:300px;width:max-content", { arrow: "l", at: "50%" })}
  ${abs("left:12px;bottom:8px;font-size:11px;color:rgba(255,255,255,.88)", "Илюстрация")}
`, 780, 480);

// @@PHOTOS

function main() {
  const R = {};
  for (const k of Object.keys(S)) R["dokumenti-" + k] = S[k];
  render(R).catch((e) => { console.error(e); process.exit(1); });
}
