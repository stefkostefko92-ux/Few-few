// Локален помощник за групата „телефонни основи, настройки и клавиатура“ (gen-3.js, gen-7.js).
// ЕДИН последователен стил за цялата група: Samsung One UI 6 (Настройки, бърз панел, заключен/начален екран),
// клавиатура Gboard (светла, българска фонетична „ЯВЕРТЪ“), Google Play / Google настройки в Material 3.
// Не пипа _shell.js — само го ползва. Снимките на тапети: assets/system/ (CC0, виж assets/credits/system.md).
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { phone, ms, appIcon, tip, ASSETS } = require("./_shell");

const wp = (n) => pathToFileURL(path.join(ASSETS, "system", n)).href;
const H = 760; // височина на работната област между лентата за състоянието и жестовата лента (≈ 19,5:9)
const BLUE = "#3e91ff";

const CSS = `
.osw{position:relative;display:inline-block;flex:none;width:50px;height:28px;border-radius:14px;background:#cfd0d4}
.osw i{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.osw.on{background:${BLUE}}.osw.on i{left:25px}
.oc{background:#fff;border-radius:26px;margin:0 12px 12px;overflow:hidden}
.orow{display:flex;align-items:center;gap:14px;padding:11px 18px;min-height:64px;position:relative}
.orow .ot{flex:1;min-width:0}
.orow .ot b{display:block;font-weight:400;font-size:16.5px;color:#111;line-height:1.25}
.orow .ot span{display:block;font-size:13px;color:#6b6b70;line-height:1.3;margin-top:2px}
.orow.ring{margin:2px 8px;padding:11px 10px;border-radius:18px}
.oic{width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;color:#fff}
.hs .al{text-shadow:0 1px 3px rgba(0,0,0,.65);color:#fff}
.hs .fl .al{color:#222;text-shadow:none}
.otrack{position:relative;height:4px;border-radius:2px;background:#d6d6da}
.otrack .f{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:${BLUE}}
.otrack .th{position:absolute;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4),0 0 0 .5px rgba(0,0,0,.12)}
.gk{display:flex;align-items:center;justify-content:center;height:50px;border-radius:9px;background:#fdfdfe;color:#1d1f23;font-size:22px;box-shadow:0 1px 0 rgba(0,0,0,.28);position:relative}
.gk.sp{background:#c8ced7;font-size:15px;font-weight:500}
`;

// Екран: wrapper с фиксирана височина; bg може да е цвят или url('…') center/cover
function scr(inner, o = {}) {
  const bg = o.bg || "#f6f6f6";
  return phone(`<style>${CSS}</style><div style="position:relative;height:${H}px;overflow:hidden;${o.css || ""}">${inner}</div>`, bg, o.sb || "#000", { time: o.time || "10:24", battery: o.battery == null ? 87 : o.battery });
}
const wpBg = (n) => `url('${wp(n)}') center/cover`;

const sw = (on, ring) => `<span class="osw${on ? " on" : ""}${ring ? " ring ringr" : ""}"><i></i></span>`;
const ic = (name, color, fill = 1) => `<span class="oic" style="background:${color}">${ms(name, { size: 21, fill, color: "#fff" })}</span>`;
const appIc = (name, s = 38) => appIcon(name, { size: s, label: false });
// ред в карта One UI. left = готов HTML (иконка), right = готов HTML
const orow = (left, title, sub, right = "", hl = false) =>
  `<div class="orow${hl ? " ring" : ""}">${left || ""}<div class="ot"><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</div>${right ? `<div style="display:flex;align-items:center;gap:6px;color:#6b6b70;font-size:14px">${right}</div>` : ""}</div>`;
const card = (rows, css = "") => `<div class="oc" style="${css}">${rows}</div>`;
const chev = ms("chevron_right", { size: 20, color: "#9a9aa0" });

// заглавна част на подстраница в One UI: стрелка назад + голямо заглавие
function hdr(title, o = {}) {
  return `<div style="height:${o.h || 108}px;padding:8px 22px 14px;display:flex;flex-direction:column;justify-content:space-between;color:#000">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-left:-8px">${ms("chevron_left", { size: 32, weight: 500 })}${o.right || ""}</div>
    <div style="font-size:${o.fs || 30}px;font-weight:500;letter-spacing:-.4px;line-height:1.1">${title}</div></div>`;
}
const sub = (t) => `<div style="padding:4px 28px 12px;font-size:13px;color:#6b6b70;line-height:1.4">${t}</div>`;
const slider = (pct, o = {}) => `<div class="otrack" style="${o.css || ""}"><div class="f" style="width:${pct}%;${o.fill ? `background:${o.fill}` : ""}"></div><div class="th${o.ring ? " ring ringr" : ""}" style="left:${pct}%"></div></div>`;

