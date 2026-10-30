// Пета партида „мокъп“ екрани: ИЗМАМИ (реалистични екрани на телефон — SMS, входящо обаждане,
// Chrome, Facebook, WhatsApp, Messenger, Play Маркет — с червени бележки) и ЕВРОТО
// (официални образци на банкнотите/монетите на ЕЦБ върху неутрална сцена, ценови етикет,
// касова бележка, банкомат, курс). Всички имена, номера и адреси са измислени.
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-5.js   (ONLY=име1,име2 — само избрани)
const { phone, scene, ms, tip, appIcon, banknote, coin, render } = require("./_shell");

const S = {};
const MONO = "'Liberation Mono','DejaVu Sans Mono','Courier New',monospace";

// ───────────────────────── Общи градивни елементи ─────────────────────────
const circ = (size, bg, inner, extra = "") =>
  `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;flex-shrink:0;${extra}">${inner}</div>`;
const person = (size = 40, bg = "#dde3ea", fg = "#5f6368") => circ(size, bg, ms("person", { size: size * 0.62, fill: 1, color: fg }));

// Google Messages (Android): разговор с непознат подател.
function gmsg({ sender, bubbles, tipHtml, tipCss, tipArrow }) {
  const bub = bubbles.map((b, i) => `
    <div style="align-self:flex-start;max-width:84%">
      <div ${b.ring ? 'class="ring"' : ""} style="background:#e8edf5;color:#1f1f1f;padding:11px 16px;border-radius:${i === 0 ? "20px 20px 20px 6px" : "6px 20px 20px 6px"};font-size:16px;line-height:1.4;${b.ring ? "border-radius:20px;" : ""}">${b.html}</div>
      ${b.time ? `<div style="font-size:11.5px;color:#5f6368;margin:5px 0 0 6px">${b.time}</div>` : ""}
    </div>`).join("");
  return phone(`
    <div style="display:flex;align-items:center;gap:8px;padding:4px 14px 6px 8px;height:64px">
      <span style="padding:8px;display:flex">${ms("arrow_back", { size: 24 })}</span>
      ${person(40)}
      <div style="flex:1;font-size:18px;font-weight:500;color:#1f1f1f;letter-spacing:0">${sender}</div>
      ${ms("call", { size: 24 })}<span style="width:6px"></span>${ms("more_vert", { size: 24 })}
    </div>
    <div class="grow" style="padding:16px 14px;display:flex;flex-direction:column;gap:3px">
      <div style="align-self:center;font-size:12px;color:#5f6368;margin-bottom:10px">Днес · 11:32</div>
      ${bub}
    </div>
    <div style="padding:6px 12px 10px;display:flex;align-items:center;gap:10px">
      ${circ(44, "#e8edf5", ms("add", { size: 26, color: "#444746" }))}
      <div style="flex:1;height:44px;border-radius:22px;background:#e8edf5;display:flex;align-items:center;padding:0 16px;font-size:16px;color:#5f6368">Текстово съобщение<span style="flex:1"></span>${ms("mic", { size: 22, color: "#444746", fill: 1 })}</div>
    </div>
    ${tip(tipHtml, tipCss, tipArrow)}
  `, "#fff");
}
const link = (t) => `<span style="color:#0b57d0;text-decoration:underline;word-break:break-all">${t}</span>`;

// Входящо повикване (Samsung/One UI стил): тъмен екран, червено „Отхвърляне“, зелено „Отговор“.
function incoming({ number, place, tipTop, tipBottom }) {
  return phone(`
    <div class="grow" style="color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:60px">
      <div style="font-size:15px;opacity:.75;margin-bottom:22px">Входящо повикване</div>
      ${circ(104, "rgba(255,255,255,.14)", ms("person", { size: 66, fill: 1, color: "rgba(255,255,255,.75)" }))}
      <div style="font-size:31px;font-weight:400;margin-top:22px;letter-spacing:.3px">${number}</div>
      <div style="font-size:16px;opacity:.7;margin-top:6px">${place}</div>
      <div style="flex:1"></div>
      <div style="display:flex;gap:96px;padding-bottom:70px">
        <div style="text-align:center">${circ(74, "#ea3d33", ms("call_end", { size: 36, fill: 1, color: "#fff" }), "box-shadow:0 0 0 3px #d32f2f,0 0 0 5px rgba(255,255,255,.92)")}<div style="margin-top:12px;font-size:14px;opacity:.9">Отхвърляне</div></div>
        <div style="text-align:center">${circ(74, "#2fb454", ms("call", { size: 36, fill: 1, color: "#fff" }))}<div style="margin-top:12px;font-size:14px;opacity:.9">Отговор</div></div>
      </div>
    </div>
    ${tip(tipTop, "left:50%;top:40px;transform:translateX(-50%);width:300px")}
    ${tip(tipBottom, "left:50%;bottom:190px;transform:translateX(-50%);width:310px", { arrow: "d", at: "27%" })}
  `, "radial-gradient(120% 70% at 50% 0%,#2a3140 0%,#14171d 62%,#0c0e12 100%)", "#fff");
}

// Chrome (Android): горна лента с адрес. o: {secure, url}
function chromeBar(url, secure, ring) {
  const ico = secure ? ms("tune", { size: 20, color: "#444746" }) : ms("warning", { size: 20, fill: 1, color: "#b3261e" });
  const label = secure ? "" : `<span style="color:#b3261e;font-size:14px;font-weight:500">Не е защитено</span><span style="width:1px;height:16px;background:#c4c7c5"></span>`;
  return `<div style="display:flex;align-items:center;gap:10px;padding:6px 10px 8px 14px;background:#fff">
    <div ${ring ? 'class="ring"' : ""} style="flex:1;height:44px;border-radius:22px;background:#eef1f6;display:flex;align-items:center;gap:8px;padding:0 14px;font-size:15.5px;color:#1f1f1f;overflow:hidden;white-space:nowrap">${ico}${label}<span>${url}</span></div>
    <div style="width:26px;height:26px;border:2px solid #444746;border-radius:7px;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;color:#444746">3</div>
    ${ms("more_vert", { size: 24, color: "#444746" })}
  </div><div style="height:1px;background:#e1e3e6"></div>`;
}

