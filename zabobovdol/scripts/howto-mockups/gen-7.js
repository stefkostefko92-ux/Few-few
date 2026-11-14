// Седма партида „мокъп" екрани: настройки и действия — прехвърляне към телевизор, точка за достъп,
// резервно копие, абонаменти, скорошни приложения, роуминг, сила на известията.
// Стил: Samsung One UI 6 + Google Play / Google настройки (Material 3); снимки — CC0 (assets/system/).
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-7.js   |   ONLY=hotspot,roaming node …
const { tip, ms, appIcon, render } = require("./_shell");
const U = require("./_oneui");
const { scr, sw, ic, appIc, orow, card, chev, hdr, sub, slider, ava, chat, gbar, grow, wp, H, BLUE } = U;

const S = {};
const C = { blue: "#2f7cf6", green: "#2fa86a", orange: "#f28b30", red: "#e5484d", purple: "#8a5cf6", teal: "#14a39b" };
const tg = (on, ring) => `<span class="tg${on ? " on" : ""}${ring ? " ring ringr" : ""}"><i></i></span>`;

// Прехвърляне към телевизор (Cast от YouTube)
S["screen-cast"] = scr(`
  <div style="position:relative;height:232px;background:#000 url('${wp("wp-autumn-path.jpg")}') center 62%/cover">
    <div style="position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,0) 40%,rgba(0,0,0,0) 70%,rgba(0,0,0,.55))"></div>
    <div style="position:absolute;left:10px;top:8px;color:#fff">${ms("keyboard_arrow_down", { size: 30, color: "#fff" })}</div>
    <div style="position:absolute;right:12px;top:8px;display:flex;gap:16px;align-items:center">${ms("cast", { size: 24, color: "#fff" })}${ms("closed_caption", { size: 24, color: "#fff" })}${ms("settings", { size: 24, color: "#fff" })}</div>
    <div style="position:absolute;left:0;right:0;top:92px;display:flex;justify-content:center">${ms("play_arrow", { size: 54, fill: 1, color: "#fff" })}</div>
    <div style="position:absolute;left:14px;right:14px;bottom:12px;color:#fff;font-size:12px;display:flex;justify-content:space-between"><span>1:12 / 4:30</span>${ms("fullscreen", { size: 20, color: "#fff" })}</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.35)"><div style="width:26%;height:3px;background:#f00"></div></div></div>
  <div style="padding:14px 16px;color:#0f0f0f"><div style="font-size:17px;font-weight:500;line-height:1.3">Есенна разходка край Бобов дол</div><div style="font-size:13px;color:#606060;margin-top:4px">12 хил. гледания · преди 3 дни</div></div>
  <div style="position:absolute;inset:232px 0 0 0;background:rgba(0,0,0,.45)"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;border-radius:28px 28px 0 0;background:#fff;padding:12px 0 24px;box-shadow:0 -6px 24px rgba(0,0,0,.25)">
    <div style="width:36px;height:4px;border-radius:2px;background:#c9cacf;margin:0 auto 14px"></div>
    <div style="font-size:19px;font-weight:500;color:#1f1f1f;padding:0 22px 10px">Прехвърляне към</div>
    <div class="ring" style="display:flex;align-items:center;gap:16px;padding:12px 16px;margin:2px 10px;border-radius:16px;font-size:17px;color:#1f1f1f">${ms("tv", { size: 26, color: "#444" })}<div style="flex:1">Телевизор (хол)<div style="font-size:13px;color:#5f6368;margin-top:1px">Намерен в Wi-Fi мрежата</div></div></div>
    <div style="display:flex;align-items:center;gap:16px;padding:12px 26px;font-size:17px;color:#1f1f1f">${ms("tv", { size: 26, color: "#444" })}<div style="flex:1">Smart TV спалня<div style="font-size:13px;color:#5f6368;margin-top:1px">Намерен в Wi-Fi мрежата</div></div></div>
    <div style="padding:10px 22px 0;font-size:13px;color:#5f6368;line-height:1.4">Телефонът и телевизорът трябва да са в една и съща Wi-Fi мрежа.</div></div>
  <div class="ring ringr" style="position:absolute;left:268px;top:2px;width:36px;height:36px;border-radius:50%"></div>
  ${tip("Докоснете „Cast“ и изберете телевизора", "right:12px;top:" + (H - 360) + "px;width:210px", { arrow: "d", at: "40%" })}`, { bg: "#fff" });

