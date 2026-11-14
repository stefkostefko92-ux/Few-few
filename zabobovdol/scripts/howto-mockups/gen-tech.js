// Група „tech“ (46 ръководства без картинка): основни понятия за технологиите, смартфон и интернет,
// памет/място/облак, достъпност, браузър, акаунти и пароли. Имена: tech-<смислено-име> → public/kak-da/.
// Стил: Samsung One UI 6 (чрез _oneui.js) за настройките, Material 3 за Google/Chrome, iOS за iPhone стъпките,
// истински снимки (CC0/PDM, assets/tech/, credits/tech.md) за предметите: рутер, СИМ карта, телевизор, таблет, тетрадка.
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-tech.js   |   ONLY=tech-wifi,tech-sim node …
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { phone, scene, tip, ms, appIcon, photo, ASSETS, render } = require("./_shell");
const U = require("./_oneui");
const { scr, sw, ic, appIc, orow, card, chev, hdr, sub, ava, wp, H, BLUE } = U;

const S = {};
const furl = (...p) => pathToFileURL(path.join(...p)).href;
const SITE_SHOT = furl(ASSETS, "instaliraj", "home-top.png");
const T = (y) => `top:${y}px`; // кратко за позиции на tip

// ───────── общи части ─────────
const dim = (a = 0.5) => `<div style="position:absolute;inset:0;background:rgba(0,0,0,${a});z-index:20"></div>`;
const ringBox = (inner, css = "", extra = "") => `<div class="ring" style="display:flex;align-items:center;justify-content:center;${css}">${inner}${extra}</div>`;
const gword = `<span style="font-size:28px;font-weight:500;letter-spacing:-.5px;font-family:Roboto,Arial,sans-serif"><span style="color:#4285f4">G</span><span style="color:#ea4335">o</span><span style="color:#fbbc05">o</span><span style="color:#4285f4">g</span><span style="color:#34a853">l</span><span style="color:#ea4335">e</span></span>`;

// Chrome (Android): адресна лента + страница
function chrome(url, inner, o = {}) {
  const bar = `<div style="height:56px;background:#fff;display:flex;align-items:center;padding:0 4px 0 12px;gap:2px;flex:0 0 auto;border-bottom:1px solid #e3e6ea">
    <div style="flex:1;height:42px;border-radius:21px;background:#f0f4f9;display:flex;align-items:center;gap:8px;padding:0 6px">
      <span style="width:32px;height:32px;border-radius:50%;background:#e2e8f1;display:flex;align-items:center;justify-content:center">${ms("tune", { size: 19, color: "#444746" })}</span>
      <span style="font-size:15.5px;color:#1f1f1f;letter-spacing:.1px;white-space:nowrap;overflow:hidden">${url}</span></div>
    <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center"><span style="width:22px;height:22px;border:2px solid #444746;border-radius:5px;font-size:12px;font-weight:700;color:#444746;display:flex;align-items:center;justify-content:center">1</span></div>
    <div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center">${ms("more_vert", { size: 24, color: "#444746" })}</div></div>`;
  return scr(`<div style="display:flex;flex-direction:column;height:${H}px;background:${o.bg || "#fff"}">${bar}<div style="flex:1;position:relative;overflow:hidden">${inner}</div></div>`, { bg: "#fff" });
}

// Material 3: поле с „плаваща“ етикет
function mfield(label, value, o = {}) {
  const ring = o.ring ? " ring" : "";
  return `<div class="${ring}" style="position:relative;height:56px;border:1.5px solid ${o.focus ? "#0b57d0" : "#79747e"};border-radius:6px;margin:${o.m || "0 0 22px"};display:flex;align-items:center;padding:0 14px;background:#fff;${o.css || ""}">
    <span style="position:absolute;left:10px;top:-10px;background:#fff;padding:0 4px;font-size:12px;color:${o.focus ? "#0b57d0" : "#49454f"}">${label}</span>
    <span style="font-size:16.5px;color:#1f1f1f;flex:1;white-space:nowrap;overflow:hidden">${value}</span>${o.right || ""}</div>`;
}
const gbtn = (t, o = {}) => `<div class="${o.ring ? "ring" : ""}" style="height:42px;padding:0 24px;border-radius:21px;background:${o.bg || "#0b57d0"};color:${o.fg || "#fff"};font-size:15px;font-weight:500;display:inline-flex;align-items:center;justify-content:center;${o.css || ""}">${t}</div>`;
const glink = (t, ring) => `<span class="${ring ? "ring" : ""}" style="color:#0b57d0;font-size:15px;font-weight:500;${ring ? "padding:6px 10px;border-radius:10px;display:inline-block;margin:-6px -10px" : ""}">${t}</span>`;

// Страница за вход/създаване на Google (accounts.google.com, мобилна)
const gpage = (inner, o = {}) => `<div style="padding:${o.pad || "34px 28px 0"};height:100%;background:#fff;position:relative">
  <div style="display:flex;justify-content:center">${gword}</div>
  <div style="text-align:center;font-size:25px;color:#1f1f1f;margin-top:22px;line-height:1.25">${o.title}</div>
  ${o.sub ? `<div style="text-align:center;font-size:15.5px;color:#444746;margin-top:8px;line-height:1.35">${o.sub}</div>` : ""}
  <div style="margin-top:${o.gap || 34}px">${inner}</div></div>`;

// Wi-Fi списък (One UI): иконата със сила на сигнала (n от 4 дъги са тъмни)
const sig = (n, on = "#3a3a3f", size = 28) => {
  const arc = (r, k) => { const d = r * 0.7071; return `<path d="M${(12 - d).toFixed(2)} ${(19 - d).toFixed(2)}A${r} ${r} 0 0 1 ${(12 + d).toFixed(2)} ${(19 - d).toFixed(2)}" fill="none" stroke="${n >= k ? on : "#c9c9ce"}" stroke-width="2.2" stroke-linecap="round"/>`; };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${arc(16, 4)}${arc(11, 3)}${arc(6, 2)}<circle cx="12" cy="18.6" r="1.8" fill="${n >= 1 ? on : "#c9c9ce"}"/></svg>`;
};
const wifiRow = (name, o = {}) =>
  orow(`<span style="width:38px;display:flex;justify-content:center">${sig(o.bars == null ? 4 : o.bars, o.color || "#3a3a3f")}</span>`, name, o.sub || "", o.lock === false ? "" : ms("lock", { size: 18, fill: 1, color: "#8a8a90" }), o.hl);
const wifiHead = (on = true) => hdr("Wi-Fi") +
  card(orow("", "Включено", "", sw(on), false), "margin-bottom:10px");

// ───────── снимките за предметите (assets/tech/) ─────────
const th = (name, o) => photo(path.join(ASSETS, "tech", name), o);


// ═══ WI-FI И ИНТЕРНЕТ ═══
// Свързване с Wi-Fi: списък + прозорец за парола
S["tech-wifi-svarzvane"] = scr(`
  <div style="position:absolute;inset:0">${wifiHead(true)}
  ${card(`<div style="padding:12px 20px 4px;font-size:13px;color:#6b6b70">Налични мрежи</div>
    ${wifiRow("Домашна мрежа", { hl: true, bars: 4 })}${wifiRow("Kristal_Net", { bars: 3 })}${wifiRow("Орфей Кафе", { bars: 2 })}${wifiRow("TP-Link_4F21", { bars: 2 })}`)}</div>
  ${dim(0.5)}
  <div style="position:absolute;z-index:30;left:22px;right:22px;top:170px;background:#fff;border-radius:28px;padding:24px 22px 16px;box-shadow:0 12px 40px rgba(0,0,0,.35)">
    <div style="font-size:20px;font-weight:500;color:#111">Домашна мрежа</div>
    <div style="margin-top:20px;height:50px;border-radius:14px;background:#f0f0f3;display:flex;align-items:center;padding:0 16px;font-size:20px;letter-spacing:3px;color:#111;border-bottom:2px solid ${BLUE}">••••••••••</div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:16px;font-size:15px;color:#333"><span style="width:20px;height:20px;border-radius:5px;border:2px solid #8a8a90"></span>Показване на паролата</div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:22px"><span style="padding:11px 20px;font-size:16px;color:${BLUE}">Отказ</span><span class="ring" style="padding:11px 24px;border-radius:22px;font-size:16px;font-weight:500;background:${BLUE};color:#fff">Свържи</span></div>
  </div>
  ${tip("Въведете паролата и натиснете „Свържи“", "z-index:60;left:50%;transform:translateX(-50%);top:" + 398 + "px;width:250px", { arrow: "u", at: "80%" })}`);

// Бавна връзка: слаб сигнал на свързаната мрежа
S["tech-wifi-slab-signal"] = scr(`${wifiHead(true)}
  ${card(`${orow(`<span style="width:38px;display:flex;justify-content:center">${sig(1, BLUE)}</span>`, "Домашна мрежа", `<span style="color:${BLUE}">Свързано, слаб сигнал</span>`, ms("settings", { size: 20, color: "#8a8a90" }), true)}`, "margin-bottom:84px")}
  ${card(`<div style="padding:12px 20px 4px;font-size:13px;color:#6b6b70">Налични мрежи</div>
    ${wifiRow("Kristal_Net", { bars: 2 })}${wifiRow("TP-Link_4F21", { bars: 1 })}`)}
  ${tip("Една чертичка е слаб сигнал — доближете се до рутера", "left:50%;transform:translateX(-50%);top:262px;width:250px", { arrow: "u", at: "20%" })}`);

// Фалшива Wi-Fi мрежа
S["tech-wifi-opasna"] = scr(`${wifiHead(true)}
  ${card(`<div style="padding:12px 20px 4px;font-size:13px;color:#6b6b70">Налични мрежи</div>
    ${wifiRow("Кафе „Орфей“", { bars: 3 })}${wifiRow("Kristal_Net", { bars: 3 })}
    ${wifiRow("Безплатен_Интернет_Free", { lock: false, hl: true, bars: 4, sub: "Отворена мрежа" })}`)}
  ${tip("Без парола и странно име — не се свързвайте", "left:50%;transform:translateX(-50%);top:" + 410 + "px;width:250px", { arrow: "u", at: "38%" })}
  ${tip("На обществен Wi-Fi не влизайте в банка и не пазарувайте", "left:50%;transform:translateX(-50%);top:498px;width:262px")}`);

// ═══ АКАУНТИ, ПАРОЛИ, GOOGLE ═══
const dots = "•".repeat(10);
const eye = ms("visibility_off", { size: 22, color: "#49454f" });