// ═══════════ ИЗМАМИ ═══════════
S["scam-parcel-sms"] = gmsg({
  sender: "+44 7700 900482",
  bubbles: [{ ring: true, time: "11:32", html: `Вашата пратка BG48210937 е задържана на склад. Доплатете такса за доставка <b>1,49 €</b> до 24 часа, иначе ще бъде върната:<br>${link("https://bgposhta-dostavka.xyz/pay")}` }],
  tipHtml: "Истинският куриер НЕ иска плащане по линк.<br>Не натискайте — изтрийте съобщението",
  tipCss: "left:50%;top:318px;transform:translateX(-50%)", tipArrow: { arrow: "u", at: "30%" },
});

S["scam-fake-sms"] = gmsg({
  sender: "BankaInfo",
  bubbles: [{ ring: true, time: "11:32", html: `<b>Банка Пример:</b> Сметката Ви е блокирана! Влезте веднага, за да я отключите:<br>${link("http://smetka-otkluchvane.top/vhod")}` }],
  tipHtml: "Банка не праща такива SMS с линк.<br>Не въвеждайте данни — обадете се на банката",
  tipCss: "left:50%;top:318px;transform:translateX(-50%)", tipArrow: { arrow: "u", at: "30%" },
});

S["scam-otp"] = gmsg({
  sender: "BankaPrimer",
  bubbles: [{ ring: true, time: "11:32", html: `Банка Пример: Код за потвърждение <b>482913</b> за плащане 349,00 € към ONLINE-SHOP. Не казвайте кода на никого — дори на банков служител.` }],
  tipHtml: "Кодът (OTP) е като ключ за дома ви.<br>Ако някой по телефона поиска този код —<br>затворете. Кодът отваря сметката ви",
  tipCss: "left:50%;top:318px;transform:translateX(-50%)", tipArrow: { arrow: "u", at: "30%" },
});

S["scam-bank-call"] = incoming({
  number: "+359 887 123 456", place: "България",
  tipTop: "Казва: „Обаждам се от отдел Сигурност на банката“ и иска кодове",
  tipBottom: "Затворете. Звъннете на банката на номера от гърба на картата — не на този",
});

S["scam-police-call"] = incoming({
  number: "+359 899 123 456", place: "България",
  tipTop: "Представя се за „полицай/прокурор“ и иска пари",
  tipBottom: "Няма такава процедура по телефона. Затворете и звъннете на 112",
});

// WhatsApp (Android): непознат номер, „внук в беда“.
S["scam-grandchild"] = phone(`
  <div style="display:flex;align-items:center;gap:6px;padding:4px 14px 8px 8px;height:62px;background:#fff">
    <span style="padding:8px;display:flex">${ms("arrow_back", { size: 24 })}</span>
    ${person(40, "#dfe5e7", "#8696a0")}
    <div style="flex:1;margin-left:4px"><div style="font-size:18px;font-weight:500;color:#111b21">+359 899 123 456</div></div>
    ${ms("videocam", { size: 26, fill: 1 })}<span style="width:12px"></span>${ms("call", { size: 24, fill: 1 })}<span style="width:8px"></span>${ms("more_vert", { size: 24 })}
  </div>
  <div class="grow" style="background:#efeae2;padding:12px 12px;display:flex;flex-direction:column;gap:5px">
    <div style="align-self:center;background:#fff;border-radius:8px;padding:4px 12px;font-size:12.5px;color:#54656f;box-shadow:0 1px .5px rgba(11,20,26,.13);margin-bottom:6px">Днес</div>
    ${[["Бабо, аз съм, внукът ти!", "10:12"], ["Смених си номера, телефонът ми се счупи.", "10:12"]].map(([t, h]) => `<div style="align-self:flex-start;max-width:80%;background:#fff;border-radius:8px 8px 8px 0;padding:7px 9px 5px 10px;font-size:16px;color:#111b21;line-height:1.35;box-shadow:0 1px .5px rgba(11,20,26,.13)">${t} <span style="font-size:11px;color:#667781;float:right;margin:6px 0 0 10px">${h}</span></div>`).join("")}
    <div class="ring" style="align-self:flex-start;max-width:84%;background:#fff;border-radius:8px;padding:7px 9px 5px 10px;font-size:16px;color:#111b21;line-height:1.35;box-shadow:0 1px .5px rgba(11,20,26,.13)">Катастрофирах и спешно ми трябват <b style="font-weight:600">1 000 евро</b>. Ще дойде мой приятел да ги вземе. Не казвай на никого! <span style="font-size:11px;color:#667781;float:right;margin:6px 0 0 10px">10:13</span></div>
    <div style="flex:1"></div>
    <div style="background:#fff;border-radius:10px;padding:12px 14px;box-shadow:0 1px 2px rgba(11,20,26,.18);font-size:14px;color:#3b4a54;line-height:1.4">Този номер не е във вашите контакти.
      <div style="display:flex;gap:10px;margin-top:10px;font-size:15px;font-weight:500;color:#0b6e5b"><span style="flex:1;text-align:center;border:1px solid #d1d7db;border-radius:20px;padding:8px 0">Блокиране</span><span style="flex:1;text-align:center;border:1px solid #d1d7db;border-radius:20px;padding:8px 0">Добавяне</span></div></div>
  </div>
  <div style="background:#efeae2;padding:6px 8px 10px;display:flex;align-items:center;gap:8px">
    <div style="flex:1;height:46px;border-radius:23px;background:#fff;display:flex;align-items:center;gap:10px;padding:0 14px;font-size:16px;color:#667781">${ms("mood", { size: 24, color: "#667781" })}Съобщение<span style="flex:1"></span>${ms("attach_file", { size: 22, color: "#667781" })}${ms("photo_camera", { size: 22, color: "#667781", fill: 1 })}</div>
    ${circ(46, "#00a884", ms("mic", { size: 24, fill: 1, color: "#fff" }))}
  </div>
  ${tip("Затворете и звъннете на внука/близките<br>на СТАРИЯ им номер. Това е измама", "left:50%;top:330px;transform:translateX(-50%)", { arrow: "u", at: "40%" })}
`, "#fff");

