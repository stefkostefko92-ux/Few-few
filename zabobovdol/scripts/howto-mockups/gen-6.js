// Шеста партида „мокъп“ екрани (фотореалистична версия): истински на вид екрани на Android приложения —
// Галерия, Камера, Телефон, Контакти, Viber, Chrome, Записващо устройство, Настройки, Файлове, Google акаунт,
// е-услуги (измислен дизайн, примерни данни), карта на OpenStreetMap, билет, телемедицина, SOS.
// Снимките са само CC0 (Wikimedia Commons) — assets/misc/, описани в assets/credits/misc.md.
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-6.js   (ONLY=име1,име2 за бърза итерация)
const { phone, tip, ms, photo, appIcon, toggle, av, render, ASSETS } = require("./_shell");
const QR = require("qrcode");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const BLUE = "#0b57d0", INK = "#1f1f1f", SUB = "#444746", LINE = "#c4c7c5", CONT = "#f0f4f9";
const T = "10:24"; // час в лентата за състоянието
const P = (screen, bg, sc, o = {}) => phone(screen, bg, sc, { time: T, ...o });

// ───────────── помощници ─────────────
const crop = (name, pos = "50% 50%", z = 1, extra = "") =>
  `<div style="width:100%;height:100%;overflow:hidden;${extra}">${photo("misc/" + name + ".jpg", { w: "100%", h: "100%", style: `object-position:${pos};transform:scale(${z});transform-origin:${pos};` })}</div>`;
// фиксирана височина на екрана (660 px) — съдържанието е в колона, бележките са извън нея
const col = (inner, bg = "#fff", extra = "") => `<div style="height:660px;overflow:hidden;position:relative;display:flex;flex-direction:column;background:${bg};${extra}">${inner}</div>`;
const radio = (on) => `<span style="width:22px;height:22px;border-radius:50%;border:2px solid ${on ? BLUE : "#444746"};display:flex;align-items:center;justify-content:center;flex-shrink:0">${on ? `<span style="width:11px;height:11px;border-radius:50%;background:${BLUE}"></span>` : ""}</span>`;
const appBar = (title, o = {}) => `<div style="display:flex;align-items:center;gap:12px;padding:8px 12px 8px 8px;height:64px;background:${o.bg || "#fff"};color:${o.fg || INK};flex-shrink:0"><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${ms("arrow_back", { size: 24 })}</span><div style="flex:1;font-size:${o.size || 22}px;line-height:1.2">${title}</div>${o.right || ""}</div>`;
const circ = (icon, o = {}) => `<div class="${o.ring ? "ring ringr" : ""}" style="width:${o.s || 56}px;height:${o.s || 56}px;border-radius:50%;background:${o.bg || "rgba(255,255,255,.16)"};display:flex;align-items:center;justify-content:center;${o.css || ""}">${ms(icon, { size: o.is || 26, fill: o.fill ?? 1, color: o.color || "#fff" })}</div>`;

// Chrome за Android: лента с адрес
const chromeBar = (url, o = {}) => `<div style="background:#fff;padding:6px 6px 6px 12px;display:flex;align-items:center;gap:4px;height:58px;flex-shrink:0">
  <div style="flex:1;height:42px;border-radius:21px;background:${CONT};display:flex;align-items:center;gap:6px;padding:0 14px 0 6px;font-size:15px;color:${INK};white-space:nowrap;overflow:hidden">
    <span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center">${ms(o.insecure ? "info" : "tune", { size: 20, color: SUB })}</span>${url}</div>
  <span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center"><span style="width:24px;height:24px;border:2.2px solid ${INK};border-radius:7px;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;color:${INK}">3</span></span>
  <span class="${o.dots ? "ring ringr" : ""}" style="width:44px;height:44px;display:flex;align-items:center;justify-content:center">${ms("more_vert", { size: 24, color: INK })}</span></div>`;

// Страница на нашия портал (за Chrome)
const portalPage = () => `<div style="flex:1;background:#f6f7f9;position:relative;overflow:hidden">
  <div style="background:#14375e;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:12px;font-size:17px;font-weight:700">${ms("menu", { size: 24, color: "#fff" })}За Бобов дол<span style="flex:1"></span>${ms("search", { size: 24, color: "#fff" })}</div>
  <div style="height:168px;position:relative">${crop("meadow", "50% 60%", 1.25)}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,30,50,0) 30%,rgba(10,30,50,.72))"></div><div style="position:absolute;left:16px;bottom:14px;right:16px;color:#fff;font-size:22px;font-weight:700;line-height:1.15">Услуги и помощ за жителите</div></div>
  <div style="padding:14px 14px 0;display:grid;grid-template-columns:1fr 1fr;gap:10px">${[["description", "Документи"], ["local_hospital", "Здраве"], ["directions_bus", "Транспорт"], ["groups", "Взаимопомощ"]].map(([ic, t]) => `<div style="background:#fff;border-radius:10px;padding:14px;display:flex;align-items:center;gap:10px;font-size:15px;color:#14375e;font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.12)">${ms(ic, { size: 24, color: "#14375e", fill: 1 })}${t}</div>`).join("")}</div>
  <div style="padding:14px"><div style="background:#fff;border-radius:10px;padding:14px;font-size:14px;color:#333;line-height:1.45;box-shadow:0 1px 2px rgba(0,0,0,.12)"><b style="font-size:16px;color:#14375e">Как да…</b><br>Над 500 ръководства стъпка по стъпка за телефона, документите и услугите.</div></div></div>`;

const S = {};

