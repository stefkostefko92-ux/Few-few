// Трета партида „мокъп" екрани: телефонни основи, настройки, клавиатура.
// Стил: Samsung One UI 6 (Настройки, бърз панел, заключен/начален екран), клавиатура Gboard (светла, ЯВЕРТЪ).
// Екраните са пресъздадени с истински Material Symbols, икони на приложения и CC0 тапети (assets/system/).
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-3.js   |   ONLY=power,battery node …
const { tip, ms, appIcon, render } = require("./_shell");
const U = require("./_oneui");
const { scr, sw, ic, appIc, orow, card, chev, hdr, sub, slider, ava, quickPanel, homeScreen, gboard, chat, gbar, grow, wp, wpBg, H, BLUE } = U;

const S = {};
const C = { blue: "#2f7cf6", green: "#2fa86a", orange: "#f28b30", red: "#e5484d", purple: "#8a5cf6", teal: "#14a39b", gray: "#7a8493", pink: "#e8579b", sky: "#1fa4e6" };
const dim = (a = 0.5) => `<div style="position:absolute;inset:0;background:rgba(0,0,0,${a})"></div>`;
const blurBg = (n, b = 26, br = 0.4) => `<div style="position:absolute;inset:-60px;background:url('${wp(n)}') center/cover;filter:blur(${b}px) brightness(${br}) saturate(1.1)"></div>`;

// ═══ ТЕЛЕФОННИ ОСНОВИ ═══
// Менюто при задържане на бутона отстрани (One UI 6)
const powerMenu = (hlRestart) => {
  const r = (icon, col, label, hl) => `<div class="${hl ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;height:62px;padding:0 16px;color:#fff;border-radius:18px;${hl ? "margin:0 2px;" : ""}"><span style="width:40px;height:40px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center">${ms(icon, { size: 23, color: "#fff" })}</span><span style="font-size:17px">${label}</span></div>`;
  return `${blurBg("wp-sea-sunset.jpg", 22, 0.3)}
    <div style="position:absolute;left:16px;top:62px;width:262px;border-radius:30px;background:rgba(48,50,58,.92);padding:8px 6px;box-shadow:0 10px 30px rgba(0,0,0,.4)">
      ${r("power_settings_new", "#e5484d", "Изключване", !hlRestart)}${r("restart_alt", "#3e91ff", "Рестартиране", hlRestart)}${r("emergency", "#f28b30", "Режим на спешност", false)}</div>`;
};
S["power"] = scr(`${powerMenu(false)}
  ${tip("Задръжте бутона отстрани", "right:14px;top:176px;max-width:96px", { arrow: "r", at: "50%" })}
  ${tip("Докоснете „Изключване“", "left:16px;top:270px;width:200px", { arrow: "u", at: "26%" })}`, { bg: "#0d0e12", sb: "#fff" });

// Заключен екран
S["lock-screen"] = scr(`
  <div style="position:absolute;inset:0;color:#fff;text-align:center">
    <div style="margin-top:20px;display:flex;justify-content:center">${ms("lock", { size: 20, fill: 1, color: "#fff" })}</div>
    <div style="font-size:16px;margin-top:10px;text-shadow:0 1px 4px rgba(0,0,0,.35)">пт, 30 октомври</div>
    <div style="font-size:98px;font-weight:400;letter-spacing:-4px;line-height:1.02;margin-top:2px;text-shadow:0 2px 12px rgba(0,0,0,.3)">10:24</div>
    <div style="margin:26px 22px 0;background:rgba(24,24,30,.52);border-radius:24px;padding:14px 16px;text-align:left;backdrop-filter:blur(14px)">
      <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#e3e5ea;margin-bottom:7px">${appIcon("viber", { size: 18, label: false })}<span>Viber</span><span>•</span><span>сега</span></div>
      <div style="font-size:15px;font-weight:500">Съдържанието е скрито</div></div>
    <div style="position:absolute;left:34px;bottom:78px;width:50px;height:50px;border-radius:50%;background:rgba(20,20,26,.5);display:flex;align-items:center;justify-content:center">${ms("call", { size: 24, fill: 1, color: "#fff" })}</div>
    <div style="position:absolute;right:34px;bottom:78px;width:50px;height:50px;border-radius:50%;background:rgba(20,20,26,.5);display:flex;align-items:center;justify-content:center">${ms("photo_camera", { size: 24, fill: 1, color: "#fff" })}</div>
    <div class="ring ringr" style="position:absolute;left:50%;bottom:74px;margin-left:-26px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.28);display:flex;align-items:center;justify-content:center">${ms("keyboard_double_arrow_up", { size: 30, color: "#fff" })}</div>
  </div>
  ${tip("Плъзнете нагоре по екрана", "left:50%;top:" + (H - 168) + "px;transform:translateX(-50%)", { arrow: "d", at: "50%" })}`, { bg: wpBg("wp-pink-sunset.jpg"), sb: "#fff" });

// Звук → Сила на звънене
S["ringer-volume"] = scr(`${hdr("Звук")}
  ${card(`<div style="padding:16px 20px 20px">
      <div style="display:flex;align-items:center;gap:10px;font-size:16.5px;color:#111;margin-bottom:22px">${ms("ring_volume", { size: 22, fill: 1, color: "#555" })}<span>Сила на звънене</span></div>
      <div style="display:flex;align-items:center;gap:14px">${ms("volume_mute", { size: 22, color: "#6b6b70" })}<div style="flex:1">${slider(68, { ring: true })}</div>${ms("volume_up", { size: 22, color: "#6b6b70" })}</div>
      </div>`)}
  ${card(`${orow("", "Мелодия на звънене", "Класическа мелодия", chev)}${orow("", "Вибрация при звънене", "Основна вибрация", chev)}`, "margin-top:56px")}
  ${tip("Плъзнете точката надясно — звънът става по-силен", "left:50%;top:228px;transform:translateX(-50%);width:250px", { arrow: "u", at: "62%" })}`);

