// „Допълнителни“ екрани за ръководствата „Как да…“ — фотореалистични пресъздавания на
// истинските приложения: Телефон/Контакти/Съобщения/Gmail (Google), банкомат и ПОС (твърди
// устройства), настройки (Samsung One UI), Gboard, Chrome, YouTube, Карти (плочки на OpenStreetMap),
// Времето, Часовник, Калкулатор, Камера и Галерия (снимки CC0). Уеб страниците на институциите са
// ИЗМИСЛЕН дизайн с ясно примерни данни (не копират официален сайт, без гербове/лога).
// Активи: scripts/howto-mockups/assets/more/ · източници и лицензи: assets/credits/more.md
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-more.js   (ONLY=име1,име2 за избрани)
const path = require("node:path");
const QRCode = require("qrcode"); // зависимост на проекта; тук само чертае примерен QR код
const { phone, scene, tip: _tip, render, ms, photo, ASSETS, toggle } = require("./_shell");
// червените бележки по центъра не се пренасят на два реда заради тясна ширина
const tip = (t, css = "", o) => _tip(t, /left:50%/.test(css) && !/width/.test(css) ? css + ";width:max-content" : css, o);

const MORE = path.join(ASSETS, "more");
const img = (f, o = {}) => photo(path.join(MORE, f), o);
const mp = (f) => "file://" + path.join(MORE, f);
const S = {};

// ───────────────────────── Общи градивни елементи ─────────────────────────
const ic = (n, o = {}) => ms(n, { size: 24, ...o });
const wrap = (inner, o = {}) =>
  `<div style="height:${o.h || 660}px;display:flex;flex-direction:column;position:relative;overflow:hidden;${o.css || ""}">${inner}</div>`;
// екран под лентата за състоянието (карти, видео, тапет)
const bleed = (inner, o = {}) =>
  `<div style="margin-top:-38px;height:${o.h || 698}px;display:flex;flex-direction:column;position:relative;overflow:hidden;${o.css || ""}">${inner}</div>`;
// добавя елементи към корпуса на телефона (страничните бутони) и разширява сцената вдясно
const withSide = (html, extra, pad = 120) =>
  html.replace("</div></div></div></div></body>", `</div></div>${extra}</div></div></body>`).replace("</style>", `.stage{padding-right:${pad}px}</style>`);
const ph = (inner, bg = "#fff", sc = "#1f1f1f", o) => phone(inner, bg, sc, o);

const G = { on: "#1f1f1f", sub: "#444746", gray: "#5f6368", pri: "#0b57d0", priC: "#d3e3fd", sc: "#f0f4f9", pill: "#e9eef6", line: "#e3e3e3", red: "#b3261e", grn: "#146c2e" };
const PAL = ["#1a73e8", "#e8710a", "#a142f4", "#188038", "#d93025", "#12a4af", "#c2185b", "#5f6368", "#7b5ea7"];
const letter = (t, c, s = 40, fs) =>
  `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-size:${fs || Math.round(s * 0.45)}px;font-weight:400;flex-shrink:0">${t}</div>`;
const ringBox = (css = "") => `<div class="ring" style="position:absolute;${css}"></div>`;
const spacer = `<div style="flex:1;min-height:0"></div>`;

// Material 3 долна навигация (Телефон/Контакти)
function navM3(items, active) {
  return `<div style="height:80px;background:${G.sc};display:flex;align-items:flex-start;padding-top:12px;flex-shrink:0">${items
    .map(([n, l], i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:64px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;${i === active ? `background:${G.priC}` : ""}">${ic(n, { fill: i === active ? 1 : 0, color: i === active ? "#041e49" : G.sub })}</div><div style="font-size:12px;font-weight:${i === active ? 600 : 500};color:${i === active ? G.on : G.sub}">${l}</div></div>`)
    .join("")}</div>`;
}
const fabDial = (css = "right:16px;bottom:96px") =>
  `<div style="position:absolute;${css};width:64px;height:64px;border-radius:20px;background:#c2e7ff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2),0 6px 12px rgba(0,0,0,.12)">${ic("dialpad", { fill: 1, size: 28, color: "#001d35" })}</div>`;
const searchPill = (text, left = "search", right = "") =>
  `<div style="margin:8px 16px;height:52px;border-radius:26px;background:${G.pill};display:flex;align-items:center;padding:0 16px;gap:14px;flex-shrink:0">${ic(left, { color: G.sub })}<span style="flex:1;font-size:16px;color:${G.sub}">${text}</span>${right}</div>`;

// ───────────────────────── Gboard (български, БДС) ─────────────────────────
// o: {hl: 'globe'|'123'|'mic'|'enter', typed:'', tool:true, lang}
function gboard(o = {}) {
  const { hl = "", tool = true, lang = "Български", enter = "keyboard_return" } = o;
  const key = (c, x = "") => `<div style="flex:1;height:46px;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:21px;color:#1f1f1f;${x}">${c}</div>`;
  const fn = (inner, flex = 1.45, h = "", x = "") => `<div class="${h ? "ring" : ""}" style="flex:${flex};height:46px;border-radius:${h ? 12 : 9}px;background:#d6dde8;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500;color:#1f1f1f;${x}">${inner}</div>`;
  const rows = [
    "у е и ш щ к с д з ц".split(" "),
    "ь я а о ж г т н в м ч".split(" "),
    "ю й ъ э ф х п р л б".split(" "),
  ];
  const row = (cells, pad = 0) => `<div style="display:flex;gap:5px;margin-bottom:9px;padding:0 ${pad}px">${cells}</div>`;
  const toolbar = tool
    ? `<div style="height:46px;display:flex;align-items:center;padding:0 8px;gap:2px">${["widgets", "sentiment_satisfied", "gif_box", "content_paste", "settings"].map((n) => `<div style="width:44px;display:flex;justify-content:center">${ic(n, { color: G.sub, size: 23 })}</div>`).join("")}<div style="flex:1"></div><div class="${hl === "mic" ? "ring" : ""}" style="width:44px;height:36px;border-radius:12px;display:flex;justify-content:center;align-items:center">${ic("mic", { color: G.sub, size: 24 })}</div></div>`
    : "";
  return `<div style="background:#e8ecf2;padding:0 4px 4px;flex-shrink:0">${toolbar}
    ${row(rows[0].map((k) => key(k)).join(""), 0)}
    ${row(rows[1].map((k) => key(k)).join(""), 0)}
    ${row(fn(ic("shift", { size: 22 }) , 1.5) + rows[2].map((k) => key(k)).join("") + fn(ic("backspace", { size: 22 }), 1.5), 0)}
    <div style="display:flex;gap:5px;margin-bottom:2px">
      ${fn("?123", 1.6, hl === "123" ? 1 : 0)}
      ${key(",", "flex:.9;background:#d6dde8;")}
      ${fn(ic("language", { size: 22 }), 1, hl === "globe" ? 1 : 0)}
      <div style="flex:5;height:46px;border-radius:9px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;color:${G.gray}">${lang}</div>
      ${key(".", "flex:.9;background:#d6dde8;")}
      <div class="${hl === "enter" ? "ring" : ""}" style="flex:1.6;height:46px;border-radius:${hl === "enter" ? 12 : 23}px;background:#c2e7ff;display:flex;align-items:center;justify-content:center">${ic(enter, { size: 24, color: "#001d35" })}</div>
    </div></div>`;
}
const gboardNum = () => ""; // не се ползва

// ───────────────────────── Chrome ─────────────────────────
function chromeBar(url, o = {}) {
  const { secure = true, ring = "", lockRing = false, focus = false, tabs = 3, typed } = o;
  const urlHtml = typed != null
    ? `<span style="flex:1;font-size:16px;color:#1f1f1f">${typed}<span style="display:inline-block;width:1.5px;height:20px;background:#0b57d0;vertical-align:middle;margin-left:1px"></span></span>${ic("close", { size: 20, color: G.sub })}`
    : `<span style="flex:1;font-size:15px;color:#1f1f1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${url}</span>`;
  const lead = typed != null ? ic("search", { size: 20, color: G.sub }) : `<span class="${lockRing ? "ring ringr" : ""}" style="display:flex;padding:3px;margin:-3px">${ic(secure ? "lock" : "warning", { size: 17, fill: 1, color: secure ? "#146c2e" : "#b3261e" })}</span>`;
  return `<div style="background:#fff;padding:6px 12px 8px;display:flex;align-items:center;gap:8px;flex-shrink:0">
    <div class="${ring}" style="flex:1;height:44px;border-radius:22px;background:${G.sc};display:flex;align-items:center;padding:0 14px;gap:9px;${focus ? "box-shadow:inset 0 0 0 2px #0b57d0;background:#fff;" : ""}">${lead}${urlHtml}</div>
    ${typed != null ? "" : `<div style="width:34px;height:34px;border-radius:8px;border:2px solid #444746;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#1f1f1f;margin:0 2px">${tabs}</div>${ic("more_vert", { color: G.sub })}`}
  </div>`;
}

// ═══════════ ГРУПА 1 — ОБЩУВАНЕ ═══════════

// Входящо обаждане (Samsung One UI)
S["call-incoming"] = ph(wrap(`
  <div style="position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 0%,#39414f 0%,#1d222b 55%,#0e1116 100%)"></div>
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;height:100%;color:#fff">
    <div style="margin-top:62px;font-size:34px;font-weight:400;letter-spacing:-.2px">Мария Петрова</div>
    <div style="font-size:17px;color:#c5cad3;margin-top:6px">Мобилен 0888 123 456</div>
    <div style="margin-top:46px">${letter("М", "#6d7f9c", 132, 62)}</div>
    ${spacer}
    <div style="display:flex;align-items:center;gap:7px;color:#d7dbe2;font-size:14px;margin-bottom:34px;padding:9px 18px;border-radius:20px;background:rgba(255,255,255,.1)">${ic("chat", { size: 18, fill: 1 })} Изпращане на съобщение</div>
    <div style="display:flex;gap:92px;margin-bottom:44px">
      <div style="text-align:center"><div class="ring ringr" style="width:78px;height:78px;border-radius:50%;background:#2fc25b;display:flex;align-items:center;justify-content:center">${ic("call", { size: 36, fill: 1, color: "#fff" })}</div><div style="font-size:14px;margin-top:10px">Приеми</div></div>
      <div style="text-align:center"><div style="width:78px;height:78px;border-radius:50%;background:#f0443a;display:flex;align-items:center;justify-content:center">${ic("call_end", { size: 36, fill: 1, color: "#fff" })}</div><div style="font-size:14px;margin-top:10px">Откажи</div></div>
    </div>
  </div>
  ${tip("Зелено — приемане на обаждането.<br>Червено — отказ", "left:50%;bottom:250px;transform:translateX(-50%)")}
`), "#0e1116", "#ffffff");

// Нов контакт (Google Контакти)
S["contact-new"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:64px;padding:0 8px 0 16px;flex-shrink:0">${ic("close", { color: G.on })}<div style="flex:1"></div><div class="ring" style="height:40px;padding:0 24px;border-radius:20px;background:${G.pri};color:#fff;font-size:15px;font-weight:500;display:flex;align-items:center;margin-right:8px">Запази</div></div>
  <div style="display:flex;flex-direction:column;align-items:center;padding:6px 0 20px">
    <div style="width:96px;height:96px;border-radius:50%;background:#e9eef6;display:flex;align-items:center;justify-content:center">${ic("add_a_photo", { size: 38, color: G.pri, fill: 1 })}</div>
    <div style="color:${G.pri};font-size:15px;font-weight:500;margin-top:10px">Добавяне на снимка</div>
  </div>
  <div style="padding:0 16px;display:flex;flex-direction:column;gap:12px">
    ${[["person", "Име", "Мария"], ["", "Фамилия", "Петрова"], ["business", "Фирма", ""], ["call", "Телефон", "0888 123 456"], ["mail", "Имейл", ""]].map(([n, l, v], i) => `<div style="display:flex;align-items:center;gap:16px"><div style="width:24px">${n ? ic(n, { color: G.gray }) : ""}</div><div style="flex:1;height:56px;border-radius:4px;border:${v ? "2px solid " + G.pri : "1px solid #79747e"};position:relative;display:flex;align-items:center;padding:0 14px;font-size:16px;color:${G.on}">${v ? `<span style="position:absolute;top:-9px;left:10px;background:#fff;padding:0 4px;font-size:12px;color:${i === 3 ? G.pri : G.gray}">${l}</span>${v}` : `<span style="color:${G.gray}">${l}</span>`}</div></div>`).join("")}
  </div>
  ${spacer}
  ${tip("Въведете име и телефон,<br>после натиснете „Запази“", "left:50%;bottom:36px;transform:translateX(-50%)")}
`), "#fff");

// Избиране на запис в контакти (Google Телефон)
S["dial-contact"] = ph(wrap(`
  ${searchPill("Търсене на контакти", "search", letter("С", "#a142f4", 32, 15))}
  <div style="flex:1;min-height:0;overflow:hidden;padding-top:4px">
    ${[["Б", "#d93025", [["Боряна Христова", "#e52592"]]], ["Г", "#188038", [["Георги Петров", "#12a4af"]]], ["М", "#1a73e8", [["Мария Петрова", "#a142f4", 1], ["Михаил Стоянов", "#e8710a"]]], ["П", "#5f6368", [["Петър Георгиев", "#188038"]]], ["Т", "#5f6368", [["Теодора Иванова", "#1a73e8"]]]].map(([l, , list]) => list.map(([n, c, hl], i) => `<div style="display:flex;align-items:center;height:64px;padding:0 16px;gap:0;position:relative"><div style="width:44px;font-size:18px;color:${G.pri};font-weight:500">${i === 0 ? l : ""}</div>${letter(n[0], c, 40, 18)}<div style="margin-left:16px;font-size:16px;color:${G.on}">${n}</div>${hl ? `<div class="ring" style="position:absolute;left:8px;right:8px;top:3px;bottom:3px;border-radius:12px"></div>` : ""}</div>`).join("")).join("")}
  </div>
  ${navM3([["star", "Любими"], ["schedule", "Скорошни"], ["contacts", "Контакти"], ["dialpad", "Клавиатура"]], 2)}
  ${tip("Докоснете името,<br>после слушалката", "right:12px;top:318px")}
`), G.sc);

// Ново съобщение (Google Съобщения) + клавиатура
S["sms-new"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:64px;padding:0 4px;gap:6px;flex-shrink:0">${ic("arrow_back", { color: G.on })}<div style="margin-left:4px">${letter("М", "#a142f4", 36, 17)}</div><div style="flex:1;font-size:19px;color:${G.on};margin-left:8px">Мария Петрова</div>${ic("videocam", { color: G.on })}<span style="width:6px"></span>${ic("call", { color: G.on })}<span style="width:6px"></span>${ic("more_vert", { color: G.on })}</div>
  <div style="flex:1;min-height:0;padding:10px 14px;display:flex;flex-direction:column;gap:6px;overflow:hidden">
    <div style="align-self:center;font-size:12px;color:${G.gray};margin:6px 0">Днес · 13:05</div>
    <div style="align-self:flex-start;max-width:72%;background:${G.pill};padding:10px 14px;border-radius:20px 20px 20px 6px;font-size:16px;color:${G.on}">Идваш ли днес на гости?</div>
    <div style="align-self:flex-end;max-width:72%;background:${G.pri};padding:10px 14px;border-radius:20px 20px 6px 20px;font-size:16px;color:#fff">Да, към 15 ч.</div>
    <div style="align-self:flex-end;font-size:11px;color:${G.gray};margin-top:-2px">13:07 · SMS</div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;padding:6px 10px 8px;flex-shrink:0">
    <div style="width:42px;height:42px;border-radius:50%;background:${G.pill};display:flex;align-items:center;justify-content:center">${ic("add", { color: G.sub })}</div>
    <div style="flex:1;height:48px;border-radius:24px;background:${G.pill};display:flex;align-items:center;padding:0 18px;font-size:16px;color:${G.on}">До скоро!<span style="display:inline-block;width:1.5px;height:20px;background:${G.pri};margin-left:1px"></span></div>
    <div class="ring ringr" style="width:48px;height:48px;border-radius:50%;background:${G.pri};display:flex;align-items:center;justify-content:center">${ic("send", { fill: 1, color: "#fff", size: 22 })}</div>
  </div>
  ${gboard({ tool: false })}
  ${tip("Напишете текста и натиснете<br>бутона за изпращане (стрелка)", "right:10px;top:236px", { arrow: "d", at: "88%" })}
`), "#e8ecf2");