const ava = (l, c, s = 44) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:500;font-size:${Math.round(s * 0.42)}px;flex:none">${l}</div>`;

// ───────── бърз панел (One UI 6) ─────────
// o: {on:[имена на включени плочки], hl: плочка в червен контур, ring slider, slider %}
const TILES = [
  ["wifi", "Wi-Fi"], ["volume_up", "Звук"], ["bluetooth", "Bluetooth"], ["flight", "Самолетен режим"],
  ["screen_rotation", "Автозавъртане"], ["flashlight_on", "Фенерче"], ["swap_vert", "Мобилни данни"], ["battery_saver", "Пестене на енергия"],
  ["location_on", "Местоположение"], ["do_not_disturb_on", "Не безпокойте"], ["cast", "Умен изглед"], ["wifi_tethering", "Точка за достъп"],
];
function quickPanel(o = {}) {
  const on = new Set(o.on || []);
  const tiles = TILES.slice(0, 8).map(([icon, label]) => {
    const act = on.has(label);
    const r = o.hl === label ? " ring ringr" : "";
    return `<div style="width:90px;text-align:center"><div class="${r}" style="width:58px;height:58px;border-radius:50%;margin:0 auto 7px;display:flex;align-items:center;justify-content:center;background:${act ? BLUE : "rgba(255,255,255,.16)"}">${ms(icon, { size: 27, fill: act ? 1 : 0, color: "#fff" })}</div><div style="font-size:12px;line-height:1.2;color:#fff;opacity:.95;padding:0 2px">${label}</div></div>`;
  }).join("");
  const sl = o.slider == null ? 62 : o.slider;
  const note = (app, name, when, title, text) => `<div style="background:rgba(40,43,52,.9);border-radius:22px;padding:13px 16px;margin-bottom:8px;color:#fff"><div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#c6c9d0;margin-bottom:6px">${appIcon(app, { size: 18, label: false })}<span>${name}</span><span>•</span><span>${when}</span></div><div style="font-size:14.5px;font-weight:500">${title}</div><div style="font-size:13.5px;color:#d4d7de;margin-top:1px">${text}</div></div>`;
  return scr(`
    <div style="position:absolute;inset:-60px;background:url('${wp("wp-sea-sunset.jpg")}') center/cover;filter:blur(26px) brightness(.38) saturate(1.1)"></div>
    <div style="position:absolute;inset:0;color:#fff;padding:2px 16px 0">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;height:72px;padding:0 6px 6px">
        <div><div style="font-size:34px;font-weight:400;letter-spacing:-.5px;line-height:1">10:24</div><div style="font-size:13px;margin-top:5px;opacity:.85">пт, 30 октомври</div></div>
        <div style="display:flex;gap:18px;opacity:.95">${ms("search", { size: 24, color: "#fff" })}${ms("power_settings_new", { size: 24, color: "#fff" })}${ms("settings", { size: 24, color: "#fff" })}</div></div>
      <div style="display:grid;grid-template-columns:repeat(4,90px);row-gap:12px;justify-content:center;margin-top:16px">${tiles}</div>
      <div class="${o.ringSlider ? "ring" : ""}" style="margin:6px 4px 14px;height:46px;border-radius:23px;background:rgba(255,255,255,.2);position:relative;overflow:hidden;${o.ringSlider ? "overflow:visible;" : ""}">
        <div style="position:absolute;left:0;top:0;bottom:0;width:${sl}%;border-radius:23px;background:#fff;display:flex;align-items:center;padding-left:14px">${ms("light_mode", { size: 22, fill: 1, color: "#3a3a3f" })}</div>
        <div style="position:absolute;right:14px;top:0;bottom:0;display:flex;align-items:center">${ms("expand_more", { size: 22, color: "#fff" })}</div></div>
      <div style="display:flex;gap:8px;margin:0 4px 14px">
        <div style="flex:1;background:rgba(255,255,255,.16);border-radius:22px;padding:11px 14px;display:flex;align-items:center;gap:10px;font-size:13px">${ms("grid_view", { size: 20, color: "#fff" })}<span>Контрол на<br>устройствата</span></div>
        <div style="flex:1;background:rgba(255,255,255,.16);border-radius:22px;padding:11px 14px;display:flex;align-items:center;gap:10px;font-size:13px">${ms("play_circle", { size: 20, color: "#fff" })}<span>Изход за<br>мултимедията</span></div></div>
      <div style="margin:0 2px">${note("viber", "Viber", "сега", "Мария Петрова", "Добро утро! Ще дойдеш ли на кафе днес?")}${note("gmail", "Gmail", "9:12", "Общинска администрация", "Напомняне: срок за плащане на местни данъци")}</div>
    </div>
    ${o.extra || ""}`, { bg: "#14161c", sb: "#fff" });
}