// Яркост — бърз панел
S["brightness"] = quickPanel({ on: ["Wi-Fi", "Мобилни данни"], ringSlider: true, slider: 64,
  extra: tip("Плъзнете надясно за по-светло, наляво за по-тъмно", "left:50%;top:352px;transform:translateX(-50%);width:250px", { arrow: "u", at: "55%" }) });

// Гласово търсене — Google
S["voice-search"] = scr(`
  <div style="display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:6px 18px 0 18px;height:60px;color:#3c4043"><div style="flex:1;font-size:13px;color:#5f6368">Бобов дол · 8°</div>${ms("notifications", { size: 22, color: "#5f6368" })}${ava("М", "#8e6ad8", 32)}</div>
  <div style="display:flex;justify-content:center;margin-top:46px">${appIcon("google", { size: 84, label: false, os: "ios" })}</div>
  <div style="margin:36px 18px 0;height:56px;border-radius:28px;background:#fff;box-shadow:0 1px 6px rgba(32,33,36,.28);display:flex;align-items:center;padding:0 12px 0 20px;gap:12px;color:#5f6368;font-size:16px">${ms("search", { size: 22, color: "#5f6368" })}<span style="flex:1">Търсене или въведете URL</span><span class="ring ringr" style="display:flex;padding:5px">${ms("mic", { size: 24, fill: 1, color: "#4285f4" })}</span>${appIcon("lens", { size: 28, label: false })}</div>
  <div style="margin:26px 18px 0;display:flex;flex-direction:column;gap:2px">
    ${[["trending_up", "времето в Бобов дол"], ["trending_up", "дежурна аптека"], ["trending_up", "новини"], ["history", "рецепта за баница"]].map(([i, t]) => `<div style="display:flex;align-items:center;gap:16px;height:48px;font-size:16px;color:#202124">${ms(i, { size: 22, color: "#70757a" })}<span>${t}</span></div>`).join("")}</div>
  ${tip("Докоснете микрофона и говорете — не пишете", "right:14px;top:294px;width:230px", { arrow: "u", at: "86%" })}`, { bg: "#fff" });

// Фенерче — бърз панел
S["flashlight"] = quickPanel({ on: ["Wi-Fi", "Фенерче"], hl: "Фенерче",
  extra: tip("Докоснете „Фенерче“ — светва. Докоснете пак — угасва", "left:44px;top:300px;width:250px", { arrow: "u", at: "36%" }) });

// Батерия
S["battery"] = scr(`${hdr("Батерия")}
  ${card(`<div style="padding:22px 22px 20px">
      <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:52px;font-weight:400;letter-spacing:-1.5px;color:#111">78</span><span style="font-size:24px;color:#111">%</span><span style="margin-left:8px;display:inline-flex;align-items:center;gap:4px;color:#2fa86a;font-size:15px">${ms("bolt", { size: 20, fill: 1, color: "#2fa86a" })}Зарежда се</span></div>
      <div style="height:10px;border-radius:5px;background:#e6e6ea;margin:14px 0 12px;overflow:hidden"><div style="width:78%;height:10px;background:#2fa86a"></div></div>
      <div style="font-size:14px;color:#6b6b70">Пълно зареждане след около 40 мин</div></div>`)}
  ${card(`${orow(ic("battery_saver", C.green), "Пестене на батерия", "Ограничава яркостта и фоновата работа", sw(true, true), false)}${orow(ic("bar_chart", C.blue), "Използване на батерията", "", chev)}${orow(ic("nights_stay", C.purple), "Фоново използване", "", chev)}`)}
  ${tip("Включете „Пестене на батерия“, за да издържи по-дълго", "left:50%;top:506px;transform:translateX(-50%);width:262px", { arrow: "u", at: "86%" })}`, { battery: 78 });

// ═══ НАСТРОЙКИ ═══
S["airplane"] = quickPanel({ on: ["Самолетен режим"], hl: "Самолетен режим",
  extra: tip("Докоснете самолетчето — връзките спират", "right:20px;top:38px;width:215px", { arrow: "d", at: "84%" }) });
S["mobile-data"] = quickPanel({ on: ["Wi-Fi", "Мобилни данни"], hl: "Мобилни данни",
  extra: tip("Докоснете „Мобилни данни“ — свети, когато е включено", "left:80px;top:300px;width:250px", { arrow: "u", at: "57%" }) });
S["auto-rotate"] = quickPanel({ on: ["Wi-Fi", "Автозавъртане"], hl: "Автозавъртане",
  extra: tip("Докоснете „Автозавъртане“ — включва или заключва", "left:16px;top:300px;width:250px", { arrow: "u", at: "17%" }) });