// Пропуснато обаждане (Google Телефон — Скорошни)
S["call-missed"] = ph(wrap(`
  ${searchPill("Търсене на контакти", "search", letter("С", "#a142f4", 32, 15))}
  <div style="flex:1;min-height:0;overflow:hidden">
    <div style="padding:10px 16px 4px;font-size:14px;color:${G.gray};font-weight:500">Днес</div>
    ${[["Мария Петрова", "#a142f4", "Пропуснато", "13:05", 1], ["0888 654 321", "#5f6368", "Пропуснато", "11:42", 1], ["Аптека „Здраве“", "#188038", "Изходящо", "09:15", 0]].map(([n, c, k, t, m], i) => `<div style="display:flex;align-items:center;height:68px;padding:0 16px;gap:16px;position:relative">${n[0] === "0" ? `<div style="width:40px;height:40px;border-radius:50%;background:#e9eef6;display:flex;align-items:center;justify-content:center">${ic("person", { fill: 1, color: G.gray })}</div>` : letter(n[0], c, 40, 18)}<div style="flex:1"><div style="font-size:16px;color:${m ? G.red : G.on}">${n}</div><div style="font-size:13px;color:${G.gray};display:flex;align-items:center;gap:4px">${ic(m ? "call_missed" : "call_made", { size: 16, color: m ? G.red : G.gray })}${k} · ${t}</div></div>${ic("info", { color: G.gray, outlined: 1, size: 22 })}${i === 0 ? `<div class="ring" style="position:absolute;left:8px;right:8px;top:3px;bottom:3px;border-radius:12px"></div>` : ""}</div>`).join("")}
    <div style="padding:14px 16px 4px;font-size:14px;color:${G.gray};font-weight:500">Вчера</div>
    ${[["Георги Петров", "#12a4af", "Входящо", "19:30"], ["Теодора Иванова", "#1a73e8", "Изходящо", "10:02"]].map(([n, c, k, t]) => `<div style="display:flex;align-items:center;height:68px;padding:0 16px;gap:16px">${letter(n[0], c, 40, 18)}<div style="flex:1"><div style="font-size:16px;color:${G.on}">${n}</div><div style="font-size:13px;color:${G.gray};display:flex;align-items:center;gap:4px">${ic(k === "Входящо" ? "call_received" : "call_made", { size: 16, color: G.gray })}${k} · ${t}</div></div>${ic("info", { color: G.gray, outlined: 1, size: 22 })}</div>`).join("")}
  </div>
  ${navM3([["star", "Любими"], ["schedule", "Скорошни"], ["contacts", "Контакти"], ["dialpad", "Клавиатура"]], 1)}
  ${fabDial("right:16px;bottom:96px")}
  ${tip("Пропуснатите са в червено — докоснете реда,<br>за да върнете обаждането", "left:16px;bottom:104px")}
`), G.sc);

// ═══════════ Gmail ═══════════
const gmailBar = () => `<div style="margin:8px 16px;height:52px;border-radius:26px;background:#e9eef6;display:flex;align-items:center;padding:0 12px 0 16px;gap:14px;flex-shrink:0">${ic("menu", { color: G.sub })}<span style="flex:1;font-size:16px;color:${G.sub}">Търсене в имейла</span>${letter("С", "#a142f4", 32, 15)}</div>`;
const mailRow = ([n, subj, snip, t, c, unread, extra]) => `<div style="display:flex;gap:14px;padding:11px 16px;position:relative;align-items:flex-start">${letter(n[0], c, 40, 18)}<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:16px;font-weight:${unread ? 700 : 400};color:${G.on}">${n}</span><span style="font-size:12px;font-weight:${unread ? 700 : 400};color:${unread ? G.on : G.gray}">${t}</span></div><div style="font-size:14px;font-weight:${unread ? 700 : 400};color:${G.on};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">${subj}</div><div style="font-size:14px;color:${G.gray};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${snip}</div></div>${extra || ""}</div>`;

S["mail-inbox"] = ph(wrap(`
  ${gmailBar()}
  <div style="padding:6px 16px 2px;font-size:13px;color:${G.sub};font-weight:500">Входящи</div>
  <div style="flex:1;min-height:0;overflow:hidden;position:relative">
    ${[
      ["Община Бобов дол", "Покана за среща с жителите", "Уважаеми съграждани, каним ви на среща в...", "09:14", "#188038", 1],
      ["Мария Петрова", "Снимки от рождения ден", "Здравей, пращам ти снимките от неделя. Внуч...", "08:02", "#a142f4", 1],
      ["Аптека Здраве", "Вашата поръчка е готова", "Можете да я вземете от аптеката до 19:00 ч.", "вчера", "#d93025", 0],
      ["Георги Петров", "Re: Неделя", "Ще дойдем към 12 часа, не се безпокой за обяда.", "28 окт.", "#12a4af", 0],
      ["Кабинет д-р Стоянова", "Напомняне за преглед", "Имате час на 5 ноември от 10:30 ч. при личния...", "27 окт.", "#e8710a", 0],
      ["Теодора Иванова", "Рецепта за пита", "Изпращам ти рецептата, която ти обещах.", "25 окт.", "#1a73e8", 0],
    ].map((r, i) => (i === 1 ? `<div style="position:relative">${mailRow(r)}<div class="ring" style="position:absolute;left:6px;right:6px;top:2px;bottom:2px;border-radius:14px"></div></div>` : mailRow(r))).join("")}
  </div>
  <div style="position:absolute;right:16px;bottom:98px;height:56px;padding:0 20px 0 16px;border-radius:16px;background:#c2e7ff;display:flex;align-items:center;gap:12px;font-size:15px;font-weight:500;color:#001d35;box-shadow:0 2px 6px rgba(0,0,0,.2),0 6px 12px rgba(0,0,0,.12)">${ic("edit", { fill: 1, color: "#001d35" })}Нов имейл</div>
  <div style="height:80px;background:${G.sc};display:flex;padding-top:12px;flex-shrink:0">${[["mail", "Поща", 1], ["videocam", "Meet", 0]].map(([n, l, a]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:64px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;${a ? "background:#d3e3fd" : ""}">${ic(n, { fill: a, color: a ? "#041e49" : G.sub })}</div><div style="font-size:12px;font-weight:500;color:${a ? G.on : G.sub}">${l}</div></div>`).join("")}</div>
  ${tip("Новите писма са удебелени.<br>Докоснете писмо, за да го отворите", "left:8px;top:552px;width:max-content", { arrow: "u", at: "26%" })}
`), G.sc);

// Писане на имейл
const mailField = (l, v, extra = "") => `<div style="display:flex;align-items:center;min-height:52px;padding:0 16px;border-bottom:1px solid #e9e9e9;font-size:16px"><span style="width:56px;color:${G.gray}">${l}</span><span style="flex:1;color:${G.on}">${v}</span>${extra}</div>`;
S["mail-compose"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:64px;padding:0 8px;gap:12px;flex-shrink:0">${ic("arrow_back", { color: G.on })}<div style="flex:1"></div>${ic("attach_file", { color: G.on })}<div class="ring ringr" style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center">${ic("send", { fill: 1, color: G.pri })}</div>${ic("more_vert", { color: G.on })}</div>
  ${mailField("От", "stoyna.ivanova@gmail.com", ic("expand_more", { color: G.gray }))}
  ${mailField("До", `<span style="display:inline-flex;align-items:center;gap:8px;height:32px;border-radius:16px;border:1px solid #c4c7c5;padding:0 12px 0 4px">${letter("М", "#a142f4", 24, 12)}Мария Петрова</span>`, ic("expand_more", { color: G.gray }))}
  ${mailField("", `<span style="font-size:18px;color:${G.on}">Поздрав за празника</span>`).replace('width:56px', 'width:0')}
  <div style="padding:16px;font-size:16px;line-height:1.5;color:${G.on};flex:1;min-height:0;overflow:hidden">Здравей, Мария!<br><br>Как сте? Очакваме ви в неделя на гости.<br>Целувки за внуците!<span style="display:inline-block;width:1.5px;height:19px;background:${G.pri};vertical-align:middle"></span></div>
  ${gboard()}
  ${tip("Стрелката горе вдясно изпраща писмото.<br>Кламерът прикачва снимка", "left:50%;top:300px;transform:translateX(-50%)")}
`), "#e8ecf2");

// Прикачване (менюто на кламера)
S["mail-attach"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:64px;padding:0 8px;gap:12px;flex-shrink:0">${ic("arrow_back", { color: G.on })}<div style="flex:1"></div><div class="ring ringr" style="width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center">${ic("attach_file", { color: G.on })}</div><div style="width:44px;display:flex;justify-content:center">${ic("send", { fill: 1, color: G.pri })}</div>${ic("more_vert", { color: G.on })}</div>
  ${mailField("От", "stoyna.ivanova@gmail.com", ic("expand_more", { color: G.gray }))}
  ${mailField("До", "maria.petrova@example.com")}
  ${mailField("", `<span style="font-size:18px">Снимки от разходката</span>`).replace("width:56px", "width:0")}
  <div style="padding:16px;font-size:16px;color:${G.on}">Здравей, Мария! Пращам ти снимките.</div>
  <div style="position:absolute;right:56px;top:58px;width:232px;background:#f3edf7;border-radius:12px;padding:8px 0;box-shadow:0 4px 8px rgba(0,0,0,.18),0 8px 24px rgba(0,0,0,.16)">
    <div class="ring" style="margin:2px 8px;height:48px;border-radius:10px;display:flex;align-items:center;padding:0 12px;font-size:16px;color:${G.on}">Прикачване на файл</div>
    <div style="height:48px;display:flex;align-items:center;padding:0 20px;font-size:16px;color:${G.on}">Вмъкване от Drive</div>
  </div>
  ${tip("Докоснете кламера,<br>после „Прикачване на файл“", "left:50%;top:300px;transform:translateX(-50%)")}
`), "#fff");

// Спам / измама
S["mail-spam"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:64px;padding:0 8px;gap:14px;flex-shrink:0">${ic("arrow_back", { color: G.on })}<div style="flex:1"></div>${ic("archive", { outlined: 1, color: G.on })}${ic("delete", { outlined: 1, color: G.on })}${ic("mail", { outlined: 1, color: G.on })}<div class="ring ringr" style="padding:6px;border-radius:50%;display:flex">${ic("more_vert", { color: G.on })}</div></div>
  <div style="margin:0 12px 10px;background:#fce8e6;border-radius:16px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start"><div style="margin-top:1px">${ic("gpp_maybe", { fill: 1, color: G.red, size: 26 })}</div><div style="font-size:14px;line-height:1.4;color:#410e0b"><b>Това съобщение е подозрително.</b> Не натискайте връзки и не изпращайте лични данни.</div></div>
  <div style="padding:6px 16px 0"><div style="font-size:21px;color:${G.on};line-height:1.25">Спечелихте 50 000 €!!! Получете наградата си днес</div></div>
  <div style="display:flex;align-items:center;gap:12px;padding:14px 16px 8px">${letter("!", "#5f6368", 40, 20)}<div style="flex:1"><div style="font-size:15px;color:${G.on};font-weight:500">Награден отдел</div><div style="font-size:13px;color:${G.gray}">prize-winner@xz-mail.info</div></div><span style="font-size:12px;color:${G.gray}">03:12</span></div>
  <div style="padding:6px 16px;font-size:15px;line-height:1.5;color:${G.on}">Поздравления! Вие сте избран за наш щастлив победител. За да получите парите, натиснете бутона и въведете данните на картата си.<div style="margin-top:14px;display:inline-block;background:#e8710a;color:#fff;padding:11px 20px;border-radius:6px;font-weight:700;font-size:14px">ВЗЕМИ НАГРАДАТА</div></div>
  <div style="position:absolute;right:12px;top:52px;width:250px;background:#f3edf7;border-radius:12px;padding:8px 0;box-shadow:0 4px 8px rgba(0,0,0,.18),0 8px 24px rgba(0,0,0,.16)">
    ${["Преместване в", "Отлагане", "Промяна на етикетите"].map((t) => `<div style="height:44px;display:flex;align-items:center;padding:0 20px;font-size:15px;color:${G.on}">${t}</div>`).join("")}
    <div class="ring" style="margin:2px 8px;height:44px;border-radius:10px;display:flex;align-items:center;padding:0 12px;font-size:15px;color:${G.on};font-weight:500">Докладване на спам</div>
    <div style="height:44px;display:flex;align-items:center;padding:0 20px;font-size:15px;color:${G.on}">Печат</div>
  </div>
  ${tip("Непознат подател и награда = измама.<br>Трите точки → „Докладване на спам“", "left:12px;top:520px")}
`), "#fff");


// ═══════════ ГРУПА 2 — ПАРИ И УСЛУГИ ═══════════