// ═════════════ gallery — Samsung Галерия ═════════════
{
  const tile = (n, pos, z, extra = "") => `<div style="position:relative;aspect-ratio:1;overflow:hidden;background:#d9dce1">${crop(n, pos, z)}${extra}</div>`;
  const vid = `<div style="position:absolute;left:6px;bottom:5px;display:flex;align-items:center;gap:2px;color:#fff;font-size:12px;font-weight:500;text-shadow:0 1px 3px rgba(0,0,0,.6)">${ms("play_arrow", { size: 16, fill: 1, color: "#fff" })}0:14</div>`;
  const tiles = [
    ["mountain", "65% 55%", 1.5, vid], ["village", "50% 50%", 1.2], ["sunset", "40% 50%", 1.1],
    ["meadow", "30% 50%", 1.3], ["beech", "50% 40%", 1.2], ["hills", "60% 50%", 1.1],
    ["forestpath", "50% 50%", 1.5], ["matterhorn", "55% 45%", 1.4], ["sunset2", "50% 60%", 1.2],
    ["meadow2", "70% 50%", 1.3], ["mountain", "20% 70%", 1.6], ["spruce", "50% 50%", 1.3],
  ];
  const grid = (list) => `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px">${list.map(([n, p, z, e]) => tile(n, p, z, e || "")).join("")}</div>`;
  const nav = [["photo_library", "Снимки", 1], ["photo_album", "Албуми", 0], ["auto_awesome_mosaic", "Истории", 0]];
  S["gallery"] = P(col(`
    <div style="height:60px;display:flex;align-items:center;padding:0 8px 0 18px;flex-shrink:0"><div style="flex:1;font-size:24px;font-weight:500;color:#000">Галерия</div>${ms("search", { size: 26, color: "#000", style: "margin:0 10px" })}${ms("more_vert", { size: 26, color: "#000" })}</div>
    <div style="padding:6px 16px 8px;font-size:14px;color:#222;display:flex;align-items:center;flex-shrink:0">Днес, 30 октомври<span style="flex:1"></span>${ms("check_circle", { size: 22, color: "#b5b8bd" })}</div>
    <div style="flex:1;overflow:hidden"><div class="ring" style="position:absolute;left:-1px;top:96px;width:130px;height:130px;border-radius:2px;z-index:5"></div>${grid(tiles.slice(0, 6))}<div style="padding:10px 16px 8px;font-size:14px;color:#222">Вчера, 29 октомври</div>${grid(tiles.slice(6, 12))}</div>
    <div style="height:66px;display:flex;background:#fff;border-top:1px solid #eceef1;flex-shrink:0">${nav.map(([ic, l, on]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:12px;color:${on ? "#000" : "#666"};font-weight:${on ? 600 : 400}">${ms(ic, { size: 24, fill: on, color: on ? "#1a73e8" : "#666" })}${l}</div>`).join("")}</div>`, "#fff"), "#fff", "#0b0b0b")
    + tip("Най-новите снимки са най-отгоре.<br>Докоснете снимка, за да я видите голяма", "left:50%;top:238px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "u", at: "22%" });
}

// ═════════════ video-record — Samsung Камера ═════════════
S["video-record"] = P(col(`
  <div style="height:54px;display:flex;align-items:center;justify-content:space-around;flex-shrink:0;padding:0 8px">${["flash_off", "timer", "crop_16_9", "tune", "settings"].map((i) => ms(i, { size: 24, color: "#fff", weight: 300 })).join("")}</div>
  <div style="flex:1;position:relative;overflow:hidden">${crop("mountain", "62% 50%", 1.7)}
    <div style="position:absolute;left:150px;top:120px;width:76px;height:76px;border:2px solid #ffd54f;border-radius:4px;opacity:.95"></div>
    <div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:4px;align-items:center;background:rgba(0,0,0,.42);border-radius:20px;padding:5px 8px;color:#fff;font-size:13px"><span style="width:28px;text-align:center;opacity:.8">.6</span><span style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.95);color:#000;font-weight:700;display:flex;align-items:center;justify-content:center">1x</span><span style="width:28px;text-align:center;opacity:.8">3</span></div></div>
  <div style="background:#000;height:176px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding-top:10px">
    <div style="display:flex;gap:24px;align-items:center;font-size:15px;color:#fff;height:38px"><span style="opacity:.75">Портрет</span><span style="opacity:.75">Снимка</span><span class="ring" style="color:#ffd54f;font-weight:700;padding:5px 12px;border-radius:16px">Видео</span><span style="opacity:.75">Още</span></div>
    <div style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:0 34px;margin-top:10px">
      <div style="width:52px;height:52px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,.7)">${crop("mountain", "60% 60%", 1.8)}</div>
      <div class="ring" style="width:76px;height:76px;border-radius:50%;border:4px solid #fff;display:flex;align-items:center;justify-content:center"><div style="width:58px;height:58px;border-radius:50%;background:#e53935"></div></div>
      <div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center">${ms("cameraswitch", { size: 26, color: "#fff" })}</div></div></div>`, "#000"), "#000", "#fff")
  + tip("Изберете „Видео“, после натиснете<br>червения бутон — записът започва", "left:50%;top:276px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });

// ═════════════ viber-call — повикване във Viber ═════════════
S["viber-call"] = P(col(`
  <div style="height:56px;display:flex;align-items:center;padding:0 10px;color:#fff;flex-shrink:0">${ms("keyboard_arrow_down", { size: 32, color: "#fff" })}<div style="flex:1;text-align:center;font-size:14px;display:flex;align-items:center;justify-content:center;gap:6px;opacity:.9">${ms("lock", { size: 14, fill: 1, color: "#fff" })}Viber · безплатно повикване</div><span style="width:32px"></span></div>
  <div style="text-align:center;color:#fff;margin-top:44px"><div style="font-size:28px;font-weight:500">Мария Георгиева</div><div style="font-size:16px;opacity:.8;margin-top:6px">Звъни…</div></div>
  <div style="display:flex;justify-content:center;margin-top:52px"><div style="width:168px;height:168px;border-radius:50%;background:#9b8cf0;color:#fff;font-size:68px;font-weight:300;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 14px rgba(255,255,255,.08),0 0 0 32px rgba(255,255,255,.05)">МГ</div></div>
  <div style="flex:1"></div>
  <div style="display:flex;justify-content:center;gap:22px;color:#fff;font-size:11.5px;text-align:center;margin-bottom:26px">${[["mic_off", "Заглуши"], ["dialpad", "Клавиатура"], ["volume_up", "Високоговорител"], ["videocam", "Видео"]].map(([i, l]) => `<div style="width:66px;display:flex;flex-direction:column;align-items:center;gap:7px">${circ(i, { s: 54, is: 26 })}<span style="opacity:.85">${l}</span></div>`).join("")}</div>
  <div style="display:flex;justify-content:center;margin-bottom:26px"><div class="ring" style="width:68px;height:68px;border-radius:50%;background:#e5484d;display:flex;align-items:center;justify-content:center">${ms("call_end", { size: 32, fill: 1, color: "#fff" })}</div></div>`, "linear-gradient(170deg,#6a58d9 0%,#4a3aa8 52%,#33287a 100%)"), "#4a3aa8", "#fff")
  + tip("Започва с иконата слушалка в чата с човека.<br>За затваряне натиснете червения бутон", "left:50%;top:466px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });

// ═════════════ video-call — видеоразговор във Viber (без лица) ═════════════
S["video-call"] = P(col(`
  <div style="position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 35%,#34344a,#1a1a26)"></div>
  <div style="position:relative;height:56px;display:flex;align-items:center;padding:0 10px;color:#fff;flex-shrink:0">${ms("keyboard_arrow_down", { size: 32, color: "#fff" })}<div style="flex:1;text-align:center;font-size:15px;font-weight:500">Мария Георгиева<div style="font-size:12px;font-weight:400;opacity:.75">03:42</div></div><span style="width:32px"></span></div>
  <div style="position:relative;text-align:center;color:#fff;margin-top:120px"><div style="width:120px;height:120px;border-radius:50%;background:#9b8cf0;margin:0 auto;font-size:48px;font-weight:300;display:flex;align-items:center;justify-content:center">МГ</div><div style="margin-top:18px;font-size:15px;opacity:.8;display:flex;align-items:center;justify-content:center;gap:6px">${ms("videocam_off", { size: 20, color: "#fff", fill: 1 })}Камерата на Мария е изключена</div></div>
  <div style="position:absolute;right:14px;top:66px;width:104px;height:148px;border-radius:14px;overflow:hidden;border:2px solid rgba(255,255,255,.85);box-shadow:0 4px 14px rgba(0,0,0,.4)">${crop("meadow2", "50% 50%", 1.6)}</div>
  <div style="flex:1"></div>
  <div style="position:relative;display:flex;justify-content:center;gap:18px;margin-bottom:34px">${circ("mic_off", { s: 58 })}${circ("cameraswitch", { s: 58, ring: 1, bg: "rgba(255,255,255,.22)" })}${circ("videocam", { s: 58 })}${circ("call_end", { s: 58, bg: "#e5484d" })}</div>`, "#1a1a26"), "#1a1a26", "#fff")
  + tip("Иконата с двете стрелки върти камерата —<br>малкото прозорче показва какво виждате Вие", "left:50%;top:380px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "38%" });

// ═════════════ share-link — Chrome + Сподели ═════════════
{
  const person = (l, c, n) => `<div style="width:72px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;color:${INK};position:relative"><div style="position:relative">${av(l, c, 52)}<div style="position:absolute;right:-3px;bottom:-3px;width:22px;height:22px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center">${appIcon("viber", { size: 18, label: false })}</div></div>${n}</div>`;
  const app = (name, l, ring) => `<div class="${ring ? "ring" : ""}" style="width:68px;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:12px;color:${INK};${ring ? "border-radius:14px;padding:4px 0;margin:-4px 0" : ""}">${appIcon(name, { size: 48, label: false })}${l}</div>`;
  S["share-link"] = P(col(`
    ${chromeBar("zabobovdol.carbonstealth.eu")}
    ${portalPage()}
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.36)"></div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:480px;background:#fff;border-radius:28px 28px 0 0;padding:10px 16px 0">
      <div style="width:32px;height:4px;border-radius:2px;background:#c4c7c5;margin:0 auto 14px"></div>
      <div style="display:flex;gap:12px;align-items:center"><div style="width:56px;height:56px;border-radius:10px;overflow:hidden;flex-shrink:0">${crop("meadow", "50% 50%", 1.4)}</div><div style="flex:1;min-width:0"><div style="font-size:15px;font-weight:500;color:${INK}">За Бобов дол — услуги и помощ</div><div style="font-size:13px;color:${SUB};margin-top:2px">zabobovdol.carbonstealth.eu</div></div></div>
      <div style="display:flex;gap:8px;margin:14px 0 4px"><span style="display:flex;align-items:center;gap:6px;border:1px solid ${LINE};border-radius:8px;padding:7px 12px;font-size:13.5px;color:${INK}">${ms("content_copy", { size: 18, color: SUB })}Копиране</span><span style="display:flex;align-items:center;gap:6px;border:1px solid ${LINE};border-radius:8px;padding:7px 12px;font-size:13.5px;color:${INK}">${ms("print", { size: 18, color: SUB })}Печат</span></div>
      <div style="font-size:13px;color:${SUB};margin:18px 0 10px;font-weight:500">Хора</div>
      <div style="display:flex;justify-content:space-between">${person("М", "#7e57c2", "Мария")}${person("И", "#1e88e5", "Иван")}${person("П", "#43a047", "Петя")}${person("Г", "#ef6c00", "Георги")}</div>
      <div style="font-size:13px;color:${SUB};margin:22px 0 12px;font-weight:500">Приложения</div>
      <div style="display:flex;justify-content:space-between">${app("viber", "Viber", 1)}${app("messenger", "Messenger")}${app("messages", "Съобщения")}${app("whatsapp", "WhatsApp")}${app("gmail", "Gmail")}</div>
    </div>`, "#fff"), "#fff", "#0b0b0b")
    + tip("Изберете приложението (напр. Viber) и човека —<br>връзката се изпраща веднага. „Копиране“ я запазва за поставяне", "left:12px;top:566px;width:max-content;max-width:366px", { arrow: "u", at: "13%" });
}

// ═════════════ speed-dial — Google Телефон, „Любими“ ═════════════
{
  const fav = (l, c, n, ring) => `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;font-size:14px;color:${INK}"><div class="${ring ? "ring ringr" : ""}" style="border-radius:50%">${av(l, c, 88)}</div>${n}</div>`;
  const nav = [["star", "Любими", 1], ["schedule", "Скорошни", 0], ["contacts", "Контакти", 0]];
  S["speed-dial"] = P(col(`
    <div style="margin:8px 14px 0;height:54px;border-radius:27px;background:${CONT};display:flex;align-items:center;padding:0 8px 0 18px;gap:12px;color:${SUB};font-size:16px;flex-shrink:0">${ms("search", { size: 24, color: SUB })}<span style="flex:1">Търсене на контакти</span>${av("И", "#5f6368", 36)}</div>
    <div style="padding:26px 16px 0;font-size:14px;color:${SUB};font-weight:500">Любими</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px 8px;padding:16px 12px 0">${fav("М", "#7e57c2", "Мария", 1)}${fav("И", "#1e88e5", "Иван")}${fav("Л", "#00897b", "Д-р Иванова")}${fav("А", "#ef6c00", "Аптека")}${fav("П", "#d81b60", "Петя")}${fav("Г", "#6d4c41", "Георги")}</div>
    <div style="flex:1"></div>
    <div style="position:absolute;right:18px;bottom:96px;width:62px;height:62px;border-radius:18px;background:#c2e7ff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,.22)">${ms("dialpad", { size: 28, fill: 1, color: "#001d35" })}</div>
    <div style="height:80px;display:flex;background:#f3f6fb;flex-shrink:0">${nav.map(([ic, l, on]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:12px;color:${INK};font-weight:${on ? 700 : 500}"><span style="width:64px;height:32px;border-radius:16px;background:${on ? "#c2e7ff" : "transparent"};display:flex;align-items:center;justify-content:center">${ms(ic, { size: 24, fill: on, color: INK })}</span>${l}</div>`).join("")}</div>`, "#fff"), "#fff", "#0b0b0b")
    + tip("Любимите са най-отгоре в „Телефон“ —<br>докоснете човека и той се набира веднага", "left:50%;top:466px;transform:translateX(-50%);width:max-content;max-width:360px");
}

// ═════════════ contact-photo — Google Контакти, редакция ═════════════
{
  const field = (label, val, icon) => `<div style="display:flex;align-items:center;gap:16px;padding:0 16px;margin-bottom:14px"><span style="width:24px">${icon ? ms(icon, { size: 24, color: SUB }) : ""}</span><div style="flex:1;position:relative;height:56px;border:1px solid #747775;border-radius:4px;display:flex;align-items:center;padding:0 14px;font-size:16px;color:${INK}"><span style="position:absolute;left:10px;top:-9px;background:#fff;padding:0 4px;font-size:12px;color:${SUB}">${label}</span>${val}</div></div>`;
  S["contact-photo"] = P(col(`
    <div style="height:64px;display:flex;align-items:center;padding:0 12px 0 8px;flex-shrink:0"><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${ms("close", { size: 24, color: INK })}</span><div style="flex:1"></div><span style="background:${BLUE};color:#fff;font-size:14px;font-weight:500;border-radius:20px;padding:10px 20px">Запази</span></div>
    <div style="display:flex;justify-content:center;padding:14px 0 84px"><div style="position:relative">${av("М", "#7e57c2", 118).replace("font-weight:500", "font-weight:400")}<div class="ring ringr" style="position:absolute;right:-2px;bottom:-2px;width:44px;height:44px;border-radius:50%;background:#c2e7ff;border:3px solid #fff;display:flex;align-items:center;justify-content:center">${ms("photo_camera", { size: 22, fill: 1, color: "#001d35" })}</div></div></div>
    ${field("Име", "Мария", "person")}${field("Фамилия", "Георгиева", "")}${field("Телефон", "0888 123 456", "call")}
    <div style="padding:0 16px 14px 56px;font-size:13px;color:${SUB}">Мобилен</div>${field("Имейл", "maria@example.com", "mail")}`, "#fff"), "#fff", "#0b0b0b")
    + tip("Докоснете кръгчето с камерата, изберете снимка<br>от галерията, после натиснете „Запази“", "left:50%;top:218px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "u", at: "62%" });
}

// ═════════════ home-shortcut — меню на Chrome ═════════════
{
  const item = (ic, t, o = {}) => `<div class="${o.ring ? "ring" : ""}" style="display:flex;align-items:center;gap:18px;height:48px;padding:0 18px;font-size:15.5px;color:${INK};white-space:nowrap;${o.ring ? "border-radius:10px;margin:2px 6px;padding:0 12px;font-weight:500;font-size:15px" : ""}">${ms(ic, { size: 24, color: SUB })}<span style="flex:1">${t}</span>${o.chk ? `<span style="width:20px;height:20px;border:2px solid #444746;border-radius:3px"></span>` : ""}</div>`;
  S["home-shortcut"] = P(col(`
    ${chromeBar("zabobovdol.carbonstealth.eu", { dots: 1 })}
    ${portalPage()}
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.18)"></div>
    <div style="position:absolute;right:8px;top:52px;width:292px;background:#fff;border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.3);padding:6px 0">
      <div style="display:flex;justify-content:space-around;padding:6px 0 8px;border-bottom:1px solid #e3e3e3">${["arrow_forward", "star", "download", "info", "refresh"].map((i) => ms(i, { size: 24, color: SUB, fill: i === "star" ? 0 : 0 })).join("")}</div>
      ${item("add_box", "Нов раздел")}${item("tab_unselected", "Нов раздел „инкогнито“")}${item("history", "История")}${item("share", "Споделяне…")}${item("search", "Търсене в страницата")}${item("add_to_home_screen", "Добавяне към началния екран", { ring: 1 })}${item("desktop_windows", "Настолен сайт", { chk: 1 })}${item("settings", "Настройки")}
    </div>`, "#fff"), "#fff", "#0b0b0b")
    + tip("Менюто с трите точки → „Добавяне към началния<br>екран“ — сайтът става икона като приложение", "left:50%;top:496px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "u", at: "74%" });
}

// ═════════════ voice-memo — Записващо устройство ═════════════
{
  const wave = (n, seed) => { let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; return Array.from({ length: n }, () => `<i style="display:block;width:3px;height:${4 + Math.round(r() * 20)}px;background:#9aa0a6;border-radius:2px"></i>`).join(""); };
  const rec = (t, d, dur, seed, first) => `<div style="padding:14px 20px;border-bottom:1px solid #eceff1"><div style="display:flex;align-items:baseline"><div style="flex:1;font-size:17px;color:${INK};font-weight:500">${t}</div><div style="font-size:14px;color:${SUB}">${dur}</div></div><div style="font-size:13px;color:${SUB};margin-top:3px">${d}</div><div style="display:flex;align-items:center;gap:2px;height:28px;margin-top:8px;overflow:hidden">${wave(60, seed)}</div></div>`;
  S["voice-memo"] = P(col(`
    <div style="margin:8px 14px 6px;height:54px;border-radius:27px;background:${CONT};display:flex;align-items:center;padding:0 14px;gap:12px;color:${SUB};font-size:16px;flex-shrink:0">${ms("search", { size: 24, color: SUB })}<span style="flex:1">Търсене в записите</span>${ms("more_vert", { size: 24, color: SUB })}</div>
    <div style="font-size:12px;color:${SUB};padding:8px 20px 0">Записващо устройство</div>
    <div style="flex:1;overflow:hidden">${rec("Лекарства за седмицата", "Днес, 8:47", "0:24", 7)}${rec("Списък за пазар", "Вчера, 17:12", "0:41", 11)}${rec("Рецепта за баница", "27 окт., 10:05", "1:12", 5)}${rec("Телефон на водопроводчика", "24 окт., 14:30", "0:09", 3)}</div>
    <div style="height:150px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;box-shadow:0 -2px 8px rgba(0,0,0,.06);flex-shrink:0">
      <div class="ring" style="width:76px;height:76px;border-radius:50%;background:#d93025;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 5px rgba(255,255,255,.9)"><div style="width:30px;height:30px;border-radius:50%;background:#fff"></div></div>
      <div style="font-size:13px;color:${SUB}">Запис</div></div>`, "#fff"), "#fff", "#0b0b0b")
    + tip("Натиснете червения бутон и говорете.<br>За край натиснете стоп и запазете", "left:50%;top:452px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });
}

// ═════════════ auto-lock — Настройки › Дисплей › Време до изключване ═════════════
{
  const opts = ["15 секунди", "30 секунди", "1 минута", "2 минути", "5 минути", "10 минути", "30 минути"];
  S["auto-lock"] = P(col(`${appBar("Време до изключване на екрана")}
    <div style="padding:6px 0">${opts.map((o, i) => `<div class="${i === 2 ? "ring" : ""}" style="display:flex;align-items:center;gap:18px;height:60px;padding:0 24px;font-size:17px;color:${INK};${i === 2 ? "border-radius:14px;margin:2px 10px;padding:0 14px" : ""}">${radio(i === 2)}${o}</div>`).join("")}</div>
    <div style="padding:10px 26px;font-size:14px;color:${SUB};line-height:1.45">Екранът угасва и се заключва сам, ако не го докосвате.</div>`), "#fff", "#0b0b0b")
    + tip("Изберете удобно време (напр. 1 минута).<br>Екранът ще угасва и заключва сам", "left:50%;top:560px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "u", at: "50%" });
}

// ═════════════ block-popups — Chrome › Настройки на сайтовете › Изскачащи прозорци ═════════════
S["block-popups"] = P(col(`${appBar("Изскачащи прозорци и пренасочвания", { size: 20 })}
  <div style="margin:8px 16px 0;background:#d3e3fd;border-radius:28px;height:76px;display:flex;align-items:center;padding:0 22px;gap:14px"><div style="flex:1"><div style="font-size:17px;font-weight:500;color:#041e49">Блокирани (препоръчително)</div></div><span class="ring" style="display:inline-block;border-radius:16px">${toggle(false)}</span></div>
  <div style="padding:20px 24px 0;font-size:14px;color:${SUB};line-height:1.5">Сайтовете няма да показват изскачащи прозорци и няма да ви пренасочват към други страници. Така се пазите от измамни реклами.</div>
  <div style="padding:26px 24px 8px;font-size:14px;color:${BLUE};font-weight:500">Разрешени</div>
  <div style="padding:0 24px;font-size:15px;color:${SUB}">Няма сайтове, на които сте разрешили изскачащи прозорци</div>
  <div style="padding:26px 24px 8px;font-size:14px;color:${BLUE};font-weight:500">Блокирани</div>
  <div style="padding:0 24px;font-size:15px;color:${SUB}">Няма добавени изключения</div>`), "#fff", "#0b0b0b")
  + tip("За да блокирате, превключвателят е ИЗКЛЮЧЕН —<br>тогава пише „Блокирани (препоръчително)“", "left:50%;top:420px;transform:translateX(-50%);width:max-content;max-width:360px");

// ═════════════ data-saver — YouTube › Предпочитания за качество на видеото ═════════════
{
  const o = (t, s, on, ring) => `<div class="${ring ? "ring" : ""}" style="display:flex;align-items:center;gap:18px;padding:12px 22px;min-height:72px;${ring ? "border-radius:14px;margin:2px 10px;padding:12px 12px" : ""}">${radio(on)}<div><div style="font-size:16px;color:${INK}">${t}</div><div style="font-size:13px;color:${SUB};margin-top:3px;line-height:1.35">${s}</div></div></div>`;
  S["data-saver"] = P(col(`${appBar("Предпочитания за качество на видеото", { size: 20 })}
    <div style="padding:14px 24px 4px;font-size:14px;color:${BLUE};font-weight:500">При мобилна мрежа</div>
    ${o("Автоматично", "Качеството се променя според връзката", 0)}${o("По-високо качество на картината", "Използва повече данни", 0)}${o("Икономия на данни", "По-ниско качество, използва по-малко данни", 1, 1)}
    <div style="height:1px;background:#e3e3e3;margin:10px 0 0"></div>
    <div style="padding:16px 24px 4px;font-size:14px;color:${BLUE};font-weight:500">При Wi-Fi</div>
    ${o("Автоматично", "Качеството се променя според връзката", 1)}${o("По-високо качество на картината", "Използва повече данни", 0)}`), "#fff", "#0b0b0b")
    + tip("Изберете „Икономия на данни“ — видеото е<br>с по-ниско качество и харчи по-малко интернет", "left:50%;top:540px;transform:translateX(-50%);width:max-content;max-width:360px");
}

// ═════════════ recharge-voucher — набиране на код (Samsung Телефон) ═════════════
{
  const keys = [["1", ""], ["2", "ABC"], ["3", "DEF"], ["4", "GHI"], ["5", "JKL"], ["6", "MNO"], ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"], ["*", ""], ["0", "+"], ["#", ""]];
  S["recharge-voucher"] = P(col(`
    <div style="height:150px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:14px;flex-shrink:0"><div style="font-size:32px;color:#000;letter-spacing:.5px;font-weight:300">*123*4829175306#</div><div style="font-size:13px;color:#1a73e8;margin-top:8px">Добавяне към контактите</div></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);padding:0 22px;flex:1;align-content:center">${keys.map(([k, l]) => `<div style="height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:32px;color:#000;font-weight:300;line-height:1">${k}</div><div style="font-size:10px;color:#777;letter-spacing:1px;height:12px;margin-top:2px">${l}</div></div>`).join("")}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 44px 14px;flex-shrink:0"><span style="width:44px;display:flex;justify-content:center">${ms("videocam", { size: 28, color: "#444" })}</span><div class="ring ringr" style="width:68px;height:68px;border-radius:50%;background:#1ea446;display:flex;align-items:center;justify-content:center">${ms("call", { size: 32, fill: 1, color: "#fff" })}</div><span style="width:44px;display:flex;justify-content:center">${ms("backspace", { size: 26, color: "#444" })}</span></div>
    <div style="height:62px;display:flex;border-top:1px solid #eceef1;flex-shrink:0">${[["dialpad", "Клавиатура", 1], ["schedule", "Скорошни", 0], ["person", "Контакти", 0]].map(([i, l, on]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11.5px;color:${on ? "#1a73e8" : "#666"}">${ms(i, { size: 24, fill: on, color: on ? "#1a73e8" : "#666" })}${l}</div>`).join("")}</div>`, "#fff"), "#fff", "#0b0b0b")
    + tip("Наберете кода от ваучера (*123*код#),<br>после натиснете зеления бутон за обаждане", "left:50%;top:462px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });
}

// ═════════════ е-услуги: измислен дизайн, примерни данни ═════════════
const sitePage = (url, brand, color, inner) => col(`${chromeBar(url)}
  <div style="flex:1;background:#f5f6f8;overflow:hidden">
    <div style="background:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #e1e4e8"><div style="width:30px;height:30px;border-radius:8px;background:${color};color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center">е</div><div style="font-size:17px;font-weight:700;color:${color}">${brand}</div><span style="flex:1"></span>${ms("menu", { size: 26, color: "#333" })}</div>
    <div style="background:#fff7d6;border-bottom:1px solid #f0e2a0;padding:7px 16px;font-size:12px;color:#6b5600;display:flex;gap:6px;align-items:center">${ms("info", { size: 16, fill: 1, color: "#8a6d00" })}Примерна страница за обучение — не е официален сайт</div>
    ${inner}</div>`, "#fff");
const input = (label, val, ph) => `<div style="margin-bottom:14px"><div style="font-size:13px;color:#333;margin-bottom:5px;font-weight:500">${label}</div><div style="height:46px;border:1px solid #b9bfc7;border-radius:6px;background:#fff;padding:0 12px;display:flex;align-items:center;font-size:16px;color:${val ? "#111" : "#8a919a"};letter-spacing:${val ? "2px" : "0"}">${val || ph}</div></div>`;

S["check-fines"] = P(sitePage("uslugi.example.bg/globi", "Е-услуги", "#1d5c63", `
  <div style="padding:18px 16px 0"><div style="font-size:22px;font-weight:700;color:#14292c;line-height:1.2;margin-bottom:6px">Проверка на глоби и задължения</div><div style="height:70px"></div>
  ${input("ЕГН", "••••••••••")}
  <div style="margin-bottom:14px"><div style="font-size:13px;color:#333;margin-bottom:5px;font-weight:500">Вид документ</div><div style="height:46px;border:1px solid #b9bfc7;border-radius:6px;background:#fff;padding:0 12px;display:flex;align-items:center;font-size:16px;color:#111">Лична карта<span style="flex:1"></span>${ms("expand_more", { size: 24, color: "#555" })}</div></div>
  ${input("Номер на документа", "•••••••••")}
  <div class="ring" style="height:50px;border-radius:8px;background:#1d5c63;color:#fff;font-size:17px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-top:20px">Провери</div>
  <div style="font-size:12px;color:#777;margin-top:12px;line-height:1.4">Данните се използват само за проверката и не се запазват.</div></div>`), "#fff", "#0b0b0b")
  + tip("Въведете данните от документите си,<br>после „Провери“ — резултатът е веднага", "left:50%;top:206px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });

S["polling-station"] = P(sitePage("izbori.example.bg/sekciya", "Изборна справка", "#2d6a4f", `
  <div style="padding:18px 16px 0"><div style="font-size:22px;font-weight:700;color:#16301f;line-height:1.2;margin-bottom:6px">Къде гласувам?</div><div style="height:70px"></div>
  ${input("ЕГН", "••••••••••")}
  <div class="ring" style="height:50px;border-radius:8px;background:#2d6a4f;color:#fff;font-size:17px;font-weight:600;display:flex;align-items:center;justify-content:center;margin:18px 0 20px">Намери секцията</div>
  <div style="background:#fff;border:1px solid #cfe5d7;border-left:5px solid #2d6a4f;border-radius:8px;padding:14px 14px 12px"><div style="font-size:13px;color:#2d6a4f;font-weight:600">Вашата секция</div><div style="font-size:24px;font-weight:700;color:#16301f;margin:2px 0 8px">№ 012</div>
  <div style="display:flex;gap:8px;font-size:14px;color:#333;line-height:1.4">${ms("location_on", { size: 20, fill: 1, color: "#2d6a4f" })}<div>Основно училище (пример)<br>ул. „Примерна“ 5, Бобов дол</div></div>
  <div style="display:flex;gap:8px;font-size:14px;color:#333;margin-top:8px">${ms("schedule", { size: 20, color: "#2d6a4f" })}<div>Работно време: 7:00 – 20:00</div></div></div></div>`), "#fff", "#0b0b0b")
  + tip("Въведете ЕГН — виждате номера<br>и адреса на секцията си", "left:50%;top:206px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });

// ═════════════ scan-document — сканиране с камерата ═════════════
{
  const line = (w) => `<div style="height:5px;width:${w}%;background:#555;border-radius:2px;margin:7px 0;opacity:.7"></div>`;
  const wood = `<svg width="390" height="470" style="position:absolute;inset:0"><defs><filter id="w"><feTurbulence type="fractalNoise" baseFrequency="0.012 0.42" numOctaves="4" seed="7"/><feColorMatrix values="0 0 0 0 .36  0 0 0 0 .22  0 0 0 0 .12  0 0 0 1.1 -.15"/></filter></defs><rect width="390" height="470" fill="#6b4529"/><rect width="390" height="470" filter="url(#w)"/><rect width="390" height="470" fill="rgba(0,0,0,.25)"/></svg>`;
  S["scan-document"] = P(col(`
    <div style="height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;flex-shrink:0;color:#fff">${ms("close", { size: 26, color: "#fff" })}<span style="font-size:14px;background:rgba(255,255,255,.16);padding:7px 14px;border-radius:16px">Сканиране на документ</span>${ms("flash_auto", { size: 26, color: "#fff" })}</div>
    <div style="flex:1;position:relative;overflow:hidden">${wood}
      <div style="position:absolute;left:58px;top:36px;width:262px;height:372px;background:linear-gradient(135deg,#fbfaf6,#efeee8);transform:rotate(-2.4deg);box-shadow:0 14px 26px rgba(0,0,0,.5),0 2px 4px rgba(0,0,0,.4);font-family:'DejaVu Serif',serif;color:#2a2a2a;padding:22px 20px">
        <div style="text-align:center;font-size:15px;font-weight:700;letter-spacing:1.5px">УДОСТОВЕРЕНИЕ</div><div style="text-align:center;font-size:9px;margin:3px 0 16px;color:#555">№ 0000/00.00.0000 г. (образец)</div>
        <div style="font-size:10.5px;line-height:1.7">Име: Иван Петров Иванов<br>Адрес: гр. Бобов дол, ул. „Примерна“ 5</div>${line(96)}${line(88)}${line(92)}${line(60)}<div style="margin-top:14px"></div>${line(94)}${line(80)}${line(90)}${line(44)}
        <div style="position:absolute;right:22px;bottom:26px;width:62px;height:62px;border:2px solid rgba(40,70,140,.55);border-radius:50%;opacity:.7"></div></div>
      <svg width="390" height="470" style="position:absolute;inset:0"><polygon points="56,40 322,26 330,404 64,414" fill="rgba(66,133,244,.14)" stroke="#fff" stroke-width="2.2"/>${[[56, 40], [322, 26], [330, 404], [64, 414]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="#fff" stroke="#4285f4" stroke-width="3"/>`).join("")}</svg></div>
    <div style="height:132px;background:#000;display:flex;align-items:center;justify-content:space-between;padding:0 36px;flex-shrink:0"><div style="width:48px;height:48px;border-radius:10px;overflow:hidden;border:2px solid rgba(255,255,255,.6)">${crop("meadow2", "50% 50%", 1.4)}</div><div class="ring" style="width:76px;height:76px;border-radius:50%;background:#fff;border:5px solid rgba(255,255,255,.45);background-clip:padding-box"></div><span style="width:48px"></span></div>`, "#000"), "#000", "#fff")
    + tip("Сложете документа на светло, насочете камерата<br>право отгоре, проверете рамката и снимайте", "left:50%;top:484px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });
}

// ═════════════ transit-ticket — билет в телефона ═════════════
{
  const qr = QR.create("BD-AUTOBUS-4821-7730-DEMO", { errorCorrectionLevel: "M" });
  const n = qr.modules.size, d = qr.modules.data, c = 6;
  let cells = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (d[y * n + x]) cells += `<rect x="${x * c}" y="${y * c}" width="${c}" height="${c}"/>`;
  const qrSvg = `<svg width="${n * c}" height="${n * c}" viewBox="0 0 ${n * c} ${n * c}" shape-rendering="crispEdges" fill="#111">${cells}</svg>`;
  const nav = [["confirmation_number", "Билети", 1], ["shopping_cart", "Купи", 0], ["person", "Профил", 0]];
  S["transit-ticket"] = P(col(`
    <div style="background:#0a3d6b;color:#fff;padding:12px 8px 14px 8px;display:flex;align-items:center;gap:6px;flex-shrink:0"><span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center">${ms("arrow_back", { size: 24, color: "#fff" })}</span><div style="flex:1;font-size:20px;font-weight:500">Билет за автобус</div></div>
    <div style="flex:1;background:#e9eef4;padding:18px 18px 0;overflow:hidden"><div style="background:#fff;border-radius:18px;box-shadow:0 4px 16px rgba(10,61,107,.18);position:relative;overflow:visible">
      <div style="padding:18px 20px 16px"><div style="display:flex;align-items:center;gap:10px"><div style="flex:1"><div style="font-size:12px;color:#667">Тръгване</div><div style="font-size:22px;font-weight:700;color:#0a3d6b">14:20</div><div style="font-size:14px;color:#222">Бобов дол</div></div>${ms("arrow_forward", { size: 26, color: "#8aa0b6" })}<div style="flex:1;text-align:right"><div style="font-size:12px;color:#667">Пристигане</div><div style="font-size:22px;font-weight:700;color:#0a3d6b">14:50</div><div style="font-size:14px;color:#222">Дупница</div></div></div>
      <div style="display:flex;gap:18px;margin-top:14px;font-size:13px;color:#333"><div><span style="color:#667">Дата</span><br><b>30.10.2026</b></div><div><span style="color:#667">Място</span><br><b>12</b></div><div><span style="color:#667">Пътник</span><br><b>1 възрастен</b></div></div></div>
      <div style="position:relative;height:0;border-top:2px dashed #cfd8e2;margin:0 14px"><i style="position:absolute;left:-30px;top:-12px;width:22px;height:22px;border-radius:50%;background:#e9eef4"></i><i style="position:absolute;right:-30px;top:-12px;width:22px;height:22px;border-radius:50%;background:#e9eef4"></i></div>
      <div style="padding:18px 20px 16px;display:flex;flex-direction:column;align-items:center"><div class="ring" style="padding:8px;background:#fff;border-radius:6px">${qrSvg}</div><div style="font-size:13px;color:#444;margin-top:12px;letter-spacing:1.2px">4821 7730 0412</div><div style="font-size:12px;color:#667;margin-top:2px">Валиден днес до 23:59</div>
      <div style="display:flex;width:100%;align-items:baseline;margin-top:12px;padding-top:10px;border-top:1px solid #eef1f5"><span style="flex:1;font-size:13px;color:#667">Цена</span><span style="font-size:22px;font-weight:800;color:#111">2,50 €</span></div></div></div></div>
    <div style="height:64px;display:flex;background:#0a3d6b;flex-shrink:0">${nav.map(([i, l, on]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11.5px;color:${on ? "#fff" : "#9fb4c9"};font-weight:${on ? 700 : 400}">${ms(i, { size: 24, fill: on, color: on ? "#fff" : "#9fb4c9" })}${l}</div>`).join("")}</div>`, "#e9eef4"), "#0a3d6b", "#fff")
    + tip("Покажете кода на шофьора или на валидатора.<br>Пазете билета до края на пътуването", "left:50%;top:536px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "u", at: "50%" });
}

// ═════════════ taxi — карта OpenStreetMap ═════════════
{
  const tiles = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) tiles.push(`<img alt="" src="${pathToFileURL(path.join(ASSETS, "misc", `osm-16-${36955 + i}-${24237 + j}.png`)).href}" style="position:absolute;left:${i * 256}px;top:${j * 256}px;width:256px;height:256px">`);
  const pin = (x, y, c, ic) => `<div style="position:absolute;left:${x - 18}px;top:${y - 44}px;width:36px;height:44px;display:flex;flex-direction:column;align-items:center"><div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${c};box-shadow:0 2px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;border:2px solid #fff"><span style="transform:rotate(45deg);display:flex">${ms(ic, { size: 18, fill: 1, color: "#fff" })}</span></div></div>`;
  const car = (x, y, r) => `<div style="position:absolute;left:${x - 15}px;top:${y - 15}px;width:30px;height:30px;border-radius:50%;background:#fcc934;border:2px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;transform:rotate(${r}deg)">${ms("local_taxi", { size: 18, fill: 1, color: "#111" })}</div>`;
  const route = "M305 484 C 296 462, 282 440, 270 414 C 262 394, 258 370, 262 346 C 264 332, 262 320, 256 306";
  S["taxi"] = P(col(`
    <div style="position:absolute;left:0;top:0;width:390px;height:660px;overflow:hidden;background:#f2efe9"><div style="position:absolute;left:-95px;top:-150px;width:768px;height:768px">${tiles.join("")}
      <svg width="768" height="768" style="position:absolute;inset:0"><path d="${route}" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="${route}" fill="none" stroke="#1a73e8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${pin(305, 486, "#1a73e8", "person_pin_circle")}${pin(256, 306, "#d93025", "flag")}${car(334, 450, 0)}${car(240, 436, 0)}${car(286, 332, 0)}</div></div>
    <div style="position:absolute;left:12px;right:12px;top:12px;background:#fff;border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,.28);padding:6px 14px">
      <div style="display:flex;align-items:center;gap:12px;height:44px;border-bottom:1px solid #eee"><span style="width:10px;height:10px;border-radius:50%;background:#1a73e8"></span><div style="font-size:15px;color:#111;flex:1">Моята позиция — ул. „Димитър Благоев“</div></div>
      <div style="display:flex;align-items:center;gap:12px;height:44px"><span style="width:10px;height:10px;background:#d93025"></span><div style="font-size:15px;color:#111;flex:1">Център, ул. „27 октомври“</div></div></div>
    <div style="position:absolute;right:4px;bottom:226px;background:rgba(255,255,255,.82);font-size:10px;color:#333;padding:1px 5px;border-radius:3px 0 0 0;z-index:3">© OpenStreetMap contributors</div>
    <div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:22px 22px 0 0;padding:10px 18px 16px;box-shadow:0 -4px 16px rgba(0,0,0,.2)">
      <div style="width:36px;height:4px;border-radius:2px;background:#ccc;margin:0 auto 12px"></div>
      <div style="display:flex;align-items:center;gap:14px;padding:10px 12px;border:2px solid #111;border-radius:14px">${ms("local_taxi", { size: 34, fill: 1, color: "#111" })}<div style="flex:1"><div style="font-size:16px;font-weight:700;color:#111">Такси · до 4 места</div><div style="font-size:13px;color:#666;margin-top:2px">Колата е на 4 минути</div></div><div style="font-size:18px;font-weight:800;color:#111">~4,50 €</div></div>
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#555;margin:12px 2px 12px">${ms("payments", { size: 20, color: "#555" })}Плащане в брой на шофьора</div>
      <div class="ring" style="height:52px;border-radius:12px;background:#111;color:#fff;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center">Поръчай такси</div></div>`, "#f2efe9"), "#fff", "#0b0b0b")
    + tip("Въведете адресите и натиснете „Поръчай такси“.<br>Виждате колата как идва към Вас на картата", "left:50%;top:378px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });
}

// ═════════════ telemedicine — видео преглед, влизане (без лица) ═════════════
S["telemedicine"] = P(col(`
  <div style="height:60px;display:flex;align-items:center;padding:0 10px;color:#e8eaed;flex-shrink:0"><span style="width:44px;display:flex;justify-content:center">${ms("close", { size: 24, color: "#e8eaed" })}</span><div style="flex:1;font-size:18px">Видео преглед</div></div>
  <div style="padding:6px 22px 0;color:#e8eaed"><div style="font-size:22px;font-weight:500">Д-р Мария Иванова</div><div style="font-size:14px;color:#9aa0a6;margin-top:4px">Личен лекар · днес, 10:30 · видео консултация</div></div>
  <div style="margin:22px 18px 0;height:218px;border-radius:16px;background:#2d2f33;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px"><div style="width:84px;height:84px;border-radius:50%;background:#5f6368;color:#fff;font-size:34px;display:flex;align-items:center;justify-content:center">ИП</div><div style="font-size:14px;color:#bdc1c6;display:flex;gap:6px;align-items:center">${ms("videocam_off", { size: 18, fill: 1, color: "#bdc1c6" })}Камерата е изключена</div><div style="position:absolute;left:12px;bottom:10px;font-size:13px;color:#e8eaed">Иван Петров</div></div>
  <div style="display:flex;justify-content:center;gap:16px;margin-top:18px">${circ("mic", { s: 52, bg: "#3c4043", is: 24 })}${circ("videocam_off", { s: 52, bg: "#a8c7fa", is: 24, color: "#062e6f" })}${circ("chat", { s: 52, bg: "#3c4043", is: 24 })}</div>
  <div style="text-align:center;font-size:13px;color:#9aa0a6;margin-top:14px">Микрофонът работи. Проверете и звука на телефона</div>
  <div style="flex:1"></div>
  <div style="margin:0 18px 12px"><div class="ring" style="height:54px;border-radius:27px;background:#a8c7fa;color:#062e6f;font-size:17px;font-weight:600;display:flex;align-items:center;justify-content:center">Влез в разговора</div></div>
  <div style="margin:0 16px 14px;font-size:12px;color:#9aa0a6;text-align:center;line-height:1.4;display:flex;gap:6px;justify-content:center">${ms("warning", { size: 16, fill: 1, color: "#f28b82" })}<span>Не е за спешни случаи. При опасност звънете на 112</span></div>`, "#202124"), "#202124", "#fff")
  + tip("В уречения час натиснете „Влез в разговора“<br>и опишете оплакванията си на лекаря", "left:50%;top:470px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "50%" });

// ═════════════ sos-button — Настройки › Безопасност и спешни случаи › Спешно SOS ═════════════
{
  const row = (t, s, on, ic) => `<div style="display:flex;align-items:center;gap:16px;padding:12px 20px;min-height:72px"><span style="width:24px">${ms(ic, { size: 24, color: SUB })}</span><div style="flex:1"><div style="font-size:16px;color:${INK}">${t}</div><div style="font-size:13px;color:${SUB};margin-top:2px;line-height:1.35">${s}</div></div>${toggle(on)}</div>`;
  S["sos-button"] = P(col(`${appBar("Спешно SOS")}
    <div style="margin:4px 16px 0;background:${CONT};border-radius:24px;height:150px;display:flex;align-items:center;justify-content:center;gap:26px">
      <svg width="86" height="118" viewBox="0 0 86 118"><rect x="6" y="4" width="68" height="110" rx="12" fill="#fff" stroke="#8a9099" stroke-width="3"/><rect x="74" y="34" width="6" height="26" rx="3" fill="#d93025"/><path d="M84 28v38" stroke="#d93025" stroke-width="2" stroke-dasharray="2 4" opacity="0"/><text x="40" y="70" text-anchor="middle" font-family="Roboto" font-weight="700" font-size="24" fill="#d93025">SOS</text></svg>
      <div style="font-size:15px;color:${INK};line-height:1.4;max-width:150px"><b style="font-size:26px;color:#d93025">5×</b><br>натиснете бързо бутона за включване</div></div>
    <div class="ring" style="display:flex;align-items:center;gap:16px;margin:14px 10px 0;padding:14px 12px;min-height:72px;border-radius:16px"><div style="flex:1;font-size:17px;font-weight:500;color:${INK}">Използване на спешно SOS</div>${toggle(true)}</div>
    ${row("Обаждане за помощ", "Автоматично набира спешния номер 112", 1, "call")}
    ${row("Известяване на спешните контакти", "Изпраща съобщение с мястото ви на близък човек", 1, "sms")}
    <div style="display:flex;align-items:center;gap:16px;padding:14px 20px;font-size:16px;color:${BLUE};font-weight:500">${ms("person_add", { size: 24, color: BLUE })}Добавяне на спешен контакт</div>`), "#fff", "#0b0b0b")
    + tip("Включете функцията и добавете спешен контакт —<br>при 5 натискания телефонът звъни на 112", "left:50%;top:548px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "u", at: "20%" });
}

// ═════════════ emergency-contact-lock — спешна информация от заключен екран ═════════════
{
  const info = (l, v) => `<div style="padding:10px 20px"><div style="font-size:12.5px;color:${SUB}">${l}</div><div style="font-size:17px;color:${INK};margin-top:2px">${v}</div></div>`;
  S["emergency-contact-lock"] = P(col(`${appBar("Спешна информация")}
    <div style="margin:0 16px 8px;background:#e8f0fe;border-radius:14px;padding:10px 14px;display:flex;gap:10px;align-items:center;font-size:13.5px;color:#0b3a8c">${ms("lock", { size: 20, fill: 1, color: "#0b57d0" })}Достъпно от заключения екран, без отключване</div>
    ${info("Име", "Иван Петров")}${info("Кръвна група", "A (II) Rh+")}${info("Алергии", "Пеницилин")}${info("Лекарства", "Метформин 500 mg · сутрин и вечер")}
    <div style="height:1px;background:#e3e3e3;margin:8px 0 4px"></div>
    <div style="padding:10px 20px 4px;font-size:12.5px;color:${SUB}">Спешни контакти</div>
    <div class="ring" style="display:flex;align-items:center;gap:14px;margin:2px 10px;padding:8px 10px;border-radius:14px">${av("М", "#7e57c2", 46)}<div style="flex:1"><div style="font-size:16px;color:${INK}">Мария Петрова</div><div style="font-size:13px;color:${SUB}">Дъщеря · 0888 123 456</div></div><span style="width:44px;height:44px;border-radius:50%;background:#c4eed0;display:flex;align-items:center;justify-content:center">${ms("call", { size: 22, fill: 1, color: "#0a5c2c" })}</span></div>
    <div style="flex:1"></div>
    <div style="margin:0 16px 14px;height:50px;border-radius:25px;border:2px solid #d93025;color:#d93025;font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px">${ms("emergency", { size: 22, fill: 1, color: "#d93025" })}Спешно обаждане 112</div>`), "#fff", "#0b0b0b")
    + tip("Спасител вижда спешния Ви контакт и може да се<br>обади на близкия Ви, без да отключва телефона", "left:50%;top:506px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "u", at: "50%" });
}

// ═════════════ lock-app — Заключване на приложения ═════════════
{
  const bank = `<div style="width:44px;height:44px;border-radius:13px;background:#0b57d0;display:flex;align-items:center;justify-content:center">${ms("account_balance", { size: 26, fill: 1, color: "#fff" })}</div>`;
  const row = (icon, name, on, ring) => `<div class="${ring ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;padding:10px 16px;min-height:68px;${ring ? "border-radius:14px;margin:2px 8px;padding:10px 8px" : ""}">${icon}<div style="flex:1;font-size:17px;color:${INK}">${name}</div>${toggle(on)}</div>`;
  S["lock-app"] = P(col(`${appBar("Заключване на приложения")}
    <div style="margin:6px 16px 10px;background:${CONT};border-radius:20px;padding:14px 18px;display:flex;align-items:center;gap:14px">${ms("fingerprint", { size: 32, color: BLUE })}<div style="flex:1"><div style="font-size:15px;font-weight:500;color:${INK}">Отключване с пръстов отпечатък</div><div style="font-size:13px;color:${SUB};margin-top:2px">или с ПИН код на телефона</div></div></div>
    <div style="padding:8px 22px 4px;font-size:14px;color:${BLUE};font-weight:500">Приложения</div>
    ${row(bank, "Банково приложение", 1, 1)}${row(appIcon("viber", { size: 44, label: false }), "Viber", 1)}${row(appIcon("gallery", { size: 44, label: false }), "Галерия", 0)}
    <div style="padding:14px 24px;font-size:13.5px;color:${SUB};line-height:1.45">Заключеното приложение иска пръст или код при всяко отваряне — дори телефонът да е отключен.</div>`), "#fff", "#0b0b0b")
    + tip("Включете ключето до приложението (напр. банката).<br>После то иска пръст или код при отваряне", "left:50%;top:394px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "u", at: "50%" });
}

// ═════════════ free-space — Files by Google, „Почистване“ ═════════════
{
  const card = (ic, c, bgc, t, s, ring) => `<div class="${ring ? "ring" : ""}" style="background:${CONT};border-radius:20px;padding:14px 14px 12px;display:flex;flex-direction:column;gap:10px"><div style="width:44px;height:44px;border-radius:14px;background:${bgc};display:flex;align-items:center;justify-content:center">${ms(ic, { size: 26, fill: 1, color: c })}</div><div><div style="font-size:15px;font-weight:500;color:${INK}">${t}</div><div style="font-size:13px;color:${SUB};margin-top:2px">${s}</div></div></div>`;
  const nav = [["cleaning_services", "Почистване", 1], ["folder", "Преглед", 0], ["share", "Споделяне", 0]];
  S["free-space"] = P(col(`
    <div style="height:60px;display:flex;align-items:center;padding:0 16px 0 20px;flex-shrink:0"><div style="flex:1;font-size:22px;color:${INK}">Файлове</div>${ms("search", { size: 24, color: SUB, style: "margin-right:14px" })}${ms("more_vert", { size: 24, color: SUB })}</div>
    <div style="margin:4px 16px 14px;background:#fce8e6;border-radius:24px;padding:16px 18px"><div style="font-size:15px;color:#601410;font-weight:500">Мястото в телефона почти свърши</div><div style="font-size:30px;font-weight:500;color:#601410;margin:6px 0 10px">6 GB <span style="font-size:15px;font-weight:400">свободни от 64 GB</span></div>
      <div style="height:12px;border-radius:6px;background:#fff;overflow:hidden;display:flex"><div style="width:44%;background:#d93025"></div><div style="width:28%;background:#f29900"></div><div style="width:18%;background:#1a73e8"></div></div>
      <div style="display:flex;gap:14px;font-size:12px;color:#601410;margin-top:8px"><span>Снимки и видео</span><span>Приложения</span><span>Други</span></div></div>
    <div style="padding:0 20px 8px;font-size:14px;color:${SUB};font-weight:500">Предложения за освобождаване на място</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 16px">${card("delete_sweep", "#b3261e", "#f9dedc", "Нежелани файлове", "1,3 GB")}${card("difference", "#0b57d0", "#d3e3fd", "Дублирани снимки", "480 MB", 1)}${card("movie", "#7a4f01", "#ffddb3", "Големи видеа", "2,1 GB")}${card("apps", "#0a5c2c", "#c4eed0", "Неизползвани приложения", "7 приложения")}</div>
    <div style="flex:1"></div>
    <div style="height:72px;display:flex;background:#f3f6fb;flex-shrink:0">${nav.map(([ic, l, on]) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:12px;color:${INK};font-weight:${on ? 700 : 500}"><span style="width:60px;height:30px;border-radius:15px;background:${on ? "#c2e7ff" : "transparent"};display:flex;align-items:center;justify-content:center">${ms(ic, { size: 22, fill: on, color: INK })}</span>${l}</div>`).join("")}</div>`, "#fff"), "#fff", "#0b0b0b")
    + tip("Изтрийте дублираните и ненужните снимки<br>и клипове — така се освобождава място", "left:50%;top:516px;transform:translateX(-50%);width:max-content;max-width:360px");
}

// ═════════════ logout-device — Google акаунт › Вашите устройства ═════════════
{
  const dev = (ic, name, sub, o = {}) => `<div class="${o.ring ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;padding:12px 16px;${o.ring ? "border-radius:16px;margin:4px 8px;padding:12px 8px" : ""}"><div style="width:48px;height:48px;border-radius:50%;background:${CONT};display:flex;align-items:center;justify-content:center">${ms(ic, { size: 26, color: SUB, fill: 1 })}</div><div style="flex:1"><div style="font-size:16px;color:${INK}">${name}</div><div style="font-size:13px;color:${o.green ? "#0a6c3a" : SUB};margin-top:2px;line-height:1.35">${sub}</div></div>${o.btn ? `<span style="border:1px solid ${LINE};border-radius:18px;padding:8px 16px;font-size:14px;font-weight:500;color:${BLUE}">Излизане</span>` : ""}</div>`;
  S["logout-device"] = P(col(`${appBar("Вашите устройства")}
    <div style="padding:4px 24px 14px;font-size:14px;color:${SUB};line-height:1.45">Влезли сте в акаунта си на 3 устройства. Излезте от тези, които не разпознавате или вече не ползвате.</div>
    ${dev("smartphone", "Samsung Galaxy A54", "Този телефон · Бобов дол, България<br>Активно сега", { green: 1 })}
    ${dev("computer", "Windows компютър", "Chrome · Дупница, България<br>Преди 2 дни", { ring: 1, btn: 1 })}
    ${dev("tablet_mac", "iPad", "Safari · София, България<br>Преди 3 седмици", { btn: 1 })}
    <div style="padding:16px 24px;font-size:13.5px;color:${SUB};line-height:1.45">След излизане устройството няма да има достъп до акаунта, докато не се влезе отново с парола.</div>`), "#fff", "#0b0b0b")
    + tip("Намерете устройството, което не ползвате,<br>и натиснете „Излизане“. После сменете паролата", "left:50%;top:462px;transform:translateX(-50%);width:max-content;max-width:360px");
}

// ═════════════ transfer-phone — първоначална настройка „Копиране на приложения и данни“ ═════════════
{
  const old = (x, y, c, rot) => `<div style="position:absolute;left:${x}px;top:${y}px;width:82px;height:148px;border-radius:16px;background:#fff;border:3px solid ${c};transform:rotate(${rot}deg);box-shadow:0 6px 14px rgba(0,0,0,.15);overflow:hidden"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:14px 8px">${["#ea4335", "#34a853", "#fbbc04", "#4285f4", "#7360f2", "#25d366", "#ff7043", "#1a73e8", "#9c27b0"].map((k) => `<i style="display:block;aspect-ratio:1;border-radius:6px;background:${k}"></i>`).join("")}</div></div>`;
  S["transfer-phone"] = P(col(`
    <div style="height:44px;flex-shrink:0"></div>
    <div style="padding:10px 28px 0"><div style="font-size:30px;line-height:1.2;color:${INK};font-weight:400">Копиране на приложения и данни</div><div style="font-size:15.5px;color:${SUB};margin-top:14px;line-height:1.5">Копирайте приложенията, снимките и контактите си от стария телефон — безплатно и без да губите нищо.</div></div>
    <div style="position:relative;height:210px;margin-top:22px">${old(76, 28, "#8a9099", -7)}${old(232, 28, "#0b57d0", 6)}
      <svg width="390" height="210" style="position:absolute;inset:0"><path d="M172 98 C 188 70, 208 70, 224 98" fill="none" stroke="#0b57d0" stroke-width="3" stroke-dasharray="3 7" stroke-linecap="round"/><path d="M216 90 L226 100 L212 104" fill="none" stroke="#0b57d0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div style="flex:1"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 24px 24px"><span style="font-size:15px;color:${BLUE};font-weight:500;padding:10px 6px">Не копирай</span><span class="ring" style="background:${BLUE};color:#fff;font-size:15px;font-weight:500;border-radius:24px;padding:13px 32px">Напред</span></div>`, "#fff"), "#fff", "#0b0b0b")
    + tip("Новият телефон сам предлага прехвърляне —<br>натиснете „Напред“ и следвайте стъпките", "left:50%;top:440px;transform:translateX(-50%);width:max-content;max-width:360px", { arrow: "d", at: "74%" });
}

// бележките (tip) са добавени след документа — премества се във вътрешността на .screen
for (const k of Object.keys(S)) {
  const i = S[k].indexOf("</html>");
  if (i < 0 || i + 7 >= S[k].length) continue;
  const tail = S[k].slice(i + 7), head = S[k].slice(0, i + 7);
  const j = head.indexOf('</div><div class="navbar');
  S[k] = head.slice(0, j) + tail + head.slice(j);
}

render(S).catch((e) => { console.error(e); process.exit(1); });