S["bluetooth"] = scr(`${hdr("Bluetooth")}
  ${card(`<div class="orow" style="min-height:68px"><div class="ot"><b style="font-size:18px">Включено</b></div>${sw(true)}</div>`)}
  ${sub("Видим като „Телефон-4821“ за устройства наблизо.")}
  <div style="padding:6px 28px 8px;font-size:14px;color:#6b6b70">Налични устройства</div>
  ${card(`${orow(ic("headphones", C.blue), "Слушалки Tune 510BT", "Докоснете, за да се сдвоят", "", true)}${orow(ic("speaker", C.purple), "Колонка Beat Mini", "Докоснете, за да се сдвои", "")}`)}
  ${tip("Включете Bluetooth и докоснете устройството, за да се свърже", "left:50%;top:410px;transform:translateX(-50%);width:262px", { arrow: "u", at: "40%" })}`);

// Преместване на икона
S["move-icon"] = (() => {
  const g = U.HOME.map((r) => r.slice()); g[1][2] = null;
  const slot = `<div style="position:absolute;left:${U.colX(2) - 28}px;top:${U.rowY(1)}px;width:56px;height:56px;border-radius:17px;background:rgba(255,255,255,.16)"></div>`;
  const ghost = `<div class="ring" style="position:absolute;left:${U.colX(1) + 28}px;top:${U.rowY(2) - 34}px;width:66px;border-radius:19px;transform:scale(1.16);filter:drop-shadow(0 14px 14px rgba(0,0,0,.45))">${appIcon("viber", { size: 56, label: true })}</div>`;
  return homeScreen(slot + ghost + tip("Задръжте иконата и я плъзнете на новото място", "left:50%;top:452px;transform:translateX(-50%);width:250px", { arrow: "u", at: "40%" }), { grid: g });
})();

// Папка
S["app-folder"] = (() => {
  const apps = ["viber", "whatsapp", "messenger", "messages", "telegram", "facebook"];
  const folder = `${dim(0.38)}
    <div style="position:absolute;left:34px;right:34px;top:150px;border-radius:34px;background:rgba(246,246,248,.96);padding:20px 18px 18px;box-shadow:0 14px 40px rgba(0,0,0,.4)">
      <div class="ring" style="display:flex;align-items:center;justify-content:center;gap:8px;margin:0 36px 18px;height:38px;border-radius:19px;font-size:19px;font-weight:500;color:#111">Общуване ${ms("edit", { size: 17, color: "#6b6b70" })}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);row-gap:16px;justify-items:center;color:#111">${apps.map((a) => `<div class="fl">${appIcon(a, { size: 56, label: true })}</div>`).join("")}</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:18px;font-size:14.5px;color:${BLUE}">${ms("add", { size: 18, color: BLUE })}Добавяне на приложения</div></div>
    ${tip("Двете приложения се събраха в папка — докоснете името и ѝ дайте свое", "left:50%;top:452px;transform:translateX(-50%);width:270px", { arrow: "u", at: "50%" })}`;
  return homeScreen(folder);
})();

// Деинсталиране
S["uninstall"] = (() => {
  const g = U.HOME.map((r) => r.slice()); g[2][2] = "opera";
  const x = U.colX(2), y = U.rowY(2);
  const menu = `${dim(0.28)}
    <div style="position:absolute;left:${x - 34}px;top:${y}px;width:66px;transform:scale(1.1);filter:drop-shadow(0 8px 10px rgba(0,0,0,.4))">${appIcon("opera", { size: 56, label: true })}</div>
    <div style="position:absolute;left:100px;top:${y + 100}px;width:282px;border-radius:22px;background:#fff;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.35);color:#111;font-size:16px">
      <div style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px">${ms("check_circle", { size: 22, color: "#555" })}Избор на елементи</div>
      <div style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px">${ms("info", { size: 22, color: "#555" })}Информация за приложението</div>
      <div class="ring" style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px;border-radius:14px;margin:2px">${ms("delete", { size: 22, color: "#555" })}Деинсталиране</div></div>
    ${tip("Задръжте иконата и изберете „Деинсталиране“", "left:50%;top:522px;transform:translateX(-50%);width:250px", { arrow: "u", at: "70%" })}`;
  return homeScreen(menu, { grid: g });
})();

// Обновяване в Google Play
S["update-app"] = (() => {
  const btn = (t, hl) => `<div class="${hl ? "ring ringr" : ""}" style="background:#01875f;color:#fff;font-size:14px;font-weight:500;padding:8px 20px;border-radius:20px">${t}</div>`;
  const app = (n, name, meta, hl, done) => `<div style="display:flex;align-items:center;gap:14px;padding:10px 18px">${appIcon(n, { size: 48, label: false })}<div style="flex:1"><div style="font-size:16px;color:#1f1f1f">${name}</div><div style="font-size:13px;color:#5f6368;margin-top:2px">${meta}</div></div>${done ? `<div style="font-size:14px;color:#01875f;font-weight:500">Отвори</div>` : btn("Обнови", hl)}</div>`;
  return scr(`${gbar("Управление на приложения")}
    <div style="display:flex;gap:8px;padding:2px 16px 12px"><span style="padding:7px 14px;border-radius:9px;background:#d3e3fd;font-size:14px;color:#0b3a8a;font-weight:500">Преглед</span><span style="padding:7px 14px;border-radius:9px;border:1px solid #c4c7c5;font-size:14px;color:#444">Управление</span></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 18px 6px"><div style="font-size:18px;font-weight:500;color:#1f1f1f">Налични обновления (4)</div>${btn("Обнови всички")}</div>
    ${app("whatsapp", "WhatsApp Messenger", "WhatsApp LLC · 61 МБ")}${app("facebook", "Facebook", "Meta Platforms · 118 МБ")}${app("gmail", "Gmail", "Google LLC · 32 МБ")}${app("viber", "Viber", "Viber Media · 94 МБ", true)}
    <div style="padding:76px 18px 6px;font-size:18px;font-weight:500;color:#1f1f1f">Наскоро обновени</div>
    ${app("chrome", "Google Chrome", "Обновено вчера", false, true)}
    ${tip("Натиснете „Обнови“ до приложението", "right:14px;top:478px;width:200px", { arrow: "u", at: "86%" })}`, { bg: "#fff" });
})();