// ---- Банкомат (твърдо устройство, без марка) ----
const STEEL = "linear-gradient(180deg,#f7f8fa 0%,#cbd0d6 48%,#a7aeb7 100%)";
const skey = (inner, o = {}) => `<div class="${o.hl ? "ring" : ""}" style="${o.abs || ""}width:${o.w || 54}px;height:${o.h || 38}px;border-radius:7px;background:${o.bg || STEEL};box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 3px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;font-size:${o.fs || 18}px;font-weight:600;color:${o.fg || "#2a2f36"};${o.css || ""}">${inner}</div>`;
const keypad = (hlAll) => {
  const nums = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""];
  return `<div style="position:relative;display:flex;gap:10px;padding:8px;border-radius:12px;background:#1d2025;box-shadow:inset 0 2px 5px rgba(0,0,0,.7)">
    <div style="display:grid;grid-template-columns:repeat(3,52px);gap:7px">${nums.map((n) => (n ? skey(n, { w: 52, h: 36 }) : skey("", { w: 52, h: 36, bg: "#2a2e35", css: "box-shadow:none" }))).join("")}</div>
    <div style="display:flex;flex-direction:column;gap:7px">${[["#2fa356", "Потвърди"], ["#f0c13a", "Поправи"], ["#d8392f", "Отказ"]].map(([c, t]) => skey(`<span style="font-size:10px;color:${c === "#f0c13a" ? "#3a2f00" : "#fff"};font-weight:600">${t}</span>`, { w: 62, h: 36, bg: `linear-gradient(180deg,${c},${c})`, fg: "#fff" })).join("")}${skey("", { w: 62, h: 36, bg: "#2a2e35", css: "box-shadow:none" })}</div>
    ${hlAll ? `<div class="ring" style="position:absolute;inset:-6px;border-radius:16px"></div>` : ""}
  </div>`;
};
function atmUnit(screen, o = {}) {
  const { L = [], R = [], hlL = -1, hlR = -1, ringKeypad = false, showCash = true } = o;
  const rowTop = [70, 120, 170];
  const side = (arr, hlI, left) => `<div style="position:relative;width:50px;height:236px">${arr.map((_, i) => skey(`<span style="width:0;height:0;border:6px solid transparent;${left ? "border-right:9px solid #3b424b;border-left:0" : "border-left:9px solid #3b424b;border-right:0"}"></span>`, { w: 44, h: 28, hl: hlI === i, css: `position:absolute;top:${rowTop[i] + 6}px;${left ? "left:0" : "right:0"}` })).join("")}</div>`;
  return `<div style="position:relative;width:470px;border-radius:26px;padding:16px 16px 20px;background:linear-gradient(160deg,#e3e6ea 0%,#b9bfc7 38%,#8f969f 100%);box-shadow:inset 0 1px 0 #fff,inset 0 -3px 6px rgba(0,0,0,.25),0 18px 30px -8px rgba(0,0,0,.45),0 3px 6px rgba(0,0,0,.3)">
    <div style="display:flex;align-items:center;justify-content:space-between;height:34px;padding:0 6px 10px;color:#3b424b;font-size:13px;font-weight:600;letter-spacing:.4px"><span style="display:flex;align-items:center;gap:6px">${ic("account_balance", { size: 18, fill: 1, color: "#3b424b" })}БАНКОМАТ</span><span style="display:flex;align-items:center;gap:10px">${ic("contactless", { size: 20, color: "#3b424b" })}${ic("accessible", { size: 20, color: "#3b424b" })}</span></div>
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:10px 6px 10px;border-radius:16px;background:linear-gradient(180deg,#0d0e11,#1b1d22);box-shadow:inset 0 0 0 1px #3a3d44,0 1px 0 rgba(255,255,255,.5)">
      ${side(L, hlL, true)}
      <div style="position:relative;width:310px;height:236px;border-radius:6px;overflow:hidden;background:linear-gradient(170deg,#0f4c8a,#0a2f5c 70%);box-shadow:inset 0 0 18px rgba(0,0,0,.55);color:#fff">
        ${screen}
        <div style="position:absolute;inset:0;background:linear-gradient(118deg,rgba(255,255,255,.14) 0%,rgba(255,255,255,.04) 28%,rgba(255,255,255,0) 29%);pointer-events:none"></div>
      </div>
      ${side(R, hlR, false)}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding:0 4px">
      <div style="width:108px;text-align:center"><div style="height:14px;border-radius:4px;background:#14161a;box-shadow:inset 0 2px 3px #000,0 1px 0 rgba(255,255,255,.7);position:relative"><div style="position:absolute;left:10px;right:10px;top:5px;height:3px;border-radius:2px;background:#4be37a;box-shadow:0 0 6px #4be37a"></div></div><div style="font-size:11px;color:#3b424b;margin-top:6px;font-weight:600">Карта</div><div style="margin-top:10px;height:8px;border-radius:3px;background:#14161a;box-shadow:inset 0 1px 2px #000"></div><div style="font-size:11px;color:#3b424b;margin-top:6px;font-weight:600">Бележка</div></div>
      ${keypad(ringKeypad)}
    </div>
    ${showCash ? `<div style="margin:18px 6px 0;height:46px;border-radius:10px;background:linear-gradient(180deg,#14161a,#2a2e35);box-shadow:inset 0 3px 6px #000,0 1px 0 rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;gap:10px;color:#cfd4da;font-size:12px;font-weight:600"><span style="display:block;width:70%;height:8px;border-radius:4px;background:#050607;box-shadow:inset 0 1px 2px #000,0 0 0 2px #3a3d44"></span></div><div style="text-align:center;font-size:11px;color:#3b424b;margin-top:6px;font-weight:600">Парите се получават тук</div>` : ""}
  </div>`;
}
const optRow = (l, r, i) => "";
S["atm"] = scene(
  `<div style="position:relative;padding-bottom:62px">` + atmUnit(
    `<div style="padding:16px 18px 0;text-align:center"><div style="font-size:13px;color:#a9c7ea">Теглене на пари</div><div style="font-size:21px;font-weight:700;margin-top:3px">Изберете сума</div></div>
     ${[["20 €", "150 €"], ["50 €", "200 €"], ["100 €", "Друга сума"]].map(([a, b], i) => `<div style="position:absolute;left:0;right:0;top:${[70, 120, 170][i] + 4}px;height:32px;display:flex;justify-content:space-between;align-items:center;padding:0 10px;font-size:19px;font-weight:600"><span style="color:#fff">${a}</span><span style="color:#fff;font-size:${b === "Друга сума" ? 16 : 19}px">${b}</span></div>`).join("")}
     <div style="position:absolute;left:0;right:0;bottom:12px;text-align:center;font-size:12px;color:#a9c7ea">Натиснете бутона до сумата</div>`,
    { L: [0, 1, 2], R: [0, 1, 2], hlL: 1 }
  ) + tip("Изберете готова сума с бутона до нея<br>или „Друга сума“", "left:50%;bottom:0;transform:translateX(-50%);width:max-content") + `</div>`,
  { pad: 30 }
);

// atm-safe — истинска снимка (CC0, Wikimedia Commons, 3dman_eu): човек въвежда ПИН и
// прикрива клавиатурата с другата ръка. Логото на производителя на банкомата е
// размито (assets/more/atm-hand.jpg; виж assets/credits/more.md).
S["atm-safe"] = scene(
  `<div style="position:relative;width:560px;padding-bottom:96px">
    ${photo("more/atm-hand.jpg", { w: 560, h: 373, radius: 18, style: "box-shadow:0 18px 40px rgba(15,23,42,.28)" })}
    <div class="ring" style="position:absolute;left:283px;top:184px;width:168px;height:150px;border-radius:26px"></div>` +
    tip("Прикривайте клавиатурата с ръка,<br>докато въвеждате ПИН кода", "left:50%;top:392px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "62%" }) +
    `<div style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:12px;color:#64748b">Снимка: 3dman_eu, Wikimedia Commons (CC0)</div>
  </div>`,
  { pad: 30 }
);

// ---- ПОС терминал (безконтактно плащане) ----
S["pos"] = scene(`
  <div style="position:relative;width:360px;height:560px">
    <div style="position:absolute;left:50px;top:26px;width:260px;height:520px;border-radius:30px;background:linear-gradient(160deg,#4a4e57 0%,#2a2d34 40%,#17191d 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -4px 8px rgba(0,0,0,.5),0 24px 34px -10px rgba(0,0,0,.55),0 4px 8px rgba(0,0,0,.35)">
      <div class="ring" style="position:absolute;left:30px;right:30px;top:16px;height:70px;border-radius:18px;background:linear-gradient(180deg,#0a0b0d,#16181c);display:flex;align-items:center;justify-content:center;gap:12px">${ic("contactless", { size: 40, color: "#e9edf2", weight: 300 })}<div style="display:flex;gap:7px">${["#2fd36b", "#444a54", "#444a54", "#444a54"].map((c) => `<i style="display:block;width:9px;height:9px;border-radius:50%;background:${c};${c === "#2fd36b" ? "box-shadow:0 0 8px #2fd36b" : ""}"></i>`).join("")}</div></div>
      <div style="position:absolute;left:22px;right:22px;top:104px;height:150px;border-radius:12px;background:linear-gradient(170deg,#f6f9fb,#dfe7ee);box-shadow:inset 0 0 0 3px #0c0d10,inset 0 0 12px rgba(0,0,0,.25);color:#111;text-align:center;padding-top:16px">
        <div style="font-size:12px;color:#4a5560;font-weight:500">Сума за плащане</div>
        <div style="font-size:42px;font-weight:700;margin:4px 0 6px;letter-spacing:-1px">24,80 €</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:7px;font-size:15px;font-weight:600;color:#0b6b36">${ic("contactless", { size: 24, color: "#0b6b36" })}Допрете картата</div>
      </div>
      <div style="position:absolute;left:24px;top:276px;display:grid;grid-template-columns:repeat(3,52px);gap:9px 9px">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "✕", "0", "✓"].map((n) => skey(n === "✕" ? ic("close", { size: 20, color: "#fff" }) : n === "✓" ? ic("check", { size: 22, color: "#fff" }) : n, { w: 52, h: 42, bg: n === "✕" ? "#d8392f" : n === "✓" ? "#2fa356" : "linear-gradient(180deg,#8c929b,#5d636c)", fg: "#fff", fs: 19, css: "box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 2px 3px rgba(0,0,0,.6)" })).join("")}</div>
      <div style="position:absolute;left:50%;bottom:10px;width:80px;height:6px;margin-left:-40px;border-radius:3px;background:#0b0c0e"></div>
    </div>
    <div style="position:absolute;left:150px;top:-8px;width:180px;height:112px;border-radius:12px;transform:rotate(-14deg);background:linear-gradient(135deg,#2c6bd0 0%,#1b4aa0 55%,#12317a 100%);box-shadow:0 14px 22px rgba(0,0,0,.4),0 2px 4px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.35)">
      <div style="position:absolute;left:16px;top:30px;width:30px;height:23px;border-radius:5px;background:linear-gradient(135deg,#f3dc9a,#c9a74c)"></div>
      <div style="position:absolute;right:14px;top:14px">${ic("contactless", { size: 24, color: "#fff" })}</div>
      <div style="position:absolute;left:16px;top:66px;font-size:12px;color:#fff;letter-spacing:1.4px;font-weight:500;font-family:'Roboto'">•••• •••• •••• 4821</div>
      <div style="position:absolute;left:16px;top:88px;font-size:9px;color:#dbe6ff;letter-spacing:1px">СТОЙНА ИВАНОВА</div>
      <div style="position:absolute;right:14px;top:88px;font-size:9px;color:#dbe6ff">09/28</div>
    </div>
    ${tip("Допрете картата до зоната със знака.<br>За по-голяма сума въведете ПИН", "left:50%;bottom:-4px;transform:translateX(-50%);width:262px")}
  </div>`, { pad: 28 });
S["pos"] = S["pos"].replace("bottom:-4px", "bottom:-26px").replace('height:560px">', 'height:600px">');

// ---- Изгубена карта: банково приложение (измислена банка) ----
S["card-lost"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:60px;padding:0 6px;gap:8px;flex-shrink:0">${ic("arrow_back", { color: G.on })}<div style="flex:1;font-size:20px;color:${G.on}">Моите карти</div>${ic("help", { outlined: 1, color: G.gray })}</div>
  <div style="margin:6px 18px 0;height:196px;border-radius:20px;position:relative;background:linear-gradient(135deg,#0f766e 0%,#115e59 55%,#134e4a 100%);box-shadow:0 10px 22px -6px rgba(15,118,110,.55);color:#fff;overflow:hidden">
    <div style="position:absolute;right:-40px;top:-60px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,.07)"></div>
    <div style="position:absolute;left:20px;top:18px;font-size:15px;font-weight:500;letter-spacing:.3px">ПримерБанк</div>
    <div style="position:absolute;right:20px;top:18px">${ic("contactless", { size: 26, color: "#fff" })}</div>
    <div style="position:absolute;left:20px;top:64px;width:40px;height:30px;border-radius:6px;background:linear-gradient(135deg,#f3dc9a,#c9a74c)"></div>
    <div style="position:absolute;left:20px;top:116px;font-size:20px;letter-spacing:2px">•••• •••• •••• 4821</div>
    <div style="position:absolute;left:20px;bottom:16px;font-size:12px;letter-spacing:1px;opacity:.9">СТОЙНА ИВАНОВА</div>
    <div style="position:absolute;right:20px;bottom:16px;font-size:12px;opacity:.9">09/28</div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;padding:12px 20px 4px;font-size:14px;color:${G.sub}"><span style="display:inline-flex;align-items:center;gap:5px;background:#dcfce7;color:#14532d;border-radius:12px;padding:3px 10px;font-weight:500">${ic("check_circle", { size: 16, fill: 1, color: "#14532d" })}Активна</span>Дебитна карта</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 18px">
    ${[["block", "Блокирай карта", "#b3261e", 1], ["pin", "Смяна на ПИН", G.pri, 0], ["tune", "Лимити", G.pri, 0], ["receipt_long", "Движения", G.pri, 0]].map(([n, t, c, hl]) => `<div class="${hl ? "ring" : ""}" style="height:74px;border-radius:16px;background:${hl ? "#fce8e6" : G.sc};display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:6px;padding:0 16px">${ic(n, { color: c, fill: hl })}<span style="font-size:14.5px;font-weight:500;color:${hl ? "#8c1d18" : G.on}">${t}</span></div>`).join("")}
  </div>
  <div style="margin:6px 18px 0;border-radius:16px;border:1px solid ${G.line};display:flex;align-items:center;gap:12px;padding:12px 14px">${ic("support_agent", { color: G.pri })}<div style="flex:1"><div style="font-size:14.5px;color:${G.on};font-weight:500">Обадете се на банката</div><div style="font-size:12.5px;color:${G.gray}">0800 12 345 · безплатно, 24 часа</div></div><div style="width:42px;height:42px;border-radius:50%;background:#146c2e;display:flex;align-items:center;justify-content:center">${ic("call", { fill: 1, color: "#fff", size: 22 })}</div></div>
  ${spacer}
  ${tip("При загуба веднага блокирайте картата<br>и се обадете на банката", "left:50%;bottom:14px;transform:translateX(-50%)")}
