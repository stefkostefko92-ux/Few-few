// Трета партида „мокъп" екрани: телефонни основи, настройки, клавиатура.
// Стилизирани пресъздавания (НЕ официални екрани). Стартиране (от zabobovdol/):
//   node scripts/howto-mockups/gen-3.js
const { phone, I, av, tip, navTitle, setRow, toggle, render } = require("./_shell");

const S = {};

// Бърз панел (горно меню), подчертава една плочка.
function qp(hl) {
  const tiles = [["Wi-Fi","📶"],["Данни","📱"],["Bluetooth","🔵"],["Фенерче","🔦"],["Самолетен","✈️"],["Завъртане","🔄"],["Звук","🔔"],["Яркост","☀️"],["Локация","📍"]];
  return phone(`
    <div style="background:linear-gradient(160deg,#1e293b,#0f172a);color:#fff;padding:16px 16px 24px;flex:0 0 auto">
      <div style="text-align:center;font-size:13px;opacity:.6;margin-bottom:14px">— плъзнете надолу от горния край —</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;text-align:center;font-size:12px">
        ${tiles.map(([l,e])=>`<div><div class="${l===hl?'ring ringr':''}" style="width:62px;height:62px;border-radius:50%;background:${l===hl?'#1877f2':'rgba(255,255,255,.14)'};display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 6px">${e}</div>${l}</div>`).join("")}
      </div>
    </div><div class="grow" style="background:#0f172a"></div>`, "#0f172a", "#fff");
}
function settings(title, rows) {
  return navTitle("#fff","#111",title) + `<div class="grow" style="background:#fff">${rows}</div>`;
}

// ═══ ТЕЛЕФОННИ ОСНОВИ ═══
S["power"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#334155,#0f172a);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px">
    <div style="position:absolute;right:0;top:150px;width:6px;height:70px;background:#94a3b8;border-radius:4px 0 0 4px"></div>
    <div class="ring ringr" style="width:130px;height:130px;border-radius:50%;border:3px solid rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;margin-bottom:24px"><div style="font-size:46px">⏻</div></div>
    <div style="font-size:17px">Плъзнете за изключване</div>
    <div style="width:200px;height:54px;background:rgba(255,255,255,.15);border-radius:27px;margin-top:14px;display:flex;align-items:center;padding:0 8px"><div style="width:38px;height:38px;border-radius:50%;background:#fff;color:#000;display:flex;align-items:center;justify-content:center">⏻</div><span style="flex:1;text-align:center;font-size:14px;opacity:.8">плъзни →</span></div>
  </div>
  ${tip("Задръжте бутона отстрани →<br>плъзнете, за да изключите","left:50%;bottom:120px;transform:translateX(-50%)")}
`, "#0f172a", "#fff");

S["lock-screen"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#1e3a5f,#0b1f3a);color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:80px">
    <div style="font-size:18px;opacity:.85;display:flex;align-items:center;gap:8px">${I.lock} заключено</div>
    <div style="font-size:72px;font-weight:200;margin-top:10px">9:41</div>
    <div style="font-size:16px;opacity:.8">петък, 20 юни</div>
    <div style="flex:1"></div>
    <div class="ring ringr" style="font-size:30px;margin-bottom:8px;padding:6px">⬆️</div>
    <div style="font-size:15px;opacity:.85;padding-bottom:50px">Плъзнете нагоре, за да отключите</div>
  </div>
  ${tip("Плъзнете пръст нагоре от долния край.<br>После въведете ПИН/пръст/лице","left:50%;bottom:120px;transform:translateX(-50%)")}
`, "#0b1f3a", "#fff");

S["ringer-volume"] = settings("Звук на звънене", `
  <div style="padding:24px 20px">
    <div style="display:flex;align-items:center;gap:14px"><span style="font-size:18px">🔕</span>
      <div style="flex:1;height:5px;background:#ddd;border-radius:3px;position:relative"><div style="position:absolute;width:65%;height:5px;background:#1877f2;border-radius:3px"></div><div class="ring ringr" style="position:absolute;left:61%;top:-11px;width:26px;height:26px;border-radius:50%;background:#1877f2;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div></div>
      <span style="font-size:22px">🔔</span></div>
    <div style="text-align:center;color:#888;font-size:13px;margin-top:14px">Така ще звъни при обаждане</div>
  </div>`) + tip("Плъзнете точката надясно —<br>звънът става по-силен","left:50%;bottom:130px;transform:translateX(-50%)");