// Фишинг страница в Chrome.
S["scam-phishing-bank"] = phone(`
  ${chromeBar("bnb-update.top", false, true)}
  <div class="grow" style="background:#fff">
    <div style="background:#0a3d6b;color:#fff;padding:14px 18px;display:flex;align-items:center;gap:10px;font-size:20px;font-weight:700">${ms("account_balance", { size: 26, fill: 1 })}Банка Пример</div>
    <div style="padding:22px 22px">
      <div style="font-size:22px;font-weight:700;color:#0a3d6b;margin-bottom:4px">Вашата сметка е блокирана</div>
      <div style="font-size:14px;color:#555;line-height:1.4;margin-bottom:18px">Потвърдете данните от картата си, за да я отключите.</div>
      ${["Номер на карта", "Валидна до (ММ/ГГ)", "CVV код", "ПИН код"].map((p) => `<div style="border:1px solid #b8bec6;border-radius:6px;padding:12px 13px;color:#8a9099;margin-bottom:11px;font-size:15px">${p}</div>`).join("")}
      <div style="background:#0a3d6b;color:#fff;padding:13px;border-radius:6px;text-align:center;font-weight:700;font-size:16px;margin-top:4px">Потвърди и отключи</div>
    </div>
  </div>
  ${tip("Истинска банка: https и точното име на банката в адреса.<br>Тук пише „Не е защитено“ и адресът е фалшив", "left:50%;bottom:90px;transform:translateX(-50%);width:330px")}
`, "#fff");