// Търсене на приложение (чекмедже на приложенията)
S["find-app"] = scr(`<div style="display:flex;flex-direction:column;height:${H}px;background:#f3f4f6">
  <div style="padding:10px 16px 6px"><div style="height:50px;border-radius:25px;background:#e6e8ec;display:flex;align-items:center;padding:0 16px;gap:12px;font-size:18px;color:#111" class="ring">${ms("search", { size: 24, color: "#555" })}<span style="flex:1">Ка<i style="display:inline-block;width:2px;height:22px;background:${BLUE};vertical-align:middle;margin-left:1px"></i></span>${ms("close", { size: 22, color: "#555" })}</div></div>
  <div style="padding:16px 22px 10px;font-size:14px;color:#6b6b70">Приложения</div>
  <div style="display:flex;gap:6px;padding:0 20px">${["calendar", "calculator", "camera"].map((n) => `<div style="width:90px">${appIcon(n, { size: 58, label: true, labelColor: "#111" })}</div>`).join("")}</div>
  <div style="flex:1"></div>
  ${gboard({ sug: ["Ка", "как", "какво"] })}</div>
  ${tip("Напишете първите букви — приложението се показва. Докоснете го", "left:50%;top:236px;transform:translateX(-50%);width:300px", { arrow: "u", at: "30%" })}`, { bg: "#f3f4f6" });

// Тапет
S["wallpaper"] = (() => {
  const photos = ["wp-sea-sunset.jpg", "wp-mountain-lake.jpg", "wp-autumn-path.jpg", "wp-meadow.jpg", "wp-fog-sunset.jpg", "wp-pink-sunset.jpg"];
  const cell = (n, sel) => `<div class="${sel ? "ring" : ""}" style="position:relative;height:196px;border-radius:16px;overflow:hidden;background:url('${wp(n)}') center/cover">${sel ? `<span style="position:absolute;right:8px;top:8px;width:26px;height:26px;border-radius:50%;background:${BLUE};display:flex;align-items:center;justify-content:center">${ms("check", { size: 18, weight: 600, color: "#fff" })}</span>` : ""}</div>`;
  return scr(`${hdr("Тапет", { h: 96 })}
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:0 14px">${photos.map((p, i) => cell(p, i === 1)).join("")}</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:98px;background:#f6f6f6;display:flex;align-items:center;justify-content:center;gap:10px">
      <div class="ring ringr" style="background:${BLUE};color:#fff;font-size:17px;font-weight:500;height:50px;padding:0 30px;border-radius:25px;display:flex;align-items:center">Задай като тапет</div></div>
    ${tip("Изберете снимка → „Задай като тапет“", "left:50%;top:" + (H - 148) + "px;transform:translateX(-50%);width:250px", { arrow: "d", at: "50%" })}`);
})();

S["date-time"] = scr(`${hdr("Дата и час")}
  ${card(`${orow("", "Автоматична дата и час", "Използва времето от мрежата", sw(true), true)}`)}
  ${card(`${orow("", "Задаване на дата", "30 октомври 2026", "")}${orow("", "Задаване на час", "10:24", "")}`, "opacity:.5")}
  ${card(`${orow("", "Часова зона", "България (GMT+2:00)", chev)}${orow("", "24-часов формат", "", sw(true))}`)}
  ${tip("Оставете „Автоматична дата и час“ включено — часът се сверява сам", "right:16px;top:40px;width:200px", { arrow: "d", at: "84%" })}`);

S["phone-language"] = scr(`${hdr("Език")}
  <div style="padding:0 28px 8px;font-size:14px;color:#6b6b70">Предпочитани езици</div>
  ${card(`${orow("", "Български", "България · основен език", ms("drag_handle", { size: 22, color: "#8a8a90" }) + ms("check", { size: 22, color: BLUE, weight: 600 }), true)}${orow("", "English", "Великобритания", ms("drag_handle", { size: 22, color: "#8a8a90" }))}`)}
  ${card(`${orow(ms("add", { size: 24, color: BLUE }), `<span style="color:${BLUE}">Добавяне на език</span>`, "", "")}`)}
  ${sub("Менютата и приложенията се показват на първия език от списъка, който е поддържан.")}
  ${tip("Добавете „Български“ и го преместете най-отгоре", "left:50%;top:352px;transform:translateX(-50%);width:262px", { arrow: "u", at: "20%" })}`);