S["brightness"] = qp("Яркост");
S["brightness"] = phone(`
  <div style="background:linear-gradient(160deg,#1e293b,#0f172a);color:#fff;padding:18px 16px 24px;flex:0 0 auto">
    <div style="text-align:center;font-size:13px;opacity:.6;margin-bottom:16px">— плъзнете надолу от горе —</div>
    <div style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.1);border-radius:16px;padding:14px">
      <span style="font-size:18px">🌙</span>
      <div class="ring" style="flex:1;height:34px;background:rgba(255,255,255,.25);border-radius:17px;position:relative;border-radius:17px"><div style="position:absolute;left:0;top:0;width:70%;height:34px;background:#fff;border-radius:17px"></div></div>
      <span style="font-size:22px">☀️</span></div>
  </div><div class="grow" style="background:#0f172a"></div>
  ${tip("Плъзнете лентата със слънце надясно,<br>за да светне екранът по-силно","left:50%;top:150px;transform:translateX(-50%)")}
`, "#0f172a", "#fff");

S["voice-search"] = phone(`
  ${navTitle("#fff","#111","Търсене")}
  <div class="grow" style="background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px">
    <div style="background:#f0f2f5;border-radius:28px;padding:12px 18px;display:flex;align-items:center;gap:12px;width:100%;font-size:16px;color:#888">${I.search}<span style="flex:1">Кажете какво търсите…</span><span class="ring ringr" style="color:#1877f2;padding:3px">${I.mic}</span></div>
    <div style="margin-top:30px"><div class="ring ringr" style="width:84px;height:84px;border-radius:50%;background:#1877f2;color:#fff;display:flex;align-items:center;justify-content:center">${I.mic}</div></div>
    <div style="margin-top:16px;color:#888;font-size:15px">Слушам… говорете сега</div>
  </div>
  ${tip("Натиснете микрофона и кажете на глас<br>какво търсите — не пишете","left:50%;top:120px;transform:translateX(-50%)")}
`);

S["flashlight"] = qp("Фенерче");
S["flashlight"] = phone(`
  <div style="background:linear-gradient(160deg,#1e293b,#0f172a);color:#fff;padding:16px 16px 24px;flex:0 0 auto">
    <div style="text-align:center;font-size:13px;opacity:.6;margin-bottom:14px">— плъзнете надолу от горе —</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;text-align:center;font-size:12px">
      ${[["Wi-Fi","📶",0],["Данни","📱",0],["Bluetooth","🔵",0],["Фенерче","🔦",1],["Самолетен","✈️",0],["Звук","🔔",0]].map(([l,e,h])=>`<div><div class="${h?'ring ringr':''}" style="width:62px;height:62px;border-radius:50%;background:${h?'#f5c518':'rgba(255,255,255,.14)'};display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 6px;color:${h?'#000':'#fff'}">${e}</div>${l}</div>`).join("")}
    </div></div><div class="grow" style="background:#0f172a"></div>
  ${tip("Плъзнете от горе → натиснете „Фенерче“<br>(светва за тъмно)","left:50%;top:150px;transform:translateX(-50%)")}
`, "#0f172a", "#fff");

S["battery"] = phone(`
  <div class="grow" style="background:#fff;padding:0">
    ${navTitle("#fff","#111","Батерия")}
    <div style="padding:24px;text-align:center;border-bottom:8px solid #eef0f2">
      <div style="font-size:46px;font-weight:200;color:#34a853">78%</div>
      <div style="font-size:14px;color:#888">⚡ зарежда се • остават ~40 мин</div>
    </div>
    ${setRow("🔋","Пестене на батерията", toggle(true), true)}
    ${setRow("📊","Употреба по приложения","›")}
  </div>
  ${tip("Включете „Пестене на батерията“,<br>за да издържи по-дълго","right:10px;top:300px")}
`);