// Мобилна точка за достъп
S["hotspot"] = scr(`${hdr("Мобилна точка за достъп", { fs: 25 })}
  ${card(`<div class="orow" style="min-height:70px"><div class="ot"><b style="font-size:18px">Включено</b></div>${sw(true, true)}</div>`)}
  ${card(`${orow("", "Име на мрежата", "Телефон-4821", "")}${orow("", "Парола", "tn4k8d2x", ms("visibility", { size: 22, color: "#6b6b70" }))}${orow("", "Свързани устройства", "1 устройство", chev)}`)}
  ${sub("Другото устройство избира тази мрежа и въвежда паролата — като при обикновено Wi-Fi. Използва мобилните Ви данни, затова изключете точката, когато не Ви трябва.")}
  ${tip("Включете ключето, после дайте името и паролата на другия, за да се свърже", "right:14px;top:16px;width:276px", { arrow: "d", at: "84%" })}`);

// Резервно копие в облака (Google)
S["phone-backup"] = scr(`${gbar("Архивиране")}
  <div style="margin:6px 16px 14px;border-radius:28px;background:#e9eef6;padding:20px 20px 18px">
    <div style="display:flex;align-items:center;gap:16px"><span style="width:48px;height:48px;border-radius:50%;background:#d3e3fd;display:flex;align-items:center;justify-content:center">${ms("cloud_upload", { size: 26, fill: 1, color: "#0b57d0" })}</span><div style="flex:1;font-size:18px;color:#1f1f1f;line-height:1.25">Архивиране с Google One</div>${tg(true, true)}</div>
    <div style="font-size:14px;color:#444746;margin:14px 0 14px;line-height:1.4">Последно архивиране: днес, 8:30<br>Акаунт: ime.familiya@gmail.com</div>
    <div style="display:inline-block;background:#0b57d0;color:#fff;font-size:14.5px;font-weight:500;padding:10px 22px;border-radius:20px">Архивирай сега</div></div>
  <div style="padding:6px 22px 4px;font-size:14px;color:#0b57d0;font-weight:500">Какво се архивира</div>
  ${[["image", "Снимки и видеоклипове", "Google Снимки · включено"], ["group", "Контакти", "Включено"], ["apps", "Приложения и настройки", "Включено"], ["sms", "SMS съобщения", "Включено"]].map(([i, t, s]) => `<div style="display:flex;align-items:center;gap:18px;padding:11px 22px"><span style="display:flex">${ms(i, { size: 24, color: "#444746" })}</span><div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f">${t}</div><div style="font-size:13.5px;color:#5f6368;margin-top:1px">${s}</div></div>${ms("check_circle", { size: 22, fill: 1, color: "#1e8e3e" })}</div>`).join("")}
  ${tip("Включете резервното копие — всичко се пази в облака", "right:12px;top:8px;width:184px", { arrow: "d", at: "90%" })}`, { bg: "#fff" });

// Абонаменти — Google Play
S["app-subscriptions"] = (() => {
  const sub_ = (app, name, price, next, open) => `<div style="margin:0 14px 12px;border-radius:20px;background:${open ? "#fff" : "#fff"};border:1px solid #dadce0;padding:14px 16px">
    <div style="display:flex;align-items:center;gap:14px">${appIcon(app, { size: 44, label: false })}<div style="flex:1"><div style="font-size:16.5px;color:#1f1f1f">${name}</div><div style="font-size:13.5px;color:#5f6368;margin-top:2px">${price}</div></div>${ms(open ? "expand_less" : "expand_more", { size: 24, color: "#5f6368" })}</div>
    ${open ? `<div style="font-size:13.5px;color:#444746;margin:12px 0 12px;line-height:1.4">Следващо плащане: 12.11.2026<br>Плащане: Google Pay</div><div class="ring ringr" style="display:inline-block;border:1px solid #747775;color:#b3261e;font-size:14.5px;font-weight:500;padding:9px 20px;border-radius:20px">Отказване на абонамента</div>` : ""}</div>`;
  return scr(`${gbar("Абонаменти")}
    <div style="padding:4px 22px 12px;font-size:14px;color:#5f6368">Активни абонаменти: 3</div>
    ${sub_("youtube", "YouTube Premium", "11,99 € / месец")}
    ${sub_("drive", "Google One · 100 GB", "1,99 € / месец")}
    ${sub_("spotify", "Spotify Premium", "6,99 € / месец", "", true)}
    ${tip("Отворете абонамента, който не ползвате, и натиснете „Отказване“", "left:50%;top:" + 470 + "px;transform:translateX(-50%);width:270px", { arrow: "u", at: "36%" })}`, { bg: "#fff" });
})();

// Скорошни приложения
S["recent-apps"] = (() => {
  const W = 236, Hc = 466, sc = W / 390;
  const card_ = (x, name, app, inner) => `<div style="position:absolute;left:${x}px;top:64px;width:${W}px">
      <div style="display:flex;align-items:center;gap:8px;height:30px;color:#fff;font-size:13px;margin-bottom:8px;justify-content:center">${appIcon(app, { size: 24, label: false })}<span>${name}</span></div>
      <div style="width:${W}px;height:${Hc}px;border-radius:26px;overflow:hidden;position:relative;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.4)"><div style="position:absolute;left:0;top:0;width:390px;height:${Math.round(Hc / sc)}px;transform:scale(${sc});transform-origin:top left;overflow:hidden">${inner}</div></div></div>`;
  const msgs = chat("Мария Петрова", [[false, "Добро утро, Мария! Как спа?"], [true, "Добре, благодаря. А ти?"], [false, "Добро утро! Ще дойдеш ли на кафе днес?"], [true, "Да, към 11 ще съм там."], [false, "Чудесно, чакам те."], [true, "До скоро!"]], "Съобщение", "");
  const chrome = `<div style="background:#fff;height:100%"><div style="display:flex;justify-content:center;margin-top:120px">${appIcon("google", { size: 84, label: false, os: "ios" })}</div><div style="margin:36px 18px 0;height:56px;border-radius:28px;background:#fff;box-shadow:0 1px 6px rgba(32,33,36,.28);display:flex;align-items:center;padding:0 20px;gap:12px;color:#5f6368;font-size:16px">${ms("search", { size: 22, color: "#5f6368" })}Търсене или въведете URL</div></div>`;
  const photos = ["wp-sea-sunset.jpg", "wp-mountain-lake.jpg", "wp-autumn-path.jpg", "wp-meadow.jpg", "wp-fog-sunset.jpg", "wp-pink-sunset.jpg", "wp-mountain-lake.jpg", "wp-sea-sunset.jpg", "wp-autumn-path.jpg"];
  const gallery = `<div style="background:#fff;height:100%"><div style="padding:18px 22px;font-size:28px;font-weight:500;color:#111">Галерия</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:0 3px">${photos.map((p) => `<div style="height:170px;background:url('${wp(p)}') center/cover"></div>`).join("")}</div></div>`;
  return scr(`<div style="position:absolute;inset:-60px;background:url('${wp("wp-sea-sunset.jpg")}') center/cover;filter:blur(28px) brightness(.32) saturate(1.1)"></div>
    ${card_(-176, "Chrome", "chrome", chrome)}${card_(77, "Съобщения", "messages", msgs)}${card_(327, "Галерия", "gallery", gallery)}
    <div style="position:absolute;left:0;right:0;top:588px;display:flex;justify-content:center"><div class="ring ringr" style="height:46px;padding:0 28px;border-radius:23px;background:rgba(255,255,255,.22);color:#fff;font-size:15.5px;display:flex;align-items:center;gap:8px">${ms("close", { size: 20, color: "#fff" })}Затвори всички</div></div>
    ${tip("Плъзнете картата нагоре — приложението се затваря. Или „Затвори всички“", "left:50%;top:" + 516 + "px;transform:translateX(-50%);width:276px", { arrow: "d", at: "50%" })}`, { bg: "#14161c", sb: "#fff" });
})();