// Facebook: платена реклама за „инвестиция“.
S["scam-investment"] = phone(`
  <div style="background:#fff;display:flex;align-items:center;gap:12px;padding:6px 14px 8px">
    ${appIcon("facebook", { size: 34, label: false })}<span style="flex:1;font-size:22px;font-weight:700;color:#1877f2;letter-spacing:-.4px">facebook</span>
    ${circ(36, "#e4e6eb", ms("search", { size: 22, color: "#050505" }))}${circ(36, "#e4e6eb", appIcon("messenger", { size: 22, label: false }).replace(/box-shadow:[^;]*;/g, ""))}
  </div>
  <div style="display:flex;background:#fff;border-bottom:1px solid #dadde1;padding:0 4px">
    ${[["home", 1], ["group", 0], ["smart_display", 0], ["storefront", 0], ["notifications", 0], ["menu", 0]].map(([n, a]) => `<div style="flex:1;display:flex;justify-content:center;padding:9px 0;${a ? "border-bottom:3px solid #1877f2;" : ""}">${ms(n, { size: 26, fill: a, color: a ? "#1877f2" : "#65676b" })}</div>`).join("")}
  </div>
  <div class="grow" style="background:#f0f2f5;padding-top:8px">
    <div style="background:#fff">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px">
        ${circ(40, "#0f5132", ms("trending_up", { size: 24, color: "#fde047" }))}
        <div style="flex:1;line-height:1.25"><div style="font-weight:600;font-size:15.5px;color:#050505">Крипто Печалби BG</div><div style="font-size:13px;color:#65676b;display:flex;align-items:center;gap:4px">Спонсорирана · ${ms("public", { size: 14, color: "#65676b" })}</div></div>
        ${ms("more_horiz", { size: 24, color: "#65676b" })}${ms("close", { size: 24, color: "#65676b" })}
      </div>
      <div style="padding:0 12px 10px;font-size:15.5px;color:#050505;line-height:1.35">Печелете 300% с крипто! Инвестирайте 200 € днес и вземете 2 000 € до месец. Гарантирано!</div>
      <div style="height:196px;background:linear-gradient(160deg,#0f3b22,#08210f);position:relative;overflow:hidden">
        <svg width="390" height="196" viewBox="0 0 390 196" style="position:absolute;inset:0"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde047" stop-opacity=".45"/><stop offset="1" stop-color="#fde047" stop-opacity="0"/></linearGradient></defs>
          <path d="M0 170 L40 160 L80 168 L120 140 L160 150 L200 112 L240 124 L290 70 L330 84 L390 24 L390 196 L0 196Z" fill="url(#g)"/>
          <path d="M0 170 L40 160 L80 168 L120 140 L160 150 L200 112 L240 124 L290 70 L330 84 L390 24" fill="none" stroke="#fde047" stroke-width="3.5" stroke-linejoin="round"/></svg>
        <div style="position:absolute;left:18px;top:16px;color:#fde047;font-size:38px;font-weight:800;line-height:1.05">+300%<div style="font-size:17px;color:#fff;font-weight:600;margin-top:4px">за 30 дни</div></div>
        <div style="position:absolute;left:18px;bottom:14px;background:#fff;color:#0f3b22;font-weight:700;font-size:13px;padding:4px 10px;border-radius:4px">Гарантирана печалба</div>
      </div>
      <div style="background:#e4e6eb;display:flex;align-items:center;gap:10px;padding:10px 12px">
        <div style="flex:1;line-height:1.3"><div style="font-size:12.5px;color:#65676b">profit-krypto24.top</div><div style="font-size:15.5px;font-weight:600;color:#050505">Регистрирайте се безплатно</div></div>
        <div class="ring" style="background:#d8dadf;border-radius:6px;padding:8px 12px;font-weight:600;font-size:14.5px;color:#050505">Научи повече</div>
      </div>
      <div style="display:flex;justify-content:space-between;padding:9px 12px;font-size:13.5px;color:#65676b"><span>1,2 хил. реакции</span><span>340 коментара</span></div>
    </div>
  </div>
  ${tip("Никой не гарантира печалба. Обещаят ли бързи пари — измама.<br>Не давайте пари/карта", "left:50%;top:515px;transform:translateX(-50%);width:330px")}
`, "#fff");

// Messenger: „любов онлайн“.
S["scam-love"] = phone(`
  <div style="display:flex;align-items:center;gap:8px;padding:4px 14px 8px 8px;height:62px;background:#fff">
    <span style="padding:6px;display:flex">${ms("arrow_back", { size: 24, color: "#0866ff" })}</span>
    ${circ(40, "linear-gradient(135deg,#8a94a6,#5b6577)", `<span style="color:#fff;font-size:18px;font-weight:600">R</span>`)}
    <div style="flex:1;line-height:1.2"><div style="font-size:17px;font-weight:600;color:#050505">Robert Hale</div><div style="font-size:12.5px;color:#65676b">Активен сега</div></div>
    ${ms("call", { size: 24, fill: 1, color: "#0866ff" })}<span style="width:8px"></span>${ms("videocam", { size: 28, fill: 1, color: "#0866ff" })}
  </div>
  <div class="grow" style="background:#fff;padding:14px 12px;display:flex;flex-direction:column;gap:5px">
    <div style="align-self:center;font-size:12px;color:#65676b;margin-bottom:8px">Вчера 21:47</div>
    <div style="align-self:flex-end;max-width:72%;background:#0866ff;color:#fff;padding:9px 14px;border-radius:18px;font-size:16px">Добър вечер, Робърт. Как мина денят ви?</div>
    <div style="display:flex;align-items:flex-end;gap:7px;margin-top:6px">${circ(28, "linear-gradient(135deg,#8a94a6,#5b6577)", `<span style="color:#fff;font-size:13px;font-weight:600">R</span>`)}
      <div style="max-width:74%;background:#e9ebee;padding:9px 14px;border-radius:18px;font-size:16px;color:#050505;line-height:1.35">Скъпа, обичам те ${ms("favorite", { size: 17, fill: 1, color: "#e0245e", style: "vertical-align:-3px" })} Искам да дойда при теб в България.</div></div>
    <div style="display:flex;align-items:flex-end;gap:7px"><span style="width:28px"></span>
      <div class="ring" style="max-width:74%;background:#e9ebee;padding:9px 14px;border-radius:18px;font-size:16px;color:#050505;line-height:1.35">Но митницата задържа подаръка ми. Прати 400 евро да го освободя…</div></div>
  </div>
  <div style="padding:6px 10px 10px;display:flex;align-items:center;gap:10px;background:#fff">
    ${ms("add_circle", { size: 28, fill: 1, color: "#0866ff" })}${ms("photo_camera", { size: 26, fill: 1, color: "#0866ff" })}${ms("image", { size: 26, fill: 1, color: "#0866ff" })}
    <div style="flex:1;height:40px;border-radius:20px;background:#f0f2f5;display:flex;align-items:center;padding:0 14px;font-size:16px;color:#65676b">Съобщение</div>
    ${ms("thumb_up", { size: 28, fill: 1, color: "#0866ff" })}
  </div>
  ${tip("Непознат „любим“ от интернет, който иска<br>пари — винаги е измама. Не пращайте", "left:50%;top:370px;transform:translateX(-50%)")}
`, "#fff");

// Google Play: приложение за отдалечен достъп „по чуждо нареждане“.
S["scam-remote"] = phone(`
  <div style="display:flex;align-items:center;gap:14px;padding:4px 16px 8px 12px;height:56px;background:#fff">
    ${ms("arrow_back", { size: 24 })}<span style="flex:1"></span>${ms("search", { size: 24 })}${ms("more_vert", { size: 24 })}
  </div>
  <div class="grow" style="background:#fff;padding:6px 20px">
    <div style="display:flex;gap:16px;align-items:center">
      ${circ(76, "#ef443b", ms("desktop_windows", { size: 44, fill: 1, color: "#fff" }), "border-radius:18px")}
      <div style="line-height:1.3"><div style="font-size:22px;font-weight:500;color:#202124">AnyDesk Remote Control</div><div style="font-size:14px;color:#01875f;font-weight:500;margin-top:3px">AnyDesk Software GmbH</div><div style="font-size:12.5px;color:#5f6368;margin-top:2px">Съдържа реклами</div></div>
    </div>
    <div style="display:flex;margin:22px 0 18px;text-align:center;color:#202124">
      <div style="flex:1"><div style="font-size:15px;font-weight:500;display:flex;justify-content:center;align-items:center;gap:3px">4,2 ${ms("star", { size: 14, fill: 1 })}</div><div style="font-size:12px;color:#5f6368;margin-top:2px">4,2 млн. отзива</div></div>
      <div style="flex:1;border-left:1px solid #dadce0"><div style="font-size:15px;font-weight:500">100 млн.+</div><div style="font-size:12px;color:#5f6368;margin-top:2px">Изтегляния</div></div>
      <div style="flex:1;border-left:1px solid #dadce0"><div style="font-size:15px;font-weight:500">3+</div><div style="font-size:12px;color:#5f6368;margin-top:2px">За всички</div></div>
    </div>
    <div class="ring" style="background:#01875f;color:#fff;border-radius:22px;height:44px;display:flex;align-items:center;justify-content:center;font-size:15.5px;font-weight:500">Инсталиране</div>
    <div style="margin-top:22px;font-size:17px;font-weight:500;color:#202124;display:flex;justify-content:space-between">За това приложение${ms("arrow_forward", { size: 22 })}</div>
    <div style="font-size:14px;color:#3c4043;line-height:1.45;margin-top:8px">Приложение за отдалечен достъп — позволява на другия човек да вижда екрана ви и да управлява устройството ви.</div>
  </div>
  ${tip("Никога не инсталирайте приложение по чуждо нареждане по телефона. Така измамникът вижда екрана ви и влиза в сметката ви", "left:50%;top:420px;transform:translateX(-50%);width:320px")}
`, "#fff");

// Фалшив магазин (Chrome).
const phoneArt = `<svg width="150" height="168" viewBox="0 0 150 168"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3f4b"/><stop offset=".5" stop-color="#1c1f27"/><stop offset="1" stop-color="#2d323d"/></linearGradient><radialGradient id="l" cx=".4" cy=".35"><stop offset="0" stop-color="#3b4a66"/><stop offset=".5" stop-color="#0b0e14"/><stop offset="1" stop-color="#000"/></radialGradient></defs>
  <rect x="32" y="4" width="86" height="160" rx="15" fill="url(#b)"/><rect x="33.5" y="5.5" width="83" height="157" rx="13.5" fill="none" stroke="#8a90a0" stroke-opacity=".5"/>
  <rect x="40" y="12" width="40" height="40" rx="11" fill="#14171d" stroke="#555b69" stroke-width="1.2"/>
  <circle cx="53" cy="25" r="7.5" fill="url(#l)" stroke="#6b7280"/><circle cx="68" cy="25" r="7.5" fill="url(#l)" stroke="#6b7280"/><circle cx="60.5" cy="40" r="7.5" fill="url(#l)" stroke="#6b7280"/><circle cx="73" cy="40" r="2.6" fill="#f3e9c6"/></svg>`;
S["scam-fake-shop"] = phone(`
  ${chromeBar("super-oferti.xyz", true)}
  <div class="grow" style="background:#fff">
    <div style="background:#e11d2e;color:#fff;text-align:center;padding:8px;font-size:14px;font-weight:700">ГОЛЯМА РАЗПРОДАЖБА −95% · само днес!</div>
    <div style="padding:8px 14px;display:flex;align-items:center;border-bottom:1px solid #eee"><span style="flex:1;font-size:20px;font-weight:800;color:#e11d2e;letter-spacing:-.3px">СУПЕР-ОФЕРТИ</span>${ms("shopping_cart", { size: 24, color: "#333" })}</div>
    <div style="height:176px;background:radial-gradient(70% 80% at 50% 45%,#fff,#e4e7ec);display:flex;align-items:center;justify-content:center">${phoneArt}</div>
    <div style="padding:10px 16px 0">
      <div style="font-weight:700;font-size:17px;color:#111">Смартфон 256 GB — чисто нов</div>
      <div style="display:flex;align-items:baseline;gap:12px;margin:5px 0"><span style="text-decoration:line-through;color:#888;font-size:16px">1 199 €</span><span style="font-size:28px;font-weight:800;color:#e11d2e">59 €</span></div>
      <div style="font-size:13px;color:#b45309;font-weight:600">Остават само 2 бройки! Офертата изтича след 00:14:52</div>
      <div class="ring" style="background:#e11d2e;color:#fff;padding:13px;border-radius:8px;text-align:center;font-weight:700;margin-top:12px;font-size:16px">Купи сега — плащане по предварителна сметка</div>
      <div style="font-size:12px;color:#888;margin-top:8px;line-height:1.4">Само предплащане по банков път. Без телефон и адрес на магазина.</div>
    </div>
  </div>
  ${tip("Твърде ниска цена + само предплащане + няма контакти = фалшив магазин", "left:50%;top:92px;transform:translateX(-50%);width:300px").replace("top:92px", "top:530px").replace(" ar-d","")}
`, "#fff");

// „Как да проверя“ — бележка с четири стъпки (приложение за бележки).
S["scam-verify"] = phone(`
  <div style="display:flex;align-items:center;gap:18px;padding:4px 16px 8px 10px;height:56px;background:#fff8b8">
    <span style="flex:1;display:flex;padding:4px">${ms("arrow_back", { size: 24, color: "#3c3a2a" })}</span>${ms("push_pin", { size: 24, color: "#3c3a2a" })}${ms("notification_add", { size: 24, color: "#3c3a2a" })}${ms("archive", { size: 24, color: "#3c3a2a" })}
  </div>
  <div class="grow" style="background:#fff8b8;padding:10px 20px;color:#202124">
    <div style="font-size:26px;font-weight:500;margin-bottom:16px">Как да проверя?</div>
    ${[["Затворете.", "Не продължавайте разговора и не натискайте линка."], ["Намерете официалния номер", "от гърба на картата, от сметката или от официалния сайт."], ["Звъннете сами", "на официалния номер и питайте дали наистина са ви търсили."], ["Питайте близък,", "преди да направите каквото и да е."]].map(([t, d]) => `<div style="display:flex;gap:12px;margin-bottom:16px;align-items:flex-start"><span style="margin-top:1px">${ms("check_box_outline_blank", { size: 26, color: "#5f6368" })}</span><div style="font-size:18px;line-height:1.4"><b style="font-weight:500">${t}</b> ${d}</div></div>`).join("")}
    <div style="margin-top:22px;font-size:16px;color:#4a4a3a;line-height:1.45;border-top:1px solid rgba(0,0,0,.12);padding-top:16px">Истинските институции нямат против да затворите и да звъннете сами.</div>
  </div>
  <div style="background:#fff8b8;display:flex;align-items:center;padding:8px 16px 12px;color:#5f6368">${ms("add_box", { size: 24 })}<span style="width:20px"></span>${ms("palette", { size: 24 })}<span style="flex:1;text-align:center;font-size:12.5px">Редактирана днес, 11:20</span>${ms("more_vert", { size: 24 })}</div>
`, "#fff8b8");

// ═══════════ ЕВРОТО ═══════════
// Банкноти „Европа“ — официални образци на ЕЦБ, лицева страна, реален относителен размер.
const NOTE_INFO = [[5, "сиво", "#9a9ea5"], [10, "червено", "#d8505c"], [20, "синьо", "#3b78c9"], [50, "оранжево", "#ec8a2f"], [100, "зелено", "#4f9d58"], [200, "жълто-кафяво", "#c79a3a"]];
S["euro-banknotes"] = scene(`
  <div style="font-family:Inter,Roboto,sans-serif;color:#1f2937">
    <div style="font-size:19px;font-weight:700;letter-spacing:-.2px">Евробанкноти</div>
    <div style="font-size:13.5px;color:#556070;margin:2px 0 14px">Лицева страна · в реалния им относителен размер</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px 10px">
      ${NOTE_INFO.map(([d, name, c]) => `<div style="display:flex;flex-direction:column;align-items:flex-start;gap:9px">
        <div style="height:112px;display:flex;align-items:center">${banknote(d, "front")}</div>
        <div style="display:flex;align-items:center;gap:8px"><span style="width:11px;height:11px;border-radius:50%;background:${c};box-shadow:0 0 0 1px rgba(0,0,0,.18)"></span><span style="font-size:15.5px;font-weight:700">${d} евро</span><span style="font-size:14px;color:#556070">${name}</span></div></div>`).join("")}
    </div>
    <div style="font-size:12px;color:#6b7280;margin-top:14px;border-top:1px solid #cdd2da;padding-top:9px">Образци: © Европейска централна банка</div>
  </div>`, { w: 500 });

// Монети — снимки на ЕЦБ: обща страна + българска национална страна, реален относителен размер.
const COIN_INFO = [["1c", "1 цент", "Мадарски конник"], ["2c", "2 цента", "Мадарски конник"], ["5c", "5 цента", "Мадарски конник"], ["10c", "10 цента", "Мадарски конник"],
  ["20c", "20 цента", "Мадарски конник"], ["50c", "50 цента", "Мадарски конник"], ["1e", "1 евро", "Св. Иван Рилски"], ["2e", "2 евро", "Паисий Хилендарски"]];
S["euro-coins"] = scene(`
  <div style="font-family:Inter,Roboto,sans-serif;color:#1f2937">
    <div style="font-size:19px;font-weight:700;letter-spacing:-.2px">Евромонети</div>
    <div style="font-size:13.5px;color:#556070;margin:2px 0 14px">Двете страни на всяка монета · в реалния им относителен размер</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 14px">
      ${COIN_INFO.map(([d, name, motif]) => `<div style="background:rgba(255,255,255,.55);border:1px solid #cfd5de;border-radius:10px;padding:9px 8px 9px">
        <div style="display:flex;justify-content:space-around;align-items:center;height:104px">${coin(d, "common", { scale: 4 })}${coin(d, "bg", { scale: 4 })}</div>
        <div style="display:flex;justify-content:space-around;font-size:11.5px;color:#6b7280;margin-top:5px"><span style="width:50%;text-align:center">обща</span><span style="width:50%;text-align:center">българска</span></div>
        <div style="margin-top:7px;text-align:center"><span style="font-size:15.5px;font-weight:700">${name}</span><div style="font-size:12.5px;color:#556070">${motif}</div></div></div>`).join("")}
    </div>
    <div style="font-size:12px;color:#6b7280;margin-top:14px;border-top:1px solid #cdd2da;padding-top:9px;line-height:1.4">Снимки: © Европейска централна банка (обща страна © ЕС, национална страна © БНБ)</div>
  </div>`, { w: 500 });

// Ценови етикети на щанд.
const shelfTag = (name, unit, lv, eur, ring) => `<div style="width:190px;background:#fff;border-radius:3px;box-shadow:0 1px 1px rgba(0,0,0,.25),0 5px 9px -3px rgba(0,0,0,.3);padding:10px 12px 8px;font-family:Inter,Roboto,sans-serif;color:#111">
  <div style="font-size:14px;font-weight:700;line-height:1.2">${name}</div><div style="font-size:11.5px;color:#555;margin-top:1px">${unit}</div>
  <div style="display:flex;margin-top:10px;align-items:flex-end;white-space:nowrap">
    <div style="flex:1;border-right:1px solid #cfcfcf;padding-right:6px"><span style="font-size:25px;font-weight:800;letter-spacing:-.5px">${lv}</span><span style="font-size:13px;font-weight:700"> лв</span></div>
    <div ${ring ? 'class="ring"' : ""} style="flex:1;padding-left:8px;${ring ? "margin-left:6px;padding:0 4px;border-radius:5px;" : ""}"><span style="font-size:25px;font-weight:800;letter-spacing:-.5px">${eur}</span><span style="font-size:13px;font-weight:700"> €</span></div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px"><span style="font-size:10px;color:#666">1 € = 1,95583 лв</span><span style="width:62px;height:16px;background:repeating-linear-gradient(90deg,#111 0 1px,#fff 1px 3px,#111 3px 5px,#fff 5px 6px,#111 6px 7px,#fff 7px 10px)"></span></div></div>`;
S["euro-dual-price"] = scene(`
  <div style="position:relative;width:456px;height:250px;border-radius:6px;overflow:hidden;background:linear-gradient(#cfd3da 0,#e9ebef 40%,#dde0e6 100%)">
    <div style="position:absolute;left:0;right:0;top:0;height:78px;background:linear-gradient(#bcc1ca,#d9dce2);border-bottom:1px solid #a9aeb8"></div>
    <div style="position:absolute;left:0;right:0;top:100px;height:104px;background:linear-gradient(#f2f3f5 0,#fff 14%,#e3e5ea 15%,#d2d5db 100%);box-shadow:0 -2px 0 #b7bcc6,0 4px 10px rgba(0,0,0,.18)"></div>
    <div style="position:absolute;left:0;right:0;top:204px;height:46px;background:linear-gradient(#b9bec8,#9ea4af)"></div>
    <div style="position:absolute;left:20px;top:78px">${shelfTag("Хляб „Добруджа“", "700 г · цена за 1 бр.", "1,20", "0,61", true)}</div>
    <div style="position:absolute;left:246px;top:78px">${shelfTag("Прясно мляко 3%", "1 л · цена за 1 бр.", "2,30", "1,18", false)}</div>
    ${tip("Двете цени са една до друга. Курсът е<br>фиксиран — не губите пари", "left:50%;top:8px;transform:translateX(-50%);width:270px", { arrow: "d", at: "24%" })}
  </div>`, { pad: 22 });

// Касова бележка (термохартия).
function fakeQr(n = 25, cell = 3.4) {
  let s = 20261030; const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) >> 8) & 1;
  const finder = (x, y) => `<rect x="${x * cell}" y="${y * cell}" width="${7 * cell}" height="${7 * cell}" fill="#222"/><rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#fbfbf8"/><rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#222"/>`;
  const inF = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  let m = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inF(x, y) && r()) m += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" fill="#222"/>`;
  return `<svg width="${n * cell}" height="${n * cell}">${m}${finder(0, 0)}${finder(n - 7, 0)}${finder(0, n - 7)}</svg>`;
}
const rrow = (a, b, st = "") => `<div style="display:flex;justify-content:space-between;${st}"><span>${a}</span><span>${b}</span></div>`;
S["euro-receipt"] = scene(`
  <div style="position:relative;width:420px;height:720px">
    <div style="position:absolute;left:55px;top:56px;width:310px;transform:rotate(-1.2deg);filter:drop-shadow(0 1px 1px rgba(0,0,0,.25)) drop-shadow(0 12px 14px rgba(0,0,0,.2))">
      <div style="background:linear-gradient(90deg,#f4f4f1,#fcfcfa 12%,#fcfcfa 88%,#f1f1ee);padding:20px 22px 26px;font-family:${MONO};font-size:12.5px;line-height:1.45;color:#2a2a2a;-webkit-mask:conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/12px 100% repeat-x;padding-bottom:30px">
        <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:8px">
          <div style="width:50px;height:50px;border-radius:50%;border:2px solid #333;display:flex;align-items:center;justify-content:center">${ms("bakery_dining", { size: 30, fill: 1, color: "#333" })}</div>
          <div style="font-weight:700;font-size:15px;margin-top:6px">МАГАЗИН „ДОБРО УТРО“</div>
          <div style="text-align:center;font-size:11.5px;color:#444">„Примерна“ 12, гр. Бобов дол<br>ЕИК 000000000 · ДДС рег. BG000000000</div>
        </div>
        <div style="border-top:1px dashed #777;margin:6px 0"></div>
        <div style="text-align:center;font-weight:700;letter-spacing:.5px">КАСОВА БЕЛЕЖКА</div>
        <div style="border-top:1px dashed #777;margin:6px 0"></div>
        ${rrow("Хляб „Добруджа“", "")}${rrow("&nbsp; 1 x 0,61", "0,61 Б")}
        ${rrow("Прясно мляко 3% 1л", "")}${rrow("&nbsp; 1 x 1,89", "1,89 Б")}
        ${rrow("Сирене бяло 400г", "")}${rrow("&nbsp; 1 x 3,99", "3,99 Б")}
        <div style="border-top:1px dashed #777;margin:8px 0 6px"></div>
        <div class="ring" style="display:flex;justify-content:space-between;font-weight:700;font-size:15px;padding:3px 4px;border-radius:4px;margin:0 -4px"><span>ОБЩА СУМА</span><span>6,49 €</span></div>
        ${rrow("В брой", "10,00 €", "margin-top:5px")}
        ${rrow("Ресто", "3,51 €")}
        <div style="border-top:1px dashed #777;margin:8px 0 5px"></div>
        <div style="font-size:11.5px;color:#444">${rrow("Равностойност в лева", "12,69 лв")}${rrow("Курс", "1 € = 1,95583 лв")}</div>
        <div style="display:flex;justify-content:center;margin-top:10px">${fakeQr()}</div>
        <div style="text-align:center;font-size:11px;color:#555;margin-top:8px;line-height:1.35">Каса 02 · Бон № 0004817<br>30.10.2026 11:32:08<br>Благодарим Ви!</div>
      </div>
    </div>
    ${tip("Сумата е в евро. Ако платите с лева,<br>рестото е в евро — по фиксирания курс", "left:50%;top:0;transform:translateX(-50%);width:300px", { arrow: "d", at: "50%" })}
  </div>`, { pad: 14, w: 450 });