// ═══ НАСТРОЙКИ ═══
S["airplane"] = qp("Самолетен");
S["mobile-data"] = qp("Данни");
S["auto-rotate"] = qp("Завъртане");

S["bluetooth"] = settings("Bluetooth", `
  <div style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:8px solid #eef0f2"><span style="font-size:16px;color:#111">Bluetooth</span>${toggle(true)}</div>
  <div style="padding:12px 16px;font-size:13px;color:#888">Налични устройства:</div>
  ${setRow("🎧","Слушалки JBL","свържи", true)}
  ${setRow("🔊","Колона Sony","свържи")}`) + tip("Включете Bluetooth → натиснете<br>устройството, за да се свърже","right:10px;top:64px");

S["move-icon"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#3b82f6,#1e3a8a);padding:24px 18px">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:20px;text-align:center;color:#fff;font-size:12px">
      ${[["📞","Тел."],["💬","Съобщ."],["📷","Камера"],["⚙️","Настр."],["🌐","Интернет"],["📧","Имейл"],["📅","Календар"],["🖼️","Снимки"]].map(([e,l])=>`<div><div style="width:54px;height:54px;border-radius:14px;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;font-size:26px;margin:0 auto 5px">${e}</div>${l}</div>`).join("")}
    </div>
    <div class="ring ringr" style="position:absolute;left:130px;top:300px;width:54px;height:54px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 12px 24px rgba(0,0,0,.4);transform:scale(1.1)">📞</div>
  </div>
  ${tip("Задръжте пръст върху иконата →<br>без да пускате, я плъзнете другаде","left:50%;bottom:160px;transform:translateX(-50%)")}
`, "#1e3a8a", "#fff");

S["app-folder"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#3b82f6,#1e3a8a);display:flex;align-items:center;justify-content:center">
    <div class="ring" style="background:rgba(255,255,255,.25);border-radius:24px;padding:18px;border-radius:24px">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:200px">${["📷","🖼️","🎬","📺","🎵","📻"].map(e=>`<div style="width:50px;height:50px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:24px">${e}</div>`).join("")}</div>
      <div style="text-align:center;color:#fff;margin-top:12px;font-size:15px">Забавление</div>
    </div>
  </div>
  ${tip("Плъзнете една икона върху друга —<br>прави се папка. Дайте ѝ име","left:50%;bottom:120px;transform:translateX(-50%)")}
`, "#1e3a8a", "#fff");