// ───────── начален екран ─────────
const HOME = [
  ["play", "youtube", "gmail", "maps"],
  ["photos", "whatsapp", "viber", "facebook"],
  ["calendar", "gallery", "clock", "calculator"],
  ["notes", "files", "assistant", "settings"],
];
const colX = (c) => 48.75 + c * 97.5;
const rowY = (r) => 52 + r * 100;
function homeIcons(grid = HOME, o = {}) {
  let out = "";
  grid.forEach((row, r) => row.forEach((n, c) => {
    if (!n) return;
    out += `<div style="position:absolute;left:${colX(c) - 33}px;top:${rowY(r)}px;width:66px">${appIcon(n, { size: 56, label: n === "play" ? "Play" : true })}</div>`;
  }));
  return out;
}
function homeScreen(inner = "", o = {}) {
  const dock = ["phone", "messages", "chrome", "camera"].map((n) => appIcon(n, { size: 56, label: false })).join("");
  return scr(`<div class="hs" style="position:absolute;inset:0">
    ${o.noIcons ? "" : homeIcons(o.grid || HOME)}
    ${o.noDock ? "" : `<div style="position:absolute;left:14px;right:14px;top:${H - 214}px;height:52px;border-radius:26px;background:rgba(255,255,255,.93);display:flex;align-items:center;padding:0 16px;gap:10px;color:#3c4043;font-size:15px">${appIcon("google", { size: 26, label: false })}<span style="flex:1;opacity:.75">Търсене</span>${ms("mic", { size: 22, color: "#4285f4" })}${appIcon("lens", { size: 26, label: false })}</div>
    <div style="position:absolute;left:0;right:0;top:${H - 150}px;display:flex;justify-content:center;gap:7px"><i style="width:7px;height:7px;border-radius:50%;background:#fff"></i><i style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.5)"></i><i style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.5)"></i></div>
    <div style="position:absolute;left:12px;right:12px;top:${H - 124}px;height:84px;border-radius:30px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:space-around;padding:0 6px">${dock}</div>`}
    ${inner}</div>`, { bg: wpBg(o.wp || "wp-sea-sunset.jpg"), sb: "#fff", ...(o.scr || {}) });
}