// Пръстов отпечатък
S["fingerprint"] = scr(`${hdr("Пръстови отпечатъци", { fs: 27 })}
  <div style="display:flex;flex-direction:column;align-items:center;margin-top:26px">
    <div class="ring ringr" style="position:relative;width:176px;height:176px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center">
      <svg width="176" height="176" viewBox="0 0 176 176" style="position:absolute;inset:0"><circle cx="88" cy="88" r="82" fill="none" stroke="#e3e3e8" stroke-width="6"/><circle cx="88" cy="88" r="82" fill="none" stroke="${BLUE}" stroke-width="6" stroke-linecap="round" stroke-dasharray="515" stroke-dashoffset="309" transform="rotate(-90 88 88)"/></svg>
      ${ms("fingerprint", { size: 108, color: BLUE, weight: 300 })}</div>
    <div style="font-size:19px;font-weight:500;color:#111;margin-top:24px">Допрете сензора</div>
    <div style="font-size:14.5px;color:#6b6b70;margin-top:8px;text-align:center;line-height:1.45;padding:0 44px">Повдигайте и допирайте пръста няколко пъти, докато се запамети. 40%</div></div>
  <div style="position:absolute;left:50%;bottom:34px;margin-left:-30px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,#d7e6ff 0,#9ec3ff 60%,rgba(158,195,255,0) 72%);display:flex;align-items:center;justify-content:center">${ms("fingerprint", { size: 34, color: "#3e91ff" })}</div>
  ${tip("Допирайте пръста няколко пъти — после телефонът се отключва с него", "left:50%;top:466px;transform:translateX(-50%);width:262px", { arrow: "d", at: "50%" })}`);

// Лице
S["face-unlock"] = scr(`${hdr("Разпознаване на лице", { fs: 27 })}
  <div style="display:flex;flex-direction:column;align-items:center;margin-top:30px">
    <div class="ring ringr" style="position:relative;width:206px;height:206px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center">
      <svg width="206" height="206" viewBox="0 0 206 206" style="position:absolute;inset:0"><circle cx="103" cy="103" r="97" fill="none" stroke="#e3e3e8" stroke-width="5"/><circle cx="103" cy="103" r="97" fill="none" stroke="${BLUE}" stroke-width="5" stroke-linecap="round" stroke-dasharray="40 21" transform="rotate(-90 103 103)"/></svg>
      ${ms("face", { size: 120, color: "#8d93a0", weight: 200 })}</div>
    <div style="font-size:19px;font-weight:500;color:#111;margin-top:28px">Погледнете към камерата</div>
    <div style="font-size:14.5px;color:#6b6b70;margin-top:8px;text-align:center;line-height:1.45;padding:0 44px">Поставете лицето си в кръга и го въртете бавно, докато се запамети.</div></div>
  ${tip("Гледайте в камерата — после телефонът Ви познава. При слаба светлина ползвайте кода", "left:50%;top:470px;transform:translateX(-50%);width:270px", { arrow: "d", at: "50%" })}`);