S["uninstall"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#3b82f6,#1e3a8a);padding:20px;position:relative">
    <div style="position:relative;width:60px;margin:60px auto 0">
      <div style="width:60px;height:60px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:30px">🎮</div>
      <div style="position:absolute;-top:6px;top:-8px;right:-8px;width:24px;height:24px;border-radius:50%;background:#fff;color:#333;display:flex;align-items:center;justify-content:center">✕</div>
    </div>
    <div style="background:#fff;border-radius:14px;margin:30px auto 0;width:240px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.3)">
      <div style="padding:12px 16px;font-size:15px;color:#111;border-bottom:1px solid #f0f0f0">ℹ️ Информация</div>
      <div class="ring" style="padding:12px 16px;font-size:15px;color:#ef4444;font-weight:700;border-radius:8px">🗑️ Деинсталирай</div>
    </div>
  </div>
  ${tip("Задръжте иконата → изберете<br>„Деинсталирай“","left:50%;bottom:130px;transform:translateX(-50%)")}
`, "#1e3a8a", "#fff");

S["update-app"] = phone(`
  ${navTitle("#fff","#111","Google Play")}
  <div class="grow" style="background:#fff">
    <div style="padding:16px;display:flex;align-items:center;gap:14px;border-bottom:1px solid #f0f0f0">
      ${av("V","#7360f2",50)}<div style="flex:1"><div style="font-weight:700;font-size:16px;color:#111">Viber</div><div style="font-size:13px;color:#888">налично е обновление</div></div>
      <div class="ring" style="background:#34a853;color:#fff;padding:8px 18px;border-radius:20px;font-weight:700;font-size:14px;border-radius:20px">Обнови</div></div>
    <div style="padding:16px;display:flex;align-items:center;gap:14px"><div style="width:50px;height:50px;border-radius:12px;background:#1877f2;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px">f</div><div style="flex:1"><div style="font-weight:700;font-size:16px;color:#111">Facebook</div><div style="font-size:13px;color:#34a853">обновено ✓</div></div></div>
  </div>
  ${tip("В „Google Play“ натиснете „Обнови“<br>до приложението","right:10px;top:110px")}
`);

S["find-app"] = phone(`
  <div style="background:#1e3a8a;padding:14px 16px"><div class="ring" style="background:rgba(255,255,255,.95);border-radius:24px;padding:11px 16px;font-size:16px;color:#111;display:flex;align-items:center;gap:10px;border-radius:24px">${I.search} аптека</div></div>
  <div class="grow" style="background:linear-gradient(160deg,#3b82f6,#1e3a8a);padding:24px;text-align:center">
    <div style="display:inline-block;background:rgba(255,255,255,.92);border-radius:16px;padding:16px"><div style="font-size:34px">💊</div><div style="font-size:12px;color:#333;margin-top:6px">Дежурна аптека</div></div>
  </div>
  ${tip("Плъзнете нагоре за списъка → горе има<br>лента „Търсене“ → напишете името","left:50%;top:70px;transform:translateX(-50%)")}
`, "#1e3a8a", "#fff");

S["wallpaper"] = settings("Тапет (фон)", `
  <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
    ${[["linear-gradient(135deg,#fbbf24,#f59e0b)",1],["linear-gradient(135deg,#60a5fa,#2563eb)",0],["linear-gradient(135deg,#34d399,#059669)",0],["linear-gradient(135deg,#f472b6,#db2777)",0]].map(([g,h])=>`<div class="${h?'ring':''}" style="height:150px;border-radius:14px;background:${g};${h?'':''}"></div>`).join("")}
  </div>
  <div style="text-align:center;padding:6px"><div class="ring" style="display:inline-block;background:#1877f2;color:#fff;padding:12px 30px;border-radius:24px;font-weight:700;border-radius:24px">Задай като фон</div></div>`) + tip("Изберете картинка → „Задай като фон“","left:50%;bottom:120px;transform:translateX(-50%)");

S["date-time"] = settings("Дата и час", `
  ${setRow("🕐","Автоматично (по мрежата)", toggle(true), true)}
  ${setRow("📅","Дата","20 юни 2026")}
  ${setRow("⏰","Час","9:41")}
  ${setRow("🌍","Часова зона","София")}`) + tip("Оставете „Автоматично“ включено —<br>часът се сверява сам","right:10px;top:64px");

S["phone-language"] = settings("Език", `
  ${["Български|1","English|0","Türkçe|0","Русский|0"].map(r=>{const[l,h]=r.split("|");return `<div class="${h==='1'?'ring':''}" style="display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid #f3f3f3;${h==='1'?'border-radius:10px;margin:4px 8px;':''}"><span style="font-size:16px;color:#111">${l}</span>${h==='1'?'<span style="color:#1877f2;font-size:18px">✓</span>':''}</div>`}).join("")}`) + tip("Натиснете „Български“,<br>за да е телефонът на роден език","right:10px;top:64px");

S["fingerprint"] = phone(`
  ${navTitle("#fff","#111","Пръстов отпечатък")}
  <div class="grow" style="background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px">
    <div class="ring ringr" style="width:120px;height:120px;border-radius:50%;background:#eef2ff;display:flex;align-items:center;justify-content:center;font-size:60px">👆</div>
    <div style="font-size:17px;font-weight:700;color:#111;margin-top:20px">Допрете пръст до сензора</div>
    <div style="font-size:14px;color:#888;margin-top:6px;text-align:center">Повдигайте и допирайте няколко пъти,<br>докато се запише</div>
  </div>
  ${tip("Допирайте пръста няколко пъти —<br>после телефонът се отключва с него","left:50%;bottom:110px;transform:translateX(-50%)")}
`);

S["face-unlock"] = phone(`
  ${navTitle("#fff","#111","Отключване с лице")}
  <div class="grow" style="background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px">
    <div class="ring ringr" style="width:150px;height:150px;border-radius:50%;border:4px dashed #1877f2;display:flex;align-items:center;justify-content:center;font-size:64px">🙂</div>
    <div style="font-size:17px;font-weight:700;color:#111;margin-top:20px">Гледайте в камерата</div>
    <div style="font-size:14px;color:#888;margin-top:6px;text-align:center">Завъртете леко глава в кръг</div>
  </div>
  ${tip("Дръжте лицето в кръга —<br>после телефонът Ви познава","left:50%;bottom:110px;transform:translateX(-50%)")}
`);

S["change-pin"] = phone(`
  ${navTitle("#fff","#111","Нов ПИН код")}
  <div class="grow" style="background:#fff;display:flex;flex-direction:column;align-items:center;padding-top:30px">
    <div style="font-size:16px;color:#111;margin-bottom:14px">Въведете нов код (4–6 цифри)</div>
    <div style="font-size:26px;letter-spacing:10px;margin-bottom:24px">● ● ● ●</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">${[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map(n=>`<div style="width:64px;height:52px;background:#f0f2f5;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600;color:#111">${n}</div>`).join("")}</div>
  </div>
  ${tip("Изберете нов код, който помните.<br>Не го казвайте на никого","left:50%;bottom:60px;transform:translateX(-50%)")}
`);

S["app-notifications"] = settings("Известия", `
  ${setRow("📘","Facebook", toggle(true))}
  ${setRow("🟣","Viber", toggle(true))}
  ${setRow("🛍️","Реклами от магазин", toggle(false), true)}
  ${setRow("🎮","Игри", toggle(false))}`) + tip("Дръпнете ключето вляво (сиво),<br>за да спрете досадните известия","right:10px;top:200px");

S["vibration"] = settings("Вибрация", `
  ${setRow("📳","Вибрация при звънене", toggle(true), true)}
  ${setRow("⌨️","Вибрация при писане", toggle(false))}`) + tip("Ключето вдясно (зелено) = включено","right:10px;top:64px");

S["block-number"] = phone(`
  ${navTitle("#fff","#111","Непознат номер")}
  <div style="background:#fff;padding:22px;text-align:center;border-bottom:8px solid #eef0f2">${av("?","#bdbdbd",70)}<div style="font-size:18px;font-weight:700;color:#111;margin-top:10px">+359 87 000 0000</div></div>
  <div class="grow" style="background:#fff">
    ${setRow("💬","Съобщение","")}
    ${setRow("ℹ️","Информация","")}
    ${setRow("🚫","Блокирай номера","", true)}
  </div>
  ${tip("Отворете обаждането → „Блокирай“ —<br>този номер няма да Ви безпокои","left:50%;bottom:130px;transform:translateX(-50%)")}
`);

S["force-restart"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#475569,#0f172a);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center">
    <div style="font-size:17px;font-weight:700;margin-bottom:24px">Ако телефонът „виси“ и не реагира:</div>
    <div style="display:flex;align-items:center;gap:30px">
      <div style="text-align:center"><div class="ring" style="width:14px;height:54px;background:#fff;border-radius:6px"></div><div style="font-size:12px;margin-top:8px;opacity:.8">Звук +</div></div>
      <div style="font-size:24px">+</div>
      <div style="text-align:center"><div class="ring" style="width:14px;height:54px;background:#fff;border-radius:6px"></div><div style="font-size:12px;margin-top:8px;opacity:.8">Включване</div></div>
    </div>
    <div style="margin-top:24px;font-size:14px;opacity:.85">Задръжте ~10 секунди, докато се рестартира</div>
  </div>
  ${tip("Задръжте двата бутона заедно<br>около 10 секунди","left:50%;bottom:90px;transform:translateX(-50%)")}
`, "#0f172a", "#fff");