// ───────── клавиатура Gboard (светла, български, фонетична „ЯВЕРТЪ“) ─────────
const ROWS = ["явертъуиопч".split(""), "асдфгхйклшщ".split(""), "зьцжбнмю".split("")];
// o: {shift:false|true|'caps', hl:'back'|'shift'|'space'|null, sug:[3 думи], mic}
function gboard(o = {}) {
  const up = !!o.shift;
  const sug = o.sug || ["", "", ""];
  const bar = `<div style="height:44px;display:flex;align-items:center;padding:0 6px;color:#2a2d33;font-size:17px">
    <span style="width:36px;display:flex;justify-content:center">${ms("chevron_right", { size: 24, color: "#5f6368" })}</span>
    ${sug.map((s) => `<span style="flex:1;text-align:center;border-left:1px solid rgba(0,0,0,.1);line-height:24px">${s}</span>`).join("")}
    <span style="width:36px;display:flex;justify-content:center">${ms("mic", { size: 22, color: "#5f6368", fill: 1 })}</span></div>`;
  const k = (t) => `<div class="gk" style="flex:1;min-width:0">${up ? t.toUpperCase() : t}</div>`;
  const shiftKey = `<div class="gk sp${o.hl === "shift" ? " ring" : ""}" style="width:46px;${o.shift ? "background:#aecbfa;" : ""}">${ms(o.shift === "caps" ? "keyboard_capslock" : "arrow_upward", { size: 24, fill: o.shift ? 1 : 0, color: "#1d1f23" })}</div>`;
  const backKey = `<div class="gk sp${o.hl === "back" ? " ring" : ""}" style="width:46px">${ms("backspace", { size: 24, fill: 0, color: "#1d1f23" })}</div>`;
  const row = (arr, pre = "", post = "", pad = 0) => `<div style="display:flex;gap:5px;padding:0 ${pad}px;margin-bottom:8px">${pre}${arr.map(k).join("")}${post}</div>`;
  return `<div style="background:#e5e8ed;padding:0 3px 6px;flex:none">${bar}
    ${row(ROWS[0])}${row(ROWS[1])}${row(ROWS[2], shiftKey, backKey, 0)}
    <div style="display:flex;gap:5px;margin-bottom:2px">
      <div class="gk sp" style="width:56px">?123</div><div class="gk sp" style="width:42px;font-size:22px">,</div>
      <div class="gk${o.hl === "space" ? " ring" : ""}" style="flex:1;font-size:14px;color:#5f6368">Български</div>
      <div class="gk sp" style="width:42px;font-size:22px">.</div>
      <div class="gk" style="width:56px;background:#aecbfa">${ms("keyboard_return", { size: 24, color: "#0b2a5a" })}</div></div></div>`;
}

// чат (Samsung Messages): bubbles = [[true|false (изходящо), текст]], input = HTML на полето
function chat(name, bubbles, inputHtml, kb, o = {}) {
  return `<div style="display:flex;flex-direction:column;height:${H}px;background:#fff">
    <div style="display:flex;align-items:center;gap:10px;padding:6px 14px 8px 8px;height:60px;border-bottom:1px solid #ececef">${ms("chevron_left", { size: 32, weight: 500 })}${ava(name[0], "#7e8fb0", 36)}<div style="flex:1;font-size:18px;font-weight:500">${name}</div>${ms("call", { size: 22, fill: 1, color: "#3a3a3f" })}${ms("more_vert", { size: 22, color: "#3a3a3f" })}</div>
    <div style="flex:1;padding:14px 14px 6px;display:flex;flex-direction:column;gap:8px;justify-content:flex-end;overflow:hidden">
      <div style="align-self:center;font-size:12px;color:#8a8a8f;margin-bottom:4px">Днес</div>
      ${bubbles.map(([out, t, tm]) => `<div style="align-self:${out ? "flex-end" : "flex-start"};max-width:78%;background:${out ? BLUE : "#ececf0"};color:${out ? "#fff" : "#111"};padding:9px 14px;border-radius:20px;font-size:15.5px;line-height:1.3">${t}</div>`).join("")}
    </div>
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px 8px">${ms("add_circle", { size: 28, color: "#6b6b70" })}<div style="flex:1;min-height:42px;border-radius:21px;background:#f0f0f3;padding:0 16px;display:flex;align-items:center;font-size:16px;color:#111;position:relative">${inputHtml}</div>${ms("send", { size: 24, fill: 1, color: BLUE })}</div>
    ${kb}</div>`;
}

// екран от Google (Material 3, бял): заглавие с назад
const gbar = (title) => `<div style="display:flex;align-items:center;gap:20px;padding:10px 16px 10px 14px;height:64px;color:#1f1f1f">${ms("arrow_back", { size: 24 })}<div style="font-size:22px;font-weight:400">${title}</div></div>`;
const grow = (title, subt, right = "", hl = false) => `<div class="${hl ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;padding:12px 22px;min-height:68px;${hl ? "margin:2px 8px;border-radius:16px;padding:12px 14px;" : ""}"><div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f;line-height:1.3">${title}</div>${subt ? `<div style="font-size:14px;color:#5f6368;line-height:1.35;margin-top:2px">${subt}</div>` : ""}</div>${right}</div>`;

module.exports = { scr, sw, ic, appIc, orow, card, chev, hdr, sub, slider, ava, quickPanel, homeScreen, homeIcons, HOME, colX, rowY, gboard, chat, gbar, grow, wp, wpBg, H, BLUE, CSS, TILES };