// Какво е акаунт: менюто на акаунта в Gmail
S["tech-akaunt-meniu"] = scr(`
  <div style="position:absolute;inset:0;background:#fff">
    <div style="height:64px;display:flex;align-items:center;gap:14px;padding:0 14px 0 18px;background:#fff"><div style="flex:1;height:46px;border-radius:23px;background:#e9eef6;display:flex;align-items:center;padding:0 14px;gap:12px;color:#444746;font-size:16px">${ms("menu", { size: 24 })}<span style="flex:1">Търсене в пощата</span>${ava("И", "#188038", 34)}</div></div>
    ${[["Иван Петров","Здравейте! Напомняне за срещата","9:41"],["Общинска администрация","Информация за местни такси","вчера"],["Мария Георгиева","Снимки от неделята","пн"],["Google","Нов вход в акаунта ви","пн"]].map(([n,t,d],i)=>`<div style="display:flex;gap:14px;padding:12px 18px;align-items:center">${ava(n[0],["#1a73e8","#e8710a","#a142f4","#188038"][i],40)}<div style="flex:1;min-width:0"><div style="font-size:15.5px;font-weight:500;color:#1f1f1f">${n}</div><div style="font-size:14px;color:#5f6368;white-space:nowrap;overflow:hidden">${t}</div></div><span style="font-size:12px;color:#5f6368">${d}</span></div>`).join("")}</div>
  ${dim(0.45)}
  <div style="position:absolute;z-index:30;left:14px;right:14px;top:14px;background:#e9eef6;border-radius:28px;padding:18px 0 14px;box-shadow:0 8px 30px rgba(0,0,0,.3)">
    <div style="text-align:center;font-size:14.5px;color:#1f1f1f">ivan.petrov@gmail.com</div>
    <div class="ring" style="margin:16px 14px 0;background:#f8fafd;border-radius:22px;padding:18px 16px;display:flex;flex-direction:column;align-items:center">${ava("И", "#188038", 76)}<div style="font-size:22px;margin-top:10px;color:#1f1f1f">Здравейте, Иван!</div>
      <div style="margin-top:14px;border:1px solid #747775;border-radius:20px;padding:9px 22px;font-size:14.5px;font-weight:500;color:#0b57d0;background:#fff">Управление на акаунта в Google</div></div>
    <div style="margin:8px 14px 0;background:#f8fafd;border-radius:22px;padding:14px 18px;display:flex;align-items:center;gap:16px;font-size:15px;color:#1f1f1f">${ms("person_add", { size: 24, color: "#444746" })}Добавяне на друг акаунт</div>
  </div>
  ${tip("Вашият акаунт: имейл (потребителско име) + парола", "z-index:60;left:50%;transform:translateX(-50%);top:" + 442 + "px;width:250px", { arrow: "u", at: "50%" })}`, { bg: "#fff" });

// Сигурност на Google акаунта — защита в две стъпки
S["tech-akaunt-sigurnost"] = scr(`
  <div style="height:64px;display:flex;align-items:center;gap:20px;padding:0 16px;color:#1f1f1f">${ms("arrow_back", { size: 24 })}<span style="font-size:22px">Сигурност</span></div>
  <div style="padding:0 16px"><div style="background:#f0f4f9;border-radius:20px;padding:16px 18px;display:flex;gap:14px;align-items:center">${ms("verified_user", { size: 30, fill: 1, color: "#188038" })}<div><div style="font-size:16px;font-weight:500;color:#1f1f1f">Акаунтът ви е защитен</div><div style="font-size:14px;color:#444746;margin-top:2px">Не са намерени проблеми</div></div></div></div>
  <div style="padding:22px 22px 6px;font-size:14px;color:#444746;font-weight:500">Как влизате в Google</div>
  ${[["key","Парола","Последна промяна: 12 септември"],["phone_iphone","Телефонен номер за възстановяване","0888 123 456"],["mail","Имейл за възстановяване","dobri.priatel@abv.bg"]].map(([i,t,v])=>`<div style="display:flex;align-items:center;gap:16px;padding:14px 24px">${ms(i, { size: 24, color: "#444746" })}<div style="flex:1"><div style="font-size:16px;color:#1f1f1f">${t}</div><div style="font-size:14px;color:#5f6368;margin-top:2px">${v}</div></div>${ms("chevron_right", { size: 22, color: "#5f6368" })}</div>`).join("")}
  <div class="ring" style="margin:0 12px;background:#fff;border-radius:16px;display:flex;align-items:center;gap:16px;padding:14px 12px">${ms("shield_lock", { size: 26, color: "#444746" })}<div style="flex:1"><div style="font-size:16px;color:#1f1f1f">Защита в две стъпки</div><div style="font-size:14px;color:#188038;margin-top:2px">Включена</div></div>${ms("chevron_right", { size: 22, color: "#5f6368" })}</div>
  ${tip("Включете „Защита в две стъпки“ за важните акаунти", "left:50%;transform:translateX(-50%);top:490px;width:250px", { arrow: "u", at: "40%" })}`, { bg: "#fff" });

// Забравена парола — страницата за вход
S["tech-parola-zabravena"] = chrome("accounts.google.com", gpage(`
    <div style="display:flex;align-items:center;gap:8px;border:1px solid #dadce0;border-radius:20px;padding:6px 14px 6px 6px;width:max-content;margin:0 auto 26px;font-size:14px;color:#3c4043">${ava("И", "#188038", 26)}ivan.petrov@gmail.com ${ms("expand_more", { size: 18, color: "#5f6368" })}</div>
    ${mfield("Въведете паролата", dots, { focus: true, right: eye, m: "0 0 14px" })}
    <div style="margin-top:12px">${glink("Забравена парола?", true)}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:70px">${glink("Опитайте друг начин")}${gbtn("Напред")}</div>`,
  { title: "Здравейте", gap: 22 }) + tip("Докоснете „Забравена парола?“", "left:50%;transform:translateX(-50%);top:420px;width:230px", { arrow: "u", at: "28%" }));

// Смяна на парола
S["tech-parola-smyana"] = scr(`
  <div style="height:64px;display:flex;align-items:center;gap:20px;padding:0 16px;color:#1f1f1f">${ms("arrow_back", { size: 24 })}<span style="font-size:22px">Парола</span></div>
  <div style="padding:6px 22px 0">
    <div style="font-size:14.5px;color:#444746;line-height:1.4;margin-bottom:26px">Изберете силна парола, която не ползвате другаде.</div>
    ${mfield("Стара парола", dots, { right: eye })}
    ${mfield("Нова парола", "•".repeat(14), { focus: true, right: eye })}
    ${mfield("Повторете новата парола", "•".repeat(14), { right: eye })}
    <div style="display:flex;justify-content:flex-end;margin-top:8px">${gbtn("Смяна на парола", { ring: true })}</div></div>
  ${tip("Старата — веднъж, новата — два пъти", "left:50%;transform:translateX(-50%);top:" + 470 + "px;width:230px", { arrow: "u", at: "82%" })}`, { bg: "#fff" });

// Вход във Facebook (общ пример за „влизам в акаунт“)
const fbForm = (ringLogin, ringCreate) => `
  <div style="display:flex;justify-content:center;padding-top:44px">${appIcon("facebook", { size: 72, label: false, os: "ios" })}</div>
  <div style="padding:34px 22px 0">
    <div style="height:54px;border-radius:10px;border:1px solid #ccd0d5;display:flex;align-items:center;padding:0 16px;font-size:16.5px;color:#1c1e21;margin-bottom:12px">ivan.petrov@gmail.com</div>
    <div style="height:54px;border-radius:10px;border:1px solid #ccd0d5;display:flex;align-items:center;padding:0 16px;font-size:20px;letter-spacing:3px;color:#1c1e21;margin-bottom:16px;justify-content:space-between"><span>${dots}</span>${ms("visibility_off", { size: 22, color: "#8a8d91" })}</div>
    <div class="${ringLogin ? "ring" : ""}" style="height:48px;border-radius:24px;background:#0866ff;color:#fff;font-size:16.5px;font-weight:600;display:flex;align-items:center;justify-content:center">Вход</div>
    <div style="text-align:center;margin-top:18px;font-size:15px;color:#1c1e21">Забравена парола?</div></div>
  <div style="position:absolute;left:22px;right:22px;bottom:54px"><div class="${ringCreate ? "ring" : ""}" style="height:46px;border-radius:23px;border:1px solid #0866ff;color:#0866ff;font-size:15.5px;font-weight:600;display:flex;align-items:center;justify-content:center">Създаване на нов профил</div>
    <div style="text-align:center;margin-top:14px;font-size:13px;color:#65676b">∞ Meta</div></div>`;
S["tech-vhod-akaunt"] = scr(`<div style="position:absolute;inset:0;background:#fff">${fbForm(true, false)}</div>
  ${tip("Имейл, парола и „Вход“. При код по SMS — въведете и него", "left:50%;transform:translateX(-50%);top:" + 408 + "px;width:262px", { arrow: "u", at: "50%" })}`, { bg: "#fff" });
S["tech-facebook-registraciya"] = scr(`<div style="position:absolute;inset:0;background:#fff">
  <div style="display:flex;align-items:center;gap:18px;padding:12px 16px;height:60px">${ms("arrow_back", { size: 26, color: "#1c1e21" })}</div>
  <div style="padding:6px 22px 0"><div style="font-size:26px;font-weight:700;color:#1c1e21">Как се казвате?</div>
    <div style="font-size:15.5px;color:#65676b;margin-top:8px;line-height:1.35">Въведете истинските си име и фамилия.</div>
    <div style="display:flex;gap:12px;margin-top:26px"><div style="flex:1;height:56px;border-radius:10px;border:2px solid #0866ff;position:relative;display:flex;align-items:center;padding:0 14px;font-size:17px">Иван<span style="position:absolute;left:10px;top:-10px;background:#fff;padding:0 4px;font-size:12px;color:#0866ff">Име</span></div>
      <div style="flex:1;height:56px;border-radius:10px;border:1px solid #ccd0d5;position:relative;display:flex;align-items:center;padding:0 14px;font-size:17px">Петров<span style="position:absolute;left:10px;top:-10px;background:#fff;padding:0 4px;font-size:12px;color:#65676b">Фамилия</span></div></div>
    <div class="ring" style="margin-top:32px;height:48px;border-radius:24px;background:#0866ff;color:#fff;font-size:16.5px;font-weight:600;display:flex;align-items:center;justify-content:center">Напред</div>
    <div style="text-align:center;margin-top:22px;font-size:15px;color:#0866ff;font-weight:500">Вече имате профил?</div></div></div>
  ${tip("Истинските име и фамилия — после телефон или имейл и парола", "left:50%;transform:translateX(-50%);top:" + 408 + "px;width:262px", { arrow: "u", at: "50%" })}`, { bg: "#fff" });