S["call-volume"] = phone(`
  <div class="grow" style="background:linear-gradient(160deg,#16324f,#0b1f3a);color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:60px">
    ${av("Г","#5b6b8c",90)}
    <div style="font-size:24px;font-weight:700;margin-top:16px">Георги (внук)</div>
    <div style="font-size:15px;opacity:.7;margin-top:4px">02:14 • разговор</div>
    <div style="margin-top:30px;background:rgba(255,255,255,.12);border-radius:20px;padding:14px 18px;display:flex;align-items:center;gap:12px">🔉<div class="ring" style="width:130px;height:8px;background:rgba(255,255,255,.3);border-radius:4px;border-radius:4px"><div style="width:75%;height:8px;background:#fff;border-radius:4px"></div></div>🔊</div>
  </div>
  ${tip("По време на разговора натискайте<br>бутона „Звук +“ отстрани","left:50%;bottom:120px;transform:translateX(-50%)")}
`, "#0b1f3a", "#fff");

S["data-usage"] = settings("Употреба на данни", `
  <div style="padding:20px;text-align:center;border-bottom:8px solid #eef0f2">
    <div style="font-size:34px;font-weight:300;color:#111">2,4 GB</div>
    <div style="font-size:13px;color:#888">от 5 GB този месец</div>
    <div style="height:10px;background:#eee;border-radius:5px;margin-top:14px;overflow:hidden"><div style="width:48%;height:10px;background:#1877f2"></div></div>
  </div>
  ${setRow("📺","YouTube","1,1 GB")}
  ${setRow("🟣","Viber","0,4 GB")}
  ${setRow("🌐","Браузър","0,3 GB")}`) + tip("Тук виждате колко интернет сте<br>изхарчили този месец","left:50%;top:130px;transform:translateX(-50%)");