// Банкомат.
const atmKey = `<div style="width:30px;height:15px;border-radius:3px;background:linear-gradient(#e9ecf0,#a9aeb7);box-shadow:0 1px 1px rgba(0,0,0,.6),inset 0 1px 0 #fff"></div>`;
const atmL = ["20 €", "50 €", "100 €", "150 €"], atmR = ["200 €", "300 €", "Друга сума", "Отказ"];
const atmOpt = (t, side, ring) => `<div style="height:54px;display:flex;align-items:center;justify-content:${side === "l" ? "flex-start" : "flex-end"}"><div ${ring ? 'class="ring"' : ""} style="min-width:112px;text-align:center;padding:9px 12px;font-size:19px;font-weight:700;color:#fff;background:${t === "Отказ" ? "#b3262b" : "rgba(255,255,255,.14)"};border:1px solid rgba(255,255,255,.34);border-radius:7px;${side === "l" ? "margin-left:-1px" : "margin-right:-1px"}">${t}</div></div>`;
S["euro-atm"] = scene(`
  <div style="position:relative;width:456px;font-family:Roboto,Inter,sans-serif">
    <div style="background:linear-gradient(160deg,#4a4f58,#2b2e34 45%,#1d2025);border-radius:22px;padding:16px 14px 18px;box-shadow:0 2px 3px rgba(0,0,0,.35),0 22px 34px -8px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.18)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin:0 6px 10px;color:#aeb4bf;font-size:12px"><span style="font-weight:700;letter-spacing:.3px;color:#cfd4dc">Банка Пример</span><span style="display:flex;align-items:center;gap:4px">${ms("contactless", { size: 16, color: "#aeb4bf" })} Карта · Безконтактно</span></div>
      <div style="display:flex;align-items:flex-start;gap:6px">
        <div style="width:34px;padding-top:98px;display:flex;flex-direction:column">${[0, 1, 2, 3].map(() => `<div style="height:54px;display:flex;align-items:center">${atmKey}</div>`).join("")}</div>
        <div style="flex:1;background:#050607;border-radius:12px;padding:8px;box-shadow:inset 0 0 0 1px #3c4048">
          <div style="height:316px;border-radius:6px;background:linear-gradient(170deg,#0f5f9e,#0a3d6b 60%,#082d50);color:#fff;position:relative;overflow:hidden;padding:0 8px">
            <div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.1) 0,rgba(255,255,255,0) 30%)"></div>
            <div style="height:98px;padding-top:12px;text-align:center;position:relative">
              <div style="display:flex;justify-content:space-between;font-size:11.5px;opacity:.75;padding:0 2px"><span>Банка Пример</span><span>30.10.2026 11:32</span></div>
              <div style="font-size:21px;font-weight:700;margin-top:14px">Изберете сума за теглене</div>
              <div style="font-size:13.5px;opacity:.85;margin-top:4px">Сумите са в евро (€)</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;position:relative"><div>${atmL.map((t, i) => atmOpt(t, "l", i === 1)).join("")}</div><div>${atmR.map((t) => atmOpt(t, "r")).join("")}</div></div>
          </div>
        </div>
        <div style="width:34px;padding-top:98px;display:flex;flex-direction:column;align-items:flex-end">${[0, 1, 2, 3].map(() => `<div style="height:54px;display:flex;align-items:center">${atmKey}</div>`).join("")}</div>
      </div>
      <div style="display:flex;gap:16px;margin-top:16px;align-items:center">
        <div style="flex:1"><div style="height:12px;border-radius:6px;background:#000;box-shadow:inset 0 1px 3px #000,0 1px 0 rgba(255,255,255,.2)"></div><div style="font-size:11px;color:#aeb4bf;margin-top:6px;text-align:center">Картов четец</div>
          <div style="height:44px;border-radius:5px;background:linear-gradient(#15171b,#0b0c0f);margin-top:12px;box-shadow:inset 0 2px 6px #000,0 1px 0 rgba(255,255,255,.18)"></div><div style="font-size:11px;color:#aeb4bf;margin-top:6px;text-align:center">Банкноти</div></div>
        <div style="display:grid;grid-template-columns:repeat(3,38px);gap:6px">${["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""].map((k) => k ? `<div style="height:27px;border-radius:4px;background:linear-gradient(#e6e9ee,#a6abb4);box-shadow:0 1px 1px rgba(0,0,0,.6),inset 0 1px 0 #fff;font-size:13px;font-weight:700;color:#2a2d33;display:flex;align-items:center;justify-content:center">${k}</div>` : "<div></div>").join("")}</div>
      </div>
    </div>
    ${tip("Тегли се по същия начин — само че<br>сумите са в евро", "left:36px;bottom:30px;width:270px")}
  </div>`, { pad: 22 });

