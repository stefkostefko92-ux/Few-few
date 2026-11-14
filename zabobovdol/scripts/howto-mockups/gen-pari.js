// Група „пари“ (47 ръководства): еврото, пари/сметки/права, карта и банкомат, пенсии и помощи.
// Екрани на банково приложение и сайтове — ИЗМИСЛЕН дизайн и явно примерни данни (без гербове/лога);
// хартиени документи — реалистични листове с примерни данни; банкноти/монети — само образци на ЕЦБ
// чрез banknote()/coin() (без уголемяване, SPECIMEN остава, нищо върху банкнотата — бележките са отстрани).
// Всички суми са в евро (€); днес е 30.10.2026 — еврото е валута от 1.01.2026, левът в брой не се приема от
// 1.02.2026, безплатната обмяна в банки/пощи приключи на 30.06.2026 (в БНБ — безсрочно).
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-pari.js   (ONLY=име1,име2 — само избрани)
const path = require("node:path");
const { phone, scene, ms, tip, appIcon, banknote, coin, photo, ASSETS, render } = require("./_shell");

const S = {};
const ic = (n, o = {}) => ms(n, { size: 24, ...o });
const wrap = (inner, o = {}) =>
  `<div style="height:${o.h || 660}px;display:flex;flex-direction:column;position:relative;overflow:hidden;${o.css || ""}">${inner}</div>`;
const bleed = (inner, o = {}) =>
  `<div style="margin-top:-38px;height:${o.h || 698}px;display:flex;flex-direction:column;position:relative;overflow:hidden;${o.css || ""}">${inner}</div>`;
const ph = (inner, bg = "#fff", sc = "#1f1f1f", o = { time: "11:32" }) => phone(inner, bg, sc, o);
const G = { on: "#1f1f1f", sub: "#444746", gray: "#5f6368", pri: "#0b57d0", sc: "#f0f4f9", line: "#e3e3e3", red: "#b3261e", grn: "#146c2e", navy: "#12305a" };
const spacer = `<div style="flex:1;min-height:0"></div>`;
const sample = (t = "Илюстрация: измислен дизайн и примерни данни") => `<div style="position:absolute;left:0;right:0;bottom:0;padding:8px 14px;background:#f3f4f6;color:#6b7280;font-size:11.5px;text-align:center;border-top:1px solid #e5e7eb">${t}</div>`;
// червена бележка в долната част на екрана (над ленточката „примерни данни“)
const bt = (t, bottom = 50, extra = "") => tip(t, `left:50%;bottom:${bottom}px;transform:translateX(-50%);width:max-content;max-width:330px;${extra}`);
// червена бележка в поток (под/над хартиен документ)
const ft = (t, arrow = "u", at = "50%", margin = "16px auto 0") => tip(t, `position:relative;display:block;width:max-content;max-width:430px;margin:${margin}`, { arrow, at });

// ───────────────────────── Банково приложение (измислена банка „ПримерБанк“) ─────────────────────────
const bankHead = (title, right = "") => `<div style="height:60px;display:flex;align-items:center;padding:0 8px;gap:8px;flex-shrink:0;color:${G.navy}"><span style="padding:8px;display:flex">${ic("arrow_back", { color: G.navy })}</span><div style="flex:1;font-size:20px;font-weight:500">${title}</div>${right}</div>`;
const card = (inner, css = "") => `<div style="background:#fff;border-radius:18px;box-shadow:0 1px 2px rgba(15,35,70,.08),0 4px 14px -6px rgba(15,35,70,.16);${css}">${inner}</div>`;
const BG = "#f2f5fa";
const bankNav = `<div style="height:68px;margin-bottom:33px;background:#fff;border-top:1px solid #e3e8f0;display:flex;align-items:center;flex-shrink:0">${[["home", "Начало", 0], ["payments", "Плащания", 0], ["credit_card", "Карти", 0], ["history", "Движения", 0], ["menu", "Още", 0]].map(([n, t]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11.5px;color:${G.gray}">${ic(n, { size: 24, color: G.gray })}${t}</div>`).join("")}</div>`;
const bank = (title, body, tipHtml, o = {}) => ph(wrap(`${bankHead(title, o.right || "")}<div style="flex:1;min-height:0;overflow:hidden;padding:4px 16px 0;display:flex;flex-direction:column;gap:12px;position:relative">${body}</div>${bankNav}${tipHtml || ""}${sample()}`), BG, "#1f1f1f");
const lbl = (t, v, o = {}) => `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:11px 0;${o.last ? "" : "border-bottom:1px solid #e8ecf3;"}"><span style="font-size:14.5px;color:${G.gray}">${t}</span><b style="font-size:16px;font-weight:500;color:${G.on};text-align:right">${v}</b></div>`;
const tx = (icon, t, d, amt, plus, ring) => `<div ${ring ? 'class="ring"' : ""} style="display:flex;align-items:center;gap:12px;padding:10px 8px;${ring ? "border-radius:14px;margin:2px 0;" : ""}"><div style="width:42px;height:42px;border-radius:50%;background:#eaf0fa;display:flex;align-items:center;justify-content:center">${ic(icon, { color: G.navy, size: 22 })}</div><div style="flex:1"><div style="font-size:15.5px;color:${G.on}">${t}</div><div style="font-size:12.5px;color:${G.gray}">${d}</div></div><b style="font-size:15.5px;font-weight:500;color:${plus ? "#146c2e" : G.on}">${amt}</b></div>`;

// ───────────────────────── Хартия ─────────────────────────
const paper = (inner, o = {}) =>
  `<div style="position:relative;width:${o.w || 460}px;background:linear-gradient(180deg,#fefefd 0%,#f7f7f3 100%);padding:${o.pad || "28px 32px 30px"};color:#23262b;font-size:14px;line-height:1.45;box-shadow:0 0 0 .5px rgba(0,0,0,.08),0 1px 1px rgba(0,0,0,.14),0 8px 16px -6px rgba(15,23,42,.3),0 26px 40px -18px rgba(15,23,42,.28);${o.rot ? `transform:rotate(${o.rot}deg);` : ""}${o.css || ""}">${inner}</div>`;
const rule = (c = "#c9ccd2") => `<div style="border-top:1px solid ${c};margin:9px 0"></div>`;
const ph_ = (w = 160) => `<span style="display:inline-block;width:${w}px;border-bottom:1px solid #8b9099;height:1em;vertical-align:baseline"></span>`;
const SAMPLE_STAMP = (t = "ОБРАЗЕЦ", pos = "bottom:16px") => `<div style="position:absolute;right:24px;${pos};border:2px solid #b9bec7;color:#b9bec7;font-size:13px;font-weight:700;letter-spacing:2px;padding:2px 9px;border-radius:4px;transform:rotate(7deg)">${t}</div>`;
const col = (c, t, w) => `<span style="color:${c};${w ? `font-weight:${w}` : ""}">${t}</span>`;
const ringSpan = (t, css = "") => `<span class="ring" style="display:inline-block;border-radius:6px;padding:1px 6px;margin:-1px -2px;${css}">${t}</span>`;
const fmt = (n) => n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// ═════════════════════════ ЕВРОТО ═════════════════════════