// ═══ СМАРТФОН И ИНТЕРНЕТ ═══
// Настройки → Акаунти → Добавяне на акаунт → Google
S["tech-google-akaunt-android"] = scr(`${hdr("Добавяне на акаунт")}
  ${card(`${orow(appIc("google", 40), "Google", "", chev, true)}${orow(`<span class="oic" style="background:#1428a0;font-size:13px;font-weight:700">S</span>`, "Samsung account", "", chev)}${orow(ic("mail", "#0a6ed1"), "Microsoft Exchange ActiveSync", "", chev)}${orow(ic("alternate_email", "#7a8493"), "Личен имейл (IMAP)", "", chev)}`)}
  <div style="padding:70px 24px 6px;font-size:13px;color:#6b6b70;line-height:1.4">Вече имате акаунт — въведете имейла и паролата. Нямате — изберете „Създай акаунт“.</div>
  ${tip("Изберете „Google“, после влезте или „Създай акаунт“", "left:50%;transform:translateX(-50%);top:384px;width:250px", { arrow: "u", at: "28%" })}`);

// Gmail: създаване на акаунт (име и фамилия)
S["tech-gmail-sazdavane"] = chrome("accounts.google.com", gpage(`
    ${mfield("Име", "Иван", { focus: true })}
    ${mfield("Фамилия (по избор)", "Петров")}
    <div style="display:flex;justify-content:flex-end;margin-top:34px">${gbtn("Напред", { ring: true })}</div>`,
  { title: "Създаване на акаунт в Google", sub: "Въведете името си", gap: 30 }) +
  tip("Име и фамилия, после „Напред“. Следва потребителско име и парола", "left:50%;transform:translateX(-50%);top:466px;width:262px", { arrow: "u", at: "82%" }));

// Viber: въвеждане на телефонен номер
S["tech-viber-registraciya"] = scr(`<div style="position:absolute;inset:0;background:#fff">
  <div style="display:flex;justify-content:center;padding-top:50px">${appIcon("viber", { size: 78, label: false })}</div>
  <div style="text-align:center;font-size:24px;font-weight:600;color:#2c2c34;margin-top:22px">Добре дошли във Viber</div>
  <div style="text-align:center;font-size:15px;color:#6e6e78;margin:10px 30px 0;line-height:1.4">Въведете телефонния си номер, за да се регистрирате</div>
  <div style="margin:34px 24px 0;border-bottom:2px solid #7360f2;display:flex;align-items:center;gap:12px;padding:0 0 10px"><span style="font-size:18px;color:#2c2c34;display:flex;align-items:center;gap:6px">Бълг. ${ms("arrow_drop_down", { size: 24, color: "#6e6e78" })}</span><span style="font-size:20px;color:#2c2c34;letter-spacing:.5px">+359 888 123 456</span></div>
  <div style="margin:34px 24px 0;height:50px;border-radius:25px;background:#7360f2;color:#fff;font-size:17px;font-weight:600;display:flex;align-items:center;justify-content:center" class="ring">Продължи</div>
  <div style="margin:26px 36px 0;font-size:12.5px;color:#8c8c96;text-align:center;line-height:1.45">След това получавате код по SMS — въведете го за потвърждение</div></div>
  ${tip("Номерът ви → код по SMS → потвърждение", "left:50%;transform:translateX(-50%);top:480px;width:240px", { arrow: "u", at: "50%" })}`, { bg: "#fff" });

// Търсене на новини в Chrome/Google
S["tech-tarsene-novini"] = chrome("google.com", `<div style="padding:12px 14px 0;background:#fff">
    <div style="height:48px;border-radius:24px;background:#f1f3f4;display:flex;align-items:center;padding:0 14px;gap:12px;font-size:16.5px;color:#202124">${ms("search", { size: 22, color: "#5f6368" })}<span style="flex:1">новини Бобов дол</span>${ms("mic", { size: 22, color: "#4285f4" })}</div>
    <div style="display:flex;gap:22px;padding:14px 6px 0;font-size:14px;color:#5f6368;border-bottom:1px solid #e0e0e0"><span style="color:#1a73e8;border-bottom:3px solid #1a73e8;padding-bottom:10px">Всички</span><span>Новини</span><span>Снимки</span><span>Видео</span></div></div>
  <div style="padding:6px 18px">
  ${[["Местни новини — Бобов дол","novini-primer.bg › bobov-dol","Новини от общината и региона: събития, ремонти, културен календар и обяви.","Днес"],["Какво се случва в Кюстендилско","regionalni-novini.example.bg","Актуални събития от областта — подбрани от редакцията.","преди 3 ч."],["Бобов дол — Уикипедия","bg.wikipedia.org › wiki › Бобов_дол","Градът и общината в Югозападна България — история, население и забележителности.",""]].map(([t,u,d,w],i)=>`<div class="${i===0?"ring":""}" style="padding:14px 10px;margin:${i===0?"6px -6px 70px":"0"};border-radius:14px"><div style="font-size:13px;color:#202124;display:flex;align-items:center;gap:8px"><span style="width:26px;height:26px;border-radius:50%;background:#e8eaed;display:flex;align-items:center;justify-content:center">${ms("public", { size: 16, color: "#5f6368" })}</span>${u}</div><div style="font-size:19px;color:#1a0dab;margin:5px 0 4px;line-height:1.25">${t}</div><div style="font-size:14px;color:#4d5156;line-height:1.4">${w ? `<span style="color:#70757a">${w} — </span>` : ""}${d}</div></div>`).join("")}</div>
  ${tip("Изберете резултат от уважаван източник", "left:50%;transform:translateX(-50%);top:252px;width:240px", { arrow: "u", at: "40%" })}`);

// Play Магазин: инсталиране
S["tech-instaliraj-prilozhenie"] = scr(`<div style="position:absolute;inset:0;background:#fff">
  <div style="height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;color:#1f1f1f">${ms("arrow_back", { size: 24 })}<div style="display:flex;gap:22px">${ms("search", { size: 24 })}${ms("more_vert", { size: 24 })}</div></div>
  <div style="display:flex;gap:18px;padding:8px 20px 0;align-items:center">${appIcon("viber", { size: 72, label: false })}<div><div style="font-size:21px;font-weight:500;color:#1f1f1f;line-height:1.2">Viber</div><div style="font-size:14px;color:#01875f;margin-top:3px">Viber Media S.à r.l.</div><div style="font-size:12.5px;color:#5f6368;margin-top:2px">Съдържа реклами · Покупки в приложението</div></div></div>
  <div style="display:flex;justify-content:space-around;padding:22px 10px 0;text-align:center;color:#1f1f1f"><div style="font-size:15px;font-weight:500">4,3 ★<div style="font-size:12px;color:#5f6368;font-weight:400;margin-top:3px">оценка</div></div><div style="width:1px;background:#dadce0"></div><div style="font-size:15px;font-weight:500">Над 1 млрд.<div style="font-size:12px;color:#5f6368;font-weight:400;margin-top:3px">изтегляния</div></div><div style="width:1px;background:#dadce0"></div><div style="font-size:15px;font-weight:500">3+<div style="font-size:12px;color:#5f6368;font-weight:400;margin-top:3px">възраст</div></div></div>
  <div style="padding:22px 20px 0"><div class="ring" style="height:46px;border-radius:23px;background:#01875f;color:#fff;font-size:16px;font-weight:500;display:flex;align-items:center;justify-content:center">Инсталирай</div></div>
  <div style="padding:84px 20px 0;font-size:18px;font-weight:500;color:#1f1f1f;display:flex;justify-content:space-between">За това приложение ${ms("arrow_forward", { size: 22, color: "#5f6368" })}</div>
  <div style="padding:8px 20px 0;font-size:14.5px;color:#5f6368;line-height:1.45">Безплатни съобщения и обаждания — със снимки, видео и гласови съобщения.</div></div>
  ${tip("Проверете името и издателя, после „Инсталирай“", "left:50%;transform:translateX(-50%);top:296px;width:250px", { arrow: "u", at: "50%" })}`, { bg: "#fff" });

// iPhone: Apple ID
const iosHdr = (t) => `<div style="padding:8px 20px 6px;font-size:34px;font-weight:700;letter-spacing:-.6px;color:#000">${t}</div>`;
const iosCard = (rows) => `<div style="background:#fff;border-radius:12px;margin:0 16px 22px;overflow:hidden">${rows}</div>`;
const iosRow = (icon, color, label, right = "", ring = false) => `<div class="${ring ? "ring" : ""}" style="display:flex;align-items:center;gap:14px;height:46px;padding:0 14px;border-bottom:.5px solid #e5e5ea;background:#fff;font-size:17px;color:#000"><span style="width:30px;height:30px;border-radius:7px;background:${color};display:flex;align-items:center;justify-content:center">${ms(icon, { size: 19, fill: 1, color: "#fff" })}</span><span style="flex:1">${label}</span><span style="color:#8e8e93;font-size:16px">${right}</span>${ms("chevron_right", { size: 20, color: "#c4c4c7" })}</div>`;
S["tech-apple-id"] = phone(`${iosHdr("Настройки")}
  <div style="margin:0 16px 22px;height:38px;border-radius:10px;background:#e3e3e8;display:flex;align-items:center;gap:8px;padding:0 10px;color:#8e8e93;font-size:17px">${ms("search", { size: 20, color: "#8e8e93" })}Търсене</div>
  <div class="ring" style="background:#fff;border-radius:12px;margin:0 16px 84px;padding:12px 14px;display:flex;align-items:center;gap:14px"><span style="width:58px;height:58px;border-radius:50%;background:#c7c7cc;display:flex;align-items:center;justify-content:center">${ms("person", { size: 38, fill: 1, color: "#fff" })}</span><div style="flex:1"><div style="font-size:19px;color:#0a84ff">Вписване в iPhone</div><div style="font-size:14px;color:#6c6c70;margin-top:2px">Настройте iCloud, App Store и други.</div></div>${ms("chevron_right", { size: 20, color: "#c4c4c7" })}</div>
  ${iosCard(iosRow("flight", "#ff9500", "Самолетен режим") + iosRow("wifi", "#007aff", "Wi-Fi", "Домашна мрежа") + iosRow("bluetooth", "#007aff", "Bluetooth", "Вкл.") + iosRow("cell_tower", "#34c759", "Мобилни данни"))}
  ${iosCard(iosRow("notifications", "#ff3b30", "Известия") + iosRow("volume_up", "#ff2d55", "Звуци и тактилен отговор") + iosRow("bedtime", "#5856d6", "Фокусиране"))}
  ${tip("Докоснете „Вписване в iPhone“ → „Нямате Apple ID?“", "left:50%;transform:translateX(-50%);top:238px;width:250px", { arrow: "u", at: "40%" })}`, "#f2f2f7", "#000", { os: "ios" });

