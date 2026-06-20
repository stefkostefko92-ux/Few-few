// Седма партида „мокъп" екрани: настройки и действия, за които още няма
// подходяща картинка — прехвърляне към телевизор, точка за достъп, резервно
// копие, абонаменти, скорошни приложения, роуминг, сила на известията.
// Стилизирани, обучителни. Стартиране (от zabobovdol/): node scripts/howto-mockups/gen-7.js
const { phone, I, av, tip, navTitle, setRow, toggle, render } = require("./_shell");

const S = {};
const settings = (title, rows, tipHtml = "") =>
  navTitle("#fff", "#111", title) + `<div class="grow" style="background:#fff">${rows}</div>` + tipHtml;

// Прехвърляне на екрана към телевизор (Cast)
S["screen-cast"] = navTitle("#fff", "#111", "Прехвърляне към екран") +
  `<div class="grow" style="background:#fff">${setRow("📺", "Телевизор (хол)", "намерен", true)}${setRow("📺", "Smart TV спалня", "")}<div style="padding:14px 18px;font-size:13px;color:#888">Телефонът и телевизорът трябва да са в една и съща Wi-Fi мрежа.</div></div>` +
  tip("Натиснете иконата „Прехвърли/Cast“ и изберете<br>телевизора — образът минава на големия екран", "right:10px;top:64px");

// Мобилна точка за достъп (hotspot)
S["hotspot"] = settings("Мобилна точка за достъп",
  `${setRow("📶", "Точка за достъп", toggle(true), true)}${setRow("🔑", "Парола", "12345678")}<div style="padding:14px 18px;font-size:13px;color:#888">Другото устройство се свързва към тази мрежа с паролата — както към обикновено Wi-Fi.</div>`,
  tip("Включете ключето → продиктувайте името и<br>паролата на другия, за да се свърже", "right:10px;top:64px"));

// Резервно копие (backup) в облака
S["phone-backup"] = settings("Резервно копие",
  `${setRow("☁️", "Резервно копие", "включено", true)}${setRow("🖼️", "Снимки и видео", toggle(true))}${setRow("👥", "Контакти", toggle(true))}<div style="padding:12px 18px;font-size:13px;color:#888">Последно копие: днес, 8:30. При нов или загубен телефон връщате всичко оттук.</div>`,
  tip("Включете резервното копие — снимките и<br>контактите се пазят в облака автоматично", "right:10px;top:64px"));

// Абонаменти в магазина за приложения
S["app-subscriptions"] = navTitle("#fff", "#111", "Абонаменти") +
  `<div class="grow" style="background:#fff">${setRow("🎬", "Филми+", `<span style="color:#ef4444;font-weight:700">Спри</span>`, true)}${setRow("🎵", "Музика", "4,99 лв/мес")}<div style="padding:14px 18px;font-size:13px;color:#888">Тук виждате всички платени абонаменти. Натиснете „Спри“, за да прекратите ненужен.</div></div>` +
  tip("В магазина → профил → „Абонаменти“.<br>Спрете тези, които не ползвате", "right:10px;top:64px");

// Скорошни приложения (затваряне на работещи отзад)
S["recent-apps"] = phone(
  `<div class="grow" style="background:#1f2630;padding:30px 16px;display:flex;flex-direction:column;gap:14px">${[["Viber", "#7e57c2"], ["Браузър", "#42a5f5"], ["Галерия", "#66bb6a"]].map(([n, c], i) => `<div class="${i === 0 ? "ring" : ""}" style="background:${c};border-radius:14px;height:118px;display:flex;align-items:flex-start;justify-content:space-between;padding:14px;color:#fff;font-weight:700;font-size:16px">${n}${i === 0 ? '<span style="font-size:20px">✕</span>' : ""}</div>`).join("")}</div>` +
  tip("Бутонът „скорошни“ ▢ показва отворените<br>приложения — плъзнете нагоре, за да ги затворите", "left:50%;top:60px;transform:translateX(-50%)"),
  "#1f2630", "#fff");

// Роуминг в чужбина
S["roaming"] = settings("Мобилни данни",
  `${setRow("🌍", "Роуминг в чужбина", toggle(false), true)}${setRow("📊", "Данни в роуминг", "изключени")}<div style="padding:14px 18px;font-size:13px;color:#888">Изключеният роуминг пази от високи сметки в чужбина. Включете го само при нужда.</div>`,
  tip("Преди пътуване проверете „Роуминг“ —<br>дръжте го изключен, освен ако не ви трябва", "right:10px;top:64px"));

// Сила на звука на известията
S["notif-volume"] = settings("Звук и известия",
  `<div style="padding:20px 18px">${[["🔔", "Известия", 80], ["📞", "Звънене", 95]].map(([e, n, v]) => `<div style="margin-bottom:22px"><div style="font-size:15px;color:#111;margin-bottom:10px">${e} ${n}</div><div style="height:10px;background:#e5e7eb;border-radius:5px;position:relative"><div style="position:absolute;left:0;top:0;bottom:0;width:${v}%;background:#1877f2;border-radius:5px"></div><div class="${n === "Известия" ? "ring ringr" : ""}" style="position:absolute;left:${v}%;top:50%;width:24px;height:24px;background:#1877f2;border-radius:50%;transform:translate(-50%,-50%);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div></div></div>`).join("")}</div>`,
  tip("Дръпнете плъзгача надясно, за да усилите<br>звука на известията и звъненето", "left:50%;top:150px;transform:translateX(-50%)"));

render(S).catch((e) => { console.error(e); process.exit(1); });