// e-koga-evro — стенен календар януари 2026 (1 януари е четвъртък) + монети на ЕЦБ
S["pari-koga-evro"] = (() => {
  const names = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
  const cells = [...Array(3).fill(""), ...Array.from({ length: 31 }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push("");
  const grid = cells.map((d, i) => {
    const wk = i % 7 >= 5;
    return `<div style="height:44px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:${d === 1 ? 800 : 400};color:${d === 1 ? "#fff" : wk ? "#b3261e" : "#23262b"}">${d === 1 ? `<span class="ring" style="width:38px;height:38px;border-radius:50%;background:#0b57d0;display:flex;align-items:center;justify-content:center">1</span>` : d}</div>`;
  }).join("");
  return scene(`<div style="width:470px">
    <div style="position:relative;background:linear-gradient(180deg,#fefefd,#f4f4ef);border-radius:6px;box-shadow:0 1px 1px rgba(0,0,0,.2),0 14px 26px -8px rgba(15,23,42,.35)">
      <div style="height:74px;background:linear-gradient(180deg,#1d4f91,#173f74);border-radius:6px 6px 0 0;color:#fff;display:flex;align-items:flex-end;justify-content:space-between;padding:0 22px 10px"><div style="font-size:30px;font-weight:700">Януари</div><div style="font-size:30px;font-weight:300">2026</div></div>
      <div style="position:absolute;top:-8px;left:0;right:0;display:flex;justify-content:space-around;padding:0 70px">${[1, 2].map(() => `<i style="display:block;width:12px;height:22px;border-radius:6px;background:linear-gradient(90deg,#9aa0a8,#eef0f3,#8a9099);box-shadow:0 2px 3px rgba(0,0,0,.3)"></i>`).join("")}</div>
      <div style="padding:10px 18px 16px"><div style="display:grid;grid-template-columns:repeat(7,1fr);font-size:13.5px;color:#5f6368;text-align:center;padding:4px 0 2px">${names.map((n) => `<span>${n}</span>`).join("")}</div><div style="display:grid;grid-template-columns:repeat(7,1fr)">${grid}</div></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin-top:20px">${coin("2e", "bg", { scale: 6 })}${coin("1e", "bg", { scale: 6 })}${coin("50c", "bg", { scale: 6 })}</div>
    ${ft("От 1 януари 2026 г. еврото е официалната валута", "u", "50%", "18px auto 0")}
  </div>`, { pad: 26 });
})();

// e-zashto — портфейл с банкноти и монети на ЕЦБ (общата страна на монетите)
S["pari-obshta-valuta"] = scene(`<div style="position:relative;width:540px;height:372px">
  <div style="position:absolute;left:0;top:54px;width:300px;height:224px;border-radius:22px;background:linear-gradient(150deg,#6b4226 0%,#4a2c17 55%,#3a2210 100%);box-shadow:inset 0 2px 2px rgba(255,255,255,.18),inset 0 -6px 12px rgba(0,0,0,.4),0 22px 28px -10px rgba(0,0,0,.5)">
    <div style="position:absolute;inset:9px;border:1.5px dashed rgba(240,214,170,.55);border-radius:15px"></div>
    <div style="position:absolute;left:20px;right:20px;top:92px;height:104px;border-radius:14px;background:linear-gradient(180deg,#59361d,#4a2c17);box-shadow:inset 0 3px 8px rgba(0,0,0,.55)"></div>
    <div style="position:absolute;left:30px;top:118px;display:flex;gap:10px">${coin("2e", "common", { scale: 3.2, shadow: false })}${coin("1e", "common", { scale: 3.2, shadow: false })}${coin("50c", "common", { scale: 3.2, shadow: false })}</div>
  </div>
  <div style="position:absolute;left:330px;top:6px;transform:rotate(3deg)">${banknote(20, "front", 188)}</div>
  <div style="position:absolute;left:336px;top:140px;transform:rotate(-3deg)">${banknote(10, "front", 176)}</div>
  <div style="position:absolute;left:400px;top:262px">${coin("2e", "common", { scale: 4.2 })}</div>
  ${tip("Една и съща валута — евро — в много страни от Европейския съюз", "left:0;top:300px;width:340px;max-width:340px", { arrow: "u", at: "22%" })}
</div>`, { pad: 28 });

// e-gubia-li-pari — превалутиране без загуба: същата стойност, показана в банковото приложение
S["pari-prevalutirane"] = bank("Разплащателна сметка", `
  ${card(`<div style="padding:18px 18px 16px"><div style="font-size:14px;color:${G.gray}">Налична сума</div>
    <div class="ring" style="display:inline-block;margin:6px -4px 2px;padding:0 6px;border-radius:8px;font-size:38px;font-weight:700;color:${G.navy};letter-spacing:-.5px">511,29 €</div>
    <div style="font-size:13px;color:${G.gray};margin-top:6px">IBAN BG00 PRBK 0000 0000 0000 00</div></div>`)}
  ${card(`<div style="padding:6px 18px 4px">${lbl("Преди превалутирането", "1 000,00 лв")}${lbl("Фиксиран курс", "1 € = 1,95583 лв")}${lbl("Такса за превалутиране", "0,00 €", { last: 1 })}</div>`)}
  ${card(`<div style="padding:14px 16px;display:flex;gap:12px;align-items:flex-start">${ic("info", { fill: 1, color: G.pri })}<div style="font-size:14.5px;color:${G.on};line-height:1.4">Парите Ви са същата стойност — сменя се само валутата.</div></div>`)}
`, bt("1 000 лв ÷ 1,95583 = 511,29 € — стойността се запазва", 118));

// e-smetki-banka — съобщение от банката в приложението
S["pari-saobshtenie-banka"] = bank("Съобщения", `
  <div style="font-size:14px;color:${G.gray};padding:2px 4px">Входящи</div>
  <div class="ring" style="background:#fff;border-radius:18px;padding:14px 16px;box-shadow:0 4px 14px -6px rgba(15,35,70,.2)">
    <div style="display:flex;align-items:center;gap:10px"><div style="width:38px;height:38px;border-radius:50%;background:${G.navy};display:flex;align-items:center;justify-content:center">${ic("account_balance", { fill: 1, color: "#fff", size: 21 })}</div><div style="flex:1"><div style="font-size:15.5px;font-weight:600;color:${G.on}">Сметките Ви са в евро</div><div style="font-size:12.5px;color:${G.gray}">ПримерБанк · 2 яну.</div></div></div>
    <div style="font-size:15px;line-height:1.45;color:${G.on};margin-top:10px">Превалутирахме всички Ваши сметки, влогове и кредити от лева в евро — автоматично и безплатно. Не е нужно да идвате в банката и да подписвате нов договор.</div>
  </div>
  ${card(`<div style="padding:13px 16px;display:flex;gap:12px;align-items:center">${ic("mark_email_read", { color: G.gray })}<div style="flex:1"><div style="font-size:15px;color:${G.on}">Извлечение за декември</div><div style="font-size:12.5px;color:${G.gray}">ПримерБанк · 5 яну.</div></div></div>`)}
`, bt("Не е нужно да правите нищо в банката — превалутирането е автоматично и безплатно", 118));

// e-iban — данни за сметката: IBAN същият, валута евро
S["pari-iban"] = bank("Данни за сметката", `
  ${card(`<div style="padding:8px 18px 4px">${lbl("Вид сметка", "Разплащателна")}
    <div class="ring" style="border-radius:12px;margin:4px -8px;padding:0 8px"><div style="padding:11px 0;border-bottom:1px solid #e8ecf3"><div style="font-size:14.5px;color:${G.gray}">IBAN</div><div style="font-size:19px;font-weight:600;color:${G.navy};letter-spacing:.8px;margin-top:3px">BG00 PRBK 9200 0000 0000 00</div></div></div>
    ${lbl("Валута", "евро (EUR)")}${lbl("Титуляр", "Иван Петров", { last: 1 })}</div>`)}
  <div style="display:flex;gap:10px"><div style="flex:1;height:50px;border-radius:25px;background:${G.navy};color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-size:15.5px;font-weight:500">${ic("content_copy", { color: "#fff", size: 20 })}Копирай IBAN</div><div style="flex:1;height:50px;border-radius:25px;border:1.5px solid ${G.navy};color:${G.navy};display:flex;align-items:center;justify-content:center;gap:8px;font-size:15.5px;font-weight:500">${ic("share", { color: G.navy, size: 20 })}Сподели</div></div>
`, bt("IBAN-ът е същият като преди — сметката само е в евро", 118));

// e-vlog — депозит в евро
S["pari-vlog"] = bank("Моите влогове", `
  ${card(`<div style="padding:16px 18px"><div style="display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:12px;background:#e3ecfb;display:flex;align-items:center;justify-content:center">${ic("savings", { fill: 1, color: G.navy })}</div><div style="flex:1"><div style="font-size:16px;font-weight:600;color:${G.on}">Срочен влог</div><div style="font-size:12.5px;color:${G.gray}">Сключен преди превалутирането</div></div></div>
    <div style="font-size:34px;font-weight:700;color:${G.navy};margin:12px 0 4px;letter-spacing:-.4px">5 000,00 €</div>
    <div style="font-size:13px;color:${G.gray}">Сумата е превалутирана по курс 1,95583</div></div>`)}
  ${card(`<div style="padding:6px 18px 4px"><div class="ring" style="border-radius:12px;margin:2px -8px;padding:0 8px">${lbl("Лихва", "2,10 % годишно")}</div><div class="ring" style="border-radius:12px;margin:2px -8px;padding:0 8px">${lbl("Срок", "до 14 март 2027")}</div>${lbl("Валута", "евро (EUR)", { last: 1 })}</div>`)}
`, bt("Лихвата и срокът остават същите — сменя се само валутата", 118));

// e-kredit — кредит в евро
S["pari-kredit"] = bank("Моите кредити", `
  ${card(`<div style="padding:16px 18px"><div style="display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:12px;background:#e3ecfb;display:flex;align-items:center;justify-content:center">${ic("request_quote", { fill: 1, color: G.navy })}</div><div style="flex:1"><div style="font-size:16px;font-weight:600;color:${G.on}">Потребителски кредит</div><div style="font-size:12.5px;color:${G.gray}">Договорът остава същият</div></div></div>
    <div style="font-size:14px;color:${G.gray};margin-top:12px">Остатък за плащане</div><div style="font-size:34px;font-weight:700;color:${G.navy};letter-spacing:-.4px;margin-top:2px">3 069,38 €</div></div>`)}
  ${card(`<div style="padding:6px 18px 4px"><div class="ring" style="border-radius:12px;margin:2px -8px;padding:0 8px">${lbl("Месечна вноска", "85,00 €")}</div>${lbl("Следваща вноска", "10 ноември 2026")}${lbl("Валута", "евро (EUR)", { last: 1 })}</div>`)}
`, bt("Вноските се запазват по стойност — само са изразени в евро", 118));

// e-pensiya — пенсията по банкова сметка в евро
S["pari-pensiya-evro"] = bank("Движения", `
  <div style="font-size:14px;color:${G.gray};padding:2px 4px">Октомври 2026</div>
  ${card(`<div style="padding:6px 10px">${tx("payments", "Пенсия — НОИ", "25 окт.", "+612,40 €", 1, 1)}${tx("bolt", "Електроснабдяване", "28 окт.", "−24,85 €")}${tx("local_pharmacy", "Аптека „Здраве“", "29 окт.", "−14,80 €")}${tx("shopping_basket", "Магазин „Добро утро“", "30 окт.", "−6,49 €")}</div>`)}
`, bt("Пенсията пристига в евро по банковата Ви сметка — по обичайния начин", 118));

// e-zaplata — фиш за заплата (хартия)
S["pari-zaplata-fish"] = scene(`<div style="display:flex;flex-direction:column">${ft("Сумата е в евро. Стойността ѝ не се променя от превалутирането", "d", "50%", "0 auto 16px")}${paper(`
  <div style="font-size:19px;font-weight:700">Фиш за заплата</div><div style="color:#5f6368;font-size:13px">за месец октомври 2026 · „Примерна фирма“ ООД</div>
  ${rule()}
  <div style="display:grid;grid-template-columns:1fr auto;row-gap:7px;font-size:14.5px"><span>Служител</span><span>Иван Петров</span><span>Основна заплата</span><span>1 250,00 €</span><span>Осигуровки и данък</span><span>−227,00 €</span></div>
  ${rule("#8b9099")}
  <div class="ring" style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;padding:5px 8px;margin:0 -8px;border-radius:10px"><span>Нетна сума за получаване</span><span>1 023,00 €</span></div>
  <div style="color:#5f6368;font-size:12.5px;margin-top:10px">Плащане по банков път · валута: евро (EUR)</div>`, { w: 470, rot: -.8 })}</div>`, { pad: 26 });

// e-leva-do-koga — табелка на касата: в брой само евро (към днешна дата — след 1.02.2026)
S["pari-kasa-samo-evro"] = scene(`<div style="width:500px;position:relative">
  <div style="display:flex;justify-content:center"><div style="width:330px;padding:22px 24px 20px;background:linear-gradient(180deg,#ffffff,#f1f2ef);border-radius:12px;text-align:center;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 14px 22px -8px rgba(15,23,42,.4)">
    <div style="font-size:15px;color:#5f6368">Каса</div>
    <div style="font-size:30px;font-weight:700;color:#173f74;line-height:1.15;margin:4px 0 8px">Плащане в брой<br>само в евро (€)</div>
    <div style="font-size:13.5px;color:#5f6368">Картите се приемат</div></div></div>
  <div style="height:16px;width:330px;margin:0 auto;background:linear-gradient(180deg,#b6bbc3,#7d838c);border-radius:0 0 8px 8px;box-shadow:0 12px 16px -8px rgba(0,0,0,.4)"></div>
  <div style="display:flex;align-items:center;justify-content:center;gap:22px;margin-top:26px">${banknote(20, "front", 188)}<div style="display:flex;flex-direction:column;gap:10px;align-items:center">${coin("2e", "bg", { scale: 6 })}${coin("50c", "bg", { scale: 6 })}</div></div>
  ${ft("От 1 февруари 2026 г. единствено законно платежно средство е еврото", "u", "50%", "22px auto 0")}
</div>`, { pad: 28 });

// e-obmiana-bezplatno — разписка за обмяна (БНБ — безсрочно и безплатно)
S["pari-obmyana-razpiska"] = scene(`<div>${paper(`
  ${SAMPLE_STAMP("ПРИМЕР")}
  <div style="font-size:19px;font-weight:700">Разписка за обмяна</div><div style="color:#5f6368;font-size:13px;margin-top:2px">лева → евро · гише в банка (примерен документ)</div>
  ${rule()}
  <div style="display:grid;grid-template-columns:1fr auto;row-gap:8px;font-size:15px"><span>Предадени левове</span><b style="font-weight:500">500,00 лв</b><span>Курс</span><b style="font-weight:500">1 € = 1,95583 лв</b><span>Такса</span><b style="font-weight:500">0,00 €</b></div>
  ${rule("#8b9099")}
  <div class="ring" style="display:flex;justify-content:space-between;font-size:19px;font-weight:700;padding:5px 8px;margin:0 -8px;border-radius:10px"><span>Получавате</span><span>255,65 €</span></div>
  <div style="color:#5f6368;font-size:12.5px;margin-top:12px;line-height:1.4">Пазете документа от обмяната.<br>Дата: 30.10.2026 · гише 3</div>`, { w: 460, rot: .6 })}${ft("Обмяна по курса 1,95583. В БНБ — безплатно, без ограничение на сумата и без срок", "u", "50%", "18px auto 0")}</div>`, { pad: 26 });

// ───────────────────────── Още градивни елементи: браузър, съобщения, обаждане ─────────────────────────
const chrome = (url) => `<div style="height:58px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#fff;border-bottom:1px solid #e5e7eb;flex-shrink:0"><div style="flex:1;height:42px;border-radius:21px;background:#eef1f6;display:flex;align-items:center;gap:8px;padding:0 14px">${ic("lock", { size: 17, fill: 1, color: "#188038" })}<span style="font-size:15px;color:#1f1f1f">${url}</span></div>${ic("more_vert", { color: "#444746" })}</div>`;
const site = (url, body) => wrap(`${chrome(url)}<div style="flex:1;min-height:0;overflow:hidden;position:relative;background:#fff">${body}</div>`);
const siteHead = (bg, title) => `<div style="height:58px;background:${bg};color:#fff;display:flex;align-items:center;padding:0 14px;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center">${ic("account_balance", { size: 19, fill: 1, color: "#fff" })}</div><div style="flex:1;font-size:17px;font-weight:500">${title}</div>${ic("menu", { color: "#fff" })}</div>`;
// Google Messages: разговор
const sms = (sender, bubbles, tipHtml, o = {}) => ph(wrap(`
  <div style="display:flex;align-items:center;gap:8px;padding:4px 14px 6px 8px;height:64px;flex-shrink:0"><span style="padding:8px;display:flex">${ic("arrow_back")}</span><div style="width:40px;height:40px;border-radius:50%;background:#dde3ea;display:flex;align-items:center;justify-content:center">${ic("person", { fill: 1, color: "#5f6368", size: 24 })}</div><div style="flex:1;font-size:18px;font-weight:500;color:#1f1f1f">${sender}</div>${ic("call")}<span style="width:6px"></span>${ic("more_vert")}</div>
  <div style="padding:16px 14px;display:flex;flex-direction:column;gap:3px;flex:1;min-height:0;overflow:hidden">
    <div style="align-self:center;font-size:12px;color:#5f6368;margin-bottom:10px">Днес · ${o.time || "11:32"}</div>
    ${bubbles.map((b, i) => `<div style="align-self:flex-start;max-width:86%"><div ${b.ring ? 'class="ring"' : ""} style="background:#e8edf5;color:#1f1f1f;padding:11px 16px;border-radius:${b.ring ? "20px" : i === 0 ? "20px 20px 20px 6px" : "6px 20px 20px 6px"};font-size:16px;line-height:1.4">${b.html}</div></div>`).join("")}
  </div>
  <div style="padding:6px 12px 10px;display:flex;align-items:center;gap:10px;flex-shrink:0"><div style="width:44px;height:44px;border-radius:50%;background:#e8edf5;display:flex;align-items:center;justify-content:center">${ic("add", { color: "#444746", size: 26 })}</div><div style="flex:1;height:44px;border-radius:22px;background:#e8edf5;display:flex;align-items:center;padding:0 16px;font-size:16px;color:#5f6368">Текстово съобщение</div></div>
  ${tipHtml}`), "#fff", "#1f1f1f", { time: o.time || "11:32" });

// Входящо обаждане (тъмен екран, Pixel)
const incoming = (name, sub, tipHtml, o = {}) => ph(bleed(`
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,#2a2f3a,#14171d)"></div>
  <div style="position:relative;margin-top:96px;text-align:center;color:#fff"><div style="font-size:15px;color:#c9ced8">${o.line || "Входящо обаждане"}</div>
    <div style="width:104px;height:104px;border-radius:50%;background:#4b5260;margin:26px auto 18px;display:flex;align-items:center;justify-content:center">${ic("person", { fill: 1, size: 62, color: "#cfd4de" })}</div>
    <div style="font-size:30px;font-weight:400;letter-spacing:.3px">${name}</div><div style="font-size:15px;color:#c9ced8;margin-top:6px">${sub}</div></div>
  <div style="position:absolute;left:0;right:0;bottom:70px;display:flex;justify-content:space-around;align-items:center">
    <div style="text-align:center;color:#fff;font-size:14px"><div ${o.ringReject ? 'class="ring"' : ""} style="width:76px;height:76px;border-radius:50%;background:#d93025;display:flex;align-items:center;justify-content:center;margin:0 auto 8px">${ic("call_end", { fill: 1, color: "#fff", size: 36 })}</div>${o.rejectLbl || "Отхвърли"}</div>
    <div style="text-align:center;color:#fff;font-size:14px"><div style="width:76px;height:76px;border-radius:50%;background:#1e8e3e;display:flex;align-items:center;justify-content:center;margin:0 auto 8px">${ic("call", { fill: 1, color: "#fff", size: 36 })}</div>Приеми</div>
  </div>${tipHtml}`), "#14171d", "#ffffff");

// ═════════════════════════ ЕВРОТО (продължение) ═════════════════════════

// e-bnb-bezsrochno — сайт (измислен дизайн) за обмяната в БНБ
S["pari-bnb-sayt"] = ph(site("bnb.example/obmiana-leva", `
  ${siteHead("#1b3a6b", "Национална банка")}
  <div style="padding:20px 18px 0"><div style="font-size:23px;font-weight:700;color:#14305a;line-height:1.2">Обмяна на левове в евро</div><div style="font-size:14px;color:#4b5563;margin-top:6px">Банкноти и монети в левове</div></div>
  <div class="ring" style="margin:16px 16px 0;border-radius:16px;background:#e8f0fb;padding:16px 16px 14px"><div style="display:flex;gap:12px;align-items:center">${ic("all_inclusive", { size: 32, color: "#1b3a6b" })}<div style="font-size:19px;font-weight:700;color:#14305a">Безсрочно и безплатно</div></div><div style="font-size:14.5px;color:#374151;margin-top:8px;line-height:1.45">Обменът в БНБ няма краен срок и няма ограничение на сумата.</div></div>
  <div style="margin:12px 16px 0;border:1px solid #dbe2ee;border-radius:14px;overflow:hidden">${[["currency_exchange", "Курс: 1 € = 1,95583 лв"], ["schedule", "Работно време: делнични дни"], ["badge", "Носете лична карта"]].map(([n, t], i) => `<div style="display:flex;align-items:center;gap:12px;padding:0 14px;height:52px;${i ? "border-top:1px solid #e8ecf3" : ""}">${ic(n, { color: "#1b3a6b" })}<div style="font-size:14.5px;color:#14305a">${t}</div></div>`).join("")}</div>
  ${bt("Не успели ли сте до юни 2026 г. — БНБ обменя левове в евро безсрочно и безплатно", 50)}${sample()}
`), "#fff", "#1f1f1f");

// e-da-barzam-li — съобщение, което бърза да Ви накара (измама)
S["pari-sms-barzane"] = sms("+359 887 123 456", [
  { html: "СПЕШНО! Левовете Ви губят стойност! Обменете ги още днес през нашия агент, иначе ще ги изгубите. Обадете се: 0887 123 456", ring: 1 },
], bt("Не бързайте. Парите в банка се превалутират сами, а в БНБ обменът е безсрочен. Бързането е удобно за измамниците", 74, "max-width:340px"));

// e-leva-vkashti — спестовна сметка вместо пари в брой вкъщи
S["pari-spestovna-smetka"] = bank("Спестовна сметка", `
  ${card(`<div style="padding:16px 18px"><div style="display:flex;align-items:center;gap:10px"><div style="width:40px;height:40px;border-radius:12px;background:#e3ecfb;display:flex;align-items:center;justify-content:center">${ic("savings", { fill: 1, color: G.navy })}</div><div style="font-size:16px;font-weight:600;color:${G.on}">Спестовна сметка</div></div>
    <div class="ring" style="display:inline-block;margin:12px -4px 2px;padding:0 6px;border-radius:8px;font-size:36px;font-weight:700;color:${G.navy};letter-spacing:-.4px">2 500,00 €</div>
    <div style="font-size:13px;color:${G.gray};margin-top:4px">Парите са в банката, а не вкъщи</div></div>`)}
  ${card(`<div style="padding:6px 18px 4px">${lbl("Лихва", "0,80 % годишно")}${lbl("Достъп", "всеки ден, от приложението", { last: 1 })}</div>`)}
`, bt("Големи суми в брой вкъщи не е добре — по-сигурно е в банка", 118));

// e-vaucheri — хартиен ваучер в лева и нов ваучер в евро
const voucher = (money, note, bg, edge) => `<div style="position:relative;width:420px;background:${bg};border-radius:10px;padding:14px 20px 14px 36px;box-shadow:0 1px 1px rgba(0,0,0,.2),0 10px 18px -6px rgba(15,23,42,.35);overflow:hidden">
  <div style="position:absolute;left:12px;top:0;bottom:0;border-left:2px dotted ${edge}"></div>
  <div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:13px;color:#4b5563">Ваучер за храна</div><div style="font-size:34px;font-weight:700;color:#1f2937;line-height:1.1">${money}</div></div>${ic("restaurant", { size: 38, color: edge, fill: 1 })}</div>
  <div style="font-size:12.5px;color:#4b5563;margin-top:6px">${note}</div></div>`;
S["pari-vaucheri"] = scene(`<div style="display:flex;flex-direction:column;align-items:center;gap:18px;width:430px">
  ${voucher("10 лв", "Хартиен ваучер в левове · валиден до 31.12.2026", "linear-gradient(135deg,#fbf3d9,#f4e6b4)", "#a8892e")}
  ${voucher("5,00 €", "Нов ваучер, издаден от 2026 г. — в евро", "linear-gradient(135deg,#e4f3ea,#cfe8d9)", "#2f7d52")}
  ${ft("Ваучерите в левове важат до изтичане на срока и се приемат по курс 1,95583. Новите са в евро", "d", "50%", "-2px auto 0").replace("margin:-2px auto 0", "margin:0 auto;order:-1")}
</div>`, { pad: 28 });

// e-izmami-vnimanie — вратата (CC0 снимка)
S["pari-vrata-izmama"] = scene(`<div style="width:380px">
  <div style="position:relative;width:380px;height:470px;border-radius:14px;overflow:hidden;box-shadow:0 18px 36px -10px rgba(15,23,42,.45)">${photo("pari/door-chain.jpg", { w: 380, h: 470, style: "object-position:50% 20%" })}<div class="ring" style="position:absolute;left:108px;top:44px;width:160px;height:150px;border-radius:24px"></div></div>
  ${ft("Не пускайте „служители“, дошли да обменят или проверяват пари — затворете вратата и звъннете на близък", "u", "30%", "16px auto 0").replace("max-width:430px", "max-width:380px")}
  <div style="text-align:center;font-size:11.5px;color:#64748b;margin-top:12px">Снимка: Jebulon, Wikimedia Commons (CC0)</div>
</div>`, { pad: 28 });

// e-izmama-telefon — обаждане „да обменят парите“
S["pari-obazhdane-obmyana"] = incoming("Непознат номер", "+359 888 123 456", tip("Обмяната на пари не става по телефон. Затворете и не давайте номер на карта, кодове или пари", "left:50%;top:76px;transform:translateX(-50%);width:max-content;max-width:330px"), { ringReject: 1, rejectLbl: "Затвори" });

// e-oficialna-info — Chrome: най-посещавани страници (официални адреси)
S["pari-ofitsialni-saitove"] = ph(wrap(`
  <div style="height:58px;display:flex;align-items:center;gap:8px;padding:0 10px;flex-shrink:0"><div style="flex:1;height:42px;border-radius:21px;background:#eef1f6;display:flex;align-items:center;gap:10px;padding:0 14px">${ic("search", { size: 20, color: "#444746" })}<span style="font-size:15px;color:#5f6368">Търсете или въведете адрес</span></div>${ic("more_vert", { color: "#444746" })}</div>
  <div style="padding:36px 24px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:26px 10px">${[["Б", "bnb.bg", "#1b3a6b"], ["е", "evroto.bg", "#0b6b8a"], ["К", "kzp.bg", "#7a3b8f"]].map(([l, t, c]) => `<div class="ring" style="border-radius:16px;padding:12px 0 10px;text-align:center;background:#fff"><div style="width:56px;height:56px;border-radius:50%;background:${c};color:#fff;font-size:26px;font-weight:500;display:flex;align-items:center;justify-content:center;margin:0 auto 8px">${l}</div><div style="font-size:13.5px;color:#1f1f1f">${t}</div></div>`).join("")}</div>
  <div style="padding:30px 24px 0;font-size:14px;color:#5f6368;text-align:center">За сметка и карта питайте във Вашата банка</div>
  ${bt("Официални източници: bnb.bg, evroto.bg и kzp.bg. Който иска пари „за еврото“, е измамник", 50)}${sample()}`), "#fff", "#1f1f1f");

// ═════════════════════════ ПАРИ, КАРТА И БАНКОМАТ ═════════════════════════

// money-nalozhen-platezh — избор „Наложен платеж“ при поръчка
S["pari-nalozhen-izbor"] = ph(wrap(`
  <div style="height:60px;display:flex;align-items:center;padding:0 8px;gap:8px;flex-shrink:0"><span style="padding:8px;display:flex">${ic("arrow_back")}</span><div style="flex:1;font-size:20px;font-weight:500;color:#1f1f1f">Плащане</div></div>
  <div style="padding:6px 18px 0"><div style="font-size:15px;color:${G.gray}">Начин на плащане</div></div>
  <div style="padding:10px 18px 0;display:flex;flex-direction:column;gap:10px">
    ${[["credit_card", "Плащане с карта", "Сега, онлайн", 0], ["local_shipping", "Наложен платеж", "Плащате на куриера при доставка", 1]].map(([n, t, s, on]) => `<div class="${on ? "ring" : ""}" style="display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;background:${on ? "#e8f0fe" : "#fff"};border:1.5px solid ${on ? "#0b57d0" : "#dadce0"}">${ic(n, { color: on ? "#0b57d0" : G.gray, size: 28 })}<div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f;font-weight:${on ? 500 : 400}">${t}</div><div style="font-size:13px;color:${G.gray};margin-top:2px">${s}</div></div><div style="width:24px;height:24px;border-radius:50%;border:2px solid ${on ? "#0b57d0" : "#79747e"};display:flex;align-items:center;justify-content:center">${on ? `<i style="width:12px;height:12px;border-radius:50%;background:#0b57d0;display:block"></i>` : ""}</div></div>`).join("")}
  </div>
  <div style="margin:18px 18px 0;padding:14px 16px;border-radius:14px;background:#f3f4f6;font-size:14.5px;color:#1f1f1f;display:flex;justify-content:space-between"><span>Общо за плащане</span><b>34,90 €</b></div>
  ${spacer}
  <div style="margin:0 18px 64px;height:52px;border-radius:26px;background:#0b57d0;color:#fff;font-size:16.5px;font-weight:500;display:flex;align-items:center;justify-content:center">Завърши поръчката</div>
  ${bt("При поръчка изберете „Наложен платеж“", 140)}${sample()}`), "#fff", "#1f1f1f");

// m-nalozhen-platezh2 — товарителница с наложен платеж
S["pari-tovaritelnitsa"] = scene(`<div style="display:flex;flex-direction:column">${paper(`
  <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:20px;font-weight:700;letter-spacing:.3px">ТОВАРИТЕЛНИЦА</div><div style="color:#5f6368;font-size:13px;margin-top:2px">№ 1051 2345 6789 · Бърз куриер (пример)</div></div>${ic("local_shipping", { size: 36, color: "#9aa0a8" })}</div>
  ${rule()}
  <div style="display:grid;grid-template-columns:90px 1fr;row-gap:6px;font-size:14.5px"><span style="color:#5f6368">Подател</span><span>Онлайн магазин „Пример“</span><span style="color:#5f6368">Получател</span><span>Стойна Иванова</span><span style="color:#5f6368">Адрес</span><span>гр. Бобов дол, ул. „Примерна“ 12</span></div>
  ${rule()}
  <div class="ring" style="display:flex;justify-content:space-between;align-items:center;font-size:18px;font-weight:700;padding:6px 10px;margin:0 -10px;border-radius:10px"><span>Наложен платеж</span><span>34,90 €</span></div>
  <div style="height:44px;margin-top:16px;background:repeating-linear-gradient(90deg,#111 0 2px,#fff 2px 4px,#111 4px 5px,#fff 5px 8px,#111 8px 11px,#fff 11px 12px)"></div>
  <div style="text-align:center;font-size:12px;letter-spacing:3px;color:#444;margin-top:3px">1051 2345 6789</div>`, { w: 460, rot: -.7 })}${ft("Проверете името и адреса, платете на куриера и вземете бележката или товарителницата", "u", "50%", "18px auto 0")}</div>`, { pad: 26 });

// money-3d-secure — еднократен код по SMS
S["pari-3ds-sms"] = sms("ПримерБанк", [
  { html: "ПримерБанк: код за потвърждение <b style=\"letter-spacing:2px\">482917</b> за плащане 24,80 € към „Онлайн магазин“. Важи 5 минути. Не го казвайте на никого.", ring: 1 },
], bt("Въведете кода САМО на страницата за плащане. Ако някой по телефона го иска — това е измама", 74, "max-width:340px"));

// money-teglene-bez-karta — документ за теглене на гише
S["pari-teglene-gishe"] = scene(`<div style="display:flex;flex-direction:column">${paper(`
  ${SAMPLE_STAMP("ПРИМЕР", "top:18px")}
  <div style="font-size:19px;font-weight:700">Теглене в брой</div><div style="color:#5f6368;font-size:13px">Документ на гише · без карта</div>
  ${rule()}
  <div style="display:grid;grid-template-columns:120px 1fr;row-gap:9px;font-size:14.5px;align-items:baseline"><span style="color:#5f6368">Титуляр</span><span>Иван Петров</span><span style="color:#5f6368">Сметка (IBAN)</span><span>BG00 PRBK 9200 0000 0000 00</span><span style="color:#5f6368">Сума</span><b style="font-size:17px">100,00 €</b><span style="color:#5f6368">Дата</span><span>30.10.2026</span></div>
  ${rule()}
  <div class="ring" style="display:flex;justify-content:space-between;align-items:flex-end;padding:8px 12px 6px;margin:0 -12px;border-radius:12px"><span style="font-size:13.5px;color:#5f6368">Подпис на титуляра</span><span style="display:block;width:170px;border-bottom:1.5px solid #3a3f47;height:34px"></span></div>
  <div style="font-size:12px;color:#5f6368;margin-top:10px">Носете лична карта. Вземете парите и бележката.</div>`, { w: 460, rot: .5 })}${ft("Отидете на гише с лична карта, кажете, че теглите в брой, и подпишете документа", "u", "50%", "18px auto 0")}</div>`, { pad: 26 });

// money-evro-podgotovka, m-evro-podgotovka2 — шпаргалка за курса
S["pari-shpargalka-kurs"] = scene(`<div style="width:430px">
  <div style="position:relative;width:340px;margin:0 auto;padding:26px 28px 24px;background:linear-gradient(170deg,#fff6a8,#fbe96d);transform:rotate(-2deg);box-shadow:0 1px 1px rgba(0,0,0,.2),0 14px 18px -8px rgba(80,60,0,.45);color:#3b3300">
    <div style="position:absolute;left:50%;top:-10px;width:92px;height:22px;margin-left:-46px;background:rgba(255,255,255,.55);box-shadow:0 1px 2px rgba(0,0,0,.15);transform:rotate(2deg)"></div>
    <div style="font-size:22px;font-weight:700">Бърза сметка</div>
    <div class="ring" style="font-size:19px;margin:8px -8px 12px;padding:4px 8px;border-radius:10px;font-weight:600">1 € = 1,95583 лв ≈ 2 лв</div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px 10px;font-size:19px">${[[5, 10], [10, 20], [20, 39], [50, 98], [100, 196]].map(([e, l]) => `<span>${e} €</span><span>≈</span><span style="text-align:right">${l} лв</span>`).join("")}</div>
    <div style="font-size:14.5px;margin-top:14px;line-height:1.4">Груба сметка: лева ÷ 2 = евро</div></div>
  ${ft("Запомнете курса: 1 евро ≈ 1,96 лева. За груба сметка делете на две", "d", "50%", "0 auto 22px").replace("margin:0 auto 22px", "margin:0 auto;order:-1")}
  <div style="display:flex;justify-content:center;gap:18px;margin-top:26px;align-items:center">${coin("2e", "bg", { scale: 5 })}${coin("1e", "bg", { scale: 5 })}${coin("20c", "bg", { scale: 5 })}</div>
</div>`.replace('<div style="width:430px">', '<div style="width:430px;display:flex;flex-direction:column">'), { pad: 28 });

// money-limit-karta — дневен лимит на картата
const slider = (pct) => `<div style="position:relative;height:28px;margin-top:8px"><div style="position:absolute;left:0;right:0;top:12px;height:4px;border-radius:2px;background:#d7dce6"></div><div style="position:absolute;left:0;width:${pct}%;top:12px;height:4px;border-radius:2px;background:${G.navy}"></div><div style="position:absolute;left:calc(${pct}% - 12px);top:2px;width:24px;height:24px;border-radius:50%;background:${G.navy};box-shadow:0 1px 4px rgba(0,0,0,.35)"></div></div>`;
S["pari-limit-karta"] = bank("Лимити", `
  <div style="display:flex;align-items:center;gap:10px;padding:0 4px;font-size:14.5px;color:${G.sub}">${ic("credit_card", { color: G.navy })}Дебитна карта •••• 4821</div>
  <div class="ring" style="background:#fff;border-radius:18px;padding:14px 18px 16px;box-shadow:0 4px 14px -6px rgba(15,35,70,.2)"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:15px;color:${G.on}">Дневен лимит за теглене</span><b style="font-size:20px;color:${G.navy}">300 €</b></div>${slider(30)}<div style="display:flex;justify-content:space-between;font-size:12px;color:${G.gray};margin-top:2px"><span>0 €</span><span>1 000 €</span></div></div>
  ${card(`<div style="padding:14px 18px 16px"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:15px;color:${G.on}">Дневен лимит за плащане</span><b style="font-size:20px;color:${G.navy}">500 €</b></div>${slider(50)}<div style="display:flex;justify-content:space-between;font-size:12px;color:${G.gray};margin-top:2px"><span>0 €</span><span>1 000 €</span></div></div>`)}
  <div style="height:50px;border-radius:25px;background:${G.navy};color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:500">Запази</div>
`, bt("Задайте дневен лимит и натиснете „Запази“. Може да го промените после", 118));

// ═════════════════════════ ПАРИ, СМЕТКИ И ПРАВА ═════════════════════════
const sheetBox = (inner, tipHtml, o = {}) => scene(`<div style="display:flex;flex-direction:column;${o.css || ""}">${inner}${tipHtml}</div>`, { pad: 26 });
const chk = (on, t, sub = "") => `<div style="display:flex;gap:12px;align-items:flex-start;padding:7px 0"><div style="width:24px;height:24px;border:2px solid #4b5563;border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">${on ? ic("check", { size: 22, color: "#146c2e", weight: 700 }) : ""}</div><div><div style="font-size:16px">${t}</div>${sub ? `<div style="font-size:13px;color:#5f6368">${sub}</div>` : ""}</div></div>`;

// m-domakinski-byudzhet — тетрадка с месечен бюджет
S["pari-byudzhet"] = sheetBox(paper(`
  <div style="position:absolute;left:44px;top:0;bottom:0;border-left:1.5px solid #e7a3a3"></div>
  <div style="padding-left:34px;font-size:15.5px;line-height:28px">
  <div style="font-size:21px;font-weight:700">Бюджет — ноември</div>
  <div style="display:flex;justify-content:space-between"><b>Доходи</b><span></span></div>
  <div style="display:flex;justify-content:space-between"><span>Пенсия</span><span>326,31 €</span></div>
  <div style="display:flex;justify-content:space-between"><b>Разходи</b><span></span></div>
  ${[["Ток", "38,00"], ["Вода", "9,50"], ["Лекарства", "45,00"], ["Храна", "140,00"], ["За непредвидено", "20,00"]].map(([a, b]) => `<div style="display:flex;justify-content:space-between"><span>${a}</span><span>${b} €</span></div>`).join("")}
  <div style="display:flex;justify-content:space-between;border-top:1.5px solid #3a3f47"><span>Общо разходи</span><span>252,50 €</span></div>
  <div class="ring" style="display:flex;justify-content:space-between;font-weight:700;font-size:18px;border-radius:10px;padding:0 8px;margin:4px -8px 0"><span>Остава</span><span>73,81 €</span></div></div>`, { w: 440, pad: "26px 26px 28px 22px", css: "background:repeating-linear-gradient(180deg,transparent 0 27px,#d2e1f3 27px 28px),linear-gradient(180deg,#fefefd,#f7f7f3);background-position:0 12px,0 0;", rot: -.6 }),
  ft("Доходи минус разходи — това остава. Следете през месеца дали се вмествате", "d", "50%", "0 auto 16px").replace("margin:0 auto 16px", "margin:0 auto 16px;order:-1"), { css: "" }).replace('<div style="display:flex;flex-direction:column;">', '<div style="display:flex;flex-direction:column;">');

// m-saveti-pestene — списък за пазаруване в телефона
S["pari-spisak-pazar"] = ph(wrap(`
  <div style="height:60px;display:flex;align-items:center;padding:0 8px;gap:8px;flex-shrink:0"><span style="padding:8px;display:flex">${ic("arrow_back")}</span><div style="flex:1"></div>${ic("push_pin", { color: G.gray })}<span style="width:12px"></span>${ic("more_vert")}</div>
  <div style="margin:0 14px;padding:16px 18px;border-radius:18px;background:#fff8c9;box-shadow:0 1px 3px rgba(0,0,0,.18)">
    <div style="font-size:24px;font-weight:500;color:#1f1f1f">Списък за пазар</div>
    <div class="ring" style="margin:10px -8px 0;padding:4px 8px;border-radius:12px">${[["Хляб", 0], ["Прясно мляко", 0], ["Яйца", 0], ["Сирене", 0]].map(([t]) => `<div style="display:flex;gap:12px;align-items:center;padding:8px 0;font-size:18px;color:#1f1f1f"><div style="width:22px;height:22px;border:2px solid #5f6368;border-radius:4px"></div>${t}</div>`).join("")}</div>
    <div style="margin-top:6px">${[["Ябълки", 1], ["Сол", 1]].map(([t]) => `<div style="display:flex;gap:12px;align-items:center;padding:8px 0;font-size:18px;color:#6b6b6b;text-decoration:line-through"><div style="width:22px;height:22px;border-radius:4px;background:#5f6368;display:flex;align-items:center;justify-content:center">${ic("check", { size: 18, color: "#fff", weight: 700 })}</div>${t}</div>`).join("")}</div>
    <div style="margin-top:10px;font-size:14px;color:#6b6b6b">Около 12,00 € · само от списъка</div>
  </div>
  ${bt("Пазарувайте със списък, за да не купувате излишно", 50)}`), "#fff", "#1f1f1f");

// m-byrzi-krediti-kapan — реклама на „бърз кредит“ (измислена)
S["pari-barz-kredit"] = ph(site("ekspres-kredit.example", `
  <div style="height:300px;background:linear-gradient(160deg,#f97316,#dc2626);color:#fff;padding:22px 20px 0;position:relative">
    <div style="font-size:15px;font-weight:600;opacity:.95">ЕкспресКредит (пример)</div>
    <div style="font-size:33px;font-weight:800;line-height:1.1;margin-top:12px">Пари за 10 минути!<br>Без документи!</div>
    <div style="margin-top:16px;display:inline-flex;gap:10px;align-items:center;background:rgba(255,255,255,.18);border-radius:14px;padding:10px 14px"><span style="font-size:15px">Вземате</span><b style="font-size:26px">300 €</b></div>
    <div style="margin-top:16px;height:52px;border-radius:26px;background:#fff;color:#dc2626;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center">Искам пари сега</div></div>
  <div style="padding:16px 20px 0;font-size:11.5px;color:#6b7280;line-height:1.45">Връщате общо <b>412,00 €</b> за 30 дни. <span class="ring" style="display:inline-block;border-radius:6px;padding:1px 6px;margin:-1px -2px;font-weight:700;color:#1f1f1f">ГПР 1 460 %</span>. Таксата за разглеждане е включена. Дребният шрифт е част от договора.</div>
  ${bt("Гледайте общата сума за връщане и ГПР, не само вноската", 50)}${sample("Илюстрация: измислена реклама и примерни данни")}
`), "#fff", "#1f1f1f");

// m-kakvo-e-lihva — сравнение на две оферти по ГПР
S["pari-lihva-gpr"] = bank("Заем 1 000 €: две оферти", `
  <div style="font-size:14px;color:${G.sub};padding:0 4px;line-height:1.4">Лихвата е цената на заетите пари — връщате сумата плюс лихва.</div>
  ${[["Оферта А", "92,00 €", "12 месеца", "1 104,00 €", "11,8 %", 1], ["Оферта Б", "85,00 €", "18 месеца", "1 530,00 €", "29,7 %", 0]].map(([n, v, t, tot, gpr, g]) => card(`<div style="padding:12px 18px 8px"><div style="display:flex;justify-content:space-between;font-size:16px;font-weight:600;color:${G.on}"><span>${n}</span><span style="font-weight:400;font-size:14px;color:${G.gray}">${t}</span></div>${lbl("Месечна вноска", v)}${lbl("Общо за връщане", tot)}<div class="ring" style="border-radius:12px;margin:2px -8px 0;padding:0 8px">${lbl("ГПР", `<span style="color:${g ? G.grn : G.red}">${gpr}</span>`, { last: 1 })}</div></div>`)).join("")}
`, bt("Сравнявайте офертите по ГПР, не по вноската", 118));

// m-chete-smetka-tok — сметка за ток (хартия)
S["pari-smetka-tok"] = sheetBox(paper(`
  <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:18px;font-weight:700">Електроснабдяване „Пример“</div><div style="color:#5f6368;font-size:13px">Сметка за ток · клиентски № 1000 0000</div></div>${ic("bolt", { size: 34, color: "#d99a00", fill: 1 })}</div>
  ${rule()}
  <div class="ring" style="display:flex;justify-content:space-between;padding:4px 8px;margin:0 -8px;border-radius:10px"><span style="color:#5f6368">Период</span><b style="font-weight:500">01.09.2026 – 30.09.2026</b></div>
  <div style="display:grid;grid-template-columns:1fr auto;row-gap:5px;margin-top:8px"><span style="color:#5f6368">Показание — начало</span><span>12 480</span><span style="color:#5f6368">Показание — край</span><span>12 612</span></div>
  <div class="ring" style="display:flex;justify-content:space-between;padding:4px 8px;margin:8px -8px 0;border-radius:10px"><span style="color:#5f6368">Изразходвано</span><b style="font-weight:500">132 kWh</b></div>
  ${rule("#8b9099")}
  <div style="display:grid;grid-template-columns:1fr auto;row-gap:4px"><span>Стари задължения</span><span>0,00 €</span></div>
  <div class="ring" style="display:flex;justify-content:space-between;align-items:center;font-size:18px;font-weight:700;padding:5px 8px;margin:8px -8px 0;border-radius:10px"><span>Сума за плащане</span><span>24,85 €</span></div>
  <div style="margin-top:8px;font-size:13.5px">Краен срок за плащане: <b>15.11.2026</b></div>`, { w: 460, rot: .5 }),
  ft("Прочетете по ред: период, изразходено, сума и краен срок. Сравнете с предишни месеци", "u", "50%", "18px auto 0"));

// m-nenuzhni-abonamenti — абонаменти в магазина за приложения
S["pari-abonamenti"] = ph(wrap(`
  <div style="height:60px;display:flex;align-items:center;padding:0 8px;gap:8px;flex-shrink:0"><span style="padding:8px;display:flex">${ic("arrow_back")}</span><div style="flex:1;font-size:20px;font-weight:500;color:#1f1f1f">Абонаменти</div></div>
  <div style="padding:2px 18px 8px;font-size:14px;color:${G.gray}">Активни</div>
  ${[["music_note", "#e8710a", "Музикално приложение", "4,99 € на месец", "Поднови на 3 ноем.", 0], ["tv", "#a142f4", "ТВ пакет Плюс", "12,90 € на месец", "Безплатният пробен период свърши", 1], ["fitness_center", "#188038", "Приложение за тренировки", "2,49 € на месец", "Поднови на 21 ноем.", 0]].map(([n, c, t, p, s, hl]) => `<div class="${hl ? "ring" : ""}" style="margin:4px 14px;padding:12px 12px;border-radius:16px;background:#fff;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)"><div style="width:48px;height:48px;border-radius:12px;background:${c};display:flex;align-items:center;justify-content:center">${ic(n, { color: "#fff", fill: 1, size: 26 })}</div><div style="flex:1"><div style="font-size:16px;color:#1f1f1f">${t}</div><div style="font-size:13px;color:${G.gray}">${p}</div><div style="font-size:12px;color:${G.gray}">${s}</div></div>${hl ? `<div style="height:34px;padding:0 14px;border-radius:17px;background:#0b57d0;color:#fff;font-size:13.5px;display:flex;align-items:center">Откажи</div>` : ""}</div>`).join("")}
  ${bt("Проверете абонаментите и откажете тези, които не ползвате", 50)}${sample()}`), "#f1f3f8", "#1f1f1f");

// m-nadplaten-prava — писмена рекламация
S["pari-reklamatsia"] = sheetBox(paper(`
  <div style="font-size:13px;color:#5f6368;text-align:right">гр. Бобов дол, 30.10.2026 г.</div>
  <div style="margin-top:8px">До търговеца<br><b>Онлайн магазин „Пример“</b></div>
  <div style="font-size:19px;font-weight:700;margin:14px 0 8px">Относно: надплатена сума</div>
  <div style="font-size:14.5px;line-height:1.55">На 27.10.2026 г. закупих стока за 14,90 €, а от картата ми са удържани 34,90 €.</div>
  <div class="ring" style="font-size:15px;line-height:1.5;margin:10px -8px;padding:6px 8px;border-radius:10px;font-weight:500">Моля да ми върнете разликата от 20,00 € по сметката ми до 14 дни.</div>
  <div style="font-size:13.5px;color:#4b5563">Прилагам: касова бележка, извлечение от сметката.</div>
  <div style="margin-top:16px;display:flex;justify-content:space-between;font-size:14px"><span>С уважение: Иван Петров</span><span style="display:block;width:110px;border-bottom:1.5px solid #3a3f47;height:22px"></span></div>`, { w: 470, rot: -.5 }),
  ft("Поискайте връщане писмено и пазете бележките. Ако откажат — жалба до КЗП", "u", "50%", "18px auto 0"));

// m-spestiavane-banka — условия на спестовна сметка (листовка на банка)
S["pari-spestyavane-nova"] = sheetBox(paper(`
  <div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:20px;font-weight:700;color:#173f74">Спестовна сметка</div><div style="color:#5f6368;font-size:13px">ПримерБанк · условия (примерен документ)</div></div>${ic("savings", { size: 36, color: "#173f74", fill: 1 })}</div>
  ${rule()}
  <div class="ring" style="display:flex;justify-content:space-between;padding:5px 8px;margin:0 -8px;border-radius:10px;font-size:16px"><span>Лихва</span><b>1,60 % годишно</b></div>
  <div style="display:grid;grid-template-columns:1fr auto;row-gap:7px;margin-top:8px;font-size:15px"><span style="color:#5f6368">Минимална сума</span><span>50,00 €</span><span style="color:#5f6368">Такса за откриване</span><span>0,00 €</span><span style="color:#5f6368">Теглене</span><span>по всяко време</span></div>
  ${rule()}
  <div style="font-size:13.5px;color:#374151;line-height:1.45;display:flex;gap:8px">${ic("verified_user", { size: 20, color: "#146c2e" })}<span>Влоговете в банките са гарантирани от държавата до определена сума на човек.</span></div>
  <div style="font-size:12.5px;color:#5f6368;margin-top:8px">За откриване носете лична карта.</div>`, { w: 460, rot: .5 }),
  ft("Питайте за лихвата и условията, преди да подпишете. Пазете документите", "u", "50%", "18px auto 0"));

// m-zaveshtanie-pulnomoshtno — пълномощно и саморъчно завещание
const SER = "'DejaVu Serif','Noto Serif',serif";
S["pari-pulnomoshtno"] = scene(`<div style="display:flex;flex-direction:column;align-items:center"><div style="display:flex;gap:18px;align-items:flex-start">
  ${paper(`<div style="font-size:19px;font-weight:700;text-align:center;letter-spacing:.5px">ПЪЛНОМОЩНО</div><div style="font-size:13.5px;line-height:1.55;margin-top:10px">Долуподписаният <b>Иван Петров</b> упълномощавам <b>Мария Георгиева</b>
  <span class="ring" style="display:inline;border-radius:6px;padding:0 4px;box-decoration-break:clone">да получава от мое име пенсията ми от пощата</span> за срок от една година.</div>
  <div style="margin-top:14px;font-size:12.5px;color:#5f6368">Дата: 30.10.2026</div><div style="margin-top:18px;display:flex;justify-content:flex-end"><span style="width:110px;border-bottom:1.5px solid #3a3f47;height:20px"></span></div>
  <div style="margin-top:14px;border:1.5px dashed #9aa0a8;border-radius:6px;padding:8px;font-size:12px;color:#5f6368;text-align:center">Нотариална заверка<br>(при важни случаи)</div>`, { w: 300, pad: "22px 22px 22px", rot: -1 })}
  ${paper(`<div style="font-size:19px;font-weight:700;text-align:center;letter-spacing:.5px">ЗАВЕЩАНИЕ</div><div style="font-family:${SER};font-style:italic;font-size:15px;line-height:1.75;margin-top:10px;color:#1e2a4a">Аз, Иван Петров, завещавам апартамента си на дъщеря ми Мария Петрова.</div>
  <div style="margin-top:12px;font-size:12.5px;color:#5f6368">Цялото — на ръка, с дата и подпис</div>
  <div style="margin-top:14px;font-family:${SER};font-style:italic;font-size:14px;color:#1e2a4a">30 октомври 2026 г.</div><div style="margin-top:14px;display:flex;justify-content:flex-end"><span style="width:110px;border-bottom:1.5px solid #3a3f47;height:20px"></span></div>`, { w: 300, pad: "22px 22px 22px", rot: 1.2, css: "margin-top:10px" })}
  </div>${ft("Пълномощно: ясно кой, на кого и за какво. Завещание: на ръка, с дата и подпис. За важните неща — при нотариус", "u", "50%", "20px auto 0")}</div>`, { pad: 26 });

// m-chete-dogovor — договор с дребен шрифт
S["pari-dogovor"] = sheetBox(paper(`
  <div style="font-size:19px;font-weight:700;text-align:center">ДОГОВОР ЗА УСЛУГА</div><div style="text-align:center;color:#5f6368;font-size:12.5px">примерен документ</div>
  ${rule()}
  <div style="font-size:14px;line-height:1.5"><b>Чл. 1.</b> Доставчикът предоставя услугата срещу месечна цена <b>19,90 €</b>.<br><b>Чл. 2.</b> Договорът е със срок 24 месеца.</div>
  <div class="ring" style="font-size:10px;line-height:1.35;color:#4b5563;margin:10px -8px 0;padding:6px 8px;border-radius:10px"><b>Чл. 7.</b> При предсрочно прекратяване потребителят дължи неустойка в размер на 45,00 € за всеки оставащ месец. Договорът се подновява автоматично за нови 24 месеца, ако не бъде прекратен писмено един месец преди изтичането на срока.</div>
  <div style="font-size:14px;line-height:1.5;margin-top:10px"><b>Чл. 8.</b> Спорове се решават по взаимно съгласие.</div>
  <div style="display:flex;justify-content:space-between;margin-top:18px;font-size:13px;color:#5f6368"><span>Доставчик: ${ph_(90)}</span><span>Потребител: ${ph_(90)}</span></div>`, { w: 460, rot: -.5 }),
  ft("Прочетете целия договор, особено дребния шрифт — таксите, срока и какво става при отказ", "u", "50%", "18px auto 0"));

// m-pazia-egn — непознат иска снимка на личната карта и ЕГН
S["pari-egn-chat"] = sms("+359 899 123 456", [
  { html: "Здравейте! Обаждаме се от „общината“. Изпратете ни снимка на личната си карта и ЕГН-то си, за да проверим помощта Ви.", ring: 1 },
], bt("Не диктувайте ЕГН и не пращайте снимка на личната карта на непознати", 74, "max-width:340px"));

// m-darenie-vnimanie — дарение с натиск
S["pari-darenie"] = ph(site("pomogni-sega.example", `
  <div style="height:170px;background:linear-gradient(160deg,#7c3aed,#4c1d95);color:#fff;padding:20px 20px 0"><div style="font-size:15px;opacity:.9">Помогни сега (пример)</div><div style="font-size:27px;font-weight:800;line-height:1.15;margin-top:8px">Дари веднага — всяка минута е важна!</div></div>
  <div style="padding:14px 18px 0"><div class="ring" style="display:inline-flex;gap:8px;align-items:center;background:#fee2e2;color:#991b1b;border-radius:12px;padding:8px 14px;font-weight:700;font-size:16px">${ic("timer", { size: 22, color: "#991b1b" })}Остават 09:42 минути</div>
    <div style="display:flex;gap:10px;margin-top:14px">${["10 €", "20 €", "50 €"].map((v, i) => `<div style="flex:1;height:50px;border-radius:12px;border:2px solid ${i === 1 ? "#7c3aed" : "#d1d5db"};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;color:#1f1f1f">${v}</div>`).join("")}</div>
    <div style="margin-top:12px;height:50px;border-radius:12px;background:#f3f4f6;display:flex;align-items:center;padding:0 14px;color:#6b7280;font-size:15px">Номер на карта</div></div>
  ${bt("Не се поддавайте на натиск „дари веднага“ — първо проверете каузата и сметката", 50)}${sample("Илюстрация: измислена страница и примерни данни")}
`), "#fff", "#1f1f1f");

// m-nasledstvo-stapki — удостоверение за наследници (образец)
S["pari-nasledstvo"] = sheetBox(paper(`
  <div style="font-size:13px;color:#5f6368">Община „Примерна“ · образец</div>
  <div style="font-size:19px;font-weight:700;margin:6px 0 4px">УДОСТОВЕРЕНИЕ ЗА НАСЛЕДНИЦИ</div>
  ${rule()}
  <div style="font-size:14.5px;line-height:1.55">Удостоверява се, че наследници на <b>Петър Иванов</b>, починал на 03.10.2026 г., са:</div>
  <div style="margin:8px 0 0;font-size:14.5px;line-height:1.7">1. Мария Петрова — съпруга<br>2. Георги Петров — син<br>3. Анна Петрова — дъщеря</div>
  ${rule()}
  <div style="font-size:12.5px;color:#5f6368">Издава се за нуждите на банка, НОИ и нотариус.</div>
  <div style="margin-top:12px;display:flex;justify-content:flex-end"><div class="ring" style="width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#6b7280;text-align:center">място за<br>печат</div></div>`, { w: 460, rot: .4 }),
  ft("Извадете удостоверение за наследници от общината и пазете всички документи. За имоти питайте нотариус", "u", "50%", "18px auto 0"));

// m-prava-pacient — табло с правата
S["pari-prava-pacient"] = sheetBox(`<div style="position:relative;width:470px;padding:22px 26px 24px;background:linear-gradient(180deg,#fdfdfb,#f3f3ee);border-radius:6px;box-shadow:0 1px 1px rgba(0,0,0,.2),0 16px 26px -10px rgba(15,23,42,.38)">
  <i style="position:absolute;left:50%;top:-8px;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ff8a80,#c62828);box-shadow:0 3px 4px rgba(0,0,0,.4)"></i>
  <div style="font-size:21px;font-weight:700;color:#173f74;margin-bottom:8px">Правата ми като пациент</div>
  ${[["info", "Да разбера диагнозата и лечението на разбираем език"], ["person_search", "Да избера личен лекар и да го сменя веднъж годишно"], ["folder_shared", "Достъп до здравното ми досие"], ["do_not_disturb_on", "Да откажа лечение (информирано)"], ["support_agent", "При проблем — към НЗОК или лечебното заведение"]].map(([n, t]) => `<div style="display:flex;gap:14px;align-items:center;padding:8px 0;border-top:1px solid #e2e5ea"><div style="width:40px;height:40px;border-radius:50%;background:#e3ecfb;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(n, { color: "#173f74", size: 22 })}</div><div style="font-size:15px;line-height:1.35">${t}</div></div>`).join("")}</div>`,
  ft("На преглед носете документите и списъка с лекарства", "u", "50%", "18px auto 0"));

// ═════════════════════════ ПЕНСИИ И СОЦИАЛНИ ПОМОЩИ ═════════════════════════

// pn-pomosht-otoplenie — молба-декларация (измислен образец)
S["pari-otoplenie-molba"] = sheetBox(paper(`
  ${SAMPLE_STAMP("ОБРАЗЕЦ", "top:50px")}
  <div style="font-size:13px;color:#5f6368">До директора на Дирекция „Социално подпомагане“</div>
  <div style="font-size:18px;font-weight:700;margin:8px 0 2px">МОЛБА-ДЕКЛАРАЦИЯ</div><div style="font-size:14px;margin-bottom:6px">за целева помощ за отопление</div>
  ${rule()}
  <div style="display:grid;grid-template-columns:120px 1fr;row-gap:8px;font-size:14px;align-items:baseline"><span style="color:#5f6368">Име</span><span>Иван Петров</span><span style="color:#5f6368">Адрес</span><span>гр. Бобов дол, ул. „Примерна“ 12</span><span style="color:#5f6368">Вид отопление</span><span>☑ електричество &nbsp;☐ дърва &nbsp;☐ ТЕЦ</span></div>
  <div class="ring" style="display:flex;justify-content:space-between;padding:5px 8px;margin:10px -8px 0;border-radius:10px;font-size:14.5px"><span>Месечен доход (пенсия)</span><b>326,31 €</b></div>
  <div style="margin-top:12px;font-size:12.5px;color:#5f6368">Лична карта и документ за доходите се прилагат.</div>
  <div style="margin-top:16px;display:flex;justify-content:space-between;font-size:13px;color:#5f6368"><span>Дата: 30.10.2026</span><span>Подпис: ${ph_(90)}</span></div>`, { w: 470, rot: -.5 }),
  ft("Попълнете молбата-декларация и я подайте в срока (обикновено до 31 октомври). Служителите помагат", "u", "50%", "18px auto 0"));

// pn-telk — направление към ТЕЛК (образец)
S["pari-telk-napravlenie"] = sheetBox(paper(`
  ${SAMPLE_STAMP("ОБРАЗЕЦ", "top:44px")}
  <div style="font-size:13px;color:#5f6368">Амбулатория за първична медицинска помощ (пример)</div>
  <div style="font-size:19px;font-weight:700;margin:8px 0 2px">НАПРАВЛЕНИЕ</div><div class="ring" style="display:inline-block;border-radius:8px;padding:1px 8px;margin:2px -8px 6px;font-size:16px;font-weight:600">за ТЕЛК</div>
  ${rule()}
  <div style="display:grid;grid-template-columns:120px 1fr;row-gap:8px;font-size:14px;align-items:baseline"><span style="color:#5f6368">Пациент</span><span>Иван Петров</span><span style="color:#5f6368">Дата</span><span>30.10.2026</span><span style="color:#5f6368">Прилага</span><span>медицински документи и изследвания</span></div>
  <div style="margin-top:14px;font-size:13px;color:#4b5563;line-height:1.45">Пациентът се насочва към ТЕЛК за определяне на степен на увреждане.</div>
  <div style="margin-top:16px;display:flex;justify-content:space-between;font-size:13px;color:#5f6368"><span>Личен лекар</span><span>Подпис и печат: ${ph_(80)}</span></div>`, { w: 460, rot: .5 }),
  ft("Поискайте направление от личния лекар и съберете медицинските си документи", "u", "50%", "18px auto 0"));

// изходящо обаждане
const outgoing = (name, sub, tipHtml) => ph(bleed(`
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,#2a2f3a,#14171d)"></div>
  <div style="position:relative;margin-top:110px;text-align:center;color:#fff"><div style="font-size:15px;color:#c9ced8">Набиране…</div>
    <div style="width:104px;height:104px;border-radius:50%;background:#1a73e8;margin:26px auto 18px;display:flex;align-items:center;justify-content:center">${ic("support_agent", { fill: 1, size: 56, color: "#fff" })}</div>
    <div style="font-size:28px;line-height:1.2;padding:0 24px">${name}</div><div style="font-size:16px;color:#c9ced8;margin-top:8px">${sub}</div></div>
  <div style="position:absolute;left:0;right:0;bottom:70px;display:flex;justify-content:center"><div style="width:76px;height:76px;border-radius:50%;background:#d93025;display:flex;align-items:center;justify-content:center">${ic("call_end", { fill: 1, color: "#fff", size: 36 })}</div></div>${tipHtml}`), "#14171d", "#ffffff");

S["pari-patronazh-obazhdane"] = outgoing("Социален патронаж", "Общинска администрация", tip("Обадете се в общината или в Социално подпомагане и питайте за условията и цената", "left:50%;top:60px;transform:translateX(-50%);width:max-content;max-width:330px"));
S["pari-noi-obazhdane"] = outgoing("НОИ", "0700 14 802", tip("Обадете се на НОИ и питайте за какви добавки към пенсията имате право", "left:50%;top:60px;transform:translateX(-50%);width:max-content;max-width:330px"));

// pn-dokumenti-socialna-pomosht — списък с документи
S["pari-dokumenti-spisak"] = sheetBox(paper(`
  <div style="font-size:20px;font-weight:700;color:#173f74">Документи за социална помощ</div>${rule()}
  ${chk(1, "Лична карта", "валидна")}${chk(1, "Документ за доходите", "пенсия и други")}${chk(1, "Молба-декларация", "попълва се на място — помагат")}${chk(0, "Решение на ТЕЛК", "само ако имате")}`, { w: 440, rot: -.6 }),
  ft("Обадете се преди да тръгнете, за да не липсва документ", "u", "50%", "18px auto 0"));

// pn-kade-da-pitam — контакти
S["pari-kontakti-pensii"] = ph(wrap(`
  <div style="margin:10px 16px 6px;height:52px;border-radius:26px;background:#e9eef6;display:flex;align-items:center;padding:0 16px;gap:14px;flex-shrink:0">${ic("search", { color: G.sub })}<span style="font-size:16px;color:${G.sub}">Търсене в контактите</span></div>
  <div style="padding:10px 20px 4px;font-size:14px;color:${G.gray}">Често търсени</div>
  ${[["НОИ", "Пенсии и обезщетения · 0700 14 802", "#1a73e8", 1], ["Социално подпомагане", "Помощ за отопление и социални помощи", "#188038", 0], ["Община Бобов дол", "Общинска администрация", "#e8710a", 0]].map(([n, s, c, hl]) => `<div class="${hl ? "ring" : ""}" style="display:flex;align-items:center;gap:14px;padding:10px 16px;margin:2px 8px;${hl ? "border-radius:16px;" : ""}"><div style="width:46px;height:46px;border-radius:50%;background:${c};color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center">${n[0]}</div><div style="flex:1"><div style="font-size:17px;color:#1f1f1f">${n}</div><div style="font-size:13px;color:${G.gray}">${s}</div></div><div style="width:42px;height:42px;border-radius:50%;background:#e6f4ea;display:flex;align-items:center;justify-content:center">${ic("call", { fill: 1, color: "#188038", size: 22 })}</div></div>`).join("")}
  ${bt("Пенсии — НОИ. Помощи и отопление — Социално подпомагане. Точните местни телефони са в „Услуги и телефони“", 50, "max-width:340px")}${sample()}`), "#fff", "#1f1f1f");
render(S).catch((e) => { console.error(e); process.exit(1); });