// Видео обаждане: бутон камера в разговора (Viber)
S["tech-video-obazhdane"] = scr(`<div style="position:absolute;inset:0;background:#fff">
  <div style="height:60px;display:flex;align-items:center;gap:12px;padding:0 14px 0 8px;background:#7360f2;color:#fff">${ms("arrow_back", { size: 26, color: "#fff" })}${ava("Г", "#a89bfa", 38)}<div style="flex:1"><div style="font-size:17px;font-weight:500">Георги (внук)</div><div style="font-size:12.5px;opacity:.85">на линия</div></div><span class="ring ringr" style="display:flex;padding:6px">${ms("videocam", { size: 26, fill: 1, color: "#fff" })}</span>${ms("call", { size: 24, fill: 1, color: "#fff" })}${ms("more_vert", { size: 24, color: "#fff" })}</div>
  <div style="background:#ece9fa;height:${H - 60 - 62}px;padding:16px 14px;display:flex;flex-direction:column;gap:10px;justify-content:flex-end">
    ${[[false,"Здравей, дядо! Искаш ли да се видим по видео?"],[true,"Да, обади ми се."],[false,"Ей сега ти звънвам."]].map(([o,t])=>`<div style="align-self:${o?"flex-end":"flex-start"};max-width:76%;background:${o?"#7360f2":"#fff"};color:${o?"#fff":"#2c2c34"};padding:10px 14px;border-radius:18px;font-size:15.5px;line-height:1.3">${t}</div>`).join("")}</div>
  <div style="height:62px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 12px;border-top:1px solid #e6e6ee">${ms("add_circle", { size: 28, color: "#7360f2" })}<div style="flex:1;height:40px;border-radius:20px;background:#f2f2f6;padding:0 14px;display:flex;align-items:center;color:#9a9aa6;font-size:15px">Съобщение</div>${ms("mic", { size: 26, color: "#7360f2" })}</div></div>
  ${tip("Докоснете иконата на камера — и изчакайте да приеме", "right:10px;top:78px;width:210px", { arrow: "u", at: "86%" })}`, { bg: "#fff", sb: "#fff" });

// Силна парола: полето за нова парола с оценка на силата
const req = (ok, t) => `<div style="display:flex;align-items:center;gap:10px;font-size:15px;color:#1f1f1f;margin-bottom:10px">${ms(ok ? "check_circle" : "cancel", { size: 20, fill: 1, color: ok ? "#188038" : "#d93025" })}${t}</div>`;
S["tech-silna-parola"] = scr(`
  <div style="height:64px;display:flex;align-items:center;gap:20px;padding:0 16px;color:#1f1f1f">${ms("arrow_back", { size: 24 })}<span style="font-size:22px">Нова парола</span></div>
  <div style="padding:6px 22px 0">
    <div style="font-size:14.5px;color:#444746;line-height:1.4;margin-bottom:26px">Дълга парола от няколко думи се запомня лесно, а се познава трудно.</div>
    ${mfield("Нова парола", "маса-река-облак-7", { focus: true, right: ms("visibility", { size: 22, color: "#49454f" }), m: "0 0 12px" })}
    <div style="display:flex;gap:6px;margin-bottom:8px">${[1,1,1,1].map(()=>`<i style="flex:1;height:6px;border-radius:3px;background:#188038"></i>`).join("")}</div>
    <div style="font-size:14px;color:#188038;font-weight:500;margin-bottom:22px">Силна парола</div>
    ${req(true, "3–4 несвързани думи")}${req(true, "Една цифра")}${req(true, "Не е име, рожден ден или „1234“")}
    <div style="margin-top:26px;border-top:1px solid #e3e3e8;padding-top:16px;font-size:14px;color:#5f6368;display:flex;gap:10px;align-items:center">${ms("edit_note", { size: 22, color: "#5f6368" })}Запишете я на хартия и я пазете вкъщи</div></div>
  ${tip("Различна парола за важните акаунти (имейл, банка)", "left:50%;transform:translateX(-50%);top:560px;width:262px")}`, { bg: "#fff" });

// Браузър: иконата на Chrome на началния екран
S["tech-brauzar"] = U.homeScreen(`
  <div class="ring" style="position:absolute;left:211px;top:${H - 110}px;width:56px;height:56px;border-radius:17px;z-index:5"></div>
  ${tip("Браузърът: Chrome (Android) или Safari (iPhone) — докоснете го", "left:50%;transform:translateX(-50%);top:" + (H - 224) + "px;width:262px", { arrow: "d", at: "62%" })}`, {});

// Какво е линк: подчертан син текст в съобщение
S["tech-link"] = scr(`<div style="display:flex;flex-direction:column;height:${H}px;background:#fff">
  <div style="display:flex;align-items:center;gap:10px;padding:6px 14px 8px 8px;height:60px;border-bottom:1px solid #ececef">${ms("chevron_left", { size: 32, weight: 500 })}${ava("М", "#7e8fb0", 36)}<div style="flex:1;font-size:18px;font-weight:500">Мария Петрова</div>${ms("call", { size: 22, fill: 1, color: "#3a3a3f" })}${ms("more_vert", { size: 22, color: "#3a3a3f" })}</div>
  <div style="flex:1;padding:14px;display:flex;flex-direction:column;gap:8px">
    <div style="align-self:center;font-size:12px;color:#8a8a8f;margin-bottom:4px">Днес</div>
    <div style="align-self:flex-start;max-width:80%;background:#ececf0;color:#111;padding:10px 14px;border-radius:20px;font-size:15.5px;line-height:1.35">Видях за концерта в събота. Всичко е тук:</div>
    <div class="ring" style="align-self:flex-start;max-width:80%;background:#ececf0;padding:10px 14px;border-radius:20px;font-size:15.5px;line-height:1.35"><span style="color:#1a0dab;text-decoration:underline;word-break:break-all">https://novini-primer.bg/koncert-bobov-dol</span></div>
    <div style="align-self:flex-end;max-width:70%;background:${BLUE};color:#fff;padding:10px 14px;border-radius:20px;font-size:15.5px">Благодаря, ще го отворя.</div></div>
  <div style="display:flex;align-items:center;gap:8px;padding:6px 10px 12px">${ms("add_circle", { size: 28, color: "#6b6b70" })}<div style="flex:1;height:42px;border-radius:21px;background:#f0f0f3;padding:0 16px;display:flex;align-items:center;font-size:16px;color:#8a8a8f">Текстово съобщение</div>${ms("send", { size: 24, fill: 1, color: "#b0b0b6" })}</div></div>
  ${tip("Синият подчертан текст е линк — докоснете го веднъж", "left:50%;transform:translateX(-50%);top:322px;width:240px", { arrow: "u", at: "30%" })}
  ${tip("Линк от непознат може да е измамен — внимавайте", "left:50%;transform:translateX(-50%);top:420px;width:240px")}`, { bg: "#fff" });

// Messenger: списък с чатове
const msgr = "linear-gradient(135deg,#00B2FF,#006AFF 55%,#A334FA)";
S["tech-messenger"] = scr(`<div style="position:absolute;inset:0;background:#fff">
  <div style="height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 16px"><div style="display:flex;align-items:center;gap:12px">${ava("И", "#188038", 36)}<span style="font-size:25px;font-weight:700;color:#050505">Чатове</span></div><div style="display:flex;gap:16px"><span style="width:38px;height:38px;border-radius:50%;background:#f0f2f5;display:flex;align-items:center;justify-content:center">${ms("photo_camera", { size: 22, fill: 1, color: "#050505" })}</span><span style="width:38px;height:38px;border-radius:50%;background:#f0f2f5;display:flex;align-items:center;justify-content:center">${ms("edit", { size: 20, fill: 1, color: "#050505" })}</span></div></div>
  <div style="margin:4px 16px 10px;height:40px;border-radius:20px;background:#f0f2f5;display:flex;align-items:center;gap:10px;padding:0 14px;color:#65676b;font-size:16px">${ms("search", { size: 20, color: "#65676b" })}Търсене</div>
  ${[["Мария Петрова","Ще се чуем довечера!","9:30","#e8579b",true],["Георги (внук)","Видеото е готово","8:12","#2f7cf6",false],["Семейство Иванови","Лидия: Идваме в неделя","вчера","#8a5cf6",false],["Димитър Стоянов","Благодаря много!","пн","#14a39b",false],["Елена Колева","Снимка","нд","#f28b30",false]].map(([n,t,w,c,hl],i)=>`<div class="${hl?"ring":""}" style="display:flex;align-items:center;gap:12px;padding:9px 16px;${hl?"margin:2px 8px;padding:9px 8px;border-radius:14px;":""}">${ava(n[0],c,56)}<div style="flex:1;min-width:0"><div style="font-size:16.5px;font-weight:${i<2?700:500};color:#050505">${n}</div><div style="font-size:14px;color:#65676b;margin-top:2px">${t} · ${w}</div></div>${i<2?`<i style="width:12px;height:12px;border-radius:50%;background:#0866ff"></i>`:""}</div>`).join("")}
  <div style="position:absolute;left:0;right:0;bottom:0;height:62px;border-top:1px solid #e4e6eb;background:#fff;display:flex;align-items:center;justify-content:space-around;color:#65676b;font-size:11.5px"><div style="text-align:center;color:#0866ff">${ms("chat_bubble", { size: 26, fill: 1, color: "#0866ff" })}<div>Чатове</div></div><div style="text-align:center">${ms("group", { size: 26, color: "#65676b" })}<div>Хора</div></div><div style="text-align:center">${ms("auto_stories", { size: 26, color: "#65676b" })}<div>Истории</div></div></div></div>
  ${tip("Докоснете човек, за да му пишете или се обадите", "left:50%;transform:translateX(-50%);top:" + 560 + "px;width:250px")}`, { bg: "#fff" });

// Видео разговор (Messenger) със „Сподели екрана“
const callBtn = (icon, label, o = {}) => `<div style="text-align:center;width:64px"><div class="${o.ring ? "ring" : ""}" style="width:54px;height:54px;border-radius:50%;margin:0 auto;background:${o.bg || "rgba(255,255,255,.16)"};display:flex;align-items:center;justify-content:center">${ms(icon, { size: 26, fill: 1, color: "#fff" })}</div><div style="font-size:11.5px;color:#e4e6eb;margin-top:7px;line-height:1.2;${o.ring ? "font-weight:600;color:#fff" : ""}">${label}</div></div>`;
const callScreen = (bg, bar, name, extra) => scr(`<div style="position:absolute;inset:0;background:${bg}"></div>
  <div style="position:absolute;left:0;right:0;top:30px;text-align:center;color:#fff"><div style="display:flex;justify-content:center">${ava(name[0], "#5b7fd6", 130)}</div><div style="font-size:24px;font-weight:600;margin-top:18px">${name}</div><div style="font-size:15px;opacity:.8;margin-top:4px">Видео разговор · 02:14</div></div>
  <div style="position:absolute;right:16px;top:300px;width:96px;height:132px;border-radius:14px;background:linear-gradient(160deg,#4a5568,#2d3748);border:2px solid rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px">Вие</div>
  <div style="position:absolute;left:0;right:0;bottom:30px;display:flex;justify-content:space-around;padding:0 10px">${bar}</div>${extra}`, { bg, sb: "#fff" });
S["tech-spodelyane-ekran"] = callScreen("linear-gradient(180deg,#1c2233,#0d111c)",
  callBtn("mic", "Микрофон") + callBtn("videocam", "Камера") + callBtn("present_to_all", "Сподели екрана", { ring: true }) + callBtn("call_end", "Затвори", { bg: "#e5484d" }), "Георги (внук)",
  tip("Натиснете „Сподели екрана“ и потвърдете", "left:50%;transform:translateX(-50%);top:" + (H - 190) + "px;width:240px", { arrow: "d", at: "55%" }));
// Помощ от близък: видео разговор (WhatsApp)
S["tech-pomosht-blizak"] = callScreen("linear-gradient(180deg,#0b3d35,#06201b)",
  callBtn("volume_up", "Говорител") + callBtn("videocam", "Камера") + callBtn("mic", "Микрофон") + callBtn("call_end", "Край", { bg: "#e5484d" }), "Георги (внук)",
  tip("Опишете какво виждате или му покажете екрана", "left:50%;transform:translateX(-50%);top:" + (H - 190) + "px;width:250px", { arrow: "d", at: "50%" }) +
  tip("Само доверен близък — не и непознат", "left:50%;transform:translateX(-50%);top:" + 266 + "px;width:230px"));

// ═══ ДОСТЪПНОСТ ═══
// Нашият сайт: лентата „Настройки за четене“ (разгърната) + горният край на страницата
const NAVY = "#212f8a";
const abtn = (inner, on, ring, css = "") => `<div class="${ring ? "ring" : ""}" style="display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1.5px solid ${on ? NAVY : "#cbd5e1"};background:${on ? NAVY : "#fff"};color:${on ? "#fff" : "#1e293b"};border-radius:10px;font-size:15.5px;font-weight:600;padding:0 12px;min-height:${css.includes("min-height") ? "auto" : "44px"};${css}">${inner}</div>`;
function siteBar(o = {}) {
  const big = o.big; // „По-лесно докосване“ включено → по-едри цели
  const h = big ? "min-height:56px;" : "";
  return `<div style="background:#f3efe6;border-bottom:1px solid #e0dccf">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 14px;gap:10px"><div style="font-size:14px;line-height:1.3;color:#334155">Независим портал<br>не е общината</div>
      ${abtn(`<b style="font-size:17px;color:${NAVY}">Аа</b><span style="color:${NAVY};font-weight:700">Настройки</span>${ms("expand_less", { size: 20, color: NAVY })}`, false, false, "background:#fff;min-height:44px;")}</div>
    <div style="border-top:1px solid #e0dccf;padding:10px 14px 12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:15px;color:#334155;display:flex;align-items:center;gap:4px;margin-right:4px">${ms("text_fields", { size: 20, color: NAVY })}Текст</span>
        ${abtn("А", !o.font, false, "flex:1;font-size:14px;" + h)}${abtn("А", o.font === 2, o.ringFont === 2, "flex:1;font-size:18px;" + h)}${abtn("А", o.font === 3, o.ringFont === 3, "flex:1;font-size:22px;" + h)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${abtn(ms("contrast", { size: 20 }) + "Контраст", false, false, h)}${abtn(ms("dark_mode", { size: 20 }) + "Тъмен режим", false, false, h)}${abtn(ms("pan_tool", { size: 20, fill: 1 }) + "По-лесно докосване", !!big, o.ringTouch, h + (big ? "font-size:17px;" : ""))}</div></div></div>`;
}
const sitePage = (scale = 1) => `<div style="height:300px;overflow:hidden;background:#1b2677;position:relative"><img alt="" src="${SITE_SHOT}" style="display:block;width:390px;height:auto;margin-top:-51px;transform-origin:top left;${scale !== 1 ? `width:${390 * scale}px` : ""}"></div>`;
S["tech-dostap-golyam-tekst"] = chrome("zabobovdol.carbonstealth.eu", siteBar({ font: 3, ringFont: 3 }) + `<div style="padding:96px 18px 0;background:#f8f6f0;height:100%"><div style="font-family:Georgia,serif;font-size:30px;line-height:1.2;font-weight:700;color:#111b4e">Всичко за Бобов дол — на едно място</div><div style="font-size:21px;line-height:1.45;color:#27304f;margin-top:14px">Важни телефони, обяснения стъпка по стъпка, събития и обяви.</div></div>
  ${tip("Натиснете най-голямото „А“ — текстът става по-едър", "left:50%;transform:translateX(-50%);top:238px;width:250px", { arrow: "u", at: "86%" })}`);
S["tech-dostap-lesno-dokosvane"] = chrome("zabobovdol.carbonstealth.eu", siteBar({ big: true, ringTouch: true }) + `<div style="padding:96px 18px 0;background:#f8f6f0;height:100%"><div style="display:flex;flex-direction:column;gap:12px">${[["call","Важни телефони"],["menu_book","Как да…"],["event","Събития"]].map(([i,t])=>`<div style="min-height:60px;border-radius:14px;background:#fff;border:1.5px solid #cbd5e1;display:flex;align-items:center;gap:14px;padding:0 18px;font-size:19px;font-weight:600;color:#111b4e">${ms(i, { size: 28, color: NAVY })}${t}</div>`).join("")}</div></div>
  ${tip("Бутоните и връзките стават по-големи", "left:50%;transform:translateX(-50%);top:276px;width:230px", { arrow: "u", at: "62%" })}`);

// Връзка с институция без обаждане: страницата на услугата
const svcRow = (icon, label, val, hl) => `<div class="${hl ? "ring" : ""}" style="display:flex;gap:14px;align-items:center;padding:14px 16px;background:#fff;border-radius:14px;margin-bottom:${hl ? 76 : 10}px;border:1px solid #e2ded2">${ms(icon, { size: 26, color: NAVY })}<div style="flex:1"><div style="font-size:13.5px;color:#64748b">${label}</div><div style="font-size:17px;font-weight:600;color:#111b4e;margin-top:2px">${val}</div></div></div>`;
S["tech-svarzvane-bez-obazhdane"] = chrome("zabobovdol.carbonstealth.eu/uslugi", `<div style="background:#f8f6f0;height:100%;padding:18px 16px 0">
  <div style="font-size:13.5px;color:#64748b">Услуги и телефони</div>
  <div style="font-family:Georgia,serif;font-size:26px;font-weight:700;color:#111b4e;margin:4px 0 16px;line-height:1.2">Гражданско обслужване</div>
  ${svcRow("call", "Телефон", "0700 000 00")}${svcRow("mail", "Имейл", "uslugi@example.bg", true)}${svcRow("location_on", "Адрес", "ул. „Примерна“ 1, Бобов дол")}${svcRow("schedule", "Работно време", "пон–пет, 8:30–17:00")}</div>
  ${tip("Пишете на имейла — ще получите писмен отговор", "left:50%;transform:translateX(-50%);top:" + 246 + "px;width:250px", { arrow: "u", at: "40%" })}`);

// 112 за хора с увреден слух: страница за регистрация (измислен дизайн)
S["tech-112-uvreden-sluh"] = chrome("112.mvr.bg", `<div style="background:#f4f6fa;height:100%">
  <div style="background:#0f3b7a;color:#fff;padding:18px 18px 20px"><div style="font-size:30px;font-weight:800;letter-spacing:.5px">112</div><div style="font-size:17px;margin-top:6px;line-height:1.3">Достъп за хора с увреден слух и говор</div></div>
  <div style="padding:18px 18px 0"><div style="font-size:19px;font-weight:700;color:#0f2a55;margin-bottom:14px">Регистрация</div>
    ${["Име и фамилия|Иван Петров","Телефон|0888 123 456","Имейл|ivan.petrov@example.bg"].map((x)=>{const [l,v]=x.split("|");return `<div style="margin-bottom:12px"><div style="font-size:13px;color:#475569;margin-bottom:4px">${l}</div><div style="height:46px;border:1.5px solid #cbd5e1;border-radius:8px;background:#fff;display:flex;align-items:center;padding:0 12px;font-size:16px;color:#111">${v}</div></div>`}).join("")}
    <div class="ring" style="margin-top:16px;height:50px;border-radius:8px;background:#0f3b7a;color:#fff;font-size:17px;font-weight:700;display:flex;align-items:center;justify-content:center">Изпратете заявката</div></div></div>
  ${tip("Регистрирайте се предварително — после изчакайте одобрение", "left:50%;transform:translateX(-50%);top:" + 510 + "px;width:262px", { arrow: "u", at: "50%" })}`);

// ═══ ПАМЕТ, МЯСТО И ОБЛАК ═══
const gp = (f, w, h, extra = "") => `<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;${extra}">${photo(path.join(ASSETS, f), { w, h })}</div>`;
const PH = ["apps/lake.jpg", "apps/sunflower.jpg", "misc/meadow.jpg", "apps/apple.jpg", "apps/forest.jpg", "misc/village.jpg", "apps/poppy.jpg", "misc/hills.jpg", "apps/monastery.jpg"];
const phOK = PH.filter((f) => require("node:fs").existsSync(path.join(ASSETS, f)));
const gnav = (items, act) => `<div style="position:absolute;left:0;right:0;bottom:0;height:64px;background:#f8fafd;display:flex;justify-content:space-around;align-items:center;border-top:1px solid #e3e6ea">${items.map(([i, t], k) => `<div style="text-align:center;font-size:11.5px;color:${k === act ? "#1f1f1f" : "#444746"}"><div style="width:56px;height:30px;border-radius:15px;margin:0 auto 2px;background:${k === act ? "#d3e3fd" : "transparent"};display:flex;align-items:center;justify-content:center">${ms(i, { size: 22, fill: k === act ? 1 : 0, color: "#1f1f1f" })}</div>${t}</div>`).join("")}</div>`;
const gpNav = gnav([["photo", "Снимки"], ["search", "Търсене"], ["group", "Споделяне"], ["photo_library", "Библиотека"]], 0);

// Какво е облак: Google Снимки с готово архивиране
S["tech-oblak-snimki"] = scr(`<div style="position:absolute;inset:0;background:#fff">
  <div style="height:64px;display:flex;align-items:center;gap:12px;padding:0 14px"><div style="flex:1;height:44px;border-radius:22px;background:#e9eef6;display:flex;align-items:center;padding:0 14px;gap:10px;color:#444746;font-size:15.5px"><span style="display:flex;width:22px;height:22px">${appIcon("photos", { size: 22, label: false, os: "ios" })}</span><span style="flex:1">Търсене в Снимки</span></div><span class="ring ringr" style="display:flex;padding:6px;background:#e9eef6">${ms("cloud_done", { size: 26, fill: 1, color: "#188038" })}</span></div>
  <div style="padding:6px 16px 8px;font-size:15px;font-weight:500;color:#1f1f1f">Днес</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px">${phOK.slice(0, 6).map((f) => gp(f, 124, 124)).join("")}</div>
  <div style="padding:14px 16px 8px;font-size:15px;font-weight:500;color:#1f1f1f">пет, 23 октомври</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px">${phOK.slice(6, 9).map((f) => gp(f, 124, 124)).join("")}</div>
  ${gpNav}</div>
  ${tip("Облакът пази копие на снимките — даже ако счупите телефона", "left:50%;transform:translateX(-50%);top:560px;width:250px")}`, { bg: "#fff" });

// Облакът като сейф: Google Диск
const file = (icon, color, name, meta) => `<div style="display:flex;align-items:center;gap:16px;padding:11px 18px">${ms(icon, { size: 30, fill: 1, color })}<div style="flex:1"><div style="font-size:16px;color:#1f1f1f">${name}</div><div style="font-size:13px;color:#5f6368;margin-top:2px">${meta}</div></div>${ms("more_vert", { size: 22, color: "#5f6368" })}</div>`;
S["tech-oblak-drive"] = scr(`<div style="position:absolute;inset:0;background:#fff">
  <div style="height:64px;display:flex;align-items:center;gap:12px;padding:0 14px"><div style="flex:1;height:44px;border-radius:22px;background:#e9eef6;display:flex;align-items:center;padding:0 14px;gap:10px;color:#444746;font-size:15.5px">${appIcon("drive", { size: 24, label: false, os: "ios" })}<span style="flex:1">Търсене в Диск</span></div>${ava("И", "#188038", 34)}</div>
  <div style="padding:10px 18px 4px;font-size:19px;font-weight:500;color:#1f1f1f">Моят диск</div>
  ${file("folder", "#5f6368", "Снимки от лятото", "Папка · 214 елемента")}${file("folder", "#5f6368", "Документи", "Папка · 18 елемента")}${file("picture_as_pdf", "#d93025", "Сметка_за_ток_октомври.pdf", "Променен вчера")}${file("movie", "#d93025", "Рожден_ден.mp4", "Променен на 12 окт.")}${file("image", "#188038", "Внучката.jpg", "Променен на 3 окт.")}
  <div style="position:absolute;right:18px;bottom:86px;height:56px;padding:0 20px;border-radius:18px;background:#c2e7ff;display:flex;align-items:center;gap:10px;font-size:15.5px;font-weight:500;color:#001d35;box-shadow:0 3px 8px rgba(0,0,0,.2)">${ms("add", { size: 24, color: "#001d35" })}Ново</div>
  ${gnav([["home", "Начало"], ["star", "Със звезда"], ["group", "Споделени"], ["folder", "Файлове"]], 3)}</div>
  ${tip("Облакът е като сейф в интернет — вашите файлове са там от всеки телефон със същия акаунт", "left:50%;transform:translateX(-50%);top:456px;width:272px")}`, { bg: "#fff" });

// Архивиране на снимките
S["tech-arhiv-snimki"] = scr(`
  <div style="height:64px;display:flex;align-items:center;gap:20px;padding:0 16px;color:#1f1f1f">${ms("arrow_back", { size: 24 })}<span style="font-size:22px">Архивиране</span></div>
  <div style="margin:4px 14px 0;padding:18px 18px;background:#f0f4f9;border-radius:24px;display:flex;align-items:center;gap:16px"><div style="flex:1"><div style="font-size:17px;color:#1f1f1f">Архивиране</div><div style="font-size:14px;color:#444746;margin-top:3px">Архивира се в ivan.petrov@gmail.com</div></div><div class="ring ringr" style="display:flex">${sw(true)}</div></div>
  <div style="height:84px"></div>
  <div class="ring" style="margin:4px 8px;padding:12px 14px;border-radius:16px;display:flex;align-items:center;gap:14px"><div style="flex:1"><div style="font-size:16px;color:#1f1f1f">Използване на мобилни данни</div><div style="font-size:14px;color:#5f6368;margin-top:2px">Само Wi-Fi — за да не се харчат данни</div></div>${sw(false)}</div>
  ${tip("Включете архивирането — после снимките се качват сами", "left:50%;transform:translateX(-50%);top:176px;width:250px", { arrow: "u", at: "86%" })}
  ${tip("Оставете качването само на Wi-Fi", "left:50%;transform:translateX(-50%);top:" + 322 + "px;width:230px", { arrow: "u", at: "86%" })}`, { bg: "#fff" });

// USB към компютър: избор „Прехвърляне на файлове“
S["tech-usb-fajlove"] = scr(`
  <div style="position:absolute;inset:-60px;background:url('${wp("wp-sea-sunset.jpg")}') center/cover;filter:blur(18px) brightness(.5)"></div>
  <div style="position:absolute;left:0;right:0;top:0;padding:18px 18px 0;color:#fff"><div style="font-size:15px;opacity:.9;margin-bottom:10px">пт, 30 октомври</div>
    <div style="background:rgba(40,43,52,.92);border-radius:22px;padding:13px 16px"><div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#c6c9d0;margin-bottom:6px">${ms("usb", { size: 16, color: "#c6c9d0" })}<span>Система Android</span></div><div style="font-size:14.5px;font-weight:500">Зареждане на това устройство през USB</div><div style="font-size:13.5px;color:#d4d7de;margin-top:1px">Докоснете за още опции</div></div></div>
  ${dim(0.35)}
  <div style="position:absolute;z-index:30;left:22px;right:22px;top:196px;background:#fff;border-radius:28px;padding:22px 0 14px;box-shadow:0 12px 40px rgba(0,0,0,.35)">
    <div style="font-size:20px;color:#1f1f1f;padding:0 24px 12px">Използване на USB за</div>
    ${[["Зареждане на това устройство",false],["Прехвърляне на файлове",true],["Прехвърляне на снимки (PTP)",false],["Без пренос на данни",false]].map(([t,on])=>`<div class="${on?"ring":""}" style="display:flex;align-items:center;gap:16px;padding:14px 24px;font-size:16px;color:#1f1f1f;${on?"margin:2px 10px;border-radius:14px;padding:14px 14px;":""}"><span style="width:22px;height:22px;border-radius:50%;border:2px solid ${on?"#0b57d0":"#5f6368"};display:flex;align-items:center;justify-content:center">${on?`<i style="width:11px;height:11px;border-radius:50%;background:#0b57d0"></i>`:""}</span>${t}</div>`).join("")}</div>
  ${tip("Изберете „Прехвърляне на файлове“, ако телефонът попита", "z-index:60;left:50%;transform:translateX(-50%);top:" + 484 + "px;width:250px", { arrow: "u", at: "50%" })}`, { bg: "#14161c", sb: "#fff" });

// Дублирани снимки
S["tech-dublirani"] = (() => {
  const dupl = phOK[1] || phOK[0];
  const cell = (f, sel) => `<div class="${sel ? "ring" : ""}" style="position:relative;width:124px;height:124px;overflow:hidden">${photo(path.join(ASSETS, f), { w: 124, h: 124 })}${sel !== undefined ? `<span style="position:absolute;left:7px;top:7px;width:24px;height:24px;border-radius:50%;background:${sel ? BLUE : "rgba(255,255,255,.35)"};border:2px solid #fff;display:flex;align-items:center;justify-content:center">${sel ? ms("check", { size: 17, weight: 700, color: "#fff" }) : ""}</span>` : ""}</div>`;
  const list = [[phOK[0], false], [dupl, true], [dupl, true], [phOK[2], false], [phOK[3], false], [phOK[4], false], [phOK[5], false], [phOK[6], false], [phOK[7], false]];
  return scr(`<div style="position:absolute;inset:0;background:#fff">
    <div style="height:64px;display:flex;align-items:center;gap:14px;padding:0 18px;color:#000">${ms("close", { size: 26 })}<span style="font-size:20px;font-weight:500;flex:1">Избрани: 2</span></div>
    <div style="padding:2px 18px 8px;font-size:14px;color:#6b6b70">Октомври 2026 · подредени по дата</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px">${list.map(([f, sel]) => cell(f, sel)).join("")}</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:70px;background:#fff;border-top:1px solid #e7e7ea;display:flex;justify-content:space-around;align-items:center;font-size:12.5px;color:#222">${[["share","Сподели"],["delete","Изтрий"],["more_vert","Още"]].map(([i,t])=>`<div class="${t==="Изтрий"?"ring":""}" style="text-align:center;${t==="Изтрий"?"padding:6px 22px;border-radius:14px":""}">${ms(i, { size: 26, color: "#222" })}<div>${t}</div></div>`).join("")}</div></div>
    ${tip("Отметнете еднаквите снимки, после „Изтрий“", "left:50%;transform:translateX(-50%);top:" + 500 + "px;width:250px", { arrow: "d", at: "50%" })}`, { bg: "#fff" });
})();

// Голямо видео чрез линк: меню на файл в Диск
S["tech-golyam-fayl-link"] = scr(`<div style="position:absolute;inset:0;background:#fff">
  <div style="height:64px;display:flex;align-items:center;gap:12px;padding:0 14px"><div style="flex:1;height:44px;border-radius:22px;background:#e9eef6;display:flex;align-items:center;padding:0 14px;gap:10px;color:#444746;font-size:15.5px">${appIcon("drive", { size: 24, label: false, os: "ios" })}<span style="flex:1">Търсене в Диск</span></div></div>
  ${file("movie", "#d93025", "Рожден_ден.mp4", "1,8 GB · Променен днес")}${file("image", "#188038", "Внучката.jpg", "Променен на 3 окт.")}</div>
  ${dim(0.4)}
  <div style="position:absolute;z-index:30;left:0;right:0;bottom:0;background:#fff;border-radius:28px 28px 0 0;padding:12px 0 10px">
    <div style="width:36px;height:4px;border-radius:2px;background:#c4c7c5;margin:0 auto 12px"></div>
    <div style="display:flex;align-items:center;gap:16px;padding:6px 22px 14px;border-bottom:1px solid #e3e6ea">${ms("movie", { size: 30, fill: 1, color: "#d93025" })}<div style="font-size:16.5px;color:#1f1f1f">Рожден_ден.mp4</div></div>
    <div class="ring" style="margin:6px 8px;display:flex;align-items:center;gap:20px;padding:15px 14px;border-radius:14px;font-size:16px;color:#1f1f1f">${ms("person_add", { size: 24, color: "#444746" })}Сподели</div>
    <div class="ring" style="margin:10px 8px;display:flex;align-items:center;gap:20px;padding:15px 14px;border-radius:14px;font-size:16px;color:#1f1f1f">${ms("link", { size: 24, color: "#444746" })}Копирай линк</div>
    ${[["download","Свали"],["drive_file_move","Премести"],["delete","Премахни"]].map(([i,t])=>`<div style="display:flex;align-items:center;gap:20px;padding:15px 22px;font-size:16px;color:#1f1f1f">${ms(i, { size: 24, color: "#444746" })}${t}</div>`).join("")}</div>
  ${tip("Сподели → „Копирай линк“, после го поставете в чата", "left:50%;transform:translateX(-50%);top:306px;width:250px", { arrow: "d", at: "50%" })}`, { bg: "#fff" });

// iCloud на iPhone
const iosSw = (on) => `<span class="tg${on ? " on" : ""}"><i></i></span>`;
const iosCard0 = (rows) => `<div style="background:#fff;border-radius:12px;margin:0 16px 22px">${rows}</div>`;
const icRow = (icon, color, label, on, ring) => `<div class="${ring ? "ring" : ""}" style="display:flex;align-items:center;gap:14px;height:48px;padding:0 14px;border-bottom:.5px solid #e5e5ea;background:#fff;font-size:17px;color:#000"><span style="width:30px;height:30px;border-radius:7px;background:${color};display:flex;align-items:center;justify-content:center">${ms(icon, { size: 19, fill: 1, color: "#fff" })}</span><span style="flex:1">${label}</span>${iosSw(on)}</div>`;
S["tech-icloud"] = phone(`
  <div style="display:flex;align-items:center;padding:2px 10px 0;color:#007aff;font-size:17px;height:34px">${ms("chevron_left", { size: 28, color: "#007aff" })}Apple ID</div>
  <div style="padding:0 20px 8px;font-size:34px;font-weight:700;letter-spacing:-.6px">iCloud</div>
  <div style="background:#fff;border-radius:12px;margin:6px 16px 22px;padding:14px 16px"><div style="font-size:15px;color:#6c6c70">Запазено в iCloud</div><div style="display:flex;height:10px;border-radius:5px;overflow:hidden;background:#e5e5ea;margin:10px 0 8px"><i style="width:38%;background:#34c759"></i><i style="width:14%;background:#ff9500"></i><i style="width:6%;background:#007aff"></i></div><div style="font-size:14px;color:#6c6c70">3,1 GB от 5 GB · Безплатното място е малко</div></div>
  <div style="padding:0 32px 8px;font-size:13px;color:#6c6c70">ПРИЛОЖЕНИЯ, КОИТО ПОЛЗВАТ ICLOUD</div>
  ${iosCard0(icRow("photo_library", "#ff9500", "Снимки", true, true) + icRow("contacts", "#8e8e93", "Контакти", true) + icRow("sms", "#34c759", "Съобщения", true) + icRow("backup", "#30b0c7", "Резервно копие в iCloud", true))}
  ${tip("Изберете какво да се пази — Снимки, Контакти…", "left:50%;transform:translateX(-50%);top:426px;width:250px", { arrow: "u", at: "30%" })}`, "#f2f2f7", "#000", { os: "ios" });

// Гигабайт: употреба на данни
S["tech-gb-danni"] = scr(`${hdr("Употреба на данни")}
  ${card(`<div style="padding:16px 20px 18px"><div style="font-size:13px;color:#6b6b70">Мобилни данни · 1 – 30 октомври</div><div style="font-size:34px;font-weight:500;color:#111;margin:4px 0 12px">4,36 <span style="font-size:20px">GB</span></div>
    <div style="height:10px;border-radius:5px;background:#e3e3e8;overflow:hidden"><i style="display:block;height:100%;width:44%;background:${BLUE}"></i></div><div style="display:flex;justify-content:space-between;font-size:13px;color:#6b6b70;margin-top:8px"><span>0</span><span>Пакет: 10 GB</span></div></div>`, "margin-top:6px")}
  ${card(`<div style="padding:14px 20px 2px;font-size:13px;color:#6b6b70">Приложения, използвали най-много данни</div>
    ${[["youtube","YouTube","2,10 GB"],["facebook","Facebook","0,94 GB"],["viber","Viber","0,61 GB"],["chrome","Chrome","0,48 GB"]].map(([a,n,g],i)=>orow(appIc(a, 40), n, "", g, i===0)).join("")}`)}
  ${tip("Видеата ядат най-много GB — следете разхода", "left:50%;transform:translateX(-50%);top:" + 562 + "px;width:250px", { arrow: "u", at: "24%" })}`);

// PDF
S["tech-pdf"] = scr(`<div style="position:absolute;inset:0;background:#e8eaed">
  <div style="height:56px;background:#fff;display:flex;align-items:center;gap:16px;padding:0 14px;border-bottom:1px solid #dadce0;color:#1f1f1f">${ms("arrow_back", { size: 24 })}<span style="flex:1;font-size:16.5px">Сметка_за_ток.pdf</span>${ms("share", { size: 22 })}${ms("more_vert", { size: 22 })}</div>
  <div style="margin:14px 14px 0;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.25);padding:20px 20px 24px;height:560px;font-size:12.5px;color:#222;position:relative;overflow:hidden">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="font-size:19px;font-weight:700;color:#0b3d7a">Електроснабдяване<br>„Пример“</div><div style="text-align:right;color:#666">Фактура № 0000123456<br>Дата: 28.10.2026</div></div>
    <div style="margin-top:22px;line-height:1.55"><b>Клиент:</b> Иван Петров<br><b>Адрес:</b> гр. Бобов дол, ул. „Примерна“ 1<br><b>Период:</b> 01.09.2026 – 30.09.2026</div>
    <table style="width:100%;border-collapse:collapse;margin-top:22px"><tr style="background:#eef2f8"><th style="text-align:left;padding:7px 8px">Описание</th><th style="text-align:right;padding:7px 8px">Сума</th></tr>
      ${[["Електрическа енергия, 214 kWh","19,80 €"],["Мрежови услуги","6,45 €"],["Такса задължение към обществото","2,10 €"],["ДДС 20%","5,67 €"]].map(([a,b])=>`<tr><td style="padding:8px;border-bottom:1px solid #e3e3e3">${a}</td><td style="text-align:right;padding:8px;border-bottom:1px solid #e3e3e3">${b}</td></tr>`).join("")}
      <tr><td style="padding:12px 8px;font-weight:700;font-size:15px">За плащане</td><td style="text-align:right;padding:12px 8px;font-weight:700;font-size:15px">34,02 €</td></tr></table>
    <div style="position:absolute;right:16px;bottom:14px;font-size:11px;color:#c0392b;border:1.5px solid #c0392b;border-radius:4px;padding:2px 8px;transform:rotate(-6deg)">ПРИМЕРЕН ДОКУМЕНТ</div></div></div>
  ${tip("Докоснете файла, за да се отвори. С два пръста го приближавате", "left:50%;transform:translateX(-50%);top:" + 640 + "px;width:262px")}`, { bg: "#e8eaed" });

// VPN в настройките
S["tech-vpn"] = scr(`${hdr("Още настройки за връзка")}
  ${card(`${orow(ic("print", "#7a8493"), "Печат", "", chev)}${orow(ic("vpn_key", "#2f7cf6"), "VPN", "Няма добавени профили", chev, true)}${orow(ic("dns", "#14a39b"), "Частен DNS", "Автоматично", chev)}${orow(ic("lan", "#f28b30"), "Ethernet", "", chev)}`)}
  ${tip("VPN е допълнителна защита на връзката — за обикновена употреба не е нужен", "left:50%;transform:translateX(-50%);top:" + 372 + "px;width:262px", { arrow: "u", at: "36%" })}
  ${tip("Не инсталирайте „безплатен VPN“ по чужд съвет", "left:50%;transform:translateX(-50%);top:" + 478 + "px;width:250px")}`);

// Родителски контрол
S["tech-roditelski-kontrol"] = scr(`${hdr("Цифрово благополучие и родителски контрол", { fs: 25, h: 128 })}
  ${card(`<div style="padding:18px 20px"><div style="font-size:13px;color:#6b6b70">Време на екрана днес</div><div style="font-size:32px;font-weight:500;color:#111;margin-top:2px">1 ч 42 мин</div></div>`, "margin-top:2px")}
  ${card(`${orow(ic("hourglass_bottom", "#14a39b"), "Таймери за приложенията", "Ограничете времето за ползване", chev)}${orow(ic("self_improvement", "#8a5cf6"), "Режим на фокус", "", chev)}${orow(ic("family_restroom", "#2f7cf6"), "Родителски контрол", "Време, приложения и съдържание", chev, true)}`)}
  ${tip("Ограничете времето, приложенията и съдържанието за внуците", "left:50%;transform:translateX(-50%);top:" + 480 + "px;width:262px", { arrow: "u", at: "50%" })}
  ${tip("Сложете код, за да не го махнат сами", "left:50%;transform:translateX(-50%);top:" + 566 + "px;width:230px")}`);

// Втора ръка: защита от кражба (заключване на акаунт)
S["tech-vtora-raka"] = scr(`<div style="position:absolute;inset:0;background:#fff;padding:0 24px">
  <div style="padding-top:54px;display:flex;justify-content:center">${ms("lock", { size: 54, fill: 1, color: "#1a73e8" })}</div>
  <div style="font-size:26px;color:#1f1f1f;text-align:center;margin-top:18px;line-height:1.25">Потвърдете, че това сте вие</div>
  <div style="font-size:15.5px;color:#444746;text-align:center;margin-top:12px;line-height:1.45">Това устройство е защитено. Влезте с Google акаунта, който е бил добавен на него преди нулирането.</div>
  <div style="margin-top:36px">${mfield("Имейл или телефон", "", { focus: true, m: "0 0 14px" })}</div>
  <div style="display:flex;justify-content:flex-end;margin-top:30px">${gbtn("Напред")}</div></div>
  ${tip("Ако телефонът иска чужд акаунт — не е отписан. Не го купувайте", "left:50%;transform:translateX(-50%);top:" + 492 + "px;width:262px", { arrow: "u", at: "50%" })}`, { bg: "#fff" });

// Фабрични настройки
S["tech-fabrichni"] = scr(`
  <div style="height:64px;display:flex;align-items:center;gap:20px;padding:0 16px;color:#1f1f1f">${ms("arrow_back", { size: 24 })}<span style="font-size:22px">Фабрични настройки</span></div>
  <div style="padding:0 22px"><div style="font-size:14px;color:#5f6368;margin-bottom:14px">Система › Нулиране</div>
    <div style="background:#fce8e6;border-radius:18px;padding:16px 18px;display:flex;gap:14px;color:#8c1d18;font-size:15px;line-height:1.4">${ms("warning", { size: 26, fill: 1, color: "#d93025" })}<div>Всичко на телефона ще се изтрие — снимки, контакти, приложения.</div></div>
    <div style="font-size:15px;color:#1f1f1f;margin:22px 0 8px">Ще бъдат изтрити:</div>
    ${["Google акаунтът ivan.petrov@gmail.com","Системните данни и настройки","Свалените приложения","Музика, снимки и други потребителски данни"].map((t)=>`<div style="display:flex;gap:12px;padding:6px 0;font-size:14.5px;color:#444746">${ms("remove", { size: 20, color: "#5f6368" })}${t}</div>`).join("")}
    <div style="margin-top:26px;display:flex;justify-content:flex-end"><div class="ring" style="height:44px;padding:0 24px;border-radius:22px;background:#d93025;color:#fff;font-size:15px;font-weight:500;display:flex;align-items:center">Изтриване на всички данни</div></div></div>
  ${tip("Първо направете резервно копие (снимки, контакти)", "left:50%;transform:translateX(-50%);top:" + 528 + "px;width:250px", { arrow: "u", at: "80%" })}`, { bg: "#fff" });

// Приложение или сайт: два телефона един до друг
const stageOf = (html) => html.slice(html.indexOf('<div class="stage">'), html.lastIndexOf("</body>")).replace('class="stage"', 'class="stg2"');
S["tech-prilozhenie-sayt"] = (() => {
  const bank = (size) => `<div style="width:${size}px;height:${size}px;border-radius:${size * 0.3}px;background:linear-gradient(160deg,#1f5fbf,#0f3b7a);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,.18),0 3px 8px -2px rgba(0,0,0,.2)">${ms("account_balance", { size: size * 0.55, fill: 1, color: "#fff" })}</div>`;
  const left = chrome("moyabanka.example.bg", `<div style="background:#f4f7fb;height:100%"><div style="background:#0f3b7a;color:#fff;padding:16px 18px;font-size:20px;font-weight:700;display:flex;align-items:center;gap:10px">${ms("account_balance", { size: 26, fill: 1, color: "#fff" })}Моята банка</div>
    <div style="padding:20px 18px"><div style="font-size:19px;font-weight:700;color:#0f2a55;margin-bottom:14px">Вход в онлайн банкиране</div>
    <div style="height:46px;border:1.5px solid #cbd5e1;border-radius:8px;background:#fff;display:flex;align-items:center;padding:0 12px;font-size:16px;margin-bottom:12px;color:#111">ivan.petrov</div><div style="height:46px;border:1.5px solid #cbd5e1;border-radius:8px;background:#fff;display:flex;align-items:center;padding:0 12px;font-size:18px;letter-spacing:3px;margin-bottom:16px">••••••••</div>
    <div style="height:48px;border-radius:8px;background:#0f3b7a;color:#fff;font-size:16.5px;font-weight:700;display:flex;align-items:center;justify-content:center">Вход</div></div></div>
    ${tip("Сайт: отваряте го в браузъра, като пишете адрес", "left:50%;transform:translateX(-50%);top:" + 400 + "px;width:250px", { arrow: "u", at: "28%" })}`);
  const right = U.homeScreen(`<div style="position:absolute;left:${U.colX(0) - 33}px;top:${U.rowY(0)}px;width:66px;text-align:center"><div class="ring" style="width:56px;height:56px;border-radius:17px;margin:0 auto">${bank(56)}</div><div class="al" style="font-size:12px;margin-top:6px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.65)">Банка</div></div>
    ${tip("Приложение: сваляте го от магазина и стои като иконка", "left:50%;transform:translateX(-50%);top:" + 456 + "px;width:250px", { arrow: "u", at: "20%" })}`,
    { grid: [[null, "youtube", "gmail", "maps"], ...U.HOME.slice(1)] });
  return scene(`<style>.stg2{display:inline-block;padding:0 4px 8px;zoom:.93;white-space:normal}</style><div style="display:flex;align-items:flex-start;gap:0;white-space:nowrap">${stageOf(left)}${stageOf(right)}</div>`, { pad: 14 });
})();

// ═══ ПРЕДМЕТИ (истински снимки CC0 + червени бележки) ═══
const credit = (t) => `<div style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:12px;color:#64748b">${t}</div>`;
const shot = (w, h, f) => photo(path.join(ASSETS, "tech", f), { w, h, radius: 18, style: "box-shadow:0 18px 40px rgba(15,23,42,.28)" });

// Рутер: лампички и етикет с парола (снимка: Digicel Router Trinidad, 999real, CC0; логото и етикетът са размити)
S["tech-ruter"] = scene(`<div style="position:relative;width:560px;padding-bottom:158px">
  ${shot(560, 370, "router.jpg")}
  <div class="ring" style="position:absolute;left:196px;top:68px;width:214px;height:50px;border-radius:14px"></div>
  <div class="ring" style="position:absolute;left:370px;top:118px;width:130px;height:114px;border-radius:12px"></div>
  ${tip("Лампичките светват, когато рутерът е готов", "left:24px;top:150px;width:190px", { arrow: "u", at: "62%" })}
  ${tip("Етикетът с паролата за Wi-Fi обикновено е отдолу на рутера", "left:300px;top:250px;width:236px", { arrow: "u", at: "42%" })}
  ${tip("Ако интернетът засича: изключете рутера от тока за 10 секунди, включете го пак и изчакайте лампичките", "left:50%;top:394px;transform:translateX(-50%);width:420px")}
  ${credit("Снимка: 999real, Wikimedia Commons (CC0) — логото и етикетът са размити")}</div>`, { pad: 30 });

// СИМ карта
S["tech-sim"] = scene(`<div style="position:relative;width:560px;padding-bottom:140px">
  ${shot(560, 420, "sim.jpg")}
  <div class="ring" style="position:absolute;left:150px;top:112px;width:372px;height:222px;border-radius:22px"></div>
  ${tip("СИМ картата дава на телефона номер, обаждания и мобилен интернет", "left:50%;top:438px;transform:translateX(-50%);width:360px", { arrow: "u", at: "50%" })}
  ${tip("Стои в слот на телефона — при нов телефон преместете същата", "left:50%;top:496px;transform:translateX(-50%);width:360px")}
  ${credit("Снимка: Ubahnverleih, Wikimedia Commons (CC0)")}</div>`, { pad: 30 });

// Таблет
S["tech-tablet"] = scene(`<div style="position:relative;width:560px;padding-bottom:140px">
  ${shot(560, 372, "tablet.jpg")}
  <div class="ring" style="position:absolute;left:138px;top:58px;width:282px;height:208px;border-radius:12px"></div>
  ${tip("По-голям екран — по-лесен за очите", "left:50%;top:392px;transform:translateX(-50%);width:300px", { arrow: "u", at: "50%" })}
  ${tip("За интернет, видео разговори, четене и снимки. Работи като телефона", "left:50%;top:446px;transform:translateX(-50%);width:380px")}
  ${credit("Снимка: Geralt, Wikimedia Commons (CC0)")}</div>`, { pad: 30 });

// Малка тетрадка за паролите
S["tech-tetradka-paroli"] = scene(`<div style="position:relative;width:560px;padding-bottom:196px">
  ${shot(560, 331, "notebook.jpg")}
  <div class="ring" style="position:absolute;left:20px;top:40px;width:520px;height:260px;border-radius:22px"></div>
  ${tip("Запишете паролите в малка тетрадка", "left:50%;top:348px;transform:translateX(-50%);width:300px", { arrow: "u", at: "50%" })}
  ${tip("Пазете я вкъщи на сигурно място — не в чантата. Паролата не се пише върху самото устройство", "left:50%;top:404px;transform:translateX(-50%);width:440px")}
  ${credit("Снимка: Thomas Martinsen (faceline), Wikimedia Commons (CC0)")}</div>`, { pad: 30 });

// Смарт телевизор: началното меню с приложения
S["tech-smart-tv"] = (() => {
  const tile = (n, ring) => `<div class="${ring ? "ring" : ""}" style="border-radius:22px">${appIcon(n, { size: 86, os: "ios", label: false })}</div>`;
  return scene(`<div style="position:relative;width:600px;padding-bottom:128px">
    <div style="position:relative;width:600px;height:372px;border-radius:14px;background:#050506;padding:10px;box-shadow:0 24px 40px -8px rgba(15,23,42,.5),inset 0 0 0 2px #1d1f24">
      <div style="position:relative;width:100%;height:100%;border-radius:6px;overflow:hidden;background:#111">
        ${photo(path.join(ASSETS, "misc", "mountain.jpg"), { w: 580, h: 352 })}
        <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,.15) 45%,rgba(0,0,0,.6))"></div>
        <div style="position:absolute;left:22px;right:22px;top:16px;display:flex;justify-content:space-between;align-items:center;color:#fff;font-size:17px"><span style="font-size:26px;font-weight:300">20:15</span>
          <span class="ring" style="display:flex;align-items:center;gap:8px;padding:5px 12px;border-radius:20px;background:rgba(0,0,0,.45)">${ms("wifi", { size: 22, color: "#fff" })}Домашна мрежа</span></div>
        <div style="position:absolute;left:22px;right:22px;top:176px;display:flex;gap:18px">${tile("youtube", true)}${tile("netflix")}${tile("spotify")}${tile("chrome")}${tile("photos")}</div>
        </div></div>
    <div style="width:130px;height:12px;margin:0 auto;background:linear-gradient(#3a3d44,#1b1d21);border-radius:0 0 8px 8px"></div><div style="width:230px;height:8px;margin:0 auto;background:#16181c;border-radius:4px;box-shadow:0 8px 14px rgba(0,0,0,.35)"></div>
    ${tip("Свържете телевизора с домашния Wi-Fi", "left:300px;top:62px;width:200px", { arrow: "r", at: "30%" }).replace("left:300px", "left:96px")}
    ${tip("Влезте в приложенията (YouTube…) от менюто с дистанционното", "left:50%;top:420px;transform:translateX(-50%);width:360px", { arrow: "u", at: "14%" })}
    ${tip("За филми и сериали често трябва абонамент за приложението", "left:50%;top:474px;transform:translateX(-50%);width:360px")}
    </div>`, { pad: 30 });
})();

render(S).catch((e) => { console.error(e); process.exit(1); });