// ═══ КЛАВИАТУРА ═══
const keyboard = (hl = "") => `<div style="background:#d1d5db;padding:8px 5px 10px">
  ${["й ц у к е н г ш щ з","ф ы в а п р о л д ж","я ч с м и т ь б ю"].map((row,ri)=>`<div style="display:flex;justify-content:center;gap:5px;margin-bottom:7px">${ri===2?`<div class="${hl==='shift'?'ring':''}" style="width:34px;height:40px;background:${hl==='shift'?'#1877f2':'#9aa3af'};color:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px">⇧</div>`:''}${row.split(" ").map(k=>`<div style="flex:1;max-width:32px;height:40px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 1px 0 rgba(0,0,0,.2)">${hl==='shift'?k.toUpperCase():k}</div>`).join("")}${ri===2?`<div class="${hl==='back'?'ring':''}" style="width:34px;height:40px;background:${hl==='back'?'#1877f2':'#9aa3af'};color:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center">⌫</div>`:''}</div>`).join("")}
  <div style="display:flex;gap:5px;justify-content:center"><div style="width:42px;height:40px;background:#9aa3af;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff">?123</div><div style="width:42px;height:40px;background:#9aa3af;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff">🌐</div><div style="flex:1;height:40px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#888">интервал</div><div style="width:42px;height:40px;background:#9aa3af;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff">🎤</div></div></div>`;

S["kb-backspace"] = phone(`
  ${navTitle("#fff","#111","Съобщение")}
  <div class="grow" style="background:#fff;padding:18px"><div style="border:1px solid #ddd;border-radius:10px;padding:14px;color:#111;font-size:16px">Здравейтее|</div></div>
  ${keyboard("back")}
  ${tip("Натиснете ⌫ (стрелка с хиксче),<br>за да триете буква по буква","right:10px;bottom:64px")}
`);

S["kb-caps"] = phone(`
  ${navTitle("#fff","#111","Съобщение")}
  <div class="grow" style="background:#fff;padding:18px"><div style="border:1px solid #ddd;border-radius:10px;padding:14px;color:#111;font-size:16px">БОБОВ|</div></div>
  ${keyboard("shift")}
  ${tip("Натиснете стрелката ⇧ — буквите<br>стават ГЛАВНИ","left:30px;bottom:120px")}
`);