// Курс (резултат от търсене в Chrome).
const conv = (lv) => (lv / 1.95583).toFixed(2).replace(".", ",");
S["euro-rate"] = phone(`
  <div style="padding:6px 12px 8px;background:#fff;display:flex;align-items:center;gap:10px">
    <div style="flex:1;height:46px;border-radius:23px;background:#eef1f6;display:flex;align-items:center;gap:10px;padding:0 14px;font-size:16px;color:#1f1f1f">${ms("search", { size: 22, color: "#444746" })}<span style="flex:1">1 евро в лева</span>${ms("close", { size: 22, color: "#444746" })}</div>
    ${ms("more_vert", { size: 24, color: "#444746" })}
  </div>
  <div style="display:flex;gap:20px;padding:0 16px;border-bottom:1px solid #e1e3e6;font-size:14.5px;color:#5f6368;background:#fff"><span style="padding:9px 0;color:#0b57d0;border-bottom:3px solid #0b57d0;font-weight:500">Всички</span><span style="padding:9px 0">Новини</span><span style="padding:9px 0">Снимки</span><span style="padding:9px 0">Видеа</span></div>
  <div class="grow" style="background:#f8f9fa;padding:12px">
    <div style="background:#fff;border:1px solid #dadce0;border-radius:14px;padding:16px">
      <div style="font-size:14px;color:#5f6368">1 евро е равно на</div>
      <div class="ring" style="display:inline-block;margin:6px 4px 4px;font-size:34px;font-weight:400;color:#202124;border-radius:6px;padding:0 4px;letter-spacing:-.5px">1,95583 <span style="font-size:22px">български лева</span></div>
      <div style="font-size:12px;color:#5f6368;margin-top:2px">30 окт., 11:32 · Фиксиран курс</div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <div style="flex:1;border:1px solid #dadce0;border-radius:8px;padding:9px 12px"><div style="font-size:20px;color:#202124">1</div><div style="font-size:13px;color:#5f6368;display:flex;justify-content:space-between;margin-top:2px">Евро ${ms("arrow_drop_down", { size: 20 })}</div></div>
        <div style="flex:1;border:1px solid #dadce0;border-radius:8px;padding:9px 12px"><div style="font-size:20px;color:#202124">1,95583</div><div style="font-size:13px;color:#5f6368;display:flex;justify-content:space-between;margin-top:2px">Български лев ${ms("arrow_drop_down", { size: 20 })}</div></div>
      </div>
    </div>
    <div style="background:#fff;border:1px solid #dadce0;border-radius:14px;margin-top:12px;overflow:hidden">
      <div style="display:flex;padding:10px 16px;font-size:13px;color:#5f6368;background:#f1f3f4"><span style="flex:1">Левове</span><span>Евро</span></div>
      ${[10, 50, 100, 500, 1000].map((v) => `<div style="display:flex;padding:9px 16px;font-size:15.5px;color:#202124;border-top:1px solid #eceff1"><span style="flex:1">${v} лв</span><b style="font-weight:500">${conv(v)} €</b></div>`).join("")}
    </div>
  </div>
  ${tip("Курсът е един и същ навсякъде —<br>сумата ви остава същата", "left:50%;top:60px;transform:translateX(-50%);width:260px").replace("top:60px", "top:545px")}
`, "#fff");