// Роуминг
S["roaming"] = scr(`${hdr("Мобилни мрежи")}
  ${card(`${orow("", "Мобилни данни", "Достъп до данни през мобилната мрежа", sw(true))}${orow("", "Роуминг на данни", "Данни при пътуване в чужбина — изключено", sw(false, true))}`)}
  ${card(`${orow("", "Режим на мрежата", "4G/5G (автоматично)", chev)}${orow("", "Мрежови оператори", "Избор на оператор", chev)}${orow("", "Имена на точки за достъп", "", chev)}`)}
  ${sub("Изключеният роуминг пази от високи сметки в чужбина. Включете го само при нужда.")}
  ${tip("Преди пътуване проверете „Роуминг на данни“ — дръжте го изключен, освен ако не Ви трябва", "left:50%;top:246px;transform:translateX(-50%);width:276px", { arrow: "u", at: "86%" })}`);

// Сила на звука на известията
S["notif-volume"] = (() => {
  const row = (icn, name, v, hl) => `<div style="padding:16px 20px 12px"><div style="display:flex;align-items:center;gap:12px;font-size:16.5px;color:#111;margin-bottom:18px">${ms(icn, { size: 22, fill: 1, color: "#555" })}<span>${name}</span></div><div style="padding:0 4px">${slider(v, { ring: hl })}</div></div>`;
  return scr(`${hdr("Сила на звука")}
    ${card(`${row("ring_volume", "Звънене", 70)}${row("music_note", "Мултимедия", 55)}${row("notifications", "Известия", 82, true)}${row("settings", "Система", 45)}`)}
    ${tip("Плъзнете „Известия“ надясно — звукът им става по-силен", "left:50%;top:" + 414 + "px;transform:translateX(-50%);width:262px", { arrow: "u", at: "84%" })}`);
})();

render(S).catch((e) => { console.error(e); process.exit(1); });