S["kb-autocorrect"] = settings("Клавиатура", `
  ${setRow("✓","Автоматична корекция", toggle(true), true)}
  ${setRow("🔤","Главна буква в началото", toggle(true))}
  ${setRow("💡","Предложения за думи", toggle(true))}`) + tip("Ключето вкл./изкл. поправянето<br>на думи, докато пишете","right:10px;top:64px");

S["kb-bigger"] = settings("Височина на клавиатурата", `
  <div style="padding:24px 20px">
    <div style="display:flex;align-items:center;gap:14px"><span style="font-size:14px;color:#888">малка</span>
      <div style="flex:1;height:5px;background:#ddd;border-radius:3px;position:relative"><div style="position:absolute;width:80%;height:5px;background:#1877f2;border-radius:3px"></div><div class="ring ringr" style="position:absolute;left:76%;top:-11px;width:26px;height:26px;border-radius:50%;background:#1877f2;border:3px solid #fff"></div></div>
      <span style="font-size:18px;color:#888">голяма</span></div>
  </div>
  <div style="background:#d1d5db;padding:14px 6px"><div style="display:flex;justify-content:center;gap:6px">${"абвгде".split("").map(k=>`<div style="width:44px;height:54px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 1px 0 rgba(0,0,0,.2)">${k}</div>`).join("")}</div></div>`) + tip("Плъзнете надясно — клавишите<br>стават по-едри и лесни за уцелване","left:50%;top:130px;transform:translateX(-50%)");

S["kb-edit"] = phone(`
  ${navTitle("#fff","#111","Съобщение")}
  <div class="grow" style="background:#fff;padding:18px"><div style="border:1px solid #ddd;border-radius:10px;padding:14px;color:#111;font-size:16px">Идвам в <span class="ring" style="background:#bcd8ff;border-radius:3px;padding:0 1px">15|</span> часа</div></div>
  ${keyboard()}
  ${tip("Натиснете точно там, където искате<br>да поправите — курсорът отива там","left:50%;top:130px;transform:translateX(-50%)")}
`);

S["one-hand"] = phone(`
  ${navTitle("#fff","#111","Една ръка")}
  <div class="grow" style="background:#f0f2f5;display:flex;align-items:flex-end;justify-content:flex-end;padding:0">
    <div class="ring" style="width:78%;background:#fff;border-radius:18px 0 0 0;box-shadow:-4px -4px 14px rgba(0,0,0,.1);padding:14px;border-radius:18px 0 0 0">
      <div style="background:#d1d5db;border-radius:10px;padding:8px"><div style="display:flex;gap:4px;justify-content:center">${"йцукен".split("").map(k=>`<div style="width:30px;height:34px;background:#fff;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:14px">${k}</div>`).join("")}</div></div>
    </div>
  </div>
  ${tip("Включете режим „с една ръка“ —<br>клавиатурата се мести към единия край","left:30px;top:130px")}
`);

S["auto-brightness"] = settings("Яркост", `
  <div style="padding:20px 20px 6px"><div style="display:flex;align-items:center;gap:14px"><span style="font-size:16px">🌙</span><div style="flex:1;height:5px;background:#ddd;border-radius:3px;position:relative"><div style="position:absolute;width:60%;height:5px;background:#1877f2;border-radius:3px"></div><div style="position:absolute;left:56%;top:-11px;width:26px;height:26px;border-radius:50%;background:#1877f2;border:3px solid #fff"></div></div><span style="font-size:20px">☀️</span></div></div>
  ${setRow("🔆","Автоматична яркост", toggle(true), true)}
  <div style="padding:12px 18px;font-size:13px;color:#888">Екранът сам се нагажда — светъл навън, по-мек на тъмно. Пести очите и батерията.</div>`) + tip("Включете „Автоматична яркост“ —<br>телефонът сам нагласява екрана","right:10px;top:200px");

render(S).catch((e) => { console.error(e); process.exit(1); });