// ═══════════ Фалшива банкнота: „Пипнете – Погледнете – Наклонете“ ═══════════
const NW = 198.5, NH = 109, NL = 185, NT = 124; // 50 € — най-големият разрешен размер
const stepCol = { "Пипнете": "#9a3412", "Погледнете": "#0b5cad", "Наклонете": "#0a7a4a" };
const fcard = (css, step, title, text) => `<div style="position:absolute;${css};background:#fff;border:1px solid #c9ced6;border-radius:10px;padding:9px 12px 10px;box-shadow:0 1px 2px rgba(0,0,0,.08)">
  <div style="font-size:12.5px;font-weight:800;color:${stepCol[step]}">${step}</div>
  <div style="font-size:14.5px;font-weight:700;color:#1f2937;margin-top:1px">${title}</div>
  <div style="font-size:12.5px;color:#4b5563;line-height:1.35;margin-top:3px">${text}</div></div>`;
const ln = (css) => `<div style="position:absolute;background:#374151;${css}"></div>`;
const nx = (f) => NL + NW * f, ny = (f) => NT + NH * f;
S["fake-banknote"] = scene(`
  <div style="position:relative;width:568px;height:488px;font-family:Inter,Roboto,sans-serif">
    <div style="position:absolute;left:${NL}px;top:${NT}px">${banknote(50, "front")}</div>
    ${fcard("left:149px;top:0;width:270px;height:106px", "Пипнете", "Релефен печат", "Основният мотив, надписите и голямото число са релефни — усещат се с пръст.")}
    ${ln(`left:${nx(0.45)}px;top:106px;width:1.5px;height:${NT - 106 - 1}px`)}
    ${fcard(`left:0;top:${ny(0.45) - 52}px;width:166px`, "Погледнете", "Воден знак", "Срещу светлина се вижда портрет на Европа и числото.")}
    ${ln(`left:166px;top:${ny(0.45)}px;width:${NL - 166 - 1}px;height:1.5px`)}
    ${fcard(`left:402px;top:${ny(0.31) - 52}px;width:166px`, "Погледнете", "Портретен прозорец", "Срещу светлина прозорецът над холограмата става прозрачен и показва портрет на Европа.")}
    ${ln(`left:${NL + NW + 1}px;top:${ny(0.31)}px;width:${402 - NL - NW - 1}px;height:1.5px`)}
    ${fcard("left:0;top:276px;width:278px", "Наклонете", "Изумрудено число", "По числото се движи светъл блясък нагоре-надолу, а цветът преминава от изумруденозелено към тъмносиньо.")}
    ${ln(`left:${nx(0.145)}px;top:${NT + NH + 1}px;width:1.5px;height:${276 - NT - NH - 1}px`)}
    ${fcard("left:292px;top:276px;width:276px", "Погледнете", "Защитна нишка", "Срещу светлина нишката се вижда като тъмна линия по цялата височина на банкнотата.")}
    ${ln(`left:${nx(0.83)}px;top:${NT + NH + 1}px;width:1.5px;height:${276 - NT - NH - 1}px`)}
    ${tip("Проверявайте няколко белега. При съмнение сравнете с банкнота,<br>за която сте сигурни, или я занесете в банка.", "left:0;top:412px;width:568px;max-width:568px")}
    <div style="position:absolute;left:0;top:470px;font-size:11px;color:#6b7280">Образец: © Европейска централна банка</div>
  </div>`, { pad: 22 });

render(S).catch((e) => { console.error(e); process.exit(1); });