`), "#fff");

// ---- Онлайн магазин (измислен) ----
S["shop-order"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:58px;padding:0 10px;gap:10px;flex-shrink:0;border-bottom:1px solid #eee">${ic("menu", { color: G.on })}<div style="flex:1;font-size:23px;font-weight:700;color:#8a4b16;letter-spacing:-.3px">Уют</div>${ic("search", { color: G.on })}<div style="position:relative;width:36px">${ic("shopping_cart", { color: G.on })}<span style="position:absolute;right:2px;top:-4px;min-width:17px;height:17px;border-radius:9px;background:#c2410c;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">0</span></div></div>
  <div style="height:252px;background:#f6f3ee;flex-shrink:0;display:flex;justify-content:center;overflow:hidden">${img("socks.jpg", { w: 252, h: 288, fit: "cover", style: "margin-top:-20px" })}</div>
  <div style="padding:12px 18px 0">
    <div style="font-size:19px;font-weight:500;color:${G.on};line-height:1.25">Ръчно плетени вълнени чорапи</div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:5px;font-size:13px;color:${G.gray}">${ic("star", { size: 17, fill: 1, color: "#f59e0b" })}<b style="color:${G.on}">4,8</b> (126 отзива) · В наличност</div>
    <div style="display:flex;align-items:baseline;gap:10px;margin-top:8px"><span style="font-size:27px;font-weight:700;color:${G.on}">12,90 €</span><span style="font-size:14px;color:${G.gray};text-decoration:line-through">15,90 €</span></div>
    <div style="display:flex;gap:8px;margin-top:10px">${["36–38", "39–41", "42–44"].map((s, i) => `<div style="height:36px;padding:0 14px;border-radius:18px;display:flex;align-items:center;font-size:14px;${i === 1 ? "background:#8a4b16;color:#fff" : "border:1px solid #c9c5bf;color:" + G.on}">${s}</div>`).join("")}</div>
  </div>
  <div style="padding:14px 18px 0;display:flex;gap:10px"><div class="ring" style="flex:1;height:50px;border-radius:25px;background:#8a4b16;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-size:16px;font-weight:500">${ic("add_shopping_cart", { color: "#fff", size: 22 })}Добави в количката</div></div>
  <div style="padding:10px 18px 0"><div style="height:46px;border-radius:23px;border:1px solid #8a4b16;color:#8a4b16;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500">Купи сега</div></div>
  ${tip("Натиснете „Добави в количката“,<br>после отворете количката", "left:50%;top:584px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })}
`), "#fff");

// ---- Уеб страници (измислен дизайн, примерни данни) в Chrome ----
const site = (url, body, o = {}) => wrap(`${chromeBar(url, o)}<div style="flex:1;min-height:0;overflow:hidden;position:relative;background:${o.bg || "#fff"}">${body}</div>`);
const siteHead = (bg, title, right = "") => `<div style="height:58px;background:${bg};color:#fff;display:flex;align-items:center;padding:0 14px;gap:10px"><div style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center">${ic("account_balance", { size: 19, fill: 1, color: "#fff" })}</div><div style="flex:1;font-size:17px;font-weight:500;letter-spacing:.1px">${title}</div>${right}</div>`;
const sample = (c = "#6b7280") => `<div style="position:absolute;left:0;right:0;bottom:0;padding:8px 14px;background:#f3f4f6;color:${c};font-size:11.5px;text-align:center;border-top:1px solid #e5e7eb">Илюстрация: измислен дизайн и примерни данни</div>`;

S["shop-track"] = ph(site("kurier.example/prosledyavane", `
  <div style="height:58px;background:#1b2a49;color:#fff;display:flex;align-items:center;padding:0 14px;gap:12px">${ic("menu", { color: "#fff" })}<div style="flex:1;font-size:18px;font-weight:700;letter-spacing:.2px">Бърз куриер</div>${ic("person", { color: "#fff", outlined: 1 })}</div>
  <div style="padding:18px 16px 0">
    <div style="font-size:22px;font-weight:700;color:#1b2a49">Проследяване на пратка</div>
    <div style="font-size:14px;color:#555;margin-top:4px">Въведете номера от SMS или имейл.</div>
    <div class="ring" style="margin-top:14px;border-radius:12px;background:#fff;display:flex;align-items:center;border:1px solid #c7cdd8;overflow:hidden;position:relative">
      <div style="flex:1;padding:6px 14px"><div style="font-size:11.5px;color:#6b7280">Проследяване · номер на товарителница</div><div style="font-size:18px;color:#111;letter-spacing:.5px;margin-top:1px">1051 2345 6789</div></div>
      <div style="width:70px;align-self:stretch;background:#f59e0b;display:flex;align-items:center;justify-content:center">${ic("search", { color: "#1b2a49", size: 28, weight: 600 })}</div>
    </div>
  </div>
  <div style="margin:18px 16px 0;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:15px;font-weight:700;color:#111">Пратка 1051 2345 6789</span><span style="font-size:12px;background:#fef3c7;color:#92400e;border-radius:10px;padding:2px 9px;font-weight:600">В доставка</span></div>
    ${[["Приета от подателя", "понеделник, 10:20", 1], ["Пристигна в сортировъчния център", "вторник, 06:30", 1], ["Предадена на куриер за доставка", "днес, 08:15", 1], ["Доставена", "очаква се днес", 0]].map(([t, d, done], i, a) => `<div style="display:flex;gap:12px"><div style="display:flex;flex-direction:column;align-items:center"><div style="width:16px;height:16px;border-radius:50%;background:${done ? "#16a34a" : "#fff"};border:2px solid ${done ? "#16a34a" : "#b6bcc6"};display:flex;align-items:center;justify-content:center">${done ? ic("check", { size: 12, color: "#fff", weight: 700 }) : ""}</div>${i < a.length - 1 ? `<div style="width:2px;flex:1;min-height:20px;background:${done ? "#16a34a" : "#d6dae1"}"></div>` : ""}</div><div style="padding-bottom:12px"><div style="font-size:14px;font-weight:${done ? 600 : 400};color:${done ? "#111" : "#6b7280"}">${t}</div><div style="font-size:12px;color:#6b7280">${d}</div></div></div>`).join("")}
  </div>
  ${tip("Въведете номера в полето „Проследяване“<br>и натиснете лупата", "left:50%;top:440px;transform:translateX(-50%);width:max-content")}
  ${sample()}
`, { tabs: 2 }), "#fff");

S["egov"] = ph(site("egov.bg", `
  ${siteHead("#1f3a5f", "Електронни услуги", `<div style="border:1.5px solid #fff;border-radius:18px;height:34px;padding:0 16px;display:flex;align-items:center;font-size:14px;font-weight:500">Вход</div>`)}
  <div style="background:#e9eff8;padding:20px 16px 18px">
    <div style="font-size:23px;font-weight:700;color:#14213d;line-height:1.2">Намерете услугата, от която се нуждаете</div>
    <div class="ring" style="margin-top:14px;height:52px;border-radius:26px;background:#fff;display:flex;align-items:center;padding:0 16px;gap:10px;border:1px solid #b9c5d8">${ic("search", { color: "#4b5b78" })}<span style="font-size:16px;color:#6b7280">Напр. удостоверение за наследници</span></div>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${["Постоянен адрес", "Лична карта", "Свидетелство за съдимост"].map((t) => `<span style="height:30px;padding:0 12px;border-radius:15px;background:#fff;border:1px solid #c8d2e2;font-size:13px;color:#1f3a5f;display:flex;align-items:center">${t}</span>`).join("")}</div>
  </div>
  <div style="padding:16px 16px 0"><div style="font-size:16px;font-weight:700;color:#14213d;margin-bottom:10px">Категории</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${[["badge", "Лични документи"], ["directions_car", "Превозни средства"], ["home_work", "Имоти"], ["health_and_safety", "Здраве"], ["elderly", "Пенсии и помощи"], ["business_center", "Бизнес"]].map(([n, t]) => `<div style="height:62px;border-radius:12px;border:1px solid #d6dde9;display:flex;align-items:center;gap:10px;padding:0 12px;font-size:14px;color:#14213d;font-weight:500"><div style="width:34px;height:34px;border-radius:9px;background:#e9eff8;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ic(n, { size: 21, color: "#1f3a5f", fill: 1 })}</div>${t}</div>`).join("")}</div></div>
  ${tip("Потърсете услугата тук.<br>За лични услуги натиснете „Вход“", "left:50%;top:246px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "40%" })}
  ${sample()}
`), "#fff");

S["health-record"] = ph(site("his.example/dosie", `
  ${siteHead("#0b6e6e", "Е-здравеопазване", `<div style="width:34px;height:34px;border-radius:50%;background:#fff;color:#0b6e6e;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700">СИ</div>`)}
  <div style="padding:16px 16px 0;display:flex;align-items:center;gap:12px"><div style="flex:1"><div style="font-size:22px;font-weight:700;color:#0f2e2e">Здравно досие</div><div style="font-size:13px;color:#4b5b5b;margin-top:2px">Стойна Иванова · ЕГН ••••••••••</div></div>${ic("lock", { color: "#0b6e6e", fill: 1 })}</div>
  <div style="display:flex;gap:8px;padding:14px 16px 4px;overflow:hidden">${["Рецепти", "Прегледи", "Изследвания", "Имунизации"].map((t, i) => `<span style="height:34px;padding:0 14px;border-radius:17px;display:flex;align-items:center;font-size:14px;white-space:nowrap;${i === 0 ? "background:#0b6e6e;color:#fff;font-weight:500" : "border:1px solid #b9d3d3;color:#0f2e2e"}">${t}</span>`).join("")}</div>
  <div style="padding:10px 16px;display:flex;flex-direction:column;gap:10px">
    <div class="ring" style="border-radius:14px;border:1px solid #c9dede;padding:12px 14px;position:relative"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:15px;font-weight:700;color:#0f2e2e">Метформин 500 mg</div><span style="font-size:11.5px;background:#d1fae5;color:#065f46;border-radius:10px;padding:2px 9px;font-weight:600">Активна</span></div><div style="font-size:13px;color:#4b5b5b;margin-top:4px">1 таблетка сутрин и вечер · валидна до 12.11.2026</div><div style="font-size:12px;color:#6b7280;margin-top:3px">Издадена на 14.10.2026 от д-р Стоянова</div></div>
    <div style="border-radius:14px;border:1px solid #c9dede;padding:12px 14px"><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:15px;font-weight:700;color:#0f2e2e">Амлодипин 5 mg</div><span style="font-size:11.5px;background:#d1fae5;color:#065f46;border-radius:10px;padding:2px 9px;font-weight:600">Активна</span></div><div style="font-size:13px;color:#4b5b5b;margin-top:4px">1 таблетка сутрин · валидна до 12.11.2026</div></div>
    <div style="border-radius:14px;background:#f1f6f6;padding:12px 14px;display:flex;align-items:center;gap:10px">${ic("stethoscope", { color: "#0b6e6e" })}<div style="flex:1"><div style="font-size:14px;font-weight:600;color:#0f2e2e">Последен преглед</div><div style="font-size:12.5px;color:#4b5b5b">14.10.2026 · Личен лекар</div></div>${ic("chevron_right", { color: "#6b7280" })}</div>
  </div>
  ${tip("Тук са рецептите и прегледите Ви.<br>Влиза се с електронна идентификация", "left:50%;top:408px;transform:translateX(-50%);width:max-content")}
  ${sample()}
`), "#fff");

S["noi-pension"] = ph(site("nssi.example/spravka", `
  ${siteHead("#3b2f7f", "Осигуряване — е-услуги", `${ic("menu", { color: "#fff" })}`)}
  <div style="padding:16px 16px 0"><div style="font-size:22px;font-weight:700;color:#241a5a">Справка за пенсия</div><div style="font-size:13px;color:#555;margin-top:2px">Вход с ЕГН и ПИК · Стойна Иванова</div></div>
  <div class="ring" style="margin:14px 16px 0;border-radius:16px;background:linear-gradient(135deg,#3b2f7f,#5846b3);color:#fff;padding:18px 18px 16px">
    <div style="font-size:13px;opacity:.85">Месечен размер на пенсията</div>
    <div style="font-size:38px;font-weight:700;margin:4px 0 6px;letter-spacing:-.5px">326,31 €</div>
    <div style="font-size:12.5px;opacity:.9;line-height:1.5">Вид: пенсия за старост<br>Следващо плащане: около 07.11.2026</div>
  </div>
  <div style="margin:14px 16px 0;border:1px solid #ddd9ee;border-radius:14px;overflow:hidden">${[["history", "История на плащанията"], ["description", "Удостоверение за размера на пенсията"], ["account_balance_wallet", "Промяна на банкова сметка"]].map(([n, t], i) => `<div style="display:flex;align-items:center;gap:12px;padding:0 14px;height:56px;${i ? "border-top:1px solid #ece9f6" : ""}">${ic(n, { color: "#3b2f7f" })}<div style="flex:1;font-size:14.5px;color:#241a5a">${t}</div>${ic("chevron_right", { color: "#8b86a8" })}</div>`).join("")}</div>
  ${tip("Тук виждате размера на пенсията<br>и историята на плащанията", "left:50%;top:452px;transform:translateX(-50%);width:max-content")}
  ${sample()}
`), "#fff");

S["pik-nap"] = ph(site("portal.example/vhod-pik", `
  ${siteHead("#0a4d78", "Данъчна е-услуга", "")}
  <div style="padding:20px 18px 0"><div style="font-size:22px;font-weight:700;color:#0a2f4a">Вход с ПИК</div><div style="font-size:14px;color:#4b5563;margin-top:4px">Персонален идентификационен код</div>
    <div style="margin-top:18px"><div style="font-size:13px;color:#0a4d78;font-weight:500;margin-bottom:5px">ЕГН</div><div style="height:50px;border:1px solid #9fb2c2;border-radius:10px;display:flex;align-items:center;padding:0 14px;font-size:20px;letter-spacing:3px;color:#111">••••••••••</div></div>
    <div style="margin-top:14px"><div style="font-size:13px;color:#0a4d78;font-weight:500;margin-bottom:5px">ПИК (12 знака)</div><div style="height:50px;border:2px solid #0a4d78;border-radius:10px;display:flex;align-items:center;padding:0 14px;font-size:20px;letter-spacing:3px;color:#111;justify-content:space-between">•••• •••• ••••${ic("visibility", { color: "#6b7280" })}</div></div>
    <div class="ring" style="margin-top:20px;height:50px;border-radius:10px;background:#0a4d78;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600">Вход</div>
    <div style="margin-top:14px;text-align:center;font-size:13.5px;color:#0a4d78;text-decoration:underline">Как да получа ПИК?</div>
    <div style="margin-top:12px;font-size:12.5px;color:#6b7280;text-align:center;line-height:1.4">ПИК се издава безплатно в офис по постоянен адрес, срещу лична карта.</div>
  </div>
  ${tip("Въведете ЕГН и ПИК,<br>после натиснете „Вход“", "left:50%;top:454px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })}
  ${sample()}
`), "#fff");

// ═══════════ ГРУПА 3 — ТЕЛЕФОН И ДОСТЪПНОСТ (Samsung One UI) ═══════════
const { appIcon } = require("./_shell");
const OB = "#3e91ff";
const oTog = (on) => `<span style="width:46px;height:26px;border-radius:13px;background:${on ? OB : "#c9c9c9"};position:relative;display:inline-block;flex-shrink:0"><i style="position:absolute;top:3px;${on ? "right:3px" : "left:3px"};width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3)"></i></span>`;
// Страница на настройките в One UI: голям заглавен блок, карти със заоблени ъгли
function oui(title, body, o = {}) {
  return wrap(`<div style="height:${o.head || 132}px;flex-shrink:0;display:flex;flex-direction:column;justify-content:space-between;padding:10px 20px 12px"><div style="display:flex;align-items:center;justify-content:space-between;height:36px">${ic("arrow_back", { color: "#111" })}${ic("search", { color: "#111" })}</div><div style="font-size:${title.length > 22 ? 28 : 33}px;font-weight:500;color:#111;letter-spacing:-.3px;line-height:1.1">${title}</div></div>
  <div style="flex:1;min-height:0;overflow:hidden;padding:0 12px;position:relative">${body}</div>`, { css: "background:#f6f6f6" });
}
const oCard = (inner, css = "") => `<div style="background:#fff;border-radius:24px;overflow:hidden;margin-bottom:10px;${css}">${inner}</div>`;
const oRow = (t, sub = "", right = "", o = {}) => `<div class="${o.hl ? "ring" : ""}" style="display:flex;align-items:center;gap:12px;min-height:${sub ? 68 : 58}px;padding:10px 20px;${o.hl ? "border-radius:20px;margin:3px 4px;" : ""}"><div style="flex:1"><div style="font-size:16.5px;color:#111;line-height:1.25">${t}</div>${sub ? `<div style="font-size:13px;color:#707070;margin-top:3px;line-height:1.35">${sub}</div>` : ""}</div>${right}</div>`;
const oDesc = (t) => `<div style="padding:4px 14px 12px;font-size:13.5px;color:#707070;line-height:1.45">${t}</div>`;
const WALL = (extra = "") => `<div style="position:absolute;inset:0;background:url('${mp("lake.jpg")}') center/cover;${extra}"></div>`;

// ---- Бързи настройки (Wi-Fi) ----
S["quick-wifi"] = ph(bleed(`
  ${WALL("filter:blur(14px) brightness(.5);transform:scale(1.15)")}
  <div style="position:absolute;inset:0;background:rgba(10,14,22,.35)"></div>
  <div style="position:relative;padding:50px 22px 0;color:#fff">
    <div style="display:flex;align-items:flex-end;justify-content:space-between"><div><div style="font-size:42px;font-weight:300;line-height:1">9:41</div><div style="font-size:14px;margin-top:6px;opacity:.9">пет., 30 окт.</div></div><div style="display:flex;gap:18px;padding-bottom:6px">${["search", "power_settings_new", "settings"].map((n) => ic(n, { color: "#fff", size: 24 })).join("")}</div></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px 6px;margin-top:30px;text-align:center;font-size:12.5px">
      ${[["wifi", "Wi-Fi", "Дом-WiFi", 1, 1], ["volume_up", "Звук", "Звук", 0], ["bluetooth", "Bluetooth", "", 0], ["screen_rotation", "Автом. завъртане", "", 0], ["flashlight_on", "Фенерче", "", 0], ["flight", "Режим „Полет“", "", 0], ["do_not_disturb_on", "Не безпокойте", "", 0], ["battery_saver", "Енергоспестяване", "", 0]].map(([n, l, sub, on, hl]) => `<div style="display:flex;flex-direction:column;align-items:center"><div class="${hl ? "ring ringr" : ""}" style="width:62px;height:62px;border-radius:50%;background:${on ? OB : "rgba(255,255,255,.22)"};display:flex;align-items:center;justify-content:center">${ic(n, { size: 28, fill: on, color: "#fff" })}</div><div style="margin-top:7px;line-height:1.15">${l}</div><div style="font-size:11px;opacity:.75;min-height:13px">${sub}</div></div>`).join("")}
    </div>
    <div style="margin-top:22px;height:48px;border-radius:24px;background:rgba(255,255,255,.22);position:relative;display:flex;align-items:center;padding:0 16px">${ic("brightness_medium", { color: "#fff" })}<div style="flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.35);margin:0 14px;position:relative"><div style="width:62%;height:5px;border-radius:3px;background:#fff"></div><div style="position:absolute;left:62%;top:-8px;width:21px;height:21px;border-radius:50%;background:#fff;margin-left:-10px"></div></div></div>
    <div style="display:flex;gap:10px;margin-top:14px">${[["devices", "Устройства"], ["music_note", "Медия"]].map(([n, t]) => `<div style="flex:1;height:52px;border-radius:18px;background:rgba(255,255,255,.18);display:flex;align-items:center;gap:10px;padding:0 16px;font-size:14px">${ic(n, { color: "#fff" })}${t}</div>`).join("")}</div>
    <div style="margin-top:14px;border-radius:22px;background:rgba(255,255,255,.88);color:#111;padding:12px 16px;display:flex;gap:12px;align-items:center"><div style="width:32px;height:32px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px #eee">${ic("mail", { fill: 1, color: "#d93025", size: 19 })}</div><div style="flex:1"><div style="font-size:13px;color:#555">Gmail · сега</div><div style="font-size:14.5px;font-weight:500">Мария Петрова</div><div style="font-size:13px;color:#555">Снимки от рождения ден</div></div></div>
  </div>
  ${tip("Плъзнете надолу от горния край<br>и натиснете Wi-Fi (синьо = включено)", "left:50%;top:590px;transform:translateX(-50%)")}
`), "#15191f", "#ffffff");

// ---- Размер на шрифта ----
S["font-size"] = ph(oui("Размер и стил на шрифта", `
  ${oCard(`<div style="padding:22px 20px 20px"><div style="font-size:22px;color:#111;line-height:1.35">Здравейте! Така ще изглежда текстът на телефона Ви.</div><div style="font-size:22px;color:#6b6b6b;line-height:1.35;margin-top:12px">Може да го направите по-голям.</div></div>`)}
  ${oCard(`<div style="padding:18px 20px 22px"><div style="font-size:15px;color:#111;margin-bottom:16px">Размер на шрифта</div>
    <div style="display:flex;align-items:center;gap:12px"><span style="font-size:14px;color:#555">Аа</span><div style="flex:1;height:36px;position:relative">
      <div style="position:absolute;left:0;right:0;top:16px;height:4px;border-radius:2px;background:#d4d4d4"></div><div style="position:absolute;left:0;width:66%;top:16px;height:4px;border-radius:2px;background:${OB}"></div>
      ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<i style="position:absolute;left:${i * 16.66}%;top:13px;width:2px;height:10px;margin-left:-1px;background:${i * 16.66 <= 66 ? OB : "#bdbdbd"}"></i>`).join("")}
      <div class="ring ringr" style="position:absolute;left:66.6%;top:5px;width:26px;height:26px;margin-left:-13px;border-radius:50%;background:${OB};box-shadow:0 0 0 4px #fff inset"></div></div><span style="font-size:26px;color:#111">Аа</span></div></div>`)}
  ${oCard(oRow("Получер шрифт", "", oTog(0)) + oRow("Стил на шрифта", "Системен шрифт", ic("chevron_right", { color: "#999" })))}
  ${tip("Плъзнете точката надясно —<br>буквите стават по-големи", "left:50%;top:404px;transform:translateX(-50%)")}
`, { head: 150 }), "#f6f6f6");

// ---- Звук и тих режим ----
S["dnd"] = ph(oui("Звуци и вибрация", `
  ${oCard(`<div style="padding:16px 18px 18px"><div style="font-size:15px;color:#111;margin-bottom:14px">Режим на звука</div><div style="display:flex;gap:10px">${[["volume_up", "Звук", 0], ["vibration", "Вибрация", 0], ["volume_off", "Тих режим", 1]].map(([n, t, a]) => `<div style="flex:1;height:84px;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;${a ? `background:#e3efff;box-shadow:inset 0 0 0 2px ${OB}` : "background:#f3f3f3"}">${ic(n, { size: 28, color: a ? "#1a6fe0" : "#555", fill: a })}<span style="font-size:13.5px;color:${a ? "#1a6fe0" : "#333"};font-weight:${a ? 500 : 400}">${t}</span></div>`).join("")}</div></div>`)}
  ${oCard(oRow("Не безпокойте", "Включено · разрешени са обаждания от любими контакти", oTog(1), { hl: 1 }) + oRow("Звук на мелодията", "Over the Horizon", "") + oRow("Сила на звука", "", ""))}
  ${tip("Включете „Не безпокойте“ — телефонът<br>мълчи. „Тих режим“ изключва звънеца", "left:50%;top:428px;transform:translateX(-50%)")}
`), "#f6f6f6");

// ---- Светкавица при известия ----
S["flash-alerts"] = ph(oui("Светкавица при известия", `
  ${oDesc("Светкавицата на камерата или екранът премигват при обаждане, съобщение и аларма. Полезно е, когато не чувате добре.")}
  ${oCard(oRow("Светкавица на камерата", "Премигва при нови известия", oTog(1), { hl: 1 }) + oRow("Светкавица на екрана", "Екранът светва за миг", oTog(0)))}
  ${oCard(`<div style="padding:18px 20px;display:flex;align-items:center;gap:14px">${ic("flashlight_on", { size: 30, color: OB, fill: 1 })}<div style="font-size:14px;color:#333;line-height:1.4">При обаждане светкавицата на гърба на телефона ще премигва.</div></div>`)}
  ${tip("Включете „Светкавица на камерата“ —<br>при обаждане ще премигва", "left:50%;top:326px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })}
`, { head: 118 }), "#f6f6f6");

// ---- Четене на глас ----
S["screen-reader"] = ph(oui("Изберете за изговаряне", `
  ${oCard(`<div class="ring" style="margin:4px;border-radius:20px;background:#e8f1ff;display:flex;align-items:center;padding:16px 18px;gap:12px"><div style="flex:1;font-size:17px;font-weight:500;color:#111">Включено</div>${oTog(1)}</div>`, "background:#fff")}
  ${oDesc("Докоснете елемент на екрана и телефонът ще го прочете на глас, например текст от съобщение.")}
  ${oCard(`<div style="padding:16px 20px 18px"><div style="font-size:16.5px;color:#111">Скорост на говора</div><div style="display:flex;align-items:center;gap:12px;margin-top:14px"><span style="font-size:12px;color:#707070">Бавно</span><div style="flex:1;height:4px;border-radius:2px;background:#d4d4d4;position:relative"><div style="width:50%;height:4px;border-radius:2px;background:${OB}"></div><div style="position:absolute;left:50%;top:-8px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:${OB}"></div></div><span style="font-size:12px;color:#707070">Бързо</span></div></div>` + oRow("Настройки", "", ic("chevron_right", { color: "#999" })))}
  ${oCard(`<div style="padding:16px 18px;display:flex;align-items:center;gap:12px;background:#eef4ff">${ic("volume_up", { color: "#1a6fe0", fill: 1, size: 28 })}<div style="font-size:14px;color:#1a3d78;line-height:1.4">Чете се: „Ново съобщение от Мария. Идваш ли днес на гости?“</div></div>`)}
  ${tip("Включете „Изберете за изговаряне“ —<br>телефонът чете на глас", "left:50%;top:420px;transform:translateX(-50%)")}
`, { head: 118 }), "#f6f6f6");

// ---- По-големи икони (мащаб на екрана) ----
S["big-icons"] = ph(oui("Мащаб на екрана", `
  ${oCard(`<div style="padding:22px 12px 16px;display:flex;justify-content:space-around">${["phone", "messages", "camera", "gallery"].map((n) => appIcon(n, { size: 62, labelColor: "#111" })).join("")}</div>`)}
  ${oCard(`<div style="padding:18px 20px 22px"><div style="font-size:15px;color:#111;margin-bottom:14px">Мащаб на екрана</div>
    <div style="display:flex;align-items:center;gap:12px">${ic("grid_view", { color: "#555", size: 20 })}<div style="flex:1;height:36px;position:relative">
      <div style="position:absolute;left:0;right:0;top:16px;height:4px;border-radius:2px;background:#d4d4d4"></div><div style="position:absolute;left:0;width:75%;top:16px;height:4px;border-radius:2px;background:${OB}"></div>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<i style="position:absolute;left:${i * 20}%;top:13px;width:2px;height:10px;margin-left:-1px;background:${i * 20 <= 75 ? OB : "#bdbdbd"}"></i>`).join("")}
      <div class="ring ringr" style="position:absolute;left:75%;top:5px;width:26px;height:26px;margin-left:-13px;border-radius:50%;background:${OB};box-shadow:0 0 0 4px #fff inset"></div></div>${ic("grid_view", { color: "#111", size: 30 })}</div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;color:#707070;margin-top:2px"><span>По-малък</span><span>По-голям</span></div></div>`)}
  ${oCard(oRow("Размер и стил на шрифта", "Размер 5", ic("chevron_right", { color: "#999" })))}
  ${tip("Плъзнете надясно — иконите и<br>менютата стават по-едри", "left:50%;top:400px;transform:translateX(-50%)")}
`, { head: 118 }), "#f6f6f6");

// ---- Контраст ----
S["contrast"] = ph(oui("Подобрения на видимостта", `
  ${oCard(`<div style="padding:18px 20px;background:#000;color:#fff;font-size:19px;font-weight:700;line-height:1.35">Така текстът е по-плътен и по-лесен за четене.</div>`)}
  ${oCard(oRow("Висок контраст на текста", "Прави буквите по-плътни и ясни", oTog(1), { hl: 1 }) + oRow("Удебелен шрифт", "", oTog(1)) + oRow("Тема с висок контраст", "", oTog(0)))}
  ${oCard(oRow("Корекция на цветовете", "", ic("chevron_right", { color: "#999" })) + oRow("Премахване на анимациите", "", oTog(0)))}
  ${tip("Включете „Висок контраст на текста“<br>и „Удебелен шрифт“", "left:50%;top:420px;transform:translateX(-50%)")}
`, { head: 118 }), "#f6f6f6");

// ---- Увеличение ----
S["magnifier"] = ph(oui("Увеличение", `
  ${oCard(`<div class="ring" style="margin:4px;border-radius:20px;background:#e8f1ff;display:flex;align-items:center;padding:16px 18px;gap:12px"><div style="flex:1;font-size:17px;font-weight:500;color:#111">Включено</div>${oTog(1)}</div>`)}
  ${oCard(`<div style="padding:16px 18px 18px;position:relative;height:160px;overflow:hidden"><div style="font-size:11.5px;line-height:1.5;color:#444">Състав: пшенично брашно, вода, мая, сол. Да се съхранява на сухо и хладно място. Годен до: 12.2026. Дребният текст е труден за четене.</div>
    <div style="position:absolute;left:60px;top:40px;width:150px;height:150px;border-radius:50%;background:#fff;border:5px solid ${OB};box-shadow:0 8px 22px rgba(0,0,0,.28);overflow:hidden"><div style="font-size:21px;line-height:1.35;color:#111;padding:26px 14px 0;font-weight:500">Годен до: 12.2026</div></div></div>`)}
  ${oCard(oRow("Тройно докосване на екрана", "Увеличава или връща нормалния изглед", `<span style="width:22px;height:22px;border-radius:50%;border:6px solid ${OB};background:#fff;display:inline-block"></span>`) + oRow("Бутон за достъпност", "", `<span style="width:22px;height:22px;border-radius:50%;border:2px solid #bbb;display:inline-block"></span>`))}
  ${tip("Включете „Увеличение“, после докоснете<br>екрана три пъти бързо, за да приближите", "left:50%;top:420px;transform:translateX(-50%)")}
`, { head: 118 }), "#f6f6f6");

// ---- Начален екран + странични бутони ----
const homeScreen = (extra = "") => bleed(`
  ${WALL()}
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,0) 40%,rgba(0,0,0,.25))"></div>
  <div style="position:relative;padding-top:62px;color:#fff;text-align:center"><div style="font-size:64px;font-weight:300;letter-spacing:-1px;line-height:1">9:41</div><div style="font-size:15px;margin-top:6px">петък, 30 октомври</div></div>
  <div style="position:absolute;left:12px;right:12px;top:290px;display:grid;grid-template-columns:repeat(4,1fr);gap:20px 0;justify-items:center">${["gallery", "calendar", "maps", "youtube", "clock", "calculator", "files", "notes"].map((n) => appIcon(n, { size: 56, labelColor: "#fff" })).join("")}</div>
  <div style="position:absolute;left:14px;right:14px;bottom:12px;height:84px;border-radius:30px;background:rgba(255,255,255,.22);display:flex;justify-content:space-around;align-items:center">${["phone", "messages", "chrome", "camera"].map((n) => appIcon(n, { size: 56, label: false })).join("")}</div>
  ${extra}`);
S["volume"] = withSide(
  ph(homeScreen(`
    <div style="position:absolute;right:14px;top:170px;width:60px;display:flex;flex-direction:column;align-items:center;gap:10px">
      <div style="width:56px;height:236px;border-radius:28px;background:rgba(40,42,48,.86);position:relative;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.4)"><div style="position:absolute;left:0;right:0;bottom:0;height:62%;background:#fff;border-radius:0 0 28px 28px"></div><div style="position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center">${ic("volume_up", { color: "#111", fill: 1, size: 26 })}</div></div>
      <div style="width:44px;height:44px;border-radius:50%;background:rgba(40,42,48,.86);display:flex;align-items:center;justify-content:center">${ic("more_horiz", { color: "#fff" })}</div>
    </div>`), "#15191f", "#ffffff"),
  `<div class="ring" style="position:absolute;right:-6px;top:148px;width:10px;height:68px;border-radius:5px;z-index:5"></div>${tip("Горният бутон усилва,<br>долният намалява", "right:-124px;top:162px;width:106px", { arrow: "l", at: "50%" })}`, 132);

// ---- Снимка на екрана ----
const weatherBody = () => `
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,#2f78d0 0%,#4a92e0 45%,#6aaae9 100%)"></div>
  <div style="position:absolute;right:-50px;top:70px;width:210px;height:210px;border-radius:50%;background:radial-gradient(circle,rgba(255,236,170,.95) 0%,rgba(255,226,140,.5) 38%,rgba(255,226,140,0) 70%)"></div>
  <div style="position:relative;padding:60px 22px 0;color:#fff">
    <div style="display:flex;align-items:center;gap:6px;font-size:21px;font-weight:500">${ic("location_on", { fill: 1, color: "#fff", size: 22 })}Бобов дол</div>
    <div style="font-size:92px;font-weight:200;line-height:1;margin-top:18px;letter-spacing:-3px">14°</div>
    <div style="display:flex;align-items:center;gap:8px;font-size:20px;margin-top:6px">${ic("sunny", { fill: 1, color: "#ffe28a", size: 28 })}Слънчево</div>
    <div style="font-size:15px;margin-top:6px;opacity:.95">Най-високо 16° · най-ниско 4°</div>
  </div>
  <div style="position:relative;margin:26px 14px 0;border-radius:24px;background:rgba(255,255,255,.22);padding:14px 6px 12px;color:#fff">
    <div style="display:flex;justify-content:space-between;text-align:center;font-size:13.5px">${[["Сега", "sunny", "14°"], ["13 ч.", "sunny", "15°"], ["14 ч.", "sunny", "16°"], ["15 ч.", "partly_cloudy_day", "16°"], ["16 ч.", "partly_cloudy_day", "14°"], ["17 ч.", "cloud", "11°"]].map(([t, n, d]) => `<div style="flex:1"><div style="opacity:.9">${t}</div><div style="margin:8px 0">${ic(n, { fill: 1, color: n === "cloud" ? "#fff" : "#ffe28a", size: 26 })}</div><div style="font-weight:500">${d}</div></div>`).join("")}</div>
  </div>
  <div style="position:relative;margin:12px 14px 0;border-radius:24px;background:rgba(255,255,255,.22);padding:6px 16px;color:#fff">
    ${[["Днес", "sunny", "4°", "16°"], ["Събота", "partly_cloudy_day", "5°", "15°"], ["Неделя", "rainy", "6°", "12°"], ["Понеделник", "cloud", "4°", "11°"], ["Вторник", "sunny", "3°", "13°"]].map(([d, n, a, b], i) => `<div style="display:flex;align-items:center;height:44px;${i ? "border-top:1px solid rgba(255,255,255,.25)" : ""}"><span style="flex:1;font-size:15px">${d}</span>${ic(n, { fill: 1, color: n === "rainy" ? "#d7ecff" : n === "cloud" ? "#fff" : "#ffe28a", size: 26 })}<span style="width:86px;text-align:right;font-size:15px"><span style="opacity:.8">${a}</span> &nbsp; <b style="font-weight:500">${b}</b></span></div>`).join("")}
  </div>`;
S["screenshot"] = withSide(
  ph(bleed(`
    <div style="position:absolute;inset:0;background:#0b0c10"></div>
    <div style="position:absolute;left:14px;right:14px;top:50px;height:560px;border-radius:26px;overflow:hidden;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 0 1px rgba(0,0,0,.3),0 0 26px rgba(255,255,255,.28)"><div style="position:absolute;inset:0;transform-origin:0 0">${weatherBody()}</div></div>
    <div style="position:absolute;left:18px;right:18px;bottom:30px;height:60px;border-radius:30px;background:rgba(55,58,66,.96);display:flex;align-items:center;justify-content:space-around;color:#fff">${["edit", "crop", "share", "save_alt"].map((n) => ic(n, { color: "#fff", size: 26 })).join("")}</div>`), "#0b0c10", "#ffffff"),
  `<div class="ring" style="position:absolute;right:-6px;top:182px;width:10px;height:34px;border-radius:5px;z-index:5"></div><div class="ring" style="position:absolute;right:-6px;top:232px;width:10px;height:36px;border-radius:5px;z-index:5"></div>${tip("Звук −", "right:-92px;top:182px;width:70px", { arrow: "l", at: "50%" })}${tip("Включване", "right:-104px;top:236px;width:82px", { arrow: "l", at: "50%" })}${tip("Натиснете двата бутона<br>едновременно", "right:-150px;top:300px;width:128px;text-align:center")}`, 168);

// ═══════════ ГРУПА 4 — КЛАВИАТУРА, ИНТЕРНЕТ ═══════════
const msgTop = (name) => `<div style="display:flex;align-items:center;height:64px;padding:0 4px;gap:6px;flex-shrink:0">${ic("arrow_back", { color: G.on })}<div style="margin-left:4px">${letter(name[0], "#a142f4", 36, 17)}</div><div style="flex:1;font-size:19px;color:${G.on};margin-left:8px">${name}</div>${ic("videocam", { color: G.on })}<span style="width:6px"></span>${ic("call", { color: G.on })}<span style="width:6px"></span>${ic("more_vert", { color: G.on })}</div>`;
const msgBody = `<div style="flex:1;min-height:0;padding:10px 14px;display:flex;flex-direction:column;gap:6px;overflow:hidden"><div style="align-self:center;font-size:12px;color:${G.gray};margin:6px 0">Днес · 13:05</div><div style="align-self:flex-start;max-width:72%;background:${G.pill};padding:10px 14px;border-radius:20px 20px 20px 6px;font-size:16px;color:${G.on}">Идваш ли днес на гости?</div></div>`;
const msgInput = (inner, ph2) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px 8px;flex-shrink:0;position:relative"><div style="width:42px;height:42px;border-radius:50%;background:${G.pill};display:flex;align-items:center;justify-content:center">${ic("add", { color: G.sub })}</div><div style="flex:1;min-height:48px;border-radius:24px;background:${G.pill};display:flex;align-items:center;padding:0 18px;font-size:16px;color:${G.on}">${inner || `<span style="color:${G.gray}">${ph2 || "Текстово съобщение"}</span>`}</div><div style="width:48px;height:48px;border-radius:50%;background:${G.pill};display:flex;align-items:center;justify-content:center">${ic("mic", { color: G.sub, fill: 1 })}</div></div>`;
const caret = `<span style="display:inline-block;width:1.5px;height:20px;background:${G.pri};vertical-align:middle;margin-left:1px"></span>`;

// Копиране (маркиране в „Бележки“)
const handle = (x, y, flip) => `<div style="position:absolute;left:${x}px;top:${y}px;width:20px;height:20px;background:#0b57d0;border-radius:${flip ? "50% 0 50% 50%" : "0 50% 50% 50%"};transform:rotate(0deg)"></div>`;
S["kb-copy"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:60px;padding:0 6px;gap:14px;flex-shrink:0">${ic("arrow_back", { color: G.on })}<div style="flex:1"></div>${["push_pin", "add_alert", "archive"].map((n) => ic(n, { color: G.on, outlined: 1 })).join("")}</div>
  <div style="padding:6px 20px 0;font-size:24px;color:${G.on};font-weight:400">Адрес</div>
  <div style="padding:14px 20px 0;font-size:19px;line-height:1.7;color:${G.on};position:relative">Среща при мен в неделя.<br>Адресът ми е:<br><span style="background:#b9d3fb;padding:2px 0">ул. „Първи май“ 12, Бобов дол</span>
    ${handle(14, 108, 0)}${handle(310, 108, 1)}
  </div>
  <div style="position:absolute;left:14px;top:122px;height:48px;border-radius:24px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25),0 8px 20px rgba(0,0,0,.2);display:flex;align-items:center;padding:0 6px;font-size:14.5px;color:${G.on}">
    <span style="padding:0 12px">Изрежи</span><span class="ring" style="padding:7px 12px;border-radius:14px;font-weight:500">Копирай</span><span style="padding:0 12px">Избери всичко</span><span style="padding:0 6px">${ic("more_vert", { size: 20, color: G.sub })}</span></div>
  ${spacer}
  ${tip("Задръжте пръст върху думата, дръпнете<br>синьите маркери, после „Копирай“", "left:50%;top:270px;transform:translateX(-50%)")}
  ${gboard()}
`), "#e8ecf2");

S["kb-paste"] = ph(wrap(`
  ${msgTop("Мария Петрова")}${msgBody}
  <div style="position:absolute;left:62px;bottom:366px;height:46px;border-radius:23px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.25),0 8px 20px rgba(0,0,0,.2);display:flex;align-items:center;padding:0 8px;font-size:15px;color:${G.on}"><span class="ring" style="padding:7px 16px;border-radius:14px;font-weight:500">Постави</span><span style="padding:0 14px">Клипборд</span></div>
  ${msgInput(caret, "")}
  ${gboard()}
  ${tip("Натиснете и задръжте в полето,<br>после „Постави“", "left:50%;top:208px;transform:translateX(-50%)", { arrow: "d", at: "28%" })}
`), "#e8ecf2");

S["kb-lang"] = ph(wrap(`
  ${msgTop("Мария Петрова")}${msgBody}
  ${msgInput(`Здравей${caret}`)}
  ${gboard({ hl: "globe" })}
  ${tip("Докоснете земното кълбо, за да сменяте<br>между български и английски", "left:50%;top:286px;transform:translateX(-50%)", { arrow: "d", at: "22%" })}
`), "#e8ecf2");

S["kb-numbers"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:64px;padding:0 8px;gap:12px;flex-shrink:0">${ic("arrow_back", { color: G.on })}<div style="flex:1"></div>${ic("attach_file", { color: G.on })}${ic("send", { fill: 1, color: G.pri })}${ic("more_vert", { color: G.on })}</div>
  ${mailField("От", "stoyna.ivanova@gmail.com", ic("expand_more", { color: G.gray }))}
  ${mailField("До", `ivan.petrov${caret}`)}
  ${mailField("", `<span style="color:${G.gray};font-size:18px">Тема</span>`).replace("width:56px", "width:0")}
  ${spacer}
  ${gboard({ hl: "123" })}
  ${tip("Натиснете „?123“ за цифри и знаци,<br>например @ . ,", "left:50%;top:286px;transform:translateX(-50%)", { arrow: "d", at: "18%" })}
`), "#e8ecf2");

S["kb-dictate"] = ph(wrap(`
  ${msgTop("Мария Петрова")}${msgBody}
  ${msgInput("", "Текстово съобщение")}
  ${gboard({ hl: "mic" })}
  ${tip("Докоснете микрофона и говорете —<br>телефонът пише вместо Вас", "right:10px;top:286px", { arrow: "d", at: "86%" })}
`), "#e8ecf2");

// ---- Chrome ----
S["browser-url"] = ph(wrap(`
  ${chromeBar("", { typed: "egov.bg", focus: true })}
  <div style="flex:1;min-height:0;background:#fff;overflow:hidden">
    ${[["language", "egov.bg", "egov.bg"], ["search", "egov.bg вход", ""], ["search", "egov.bg електронни услуги", ""], ["schedule", "egov.bg/wps/portal", "история"]].map(([n, t, sub]) => `<div style="display:flex;align-items:center;height:56px;padding:0 16px;gap:16px">${ic(n, { color: G.gray })}<div style="flex:1;font-size:16px;color:${G.on}">${t}</div>${ic("north_west", { color: G.gray, size: 20 })}</div>`).join("")}
  </div>
  ${gboard({ hl: "enter", enter: "arrow_forward" })}
  ${tip("Докоснете лентата, напишете адреса<br>и натиснете бутона „Отиди“", "left:50%;top:292px;transform:translateX(-50%)", { arrow: "d", at: "88%" })}
`), "#e8ecf2");

S["browser-secure"] = ph(wrap(`
  ${chromeBar("zabobovdol.carbonstealth.eu", { lockRing: true })}
  <div style="flex:1;min-height:0;position:relative;overflow:hidden;background:#f4f7f4">
    <div style="background:#1f6f4a;color:#fff;padding:22px 20px 24px"><div style="font-size:26px;font-weight:700">За Бобов дол</div><div style="font-size:14px;opacity:.9;margin-top:4px">Градски портал и помощ стъпка по стъпка</div><div style="margin-top:16px;height:46px;border-radius:23px;background:#fff;display:flex;align-items:center;padding:0 16px;gap:10px;color:#6b7280;font-size:15px">${ic("search", { color: "#6b7280" })}Какво търсите?</div></div>
    <div style="padding:16px 16px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px">${["Как да…", "Услуги", "Новини", "Събития"].map((t) => `<div style="height:70px;border-radius:14px;background:#fff;border:1px solid #dbe5dd;display:flex;align-items:center;padding:0 16px;font-size:16px;font-weight:500;color:#173c2b">${t}</div>`).join("")}</div>
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.34)"></div>
    <div style="position:absolute;left:12px;top:8px;width:330px;border-radius:22px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.25),0 12px 32px rgba(0,0,0,.22);padding:16px 18px 14px">
      <div style="font-size:14px;color:${G.gray}">zabobovdol.carbonstealth.eu</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:10px"><div style="width:38px;height:38px;border-radius:50%;background:#e3f4e8;display:flex;align-items:center;justify-content:center">${ic("lock", { fill: 1, color: "#146c2e", size: 22 })}</div><div style="font-size:18px;font-weight:500;color:${G.on}">Връзката е защитена</div></div>
      <div style="font-size:13.5px;line-height:1.45;color:${G.sub};margin-top:10px">Информацията, която изпращате до този сайт (като пароли или номера на карти), не може да бъде видяна от други хора.</div>
      <div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid ${G.line};font-size:14px;color:${G.pri};font-weight:500"><span>Разрешения</span><span>Бисквитки</span></div>
    </div>
  </div>
  ${tip("Катинарчето и „https“ преди адреса<br>значат, че сайтът е защитен", "left:50%;top:262px;transform:translateX(-50%)", { arrow: "u", at: "12%" }).replace("top:262px", "top:330px")}
`), "#fff");

// ---- YouTube ----
const ytLogo = `<span style="display:inline-flex;align-items:center;gap:3px"><svg width="30" height="21" viewBox="0 0 30 21"><rect width="30" height="21" rx="6" fill="#f00"/><path d="M12 6l8 4.5-8 4.5z" fill="#fff"/></svg><span style="font-size:20px;font-weight:700;letter-spacing:-1.1px;color:#0f0f0f">YouTube</span></span>`;
const ytPlayer = (file, o = {}) => `<div style="position:relative;height:219px;background:#000;flex-shrink:0;overflow:hidden">${img(file, { w: 390, h: 219, fit: "cover", style: `object-position:${o.pos || "center"}` })}
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,0) 62%,rgba(0,0,0,.55) 100%)"></div>
  <div style="position:absolute;left:8px;top:6px">${ic("keyboard_arrow_down", { color: "#fff", size: 32 })}</div>
  <div style="position:absolute;right:10px;top:10px;display:flex;gap:16px;align-items:center">${ic("cast", { color: "#fff", size: 22 })}<span class="${o.ccRing ? "ring" : ""}" style="border-radius:6px;padding:1px;display:flex">${ic("closed_caption", { color: "#fff", size: 26, fill: o.ccOn ? 1 : 0 })}</span>${ic("settings", { color: "#fff", size: 22 })}</div>
  <div class="${o.playRing ? "ring ringr" : ""}" style="position:absolute;left:50%;top:50%;width:62px;height:62px;margin:-31px 0 0 -31px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center">${ic("play_arrow", { color: "#fff", size: 40, fill: 1 })}</div>
  ${o.sub ? `<div style="position:absolute;left:0;right:0;bottom:34px;text-align:center"><span style="background:rgba(8,8,8,.78);color:#fff;font-size:15px;padding:3px 9px;border-radius:3px;line-height:1.5">${o.sub}</span></div>` : ""}
  <div style="position:absolute;left:12px;bottom:14px;font-size:12px;color:#fff">0:00 <span style="opacity:.7">/ 45:12</span></div><div style="position:absolute;right:10px;bottom:10px">${ic("fullscreen", { color: "#fff", size: 24 })}</div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.3)"><div style="width:0%;height:3px;background:#f00"></div></div></div>`;
const ytMeta = () => `<div style="padding:12px 14px 0"><div style="font-size:17px;font-weight:500;color:#0f0f0f;line-height:1.3">Стари български песни — най-доброто (сборник)</div><div style="font-size:13px;color:#606060;margin-top:4px">1,2 млн. показвания · преди 2 години <b style="color:#0f0f0f;font-weight:500">...още</b></div></div>
  <div style="display:flex;align-items:center;gap:10px;padding:14px 14px 0">${letter("З", "#c0392b", 36, 17)}<div style="flex:1"><div style="font-size:14.5px;font-weight:500;color:#0f0f0f">Златни мелодии</div><div style="font-size:12px;color:#606060">184 хил. абонати</div></div><div style="height:36px;padding:0 16px;border-radius:18px;background:#0f0f0f;color:#fff;font-size:14px;font-weight:500;display:flex;align-items:center">Абониране</div></div>
  <div style="display:flex;gap:8px;padding:14px 14px 0;overflow:hidden">${[["thumb_up", "12 хил."], ["share", "Споделяне"], ["download", "Изтегляне"], ["bookmark", "Запазване"]].map(([n, t]) => `<div style="height:34px;padding:0 14px;border-radius:17px;background:#f2f2f2;display:flex;align-items:center;gap:6px;font-size:13.5px;color:#0f0f0f;font-weight:500;white-space:nowrap">${ic(n, { size: 19, outlined: 1 })}${t}</div>`).join("")}</div>`;
S["youtube-watch"] = ph(wrap(`${ytPlayer("village.jpg", { playRing: 1, pos: "center 55%" })}<div style="background:#fff;flex:1;min-height:0;overflow:hidden">${ytMeta()}
    <div style="display:flex;gap:10px;padding:16px 14px 0"><div style="width:150px;height:84px;border-radius:10px;overflow:hidden;flex-shrink:0;position:relative">${img("accordions.jpg", { w: 150, h: 84 })}<span style="position:absolute;right:5px;bottom:5px;background:rgba(0,0,0,.8);color:#fff;font-size:11px;padding:1px 4px;border-radius:4px">38:20</span></div><div><div style="font-size:14px;font-weight:500;color:#0f0f0f;line-height:1.3">Народна музика на живо</div><div style="font-size:12px;color:#606060;margin-top:4px">Златни мелодии · 640 хил. показвания</div></div></div></div>
  ${tip("Докоснете бутона за пускане,<br>за да започне видеото", "left:50%;top:196px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#000", "#ffffff");

S["youtube-search"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:60px;padding:0 6px 0 4px;gap:4px;flex-shrink:0">${ic("arrow_back", { color: "#0f0f0f" })}<div class="ring" style="flex:1;height:42px;border-radius:21px;background:#f2f2f2;display:flex;align-items:center;padding:0 14px;font-size:16px;color:#0f0f0f;margin:0 6px 0 10px">стари български песни</div><div style="width:42px;height:42px;border-radius:50%;background:#f2f2f2;display:flex;align-items:center;justify-content:center">${ic("mic", { color: "#0f0f0f", fill: 1, size: 22 })}</div></div>
  <div style="display:flex;gap:8px;padding:2px 12px 10px;overflow:hidden;flex-shrink:0">${["Всички", "Видеа", "Музика", "На живо", "Плейлисти"].map((t, i) => `<span style="height:32px;padding:0 12px;border-radius:8px;display:flex;align-items:center;font-size:14px;white-space:nowrap;${i === 0 ? "background:#0f0f0f;color:#fff" : "background:#f2f2f2;color:#0f0f0f"}">${t}</span>`).join("")}</div>
  <div style="flex:1;min-height:0;overflow:hidden">
    ${[["accordions.jpg", "Стари градски песни — сборник", "Златни мелодии · 1,2 млн. показвания · преди 2 години", "45:12", "center"], ["dupnitsa.jpg", "Любими шлагери от 70-те години", "Радио спомени · 380 хил. показвания · преди 1 година", "38:04", "center 20%"], ["rilapeak.jpg", "Народна музика — най-хубавите песни", "Родопско ехо · 910 хил. показвания · преди 4 години", "1:12:30", "center"]].map(([f, t, m, d, pos]) => `<div style="margin-bottom:14px"><div style="position:relative;height:219px;overflow:hidden">${img(f, { w: 390, h: 219, fit: "cover", style: `object-position:${pos}` })}<span style="position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.8);color:#fff;font-size:12px;padding:2px 5px;border-radius:4px;font-weight:500">${d}</span></div><div style="display:flex;gap:12px;padding:10px 12px 0">${letter(m[0], "#c0392b", 36, 17)}<div style="flex:1"><div style="font-size:15px;color:#0f0f0f;line-height:1.3">${t}</div><div style="font-size:12.5px;color:#606060;margin-top:3px">${m}</div></div>${ic("more_vert", { color: "#0f0f0f", size: 22 })}</div></div>`).join("")}
  </div>
  ${tip("Напишете какво търсите и натиснете „Търси“<br>на клавиатурата, после изберете видео", "left:50%;top:112px;transform:translateX(-50%)", { arrow: "u", at: "40%" })}
`), "#fff");
// Субтитри
S["captions"] = ph(wrap(`${ytPlayer("village.jpg", { ccRing: 1, ccOn: 1, sub: "Добър ден на всички зрители!", pos: "center 55%" })}<div style="background:#fff;flex:1;min-height:0;overflow:hidden">${ytMeta()}</div>
  ${tip("Докоснете „CC“ — под видеото<br>се появяват субтитри", "right:10px;top:96px", { arrow: "u", at: "74%" })}
`), "#000", "#ffffff");

// ═══════════ КАРТИ (плочки на OpenStreetMap, © OpenStreetMap contributors) ═══════════
const mapBg = (ox, oy) => `<div style="position:absolute;left:0;top:0;right:0;bottom:0;background:url('${mp("osm/map16.png")}') -${ox}px -${oy}px/768px 1280px no-repeat"></div>`;
const OSM = `<div style="position:absolute;left:0;top:-19px;background:rgba(255,255,255,.85);font-size:10.5px;color:#333;padding:2px 7px;border-radius:0 6px 0 0">© OpenStreetMap contributors</div>`;
const gPill = (left, text, right, o = {}) => `<div class="${o.ring ? "ring" : ""}" style="position:absolute;left:12px;right:12px;top:${o.top || 48}px;height:50px;border-radius:25px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3),0 4px 10px rgba(0,0,0,.18);display:flex;align-items:center;padding:0 14px;gap:14px">${ic(left, { color: "#444746" })}<span style="flex:1;font-size:16px;color:#1f1f1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${text}</span>${right}</div>`;
const sheet = (top, inner) => `<div style="position:absolute;left:0;right:0;top:${top}px;bottom:0;background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -2px 10px rgba(0,0,0,.2)">${OSM}<div style="width:32px;height:4px;border-radius:2px;background:#c4c7c5;margin:9px auto 0"></div>${inner}</div>`;
const redPin = (x, y, s = 46) => `<div style="position:absolute;left:${x - s / 2}px;top:${y - s}px;filter:drop-shadow(0 3px 3px rgba(0,0,0,.4))">${ic("location_on", { size: s, fill: 1, color: "#ea4335", style: "" })}</div>`;
const rpin = (x, y, label) => `<div style="position:absolute;left:${x - 16}px;top:${y - 40}px;display:flex;align-items:flex-start;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))"><div style="position:relative"><div style="width:32px;height:32px;border-radius:50%;background:#ea4335;border:2px solid #fff;display:flex;align-items:center;justify-content:center">${ic("local_pharmacy", { size: 18, fill: 1, color: "#fff" })}</div><div style="position:absolute;left:11px;top:31px;border:5px solid transparent;border-top:8px solid #ea4335;border-bottom:0"></div></div></div><div style="position:absolute;left:${x + 20}px;top:${y - 30}px;font-size:11.5px;font-weight:700;color:#3c4043;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 4px #fff;white-space:nowrap">${label}</div>`;
const mapBtns = (bottom) => `<div style="position:absolute;right:12px;bottom:${bottom}px;display:flex;flex-direction:column;gap:10px;align-items:center"><div style="width:42px;height:42px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center">${ic("layers", { color: "#444746", size: 22 })}</div><div style="width:48px;height:48px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center">${ic("my_location", { color: "#1a73e8", size: 24 })}</div></div>`;
const mapBtn = (label, ico, filled, ring) => `<div class="${ring ? "ring" : ""}" style="height:40px;padding:0 16px 0 12px;border-radius:20px;display:flex;align-items:center;gap:7px;font-size:14px;font-weight:500;${filled ? "background:#0b57d0;color:#fff" : "border:1px solid #c4c7c5;color:#0b57d0"}">${ic(ico, { size: 20, color: filled ? "#fff" : "#0b57d0", fill: filled })}${label}</div>`;

S["maps-search"] = ph(bleed(`
  ${mapBg(60, 260)}
  ${redPin(195, 300)}
  ${gPill("arrow_back", "ул. „Димитър Благоев“, Бобов дол", ic("close", { color: "#444746" }), { ring: 1 })}
  ${mapBtns(238)}
  ${sheet(468, `<div style="padding:12px 18px 0"><div style="font-size:21px;color:#1f1f1f">ул. „Димитър Благоев“</div><div style="font-size:14px;color:#5f6368;margin-top:3px">Бобов дол, област Кюстендил</div>
    <div style="display:flex;gap:8px;margin-top:14px">${mapBtn("Упътвания", "directions", 1)}${mapBtn("Запази", "bookmark_border", 0)}${mapBtn("Сподели", "share", 0)}</div></div>`)}
  ${tip("Докоснете лентата горе и напишете адреса —<br>картата показва къде е мястото", "left:50%;top:110px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

const route = [[229, 453], [220, 427], [205, 405], [185, 370], [172, 335], [167, 305], [165, 275], [163, 253]];
S["maps-directions"] = ph(bleed(`
  ${mapBg(83, 295)}
  <svg style="position:absolute;left:0;top:0" width="390" height="698" viewBox="0 0 390 698"><polyline points="${route.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${route.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#1a73e8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 14"/><polyline points="${route.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#1a73e8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity=".0"/></svg>
  ${redPin(163, 253, 42)}
  <div style="position:absolute;left:210px;top:438px;width:36px;height:36px;border-radius:50%;background:rgba(26,115,232,.22)"></div><div style="position:absolute;left:220px;top:448px;width:16px;height:16px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
  <div style="position:absolute;left:0;right:0;top:0;height:196px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25);padding:46px 12px 0">
    <div style="display:flex;align-items:center;gap:10px;height:44px">${ic("arrow_back", { color: "#444746" })}<div style="flex:1;height:38px;border-radius:19px;background:#f0f4f9;display:flex;align-items:center;padding:0 14px;font-size:15px;color:#1a73e8"><span style="width:10px;height:10px;border-radius:50%;border:2px solid #1a73e8;margin-right:10px"></span>Моето местоположение</div>${ic("more_vert", { color: "#444746" })}</div>
    <div style="display:flex;align-items:center;gap:10px;height:44px;margin-top:2px"><span style="width:24px"></span><div style="flex:1;height:38px;border-radius:19px;background:#f0f4f9;display:flex;align-items:center;padding:0 14px;font-size:15px;color:#1f1f1f">${ic("location_on", { size: 18, fill: 1, color: "#ea4335" })}<span style="margin-left:8px">Аптека „Здраве“</span></div>${ic("swap_vert", { color: "#444746" })}</div>
    <div style="display:flex;justify-content:space-around;margin-top:6px">${[["directions_car", 0], ["directions_transit", 0], ["directions_walk", 1], ["local_taxi", 0], ["directions_bike", 0]].map(([n, a]) => `<div style="width:56px;height:36px;border-radius:18px;display:flex;align-items:center;justify-content:center;${a ? "background:#d3e3fd" : ""}">${ic(n, { color: a ? "#0b57d0" : "#444746", fill: a })}</div>`).join("")}</div>
  </div>
  ${sheet(520, `<div style="padding:10px 18px 0;display:flex;align-items:center"><div style="flex:1"><div style="font-size:24px;color:#188038;font-weight:500">7 мин <span style="font-size:16px;color:#5f6368;font-weight:400">(500 м)</span></div><div style="font-size:13.5px;color:#5f6368;margin-top:2px">Пеша · най-кратък път</div></div></div>
    <div style="display:flex;gap:8px;margin:14px 18px 0">${mapBtn("Старт", "navigation", 1, 1)}${mapBtn("Стъпки", "list", 0)}</div>`)}
  ${tip("Изберете как пътувате (пеша), после<br>натиснете „Старт“ — линията Ви води", "left:50%;top:208px;transform:translateX(-50%)", { arrow: "u", at: "50%" })}
`), "#fff");

S["maps-nearby"] = ph(bleed(`
  ${mapBg(90, 380)}
  ${gPill("arrow_back", "аптека", ic("close", { color: "#444746" }), { ring: 0 })}
  <div style="position:absolute;left:12px;right:0;top:106px;display:flex;gap:8px;overflow:hidden">${[["Отворено сега", "schedule"], ["Оценка", "star"], ["Още", "tune"]].map(([t, n]) => `<div style="height:34px;padding:0 12px;border-radius:17px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);display:flex;align-items:center;gap:6px;font-size:13.5px;color:#1f1f1f;white-space:nowrap">${ic(n, { size: 17, color: "#444746" })}${t}</div>`).join("")}</div>
  ${rpin(162, 188, "Аптека „Здраве“")}${rpin(228, 258, "Аптека „Билка“")}${rpin(290, 218, "Аптека „Св. Врач“")}${rpin(110, 330, "Аптека „Център“")}
  ${sheet(380, `<div style="padding:8px 0 0">
    ${[["Аптека „Здраве“", "4,6", "86", "350 м", "Затваря в 20:00", 1], ["Аптека „Билка“", "4,3", "41", "600 м", "Затваря в 19:00", 0], ["Аптека „Св. Врач“", "4,5", "63", "900 м", "Затваря в 21:00", 0]].map(([n, r, c, d, t, hl]) => `<div class="${hl ? "ring" : ""}" style="display:flex;gap:12px;padding:12px 16px;align-items:center;${hl ? "margin:4px 8px;border-radius:14px;padding:10px 10px" : ""}"><div style="flex:1"><div style="font-size:16.5px;color:#1a0dab;color:#1f1f1f;font-weight:500">${n}</div><div style="font-size:13px;color:#5f6368;margin-top:2px;display:flex;align-items:center;gap:4px">${r} ${ic("star", { size: 14, fill: 1, color: "#fbbc04" })} (${c}) · Аптека</div><div style="font-size:13px;margin-top:2px"><span style="color:#188038">Отворено</span> <span style="color:#5f6368">· ${t} · ${d}</span></div></div><div style="width:44px;height:44px;border-radius:50%;background:#d3e3fd;display:flex;align-items:center;justify-content:center">${ic("directions", { color: "#0b57d0", fill: 1 })}</div></div>`).join("")}</div>`)}
  ${tip("Картата показва най-близките аптеки;<br>изберете една за адрес и час", "left:50%;top:150px;transform:translateX(-50%)", { arrow: "d", at: "40%" }).replace("top:150px", "top:272px").replace('arrow: "d"', "")}
`), "#fff");
S["maps-nearby"] = S["maps-nearby"].replace(/top:272px;transform:translateX\(-50%\);width:max-content/, "top:640px;transform:translateX(-50%);width:max-content");

// ═══════════ ВРЕМЕТО ═══════════
S["weather"] = ph(bleed(`${weatherBody()}
  ${tip("Горе е днешното време, долу — следващите дни", "left:50%;top:648px;transform:translateX(-50%)")}
`), "#a9d3f7", "#ffffff");

// ═══════════ ЧАСОВНИК — АЛАРМА (Google Часовник) ═══════════
S["alarm"] = ph(wrap(`
  <div style="padding:26px 24px 10px;flex-shrink:0"><div style="font-size:16px;color:${G.sub}">Звъни след 11 ч. 19 мин.</div></div>
  <div style="flex:1;min-height:0;overflow:hidden;padding:0 14px;display:flex;flex-direction:column;gap:10px">
    ${[["07:00", "Събуждане", "Пон–Пет", 0], ["21:00", "Лекарство", "Всеки ден", 1], ["06:30", "Разходка", "Съб, Нед", 0]].map(([t, l, d, on]) => `<div style="border-radius:28px;background:${on ? "#d3e3fd" : G.sc};padding:16px 20px 14px"><div style="display:flex;align-items:center"><div style="flex:1;font-size:50px;font-weight:300;color:${on ? G.on : G.gray};letter-spacing:-1px;line-height:1.1">${t}</div>${toggle(on)}</div><div style="display:flex;align-items:center;margin-top:2px;font-size:14.5px;color:${G.sub}"><span style="flex:1">${l} · ${d}</span>${ic("expand_more", { color: G.sub })}</div></div>`).join("")}
  </div>
  <div class="ring" style="position:absolute;left:50%;bottom:98px;width:64px;height:64px;margin-left:-32px;border-radius:20px;background:#c2e7ff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2),0 6px 12px rgba(0,0,0,.12)">${ic("add", { size: 32, color: "#001d35", weight: 500 })}</div>
  ${navM3([["alarm", "Аларма"], ["schedule", "Часовник"], ["hourglass_empty", "Таймер"], ["timer", "Хронометър"]], 0)}
  ${tip("Натиснете „+“, нагласете часа,<br>после включете ключето вдясно", "left:50%;top:456px;transform:translateX(-50%)", { arrow: "d", at: "50%" })}
`), G.sc);

// ═══════════ НАПОМНЯНЕ (Google Календар) ═══════════
S["reminder"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:64px;padding:0 8px 0 14px;flex-shrink:0">${ic("close", { color: G.on })}<div style="flex:1"></div><div class="ring" style="height:40px;padding:0 24px;border-radius:20px;background:${G.pri};color:#fff;font-size:15px;font-weight:500;display:flex;align-items:center;margin-right:8px">Запази</div></div>
  <div style="padding:6px 22px 0 62px"><div style="font-size:26px;color:${G.on};border-bottom:2px solid ${G.pri};padding-bottom:8px">Лекарство за кръвно${caret}</div></div>
  <div style="display:flex;gap:8px;padding:16px 22px 6px 62px">${["Събитие", "Задача", "Напомняне"].map((t, i) => `<span style="height:34px;padding:0 14px;border-radius:9px;display:flex;align-items:center;font-size:14px;${i === 2 ? "background:#d3e3fd;color:#041e49;font-weight:500" : "border:1px solid #c4c7c5;color:" + G.on}">${t}</span>`).join("")}</div>
  <div style="padding:8px 0 0">
    ${[["schedule", `петък, 30 октомври`, `20:00 ч.`], ["repeat", "Повтаря се всеки ден", ""], ["notifications", "Известие в 20:00 ч.", ""]].map(([n, a, b]) => `<div style="display:flex;align-items:center;height:60px;padding:0 22px;gap:22px">${ic(n, { color: G.gray })}<div style="flex:1;font-size:16px;color:${G.on}">${a}</div>${b ? `<div style="font-size:16px;color:${G.on}">${b}</div>` : ""}</div>`).join("")}
  </div>
  ${spacer}
  ${tip("Изберете час и повторение „всеки ден“,<br>после натиснете „Запази“", "left:50%;top:440px;transform:translateX(-50%)")}
`), "#fff");

// ═══════════ КАМЕРА (Samsung) ═══════════
function camUI(preview, o = {}) {
  return wrap(`
  <div style="height:46px;background:#000;display:flex;align-items:center;justify-content:space-around;flex-shrink:0;padding:0 20px">${(o.topIcons || ["settings", "flash_auto", "timer", "aspect_ratio", "filter_vintage"]).map((n) => (n === o.topRing ? `<span class="ring" style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center">${ic(n, { color: "#ffd24a", size: 22 })}</span>` : ic(n, { color: "#fff", size: 22 }))).join("")}</div>
  <div style="position:relative;height:450px;flex-shrink:0;overflow:hidden;background:#111">${preview}
    ${o.zoomHtml || `<div style="position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center"><div style="display:flex;gap:4px;height:36px;padding:3px;border-radius:18px;background:rgba(0,0,0,.4);align-items:center;color:#fff;font-size:13px"><span style="width:30px;text-align:center">.6</span><span style="width:34px;height:30px;border-radius:15px;background:rgba(255,255,255,.95);color:#000;font-weight:700;display:flex;align-items:center;justify-content:center">1×</span><span style="width:30px;text-align:center">3</span></div></div>`}</div>
  <div style="height:36px;background:#000;color:#fff;display:flex;justify-content:center;gap:22px;align-items:center;font-size:14px;flex-shrink:0"><span style="opacity:.7">Видео</span><span style="font-weight:700;color:#ffd24a">Снимка</span><span style="opacity:.7">Портрет</span><span style="opacity:.7">Още</span></div>
  <div style="flex:1;background:#000;display:flex;align-items:center;justify-content:space-between;padding:0 38px 4px">${img(o.thumb || "lake.jpg", { w: 52, h: 52, radius: 14, style: "box-shadow:0 0 0 2px rgba(255,255,255,.7)" })}
    <div class="${o.ring === false ? "" : "ring ringr"}" style="width:76px;height:76px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px #000,0 0 0 6px #fff"></div>
    <div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center">${ic("cameraswitch", { color: "#fff", size: 26 })}</div></div>
  ${o.tipHtml || ""}`, { css: "background:#000" });
}
S["camera"] = ph(camUI(`${img("meadow1.jpg", { w: 390, h: 450, fit: "cover", style: "object-position:40% 50%" })}<div style="position:absolute;left:150px;top:230px;width:72px;height:72px;border:2px solid #ffd24a;border-radius:6px"></div>`, { tipHtml: tip("Насочете телефона и докоснете<br>големия бял кръг, за да снимате", "left:50%;top:536px;transform:translateX(-50%)", { arrow: "d", at: "50%" }).replace("top:536px", "top:376px") }), "#000", "#ffffff");

// ═══════════ КАМЕРАТА КАТО ЛУПА (day-lupa): дребен текст върху листовка, приближен с щипване ═══════════
// Няма външна снимка: листовката е пресъздадена (хартиено зърно, лек наклон, сянка, светлина от фенерчето).
S["camera-magnifier"] = (() => {
  const line = (t, css = "") => `<div style="font-size:20px;line-height:1.36;color:#1d1c1a;text-shadow:0 0 .7px rgba(0,0,0,.55);${css}">${t}</div>`;
  const paper = `
    <div style="position:absolute;inset:-40px;transform:rotate(-2.4deg);background:linear-gradient(100deg,#ece6d6 0%,#f8f4e8 38%,#fbf8ef 62%,#e9e2d0 100%)">
      <svg width="100%" height="100%" style="position:absolute;inset:0;mix-blend-mode:multiply;opacity:.55"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .3  0 0 0 0 .22  0 0 0 .22 0"/></filter><rect width="100%" height="100%" filter="url(#grain)"/></svg>
      <div style="position:absolute;left:66px;top:104px;width:296px">
        <div style="font-size:14px;letter-spacing:.6px;color:#4a4742;text-shadow:0 0 .6px rgba(0,0,0,.4);margin-bottom:6px">Листовка: информация за пациента</div>
        ${line("Как да приемате", "font-weight:700;font-size:25px;margin-bottom:4px")}
        ${line("Възрастни: по 1 таблетка сутрин и вечер, след хранене.")}
        ${line("Не превишавайте дневната доза.", "margin-top:8px")}
        ${line("Съхранявайте на сухо, под 25 °C, далеч от деца.", "margin-top:8px")}
        <div style="position:relative;margin-top:14px;width:max-content"><div style="position:absolute;inset:-5px -10px;border:2px solid #ffd24a;border-radius:6px;box-shadow:0 0 0 1px rgba(0,0,0,.18)"></div>${line("Годно до: <b>08.2027</b>", "font-size:23px")}</div>
      </div>
    </div>
    <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 58% 38%,rgba(255,252,240,.34),rgba(255,252,240,0) 62%),radial-gradient(ellipse at 50% 50%,rgba(0,0,0,0) 55%,rgba(0,0,0,.42) 100%);pointer-events:none"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:130px;backdrop-filter:blur(1.6px);-webkit-mask-image:linear-gradient(0deg,#000,rgba(0,0,0,0));mask-image:linear-gradient(0deg,#000,rgba(0,0,0,0));pointer-events:none"></div>`;
  const finger = (x, y) => `<div style="position:absolute;left:${x - 32}px;top:${y - 32}px;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.28);border:2px solid rgba(255,255,255,.9);box-shadow:0 0 0 2px rgba(0,0,0,.25);z-index:15"></div>`;
  const arrow = (x, y, rot) => `<div style="position:absolute;left:${x}px;top:${y}px;z-index:14;transform:rotate(${rot}deg)">${ic("arrow_forward", { size: 34, color: "#fff" })}</div>`;
  const zoomHtml = `<div style="position:absolute;left:0;right:0;top:12px;display:flex;justify-content:center"><div style="height:30px;padding:0 14px;border-radius:15px;background:rgba(0,0,0,.45);color:#fff;font-size:15px;font-weight:600;display:flex;align-items:center">3,0×</div></div>
    <div style="position:absolute;left:0;right:0;bottom:12px;display:flex;flex-direction:column;align-items:center;gap:9px">
      <div style="position:relative;width:250px;height:4px;border-radius:2px;background:rgba(255,255,255,.4)"><div style="position:absolute;left:0;top:0;width:44%;height:4px;border-radius:2px;background:#fff"></div><div style="position:absolute;left:44%;top:-7px;margin-left:-9px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div></div>
      <div style="display:flex;gap:4px;height:36px;padding:3px;border-radius:18px;background:rgba(0,0,0,.4);align-items:center;color:#fff;font-size:13px"><span style="width:30px;text-align:center">1</span><span style="width:30px;text-align:center">2</span><span style="min-width:38px;height:30px;border-radius:15px;background:rgba(255,255,255,.95);color:#000;font-weight:700;display:flex;align-items:center;justify-content:center">3×</span><span style="width:30px;text-align:center">5</span></div></div>`;
  return ph(camUI(`${paper}${finger(296, 330)}${finger(338, 196)}${arrow(250, 356, 135)}${arrow(334, 124, -45)}`, {
    ring: false, thumb: "bread.jpg", zoomHtml, topIcons: ["settings", "flash_on", "timer", "aspect_ratio", "filter_vintage"], topRing: "flash_on",
    tipHtml: tip("Раздалечете два пръста на екрана —<br>дребният текст се уголемява", "left:50%;top:506px;transform:translateX(-50%)", { arrow: "u", at: "50%" }),
  }), "#000", "#ffffff");
})();

// ═══════════ QR КОД (камерата чете кода, без да снимате) ═══════════
function qrSvg(text, px) {
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size, d = q.modules.data, cell = px / n;
  let r = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) r += `<rect x="${(x * cell).toFixed(2)}" y="${(y * cell).toFixed(2)}" width="${(cell + 0.3).toFixed(2)}" height="${(cell + 0.3).toFixed(2)}"/>`;
  return `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" fill="#111" shape-rendering="crispEdges">${r}</svg>`;
}
const corner = (css) => `<div style="position:absolute;width:34px;height:34px;${css};border-radius:8px"></div>`;
S["qr"] = ph(camUI(`${img("cafe.jpg", { w: 390, h: 450, fit: "cover", style: "object-position:50% 40%;filter:brightness(.78)" })}
  <div style="position:absolute;left:92px;top:96px;width:206px;height:246px;border-radius:10px;background:#faf9f6;transform:rotate(-3deg);box-shadow:0 14px 26px rgba(0,0,0,.5),0 2px 4px rgba(0,0,0,.4);padding:18px 0 0;text-align:center"><div style="display:inline-block;padding:7px;background:#fff">${qrSvg("https://zabobovdol.carbonstealth.eu", 150)}</div><div style="font-size:15px;font-weight:700;color:#222;margin-top:10px">Меню и цени</div><div style="font-size:11.5px;color:#666;margin-top:2px">Сканирайте кода с телефона</div></div>
  ${corner("left:70px;top:112px;border-top:4px solid #fff;border-left:4px solid #fff")}${corner("left:286px;top:112px;border-top:4px solid #fff;border-right:4px solid #fff")}${corner("left:70px;top:312px;border-bottom:4px solid #fff;border-left:4px solid #fff")}${corner("left:286px;top:312px;border-bottom:4px solid #fff;border-right:4px solid #fff")}
  <div class="ring" style="position:absolute;left:50%;top:362px;margin-left:-134px;width:268px;height:44px;border-radius:22px;background:#fff;display:flex;align-items:center;gap:8px;padding:0 14px;font-size:13.5px;color:#111;font-weight:500">${ic("link", { color: "#0b57d0", size: 20 })}zabobovdol.carbonstealth.eu</div>`, { ring: false, thumb: "church.jpg", tipHtml: tip("Насочете камерата към кода, без да снимате —<br>докоснете появилата се връзка", "left:50%;top:66px;transform:translateX(-50%)") }), "#000", "#ffffff");

// ═══════════ КАЛКУЛАТОР (Google) ═══════════
S["calculator"] = ph(wrap(`
  <div style="height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;flex-shrink:0">${ic("history", { color: G.sub })}${ic("more_vert", { color: G.sub })}</div>
  <div style="flex:1;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-end;padding:0 24px 16px"><div style="font-size:50px;color:${G.on};font-weight:400;letter-spacing:-1px">128 + 47</div><div style="font-size:30px;color:${G.gray};margin-top:6px">175</div></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:0 14px 8px;flex-shrink:0">
    ${[["C", "#fce8e6", "#b3261e"], ["( )", "#e3ebf8", "#0b57d0"], ["%", "#e3ebf8", "#0b57d0"], ["÷", "#e3ebf8", "#0b57d0"], ["7"], ["8"], ["9"], ["×", "#e3ebf8", "#0b57d0"], ["4"], ["5"], ["6"], ["−", "#e3ebf8", "#0b57d0"], ["1"], ["2"], ["3"], ["+", "#e3ebf8", "#0b57d0"], ["0"], [","], ["⌫"], ["=", "#0b57d0", "#fff", 1]].map(([k, b, c, hl]) => `<div class="${hl ? "ring" : ""}" style="height:68px;border-radius:${hl ? 22 : 26}px;background:${b || "#f0f1f3"};color:${c || G.on};display:flex;align-items:center;justify-content:center;font-size:${k === "( )" ? 22 : 29}px;font-weight:${b ? 500 : 400}">${k === "⌫" ? ic("backspace", { color: G.on, size: 28 }) : k}</div>`).join("")}
  </div>
  ${tip("Натискайте цифрите и знаците (+ − × ÷),<br>после „=“ за резултата", "left:50%;top:76px;transform:translateX(-50%)")}
`), "#fff");

// ═══════════ ГАЛЕРИЯ (Samsung) ═══════════
const grid9 = ["meadow1.jpg", "cat.jpg", "bread.jpg", "lake.jpg", "church.jpg", "apple.jpg", "rila.jpg", "matter.jpg", "village.jpg"];
S["photo-multi"] = ph(wrap(`
  <div style="display:flex;align-items:center;height:62px;padding:0 14px 0 16px;flex-shrink:0;gap:12px"><div style="flex:1;font-size:24px;color:#111;font-weight:500">3 избрани</div><div style="display:flex;align-items:center;gap:8px;font-size:14px;color:#111">Всички<span style="width:22px;height:22px;border-radius:50%;border:2px solid #777;display:inline-block"></span></div></div>
  <div style="padding:2px 16px 8px;font-size:13.5px;color:#555;flex-shrink:0">30 октомври</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;flex-shrink:0">${grid9.map((f, i) => { const sel = [0, 3, 8].includes(i); return `<div style="position:relative;aspect-ratio:1;overflow:hidden;background:#ddd">${img(f, { w: "100%", h: "100%", fit: "cover", style: sel ? "transform:scale(.86);border-radius:10px" : "" })}<span style="position:absolute;left:7px;top:7px;width:23px;height:23px;border-radius:50%;box-sizing:border-box;${sel ? `background:${OB};border:2px solid #fff;display:flex;align-items:center;justify-content:center` : "border:2px solid #fff;background:rgba(0,0,0,.12)"}">${sel ? ic("check", { size: 16, color: "#fff", weight: 700 }) : ""}</span></div>`; }).join("")}</div>
  ${spacer}
  <div style="height:78px;background:#fff;display:flex;justify-content:space-around;align-items:center;flex-shrink:0;border-top:1px solid #eee">${[["share", "Споделяне", 1], ["delete", "Изтриване", 0], ["more_horiz", "Още", 0]].map(([n, t, hl]) => `<div class="${hl ? "ring" : ""}" style="width:96px;height:56px;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12.5px;color:#111">${ic(n, { color: "#111", size: 24 })}${t}</div>`).join("")}</div>
  ${tip("Докоснете няколко снимки (появяват се отметки),<br>после „Споделяне“", "left:50%;top:456px;transform:translateX(-50%)", { arrow: "d", at: "18%" }).replace("top:456px", "top:490px")}
`), "#fff");

// Изрязване
S["photo-crop"] = ph(wrap(`
  <div style="height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#fff;flex-shrink:0"><span style="font-size:16px">Отказ</span><span style="font-size:17px;font-weight:500">Изрязване</span><span class="ring" style="height:34px;padding:0 18px;border-radius:17px;background:${OB};font-size:15px;font-weight:500;display:flex;align-items:center">Запази</span></div>
  <div style="flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center">
    <div style="position:relative;width:366px;height:244px;overflow:hidden">${img("lake.jpg", { w: 366, h: 244, fit: "cover" })}
      <div style="position:absolute;left:34px;top:26px;width:262px;height:176px;box-shadow:0 0 0 800px rgba(0,0,0,.62);border:2px solid #fff">
        <div style="position:absolute;left:33.3%;top:0;bottom:0;width:1px;background:rgba(255,255,255,.55)"></div><div style="position:absolute;left:66.6%;top:0;bottom:0;width:1px;background:rgba(255,255,255,.55)"></div><div style="position:absolute;top:33.3%;left:0;right:0;height:1px;background:rgba(255,255,255,.55)"></div><div style="position:absolute;top:66.6%;left:0;right:0;height:1px;background:rgba(255,255,255,.55)"></div>
        ${["left:-5px;top:-5px;border-top:5px solid #fff;border-left:5px solid #fff", "right:-5px;top:-5px;border-top:5px solid #fff;border-right:5px solid #fff", "left:-5px;bottom:-5px;border-bottom:5px solid #fff;border-left:5px solid #fff", "right:-5px;bottom:-5px;border-bottom:5px solid #fff;border-right:5px solid #fff"].map((c) => `<div style="position:absolute;width:26px;height:26px;${c}"></div>`).join("")}
      </div></div></div>
  <div style="height:120px;flex-shrink:0;color:#fff"><div style="display:flex;gap:10px;justify-content:center;padding-top:6px">${["Свободно", "1:1", "3:4", "4:3", "16:9"].map((t, i) => `<span style="height:34px;padding:0 13px;border-radius:17px;display:flex;align-items:center;font-size:13.5px;${i === 0 ? "background:#fff;color:#000;font-weight:500" : "background:rgba(255,255,255,.14)"}">${t}</span>`).join("")}</div><div style="display:flex;justify-content:space-around;margin-top:20px">${["crop", "tune", "brush", "mood"].map((n, i) => ic(n, { color: i === 0 ? "#fff" : "rgba(255,255,255,.55)", size: 26 })).join("")}</div></div>
  ${tip("Дръпнете ъглите на рамката до желаното,<br>после натиснете „Запази“", "left:50%;top:72px;transform:translateX(-50%)", { arrow: "u", at: "80%" })}
`, { css: "background:#000" }), "#000", "#ffffff");

// Завъртане
S["photo-rotate"] = ph(wrap(`
  <div style="height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;color:#fff;flex-shrink:0"><span style="font-size:16px">Отказ</span><span style="font-size:17px;font-weight:500">Редактиране</span><span style="height:34px;padding:0 18px;border-radius:17px;background:${OB};font-size:15px;font-weight:500;display:flex;align-items:center">Запази</span></div>
  <div style="flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden"><div style="width:366px;height:244px;transform:rotate(-90deg) scale(1.2);transform-origin:center">${img("lake.jpg", { w: 366, h: 244, fit: "cover" })}</div></div>
  <div style="height:128px;flex-shrink:0;color:#fff;display:flex;justify-content:center;gap:34px;align-items:flex-start;padding-top:16px">
    <div style="text-align:center;font-size:12.5px"><div class="ring ringr" style="width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;margin:0 auto 6px">${ic("rotate_right", { color: "#fff", size: 30 })}</div>Завърти</div>
    <div style="text-align:center;font-size:12.5px;opacity:.75"><div style="width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;margin:0 auto 6px">${ic("flip", { color: "#fff", size: 28 })}</div>Огледално</div>
    <div style="text-align:center;font-size:12.5px;opacity:.75"><div style="width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;margin:0 auto 6px">${ic("crop", { color: "#fff", size: 28 })}</div>Изрязване</div></div>
  ${tip("Натискайте кръглата стрелка,<br>докато снимката се изправи", "left:50%;top:120px;transform:translateX(-50%)")}
`, { css: "background:#000" }), "#000", "#ffffff");

// Час в лентата за състоянието = часът в съдържанието (без „последно видян“ в бъдещето)
const setTime = (names, t) => names.forEach((n) => { S[n] = S[n].replace(/(<span class="st-time">)[^<]*/, `$1${t}`); });
setTime(["sms-new", "kb-lang", "kb-paste", "kb-dictate"], "13:09");
setTime(["call-missed"], "13:40");
setTime(["weather", "screenshot"], "12:41");
// @@END
render(S).catch((e) => { console.error(e); process.exit(1); });