// ПИН
S["change-pin"] = scr(`${hdr("Нов ПИН", { fs: 28 })}
  <div style="text-align:center;padding-top:6px">
    <div style="font-size:16px;color:#111">Въведете новия код два пъти</div>
    <div style="display:flex;justify-content:center;gap:16px;margin:26px 0 8px">${[1, 1, 1, 0].map((f) => `<i style="width:15px;height:15px;border-radius:50%;${f ? `background:#111` : "border:2px solid #9a9aa0"}"></i>`).join("")}</div>
    <div style="font-size:13px;color:#6b6b70;margin-bottom:8px">Най-малко 4 цифри</div></div>
  <div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:28px 28px 0 0;padding:14px 20px 8px">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);row-gap:4px">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "bk"].map((n) => `<div style="height:62px;display:flex;align-items:center;justify-content:center;font-size:30px;color:#111">${n === "bk" ? ms("backspace", { size: 28, color: "#111" }) : n}</div>`).join("")}</div>
    <div style="display:flex;gap:10px;margin:6px 0 4px"><div style="flex:1;height:50px;border-radius:25px;background:#ececf0;display:flex;align-items:center;justify-content:center;font-size:16.5px;color:#111">Отказ</div><div style="flex:1;height:50px;border-radius:25px;background:${BLUE};display:flex;align-items:center;justify-content:center;font-size:16.5px;color:#fff;font-weight:500">Продължи</div></div></div>
  ${tip("Изберете код, който помните. Не го казвайте на никого", "left:50%;top:238px;transform:translateX(-50%);width:262px", { arrow: "d", at: "50%" })}`);

// Известия на приложения
S["app-notifications"] = (() => {
  const r = (app, name, on, hl) => orow(appIc(app, 40), name, "", sw(on, hl));
  return scr(`${hdr("Известия от приложения", { fs: 26 })}
    ${card(`${r("viber", "Viber", true)}${r("messenger", "Messenger", true)}${r("play", "Play Маркет", true)}${r("youtube", "YouTube", true)}${r("gmail", "Gmail", true)}${r("facebook", "Facebook", false, true)}`)}
    ${tip("Изключете ключето на приложението, което вдига шум. Важните оставете включени", "left:50%;top:496px;transform:translateX(-50%);width:270px", { arrow: "u", at: "86%" })}`);
})();

// Вибрация
S["vibration"] = scr(`${hdr("Звук")}
  ${card(`<div style="padding:16px 18px 18px"><div style="font-size:16.5px;color:#111;margin-bottom:12px">Звуков режим</div>
    <div style="display:flex;gap:8px">${[["Звук", 0], ["Вибрация", 1], ["Без звук", 0]].map(([t, a]) => `<div style="flex:1;height:42px;border-radius:21px;display:flex;align-items:center;justify-content:center;font-size:14.5px;${a ? `background:${BLUE};color:#fff;font-weight:500` : "background:#ececf0;color:#333"}">${t}</div>`).join("")}</div></div>`)}
  ${card(`${orow("", "Вибрация при докосване", "", sw(false))}${orow("", "Вибрация при известия", "", sw(true))}${orow("", "Вибрация при звънене", "Телефонът трепти при обаждане", sw(true, true))}`)}
  ${tip("Ключето синьо (вдясно) = вибрацията е включена", "left:50%;top:456px;transform:translateX(-50%);width:262px", { arrow: "u", at: "84%" })}`);

// Блокиране на номер — Телефон → Скорошни
S["block-number"] = (() => {
  const rec = (name, sub, ico, col, sel) => `<div style="display:flex;align-items:center;gap:14px;padding:10px 20px;${sel ? "background:#dce8fd;" : ""}">${/^\d/.test(name) ? `<div style="width:46px;height:46px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center">${ms("person", { size: 26, fill: 1, color: "#fff" })}</div>` : ava(name[0], col, 46)}<div style="flex:1"><div style="font-size:17px;color:${ico === "phone_missed" ? "#d93025" : "#111"}">${name}</div><div style="font-size:13px;color:#6b6b70;margin-top:2px;display:flex;align-items:center;gap:4px">${ms(ico, { size: 15, color: ico === "phone_missed" ? "#d93025" : "#6b6b70" })}${sub}</div></div>${ms("info", { size: 22, color: "#8a8a90" })}</div>`;
  return scr(`<div style="display:flex;flex-direction:column;height:${H}px;background:#fff">
    <div style="padding:8px 22px 6px;font-size:28px;font-weight:500;color:#111;display:flex;justify-content:space-between;align-items:center">Скорошни ${ms("more_vert", { size: 24 })}</div>
    <div style="padding:4px 14px 8px"><div style="height:44px;border-radius:22px;background:#f0f0f3;display:flex;align-items:center;padding:0 16px;gap:10px;font-size:15px;color:#6b6b70">${ms("search", { size: 22, color: "#6b6b70" })}Търсене</div></div>
    ${rec("Мария Петрова", "Входящо · 9:58", "call_received", "#8e6ad8")}
    ${rec("0888 123 456", "Пропуснато · 9:12", "phone_missed", "#9aa0a8", true)}
    ${rec("Георги (внук)", "Изходящо · вчера", "call_made", "#2fa86a")}
    ${rec("Д-р Стоянова", "Входящо · вчера", "call_received", "#e8579b")}
    ${rec("0877 555 019", "Пропуснато · пн", "phone_missed", "#9aa0a8")}
    <div style="flex:1"></div>
    <div style="display:flex;justify-content:space-around;padding:10px 0 6px;border-top:1px solid #ececef;font-size:12px;color:#555">${[["dialpad", "Клавиатура", 0], ["schedule", "Скорошни", 1], ["person", "Контакти", 0]].map(([i, t, a]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;${a ? `color:${BLUE};font-weight:500` : ""}">${ms(i, { size: 24, fill: a, color: a ? BLUE : "#555" })}${t}</div>`).join("")}</div></div>
    <div style="position:absolute;left:56px;top:240px;width:270px;border-radius:20px;background:#fff;padding:6px;box-shadow:0 8px 28px rgba(0,0,0,.28);font-size:16px;color:#111">
      <div class="ring" style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px;border-radius:14px;margin:2px">${ms("block", { size: 22, color: "#d93025" })}Блокирай номера</div>
      <div style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px">${ms("person_add", { size: 22, color: "#555" })}Добави към контактите</div>
      <div style="display:flex;align-items:center;gap:12px;height:46px;padding:0 12px">${ms("delete", { size: 22, color: "#555" })}Изтрий</div></div>
    ${tip("Задръжте върху номера → „Блокирай номера“. Повече няма да Ви безпокои", "left:50%;top:440px;transform:translateX(-50%);width:270px", { arrow: "u", at: "50%" })}`, { bg: "#fff" });
})();

// Принудителен рестарт
S["force-restart"] = scr(`${powerMenu(true)}
  ${tip("Звук −", "right:14px;top:106px;max-width:80px", { arrow: "r", at: "50%" })}
  ${tip("Включване", "right:14px;top:190px;max-width:100px", { arrow: "r", at: "50%" })}
  ${tip("Ако екранът не реагира — задръжте двата бутона заедно около 10 секунди", "left:16px;top:262px;width:240px", { arrow: "u", at: "74%" })}`, { bg: "#0d0e12", sb: "#fff" });

// Усилване по време на разговор
S["call-volume"] = scr(`
  ${blurBg("wp-sea-sunset.jpg", 34, 0.34)}
  <div style="position:absolute;inset:0;color:#fff;text-align:center">
    <div style="margin-top:56px;display:flex;justify-content:center">${ava("Г", "linear-gradient(135deg,#5b8def,#7a5bd9)", 104)}</div>
    <div style="font-size:28px;margin-top:18px">Георги (внук)</div>
    <div style="font-size:16px;opacity:.8;margin-top:6px">02:14</div>
    <div style="position:absolute;left:24px;right:24px;top:392px;display:grid;grid-template-columns:repeat(3,1fr);row-gap:22px;font-size:12.5px">
      ${[["add_call", "Добавяне"], ["videocam", "Видео"], ["bluetooth", "Bluetooth"], ["volume_up", "Високоговорител"], ["mic_off", "Заглушаване"], ["dialpad", "Клавиатура"]].map(([i, t], k) => `<div><div class="${k === 3 ? "ring ringr" : ""}" style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.16);margin:0 auto 7px;display:flex;align-items:center;justify-content:center">${ms(i, { size: 26, color: "#fff" })}</div>${t}</div>`).join("")}</div>
    <div style="position:absolute;left:50%;bottom:36px;margin-left:-35px;width:70px;height:70px;border-radius:50%;background:#e5352d;display:flex;align-items:center;justify-content:center">${ms("call_end", { size: 32, fill: 1, color: "#fff" })}</div>
  </div>
  <div class="ring" style="position:absolute;right:14px;top:160px;width:58px;height:236px;border-radius:29px;background:rgba(245,246,250,.95);overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.35)">
    <div style="position:absolute;left:0;right:0;bottom:0;height:70%;background:${BLUE}"></div>
    <div style="position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center">${ms("volume_up", { size: 26, color: "#fff", fill: 1 })}</div></div>
  ${tip("Натискайте „Звук +“ отстрани — звукът става по-силен", "left:16px;top:262px;width:262px", { arrow: "r", at: "50%" })}
  ${tip("За още по-силно — „Високоговорител“", "left:16px;top:574px;width:236px", { arrow: "u", at: "20%" })}`, { bg: "#14161c", sb: "#fff" });

// Използване на данни
S["data-usage"] = scr(`${hdr("Използване на данни", { fs: 27 })}
  ${card(`<div class="ring" style="margin:10px;padding:14px 12px;border-radius:18px"><div style="font-size:13.5px;color:#6b6b70">Мобилни данни · 1 окт – 30 окт</div>
    <div style="display:flex;align-items:baseline;gap:6px;margin-top:6px"><span style="font-size:40px;color:#111;letter-spacing:-1px">2,4</span><span style="font-size:18px;color:#111">GB</span><span style="margin-left:auto;font-size:14px;color:#6b6b70">от 5 GB</span></div>
    <div style="height:10px;border-radius:5px;background:#e6e6ea;margin-top:12px;overflow:hidden"><div style="width:48%;height:10px;background:${BLUE}"></div></div></div>
`)}
  <div style="padding:2px 28px 8px;font-size:14px;color:#6b6b70">Използване по приложения</div>
  ${card(`${orow(appIc("youtube", 38), "YouTube", "", "1,1 GB")}${orow(appIc("viber", 38), "Viber", "", "0,4 GB")}${orow(appIc("chrome", 38), "Chrome", "", "0,3 GB")}`)}
  ${card(`${orow("", "Предупреждение за данни", "При 4,5 GB", chev)}`)}
  ${tip("Тук виждате колко интернет сте изхарчили този месец", "left:50%;top:572px;transform:translateX(-50%);width:250px", { arrow: "u", at: "36%" })}`);

// ═══ КЛАВИАТУРА ═══
const typed = (t) => `<span>${t}</span><i style="display:inline-block;width:2px;height:22px;background:${BLUE};vertical-align:middle;margin-left:1px"></i>`;
const conv = [[false, "Здравей, бабо! Как си днес?"], [true, "Добре съм, мило. Ела на обяд."]];

S["kb-backspace"] = scr(chat("Георги (внук)", conv, typed("Здравейтее"), gboard({ hl: "back", sug: ["Здравейте", "Здравей", "Здравейтее"] })) +
  tip("Натиснете ⌫ — трие буква по буква", "right:6px;top:236px;width:300px", { arrow: "d", at: "92%" }), { bg: "#fff" });

S["kb-caps"] = scr(chat("Георги (внук)", conv, typed("БОБОВ ДОЛ"), gboard({ shift: "caps", hl: "shift", sug: ["БОБОВ", "ДОЛ", "БОБОВДОЛ"] })) +
  tip("Стрелката ⇧ — веднъж: една главна; два пъти: всички главни", "left:6px;top:236px;width:300px", { arrow: "d", at: "12%" }), { bg: "#fff" });

// Gboard → Корекция на текста
S["kb-autocorrect"] = scr(`${gbar("Корекция на текста")}
  <div style="padding:8px 22px 6px;font-size:14px;color:#0b57d0;font-weight:500">Корекции</div>
  ${grow("Блокиране на обидни думи", "Не предлага обидни думи", `<span class="tg on"><i></i></span>`)}
  ${grow("Автоматична корекция", "Автоматично поправя печатните грешки", `<span class="tg on"><i></i></span>`, true)}
  ${grow("Предложения за корекция", "Показва предложения, докато пишете", `<span class="tg on"><i></i></span>`)}
  <div style="padding:14px 22px 6px;font-size:14px;color:#0b57d0;font-weight:500">Писане</div>
  ${grow("Автоматично поставяне на главни букви", "Главна буква в началото на изречението", `<span class="tg on"><i></i></span>`)}
  ${grow("Двоен интервал за точка", "Две докосвания на интервала поставят „. “", `<span class="tg"><i></i></span>`)}
  ${tip("Включете или изключете „Автоматична корекция“. Ако сменя думи грешно — изключете", "left:50%;top:228px;transform:translateX(-50%);width:276px", { arrow: "u", at: "84%" })}`, { bg: "#fff" });

S["kb-bigger"] = scr(`${gbar("Предпочитания")}
  ${grow("Височина на клавиатурата", "Нормална", "")}${grow("Вибрация при натискане", "", `<span class="tg on"><i></i></span>`)}${grow("Звук при натискане", "", `<span class="tg"><i></i></span>`)}${grow("Едри букви на клавишите", "", `<span class="tg"><i></i></span>`)}
  <div style="position:absolute;inset:0;background:rgba(0,0,0,.42)"></div>
  <div style="position:absolute;left:28px;right:28px;top:118px;border-radius:28px;background:#ece6f0;padding:22px 8px 12px;color:#1d1b20">
    <div style="font-size:22px;padding:0 18px 12px">Височина на клавиатурата</div>
    ${["Много ниска", "Ниска", "Нормална", "По-висока", "Много висока"].map((t) => {
      const on = t === "По-висока";
      return `<div class="${on ? "ring" : ""}" style="display:flex;align-items:center;gap:16px;height:50px;padding:0 18px;font-size:16.5px;${on ? "border-radius:14px;margin:2px 4px" : ""}"><span style="width:20px;height:20px;border-radius:50%;border:2px solid ${on ? "#6750a4" : "#49454f"};display:flex;align-items:center;justify-content:center">${on ? `<i style="width:10px;height:10px;border-radius:50%;background:#6750a4"></i>` : ""}</span>${t}</div>`;
    }).join("")}
    <div style="text-align:right;padding:14px 16px 4px;font-size:15px;color:#6750a4;font-weight:500">Отказ</div></div>
  ${tip("Изберете „По-висока“ — буквите стават по-големи и удобни", "left:50%;top:" + (H - 250) + "px;transform:translateX(-50%);width:262px", { arrow: "u", at: "50%" })}`, { bg: "#fff" });

// Поправяне на текст: курсор на нужното място
S["kb-edit"] = (() => {
  const field = `<span>Ще дойда в 5</span><i style="display:inline-block;width:2px;height:22px;background:${BLUE};vertical-align:middle;margin-left:1px"></i><span style="position:relative"><span> часа</span></span>
    <span class="ring ringr" style="position:absolute;left:122px;top:30px;width:20px;height:24px;background:${BLUE};border-radius:0 50% 50% 50%;transform:rotate(45deg) scale(.7);transform-origin:top left"></span>`;
  return scr(chat("Георги (внук)", [[false, "Колко ще остане при нас?"], [true, "Ще дойда в 6 часа"]], field, gboard({ sug: ["часа", "часът", "часове"] })) +
    tip("Докоснете точно там, където искате да поправите — курсорът отива там", "left:50%;top:" + (H - 428) + "px;transform:translateX(-50%);width:262px", { arrow: "d", at: "42%" }), { bg: "#fff" });
})();

// Режим с една ръка (One UI): екранът се смалява към ъгъла
S["one-hand"] = (() => {
  const mini = `<div style="position:relative;width:390px;height:${H + 64}px;background:url('${wp("wp-sea-sunset.jpg")}') center/cover;border-radius:44px;overflow:hidden">
      ${U.homeIcons(U.HOME).replace(/top:(\d+)px/g, (m, t) => `top:${+t + 40}px`).replace(/<div style="position:absolute/g, '<div class="hs" style="position:absolute')}
      <div style="position:absolute;left:12px;right:12px;bottom:46px;height:84px;border-radius:30px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:space-around;padding:0 6px">${["phone", "messages", "chrome", "camera"].map((n) => appIcon(n, { size: 56, label: false })).join("")}</div></div>`;
  return scr(`<div style="position:absolute;inset:0;background:#0b0c10"></div>
    <div style="position:absolute;left:0;top:0;width:100%;height:100%"><div class="ring hs" style="position:absolute;right:0;bottom:0;width:390px;height:${H + 64}px;transform:scale(.72);transform-origin:bottom right;border-radius:44px">${mini}</div></div>
    <div style="position:absolute;left:14px;bottom:14px;display:flex;flex-direction:column;gap:12px">${["settings", "swap_horiz"].map((i) => `<span style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center">${ms(i, { size: 22, color: "#fff" })}</span>`).join("")}</div>
    ${tip("Режим „с една ръка“ — екранът се смалява към единия ъгъл, лесно за палеца", "left:14px;top:16px;width:230px")}`, { bg: "#0b0c10", sb: "#fff" });
})();

// Автоматична яркост — Дисплей
S["auto-brightness"] = scr(`${hdr("Дисплей")}
  ${card(`<div style="display:flex;gap:14px;padding:18px 20px 14px;justify-content:center">${[["Светъл", "#f4f4f6", "#111", 1], ["Тъмен", "#202228", "#fff", 0]].map(([t, b, f, a]) => `<div style="text-align:center;font-size:14px;color:#111"><div style="width:120px;height:104px;border-radius:16px;background:${b};border:${a ? `2px solid ${BLUE}` : "1px solid #ddd"};margin-bottom:8px;padding:12px;display:flex;flex-direction:column;gap:7px"><i style="height:9px;border-radius:5px;background:${f};opacity:.5;width:70%"></i><i style="height:9px;border-radius:5px;background:${f};opacity:.3"></i><i style="height:9px;border-radius:5px;background:${f};opacity:.3;width:50%"></i></div>${t}</div>`).join("")}</div>`)}
  ${card(`<div style="padding:16px 20px 10px"><div style="font-size:16.5px;color:#111;margin-bottom:18px">Яркост</div>
    <div style="display:flex;align-items:center;gap:14px">${ms("light_mode", { size: 20, color: "#8a8a90" })}<div style="flex:1">${slider(58)}</div>${ms("light_mode", { size: 26, fill: 1, color: "#8a8a90" })}</div></div>
    ${orow("", "Адаптивна яркост", "Екранът сам се нагласява според светлината", sw(true), true)}`)}
  ${tip("Включете „Адаптивна яркост“ — екранът сам потъмнява на тъмно и светва на светло", "left:50%;top:" + (H - 168) + "px;transform:translateX(-50%);width:276px", { arrow: "u", at: "84%" })}`);

render(S).catch((e) => { console.error(e); process.exit(1); });
