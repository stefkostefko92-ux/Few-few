// „Дом, безопасност, кухня и хранене“ — снимки с бележки за ръководствата d-* и k-*.
// Истинска снимка (само CC0 / обществено достояние от Wikimedia Commons) + червен контур и бележка,
// точно по стъпките на ръководството. Активи: scripts/howto-mockups/assets/dom/ · лицензи: assets/credits/dom.md
// Лица и чужди марки няма; където има марка — размита (blur). Хартиените образци са ИЗМИСЛЕНИ, с примерни данни.
// Стартиране (от zabobovdol/):  node scripts/howto-mockups/gen-dom.js   (ONLY=име1,име2 за избрани)
const path = require("node:path");
const sharp = require("sharp"); // зависимост на проекта; тук само чете размерите на снимките
const { scene, phone, tip: _tip, render, ms, photo, ASSETS } = require("./_shell");
// бележките не се пренасят на нов ред заради тясна ширина
const tip = (t, css = "", o) => _tip(t, css + ";max-width:none", o);

const DOM = path.join(ASSETS, "dom");
const ic = (n, o = {}) => ms(n, { size: 24, ...o });

// Една снимка + контури + бележки. Всички позиции са части (0..1) от снимката; y>1 = под нея.
//   o.file    — файл в assets/dom/
//   o.w       — ширина на снимката в px (по подразб. 560); височината идва от пропорцията
//   o.rings   — [[x,y,w,h,round?]…] червени контури
//   o.tips    — [[текст, x, y, стрелка(u|d|l|r|""), at]…]  (x,y = център на бележката)
//   o.blur    — [[x,y,w,h]…] размити места (марки)
//   o.credit  — подпис под снимката
//   o.below   — място под снимката за бележки (px)
async function shot(o) {
  const f = path.join(DOM, o.file);
  const meta = await sharp(f).metadata();
  const w = o.w || 560;
  const h = Math.round((w * meta.height) / meta.width);
  const px = (v, s) => Math.round(v * s);
  const rings = (o.rings || [])
    .map(([x, y, rw, rh, round]) => `<div class="ring" style="position:absolute;left:${px(x, w)}px;top:${px(y, h)}px;width:${px(rw, w)}px;height:${px(rh, h)}px;border-radius:${round ? "999px" : "14px"}"></div>`)
    .join("");
  const blurs = (o.blur || [])
    .map(([x, y, bw, bh]) => `<div style="position:absolute;left:${px(x, w)}px;top:${px(y, h)}px;width:${px(bw, w)}px;height:${px(bh, h)}px;backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);background:rgba(120,120,120,.18);border-radius:6px"></div>`)
    .join("");
  const tips = (o.tips || [])
    .map(([t, x, y, a, at]) => tip(t, `left:${px(x, w)}px;top:${px(y, h)}px;transform:translate(-50%,-50%);width:max-content`, a ? { arrow: a, at: at || "50%" } : {}))
    .join("");
  const below = o.below || 0;
  return scene(
    `<div style="position:relative;width:${w + (o.side || 0)}px;padding-bottom:${below + 34}px">
      ${photo(f, { w, h, radius: 18, style: "box-shadow:0 18px 40px rgba(15,23,42,.28)" })}${blurs}${rings}${tips}
      <div style="position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:12px;color:#64748b">${o.credit}</div>
    </div>`,
    { pad: 30 }
  );
}

const SHOTS = {};
const CC0 = (a) => `Снимка: ${a}, Wikimedia Commons (CC0)`;

// ───────── Хартиени образци (ИЗМИСЛЕНИ, примерни данни; без герб/лого на институция) ─────────
const DESK = "background:radial-gradient(120% 90% at 30% 0%,#c9a77c 0%,#b08a5e 55%,#9c7650 100%)";
const grain = "background-image:repeating-linear-gradient(92deg,rgba(80,50,20,.07) 0 2px,transparent 2px 7px)";
const sheet = (inner, css = "") => `<div style="position:absolute;background:#fdfdfb;box-shadow:0 1px 1px rgba(0,0,0,.2),0 14px 26px rgba(40,25,10,.38);color:#1d2330;${css}">${inner}</div>`;
const line = (l, v, o = {}) => `<div style="display:flex;align-items:baseline;gap:8px;margin:0 0 ${o.mb || 11}px;font-size:${o.fs || 14}px"><span style="color:#4b5563;white-space:nowrap">${l}</span><span style="flex:1;border-bottom:1px solid #9aa3b2;padding:0 4px 1px;font-style:italic;color:#1e3a8a;min-height:18px">${v}</span></div>`;
const biro = (css) => `<div style="position:absolute;height:10px;border-radius:5px;background:linear-gradient(180deg,#5b8def,#1e40af 55%,#14307a);box-shadow:0 6px 8px rgba(0,0,0,.4);${css}"><i style="position:absolute;right:-12px;top:2px;border-left:12px solid #d8c9a8;border-top:3px solid transparent;border-bottom:3px solid transparent"></i></div>`;
const deskScene = (inner, w = 600, h = 760) => scene(`<div style="position:relative;width:${w}px;height:${h}px;border-radius:18px;overflow:hidden;${DESK};box-shadow:0 18px 40px rgba(15,23,42,.28)"><div style="position:absolute;inset:0;${grain}"></div>${inner}</div>`, { pad: 30 });

// @@SHOTS
SHOTS["dom-krushka"] = { file: "bulb-socket.jpg", w: 380, credit: CC0("RAIL P (RAIL.PHOTOGRAPHY)"), below: 110,
  rings: [[0.2, 0.25, 0.5, 0.4, true]],
  tips: [["Изключете ключа на лампата<br>(а за сигурност и предпазителя)", 0.5, 1.1, "u", "50%"], ["Развийте старата крушка (обикновено наляво)", 0.5, 1.26, ""]] };

SHOTS["dom-zakliuchen"] = { file: "corridor-door.jpg", w: 340, side: 420, credit: CC0("247homerescue"), below: 0,
  rings: [[0.46, 0.27, 0.16, 0.1, true]],
  tips: [["Звъннете на близък, който има резервен ключ", 1.55, 0.2, "l", "50%"], ["Обадете се на ключар", 1.4, 0.45, "l", "50%"], ["Не разбивайте сами —<br>рискувате нараняване и щети", 1.5, 0.72, "l", "50%"]] };

SHOTS["dom-hlazgav-banya"] = { file: "bathtub.jpg", w: 380, credit: CC0("It's Asbestos Time, Baby"), below: 150,
  rings: [[0.02, 0.22, 0.75, 0.4]],
  tips: [["Сложете противохлъзгаща постелка във ваната/душа", 0.5, 1.08, "u", "40%"], ["Поставете дръжки (хватки) на стената", 0.5, 1.22, ""]] };

SHOTS["dom-otoplenie"] = { file: "radiator-valve.jpg", credit: CC0("247homerescue"), below: 110,
  rings: [[0.5, 0.2, 0.3, 0.8]],
  tips: [["Отоплявайте основно обитаваните стаи<br>и затваряйте вратите", 0.5, 1.12, "u", "65%"]] };

SHOTS["dom-zima-burya"] = { file: "flashlight.jpg", w: 330, side: 400, credit: CC0("Gits Molding Corporation, fabricant"), below: 0,
  rings: [[0.05, 0.1, 0.85, 0.8]],
  tips: [["Дръжте фенерче и резервни батерии подръка", 1.55, 0.25, "l", "50%"], ["Заредете телефона и имайте<br>резервна батерия (powerbank)", 1.55, 0.5, ""], ["Пригответе топли дрехи и одеяла", 1.55, 0.7, ""]] };

SHOTS["dom-pozhar-doma"] = { file: "corridor-door.jpg", w: 340, side: 400, credit: CC0("247homerescue"), below: 0,
  rings: [[0.03, 0.02, 0.7, 0.82]],
  tips: [["Извикайте всички и излезте веднага", 1.5, 0.12, "l", "50%"], ["Затваряйте врати след себе си,<br>за да забавите огъня", 1.5, 0.42, "l", "50%"], ["Ако има дим, движете се ниско (приведени)", 1.52, 0.7, ""], ["От безопасно място звъннете на 112", 1.5, 0.86, ""]] };

SHOTS["dom-pechka"] = { file: "heater.jpg", w: 460, credit: CC0("Bondigoldwiki"), below: 110,
  blur: [[0.4, 0.855, 0.17, 0.045]],
  rings: [[0.0, 0.05, 1.0, 0.9]],
  tips: [["Дръжте на разстояние от завеси,<br>дрехи и мебели", 0.5, 1.1, "u", "50%"], ["Не сушете дрехи върху печката", 0.5, 1.28, ""]] , below: 150 };

SHOTS["dom-tigan-olio"] = { file: "frying-pan.jpg", credit: CC0("Hans Herrington"), below: 150,
  rings: [[0.42, 0.18, 0.5, 0.7, true]],
  tips: [["НЕ заливайте с вода", 0.3, 1.1, "u", "50%"], ["Покрийте тигана с капак или мокра кърпа,<br>за да спрете въздуха", 0.5, 1.28, "u", "75%"]] };

SHOTS["dom-techa-kran"] = { file: "water-valve.jpg", credit: CC0("Tomwsulcer"), below: 70,
  rings: [[0.25, 0.3, 0.55, 0.65]],
  tips: [["Намерете главния спирателен кран<br>(обикновено в банята/мазето) и го затворете", 0.5, 1.12, "u", "50%"]] };

SHOTS["dom-zamraznali-trabi"] = { file: "frozen-pipe.jpg", credit: CC0("Nylki"), below: 70,
  rings: [[0.12, 0.1, 0.8, 0.75]],
  tips: [["Топлоизолирайте външните тръби;<br>замръзнала тръба затоплете бавно, не с открит огън", 0.5, 1.12, "u", "50%"]] };

SHOTS["dom-razmraziavane"] = { file: "freezer-chest.jpg", w: 380, credit: CC0("Laura Stoinski"), below: 70,
  rings: [[0.08, 0.3, 0.84, 0.55]],
  tips: [["Най-безопасно: преместете от фризера<br>в хладилника предната вечер", 0.5, 1.1, "u", "50%"]] };

SHOTS["dom-zamrazia"] = { file: "freezer.jpg", credit: CC0("Philsacor"), below: 70,
  rings: [[0.08, 0.3, 0.8, 0.5]],
  tips: [["Разделяйте на порции, слагайте в пликове/кутии<br>и надпишете с дата", 0.5, 1.12, "u", "50%"]] };

// k-merna-bez-kantar — лъжичка върху чиния + таблица с мерки (стойностите са от стъпките)
SHOTS["dom-merki"] = async () => {
  const f = path.join(DOM, "spoon-plate.jpg");
  const meta = await sharp(f).metadata();
  const w = 340, h = Math.round((w * meta.height) / meta.width);
  const rows = [["1 чаена чаша", "≈ 250 мл"], ["1 супена лъжица", "≈ 15 мл (3 чаени лъжички)"], ["1 чаена лъжичка", "≈ 5 мл"], ["Чаша брашно", "≈ 130–150 г"], ["Чаша захар", "≈ 200 г"]];
  return counterScene(`
    <div style="position:absolute;left:30px;top:40px">${photo(f, { w, h, radius: 16, style: "box-shadow:0 14px 26px rgba(0,0,0,.35)" })}
      <div class="ring" style="position:absolute;left:${Math.round(w * 0.3)}px;top:${Math.round(h * 0.25)}px;width:${Math.round(w * 0.4)}px;height:${Math.round(h * 0.66)}px;border-radius:999px"></div></div>
    <div style="position:absolute;left:390px;top:40px;width:370px;background:#fff;border-radius:14px;padding:16px 20px;box-shadow:0 14px 26px rgba(0,0,0,.25);color:#1d2330">
      <div style="font-weight:700;font-size:17px;margin-bottom:8px">Мерки без кантар</div>
      ${rows.map(([a, b], i) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid #d5dbe4;font-size:14.5px"><span style="white-space:nowrap">${a}</span><b style="text-align:right">${b}</b></div>`).join("")}
      <div style="font-size:12.5px;color:#64748b;border-top:1px solid #d5dbe4;padding-top:9px">За точност при печене все пак е добре кантар.</div>
    </div>
    <div style="position:absolute;left:30px;top:${40 + h + 14}px;text-align:center;width:${w}px;font-size:12px;color:#64748b">Снимка: Nutrition, Food Safety &amp; Health, Wikimedia Commons (CC0)</div>
  `, 800, h + 100);
};

SHOTS["dom-gotvene-kapak"] = { file: "pot-stove.jpg", w: 420, credit: CC0("Olgatladi2020"), below: 70,
  rings: [[0.12, 0.1, 0.78, 0.6]],
  tips: [["Слагайте капак на тенджерата — вари по-бързо", 0.5, 1.1, "u", "50%"]] };

SHOTS["dom-konservirane"] = { file: "jars.jpg", credit: CC0("Nutrition, Food Safety &amp; Health"), below: 70,
  blur: [[0.225, 0.39, 0.07, 0.06], [0.455, 0.48, 0.07, 0.06], [0.655, 0.37, 0.07, 0.06]],
  rings: [[0.05, 0.1, 0.9, 0.78]],
  tips: [["Ползвайте чисти, здрави буркани и капачки", 0.5, 1.1, "u", "50%"]] };

SHOTS["dom-higiena-raze"] = { file: "hand-sink.jpg", credit: CC0("Simplegnome"), below: 70,
  rings: [[0.0, 0.2, 0.42, 0.7]],
  tips: [["Мийте ръцете преди и след работа с храна", 0.5, 1.12, "u", "22%"]] };

SHOTS["dom-podpravki"] = { file: "spices.jpg", credit: CC0("Kirsty Hughes"), below: 70,
  rings: [[0.28, 0.2, 0.6, 0.6]],
  tips: [["Ползвайте подправки: чубрица, риган, копър, чесън, лимон", 0.5, 1.1, "u", "60%"]] };

SHOTS["dom-lyubimets"] = { file: "dog-bowl2.jpg", w: 420, credit: CC0("ELTORO.VET"), below: 70,
  rings: [[0.05, 0.05, 0.9, 0.9, true]],
  tips: [["Осигурявайте прясна вода и подходяща храна всеки ден", 0.5, 1.1, "u", "50%"]] };

SHOTS["dom-kafe-vecher"] = { file: "coffee.jpg", credit: CC0("Ross Parmly"), below: 70,
  rings: [[0.12, 0.12, 0.62, 0.8]],
  tips: [["Ограничете кафе и силен чай след обяд", 0.5, 1.1, "u", "40%"]] };

SHOTS["dom-elektro-razklonitel"] = { file: "power-strip.jpg", credit: CC0("Yapparina"), below: 70,
  rings: [[0.38, 0.12, 0.5, 0.6]],
  tips: [["Не претоварвайте контакти с много уреди/разклонители", 0.5, 1.1, "u", "62%"]] };

SHOTS["dom-mikrovalnova"] = { file: "microwave.jpg", credit: CC0("Rakoon"), below: 70,
  rings: [[0.02, 0.05, 0.6, 0.85]],
  tips: [["НЕ слагайте метал, фолио и съдове със златен кант", 0.5, 1.1, "u", "30%"]] };

SHOTS["dom-stalba"] = { file: "ladder.jpg", w: 260, side: 360, credit: CC0("Wikideas1"), below: 0,
  rings: [[0.0, 0.88, 1.0, 0.12]],
  tips: [["Ползвайте стабилна стълба<br>на равен под", 1.45, 0.9, "l", "50%"], ["Не се качвайте на най-горното<br>стъпало", 1.5, 0.08, "l", "50%"], ["Дръжте се с една ръка", 1.4, 0.4, "l", "50%"]] };

SHOTS["dom-nozh"] = { file: "knife-cloth.jpg", credit: CC0("Gregory Karastergios"), below: 70,
  rings: [[0.07, 0.06, 0.85, 0.9]],
  tips: [["Режете на стабилна дъска<br>(сложете влажна кърпа отдолу)", 0.5, 1.12, "u", "50%"]] };

SHOTS["dom-hladilnik-hrana"] = { file: "fridge-left.jpg", w: 480, credit: CC0("Alabama Extension"), below: 70,
  rings: [[0.02, 0.03, 0.96, 0.9]],
  tips: [["Бързоразвалящите се (месо, мляко)<br>дръжте в хладилника", 0.5, 1.12, "u", "50%"]] };

SHOTS["dom-razhitie-hladilnik"] = { file: "fridge-drawers.jpg", credit: CC0("Alabama Extension"), below: 100,
  rings: [[0.0, 0.0, 0.5, 1.0]],
  tips: [["Подреждайте по-старото отпред в хладилника", 0.5, 1.1, "u", "25%"], ["Гответе от това, което е по-старо", 0.5, 1.28, ""]] };

SHOTS["dom-supa"] = { file: "soup.jpg", credit: CC0("Cala cala_maffia"), below: 70,
  tips: [["Поднесете топла; може с лъжица кисело мляко", 0.5, 1.1, "u", "50%"]] };

SHOTS["dom-klyuchove"] = { file: "keys-bulb.jpg", credit: CC0("Aphiwat chuangchoem"), below: 70,
  rings: [[0.62, 0.45, 0.35, 0.55]],
  tips: [["Дайте резервен ключ на доверен близък,<br>не го крийте под изтривалката", 0.5, 1.12, "u", "50%"]] };

SHOTS["dom-neznakomci"] = { file: "door-chain.jpg", w: 380, side: 390, credit: CC0("Jebulon"), below: 0,
  tips: [["Първо питайте кой е и защо идва,<br>без да отваряте", 1.4, 0.2, "l", "50%"], ["Поискайте служебна карта и я разгледайте<br>през шпионката/процепа", 1.4, 0.6, "l", "50%"]] };

// ───────── Кухненски плот (мрамор) ─────────
const COUNTER = "background:linear-gradient(135deg,#f1f1ee 0%,#e4e4df 40%,#f3f3f0 70%,#dcdcd6 100%)";
const counterScene = (inner, w = 560, h = 600) => scene(`<div style="position:relative;width:${w}px;height:${h}px;border-radius:18px;overflow:hidden;${COUNTER};box-shadow:0 18px 40px rgba(15,23,42,.28)"><div style="position:absolute;inset:0;background:radial-gradient(60% 40% at 20% 15%,rgba(150,150,140,.18),transparent 70%),radial-gradient(50% 35% at 85% 80%,rgba(150,150,140,.15),transparent 70%)"></div>${inner}</div>`, { pad: 30 });

// k-chete-etiket-hrana — хранителна стойност (измислен продукт, без марка)
const nrow = (a, b, o = {}) => `<div style="display:flex;justify-content:space-between;padding:4px ${o.ind ? "0 4px 16px" : "0"};border-bottom:1px solid #222;font-size:${o.fs || 14}px;${o.b ? "font-weight:700" : ""}"><span>${a}</span><span>${b}</span></div>`;
SHOTS["dom-etiket-hrana"] = () => counterScene(`
  <div style="position:absolute;left:70px;top:36px;width:300px;background:#fff;border:2px solid #111;padding:10px 14px;box-shadow:0 12px 22px rgba(0,0,0,.28);transform:rotate(-1deg);color:#111">
    <div style="font-weight:800;font-size:19px;border-bottom:6px solid #111;padding-bottom:3px">Хранителна стойност</div>
    <div class="ring" style="font-size:13.5px;margin:6px 0;padding:3px 6px;border-radius:8px;font-weight:600">на 100 г</div>
    ${nrow("Енергия", "1450 kJ / 345 kcal", { b: 1 })}${nrow("Мазнини", "12 g", { b: 1 })}${nrow("от които наситени", "5 g", { ind: 1 })}${nrow("Въглехидрати", "48 g", { b: 1 })}
    <div class="ring" style="border-radius:8px;margin:3px 0">${nrow("от които захари", "22 g", { ind: 1 })}</div>
    ${nrow("Белтъци", "6 g", { b: 1 })}
    <div class="ring" style="border-radius:8px;margin:3px 0">${nrow("Сол", "1,2 g", { b: 1 })}</div>
    <div class="ring" style="font-size:12px;line-height:1.4;margin-top:10px;padding:6px 8px;border-radius:8px"><b>Съставки:</b> пшенично брашно, захар, растително олио, сол, мая.</div>
  </div>
  ${tip("Намерете таблицата<br>„Хранителна стойност“", "left:300px;top:20px;width:max-content", { arrow: "l", at: "50%" }).replace("left:300px;top:20px", "left:395px;top:36px")}
  ${tip("Гледайте на 100 г,<br>за да сравнявате", "left:395px;top:100px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("Високо съдържание на сол/захар<br>избягвайте при нужда", "left:395px;top:250px;width:max-content", { arrow: "l", at: "50%" })}
  ${tip("Списъкът на съставките е по количество<br>(първото е най-много)", "left:395px;top:332px;width:max-content", { arrow: "l", at: "50%" })}
`, 740, 440);

// k-srok-godnost-hrana — „Годен до“ и „Най-добър до“ върху опаковки (без марки)
SHOTS["dom-srok-godnost"] = () => counterScene(`
  <div style="position:absolute;left:50px;top:70px;width:190px;height:230px">
    <div style="position:absolute;left:0;top:0;width:190px;height:30px;border-radius:50%/100%;background:linear-gradient(180deg,#e9e9ee,#cfd0d8);box-shadow:0 2px 3px rgba(0,0,0,.3)"></div>
    <div style="position:absolute;left:8px;top:16px;width:174px;height:210px;border-radius:0 0 22px 22px/0 0 18px 18px;background:linear-gradient(90deg,#d8e6f6,#ffffff 30%,#e8f0fa 70%,#c6d6ea);box-shadow:0 14px 20px rgba(0,0,0,.3)">
      <div style="margin:52px 14px 0;text-align:center;color:#1f4a8c;font-weight:700;font-size:20px">Кисело мляко</div>
      <div style="margin:3px 14px 0;text-align:center;color:#4b5f7d;font-size:12px">400 g · пример</div>
      <div class="ring" style="margin:30px 14px 0;text-align:center;font-weight:700;font-size:15px;padding:7px 0;border-radius:9px;background:#fff;font-family:'Roboto Mono',monospace">Годен до 12.11.2026</div></div></div>
  <div style="position:absolute;left:300px;top:60px;width:200px;height:250px;background:linear-gradient(90deg,#e5c58b,#f3dba8 40%,#d9b676);box-shadow:0 14px 20px rgba(0,0,0,.3);border-radius:4px;transform:rotate(2deg)">
      <div style="margin:46px 12px 0;text-align:center;color:#6a3c12;font-weight:800;font-size:22px">Ориз</div>
      <div style="margin:3px 12px 0;text-align:center;color:#7d5328;font-size:12px">1 kg · пример</div>
      <div class="ring" style="margin:56px 14px 0;text-align:center;font-weight:700;font-size:14px;padding:7px 0;border-radius:9px;background:#fff;font-family:'Roboto Mono',monospace">Най-добър до 03.2027</div></div>
  ${tip("„Годен до“ — не яжте след тази дата", "left:145px;top:340px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })}
  ${tip("„Най-добър до“ — обикновено става и малко след,<br>ако изглежда/мирише добре", "left:345px;top:405px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "75%" })}
  ${tip("При съмнение (миризма, плесен) — изхвърлете", "left:50%;top:500px;transform:translateX(-50%);width:max-content")}
`, 560, 560);

// k-pia-dostatuchno-voda-hranene — аларми за хранене и вода (екран на телефон, Android)
const toggleM = (on) => `<span style="width:52px;height:32px;border-radius:16px;background:${on ? "#0b57d0" : "#79747e"};position:relative;flex-shrink:0"><i style="position:absolute;top:4px;${on ? "right:4px" : "left:4px"};width:24px;height:24px;border-radius:50%;background:#fff"></i></span>`;
const alRow = (t, l, on, ring) => `<div class="${ring ? "ring" : ""}" style="margin:6px 12px;padding:14px 16px;border-radius:22px;background:#f0f4f9;display:flex;align-items:center;gap:12px"><div style="flex:1"><div style="font-size:36px;font-weight:400;letter-spacing:-1px;color:#1f1f1f">${t}</div><div style="font-size:14px;color:#444746;margin-top:2px">${l}</div></div>${toggleM(on)}</div>`;
SHOTS["dom-alarma-hranene"] = () => phone(`
  <div style="height:660px;display:flex;flex-direction:column;position:relative;background:#fff">
    <div style="padding:14px 20px 6px;font-size:24px;color:#1f1f1f">Будилник</div>
    ${alRow("08:30", "Закуска · всеки ден", 1, 1)}${alRow("10:00", "Чаша вода · всеки ден", 1, 1)}${alRow("12:30", "Обяд · всеки ден", 1, 1)}${alRow("15:00", "Чаша вода · всеки ден", 1)}${alRow("18:30", "Вечеря · всеки ден", 1, 1)}
    ${tip("Сложете аларми за хранене и за вода", "left:50%;top:594px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })}
  </div>`, "#fff", "#1f1f1f");

// d-otchitam-elektromer — електромер на две тарифи (измислен, без марка): черни цифри + червена десетична
const reg = (d, red) => `<div style="display:flex;gap:3px;background:#101214;padding:6px 8px;border-radius:5px;box-shadow:inset 0 2px 6px #000,0 1px 0 rgba(255,255,255,.5)">${d.split("").map((c) => `<i style="font-style:normal;width:34px;height:50px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#d8d8d2,#fbfbf6 40%,#e5e5de);color:#15171a;font:600 34px/1 'Roboto Mono',monospace;box-shadow:inset 0 -6px 8px rgba(0,0,0,.18)">${c}</i>`).join("")}${red.split("").map((c) => `<i style="font-style:normal;width:34px;height:50px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#e4c4c0,#fbf0ee 40%,#e9cdca);color:#c4161c;font:600 34px/1 'Roboto Mono',monospace;box-shadow:inset 0 -6px 8px rgba(0,0,0,.18)">${c}</i>`).join("")}</div>`;
SHOTS["dom-elektromer"] = () => scene(`
  <div style="position:relative;width:560px;height:560px;border-radius:18px;overflow:hidden;background:linear-gradient(160deg,#cfd2d4,#b7bbbe);box-shadow:0 18px 40px rgba(15,23,42,.28)">
    <div style="position:absolute;left:70px;top:36px;width:420px;height:360px;border-radius:22px;background:linear-gradient(160deg,#fbfbfb,#dfe2e4 60%,#cdd1d4);box-shadow:inset 0 2px 0 #fff,inset 0 -6px 12px rgba(0,0,0,.18),0 16px 24px rgba(0,0,0,.35)">
      <div style="position:absolute;left:0;right:0;top:20px;text-align:center;font-weight:600;font-size:17px;color:#374151;letter-spacing:.4px">ЕЛЕКТРОМЕР · 230 V · 50 Hz</div>
      <div style="position:absolute;left:36px;top:76px;font-size:14px;color:#374151;font-weight:600">Дневна тарифа</div>
      <div style="position:absolute;left:36px;top:100px">${reg("04218", "7")}</div>
      <div style="position:absolute;left:36px;top:190px;font-size:14px;color:#374151;font-weight:600">Нощна тарифа</div>
      <div style="position:absolute;left:36px;top:214px">${reg("02955", "3")}</div>
      <div style="position:absolute;left:300px;top:150px;font-size:13px;color:#4b5563">kWh</div>
      <div style="position:absolute;left:36px;top:300px;width:348px;height:26px;border-radius:6px;background:repeating-linear-gradient(90deg,#9aa0a6 0 2px,transparent 2px 6px);opacity:.35"></div>
    </div>
    <div class="ring" style="position:absolute;left:94px;top:136px;width:240px;height:68px;border-radius:12px"></div>
    <div class="ring" style="position:absolute;left:94px;top:250px;width:240px;height:68px;border-radius:12px"></div>
    ${tip("Запишете числата от ляво надясно<br>(без тези в червено)", "left:400px;top:425px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "35%" })}
    ${tip("За две тарифи запишете и двете числа<br>(дневна/нощна)", "left:50%;top:500px;transform:translateX(-50%);width:max-content")}
  </div>`, { pad: 30 });

// d-namalia-smetka-tok — примерна сметка за ток с разход по месеци (измислена, без лого на доставчик)
SHOTS["dom-smetka-tok"] = () => deskScene(`
  ${sheet(`<div style="padding:26px 30px">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:18px">Сметка за ток</b><span style="font-size:12.5px;color:#64748b">септември 2026 (пример)</span></div>
      <div style="height:1px;background:#cbd5e1;margin:12px 0 14px"></div>
      ${line("Потребление:", "212 kWh", { fs: 14 })}${line("Сума за плащане:", "38,40 €", { fs: 14 })}
      <div style="font-size:13px;color:#4b5563;margin:16px 0 8px">Разход по месеци (kWh)</div>
      <div class="ring" style="border-radius:12px;padding:12px 10px 8px;display:flex;align-items:flex-end;gap:12px;height:140px">${[["юни", 150], ["юли", 160], ["авг.", 175], ["септ.", 212]].map(([m, v], i) => `<div style="flex:1;text-align:center;font-size:11.5px;color:#475569"><div style="height:${v * 0.5}px;border-radius:4px 4px 0 0;background:${i === 3 ? "#1d4ed8" : "#93b4f0"};margin-bottom:4px"></div>${m}</div>`).join("")}</div>
    </div>`, "left:50px;top:70px;width:430px;height:360px;transform:rotate(-1deg)")}
  ${tip("Следете сметката и сравнявайте месеците", "left:60px;top:460px;width:max-content", { arrow: "u", at: "40%" })}
`, 600, 520);

// Бележник до телефона (три ръководства за социални услуги; текстът е от стъпките)
const pad = (title, items, extra = "") => `
  ${sheet(`<div style="position:absolute;left:0;right:0;top:0;height:26px;background:linear-gradient(180deg,#27478a,#1d3770);border-radius:4px 4px 0 0"></div>
    <div style="padding:46px 30px 20px 52px;position:relative;background-image:repeating-linear-gradient(180deg,transparent 0 33px,#c9d6ee 33px 34px);background-position:0 12px;height:100%;box-sizing:border-box">
      <div style="position:absolute;left:38px;top:26px;bottom:0;width:1px;background:#f1a3a3"></div>
      <div style="font-weight:700;font-size:18px;line-height:34px;color:#1e3a8a;margin-bottom:0">${title}</div>
      ${items.map((t, i) => `<div style="font-size:16px;line-height:34px;color:#1f2a44;font-style:italic">${t}</div>`).join("")}
    </div>`, "left:80px;top:34px;width:430px;height:340px;transform:rotate(-1deg)")}
  ${biro("left:360px;top:410px;width:150px;transform:rotate(-14deg)")}${extra}`;
SHOTS["dom-pomoshti-vazrastni"] = () => deskScene(pad("Дирекция „Социално подпомагане“", ["Опишете нуждата си", "целеви помощи (отопление и др.)", "социален патронаж и домашен помощник", "добавки при ТЕЛК", "↳ придружител: близък или доброволец"],
  tip("Питайте в общината за социален патронаж<br>и домашен помощник", "left:50%;top:470px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })), 600, 540);
SHOTS["dom-socialen-patronazh"] = () => deskScene(pad("Социален патронаж", ["Питам за условията", "Питам за цената за хранене", "Подавам заявление", "(близък може да помогне)", "Уговарям доставката по домовете"],
  tip("Обадете се в общината или<br>Социално подпомагане и питайте за патронаж", "left:50%;top:470px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })), 600, 540);
SHOTS["dom-lichen-asistent"] = () => deskScene(pad("Личен асистент", ["Опишете нуждата си (Соц. подпомагане)", "Условия — често е нужно ТЕЛК решение", "Заявление с нужните документи", "Оценка на нуждите", "При одобрение — асистент/услуга"],
  tip("Помолете близък да помогне с документите", "left:50%;top:470px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "50%" })), 600, 540);

// d-speshni-telefoni-doma — списък с телефони, залепен на хладилник (измислени примерни номера)
SHOTS["dom-speshni-telefoni"] = () => scene(`
  <div style="position:relative;width:560px;height:640px;border-radius:18px;overflow:hidden;background:linear-gradient(100deg,#e9edf0 0%,#f8fafb 28%,#dfe4e8 55%,#f1f4f6 100%);box-shadow:0 18px 40px rgba(15,23,42,.28)">
    <div style="position:absolute;left:0;right:0;top:300px;height:5px;background:#b9c0c7;box-shadow:0 2px 3px rgba(0,0,0,.25)"></div>
    <div style="position:absolute;left:470px;top:70px;width:16px;height:230px;border-radius:8px;background:linear-gradient(90deg,#b8bec5,#eef1f3,#aab1b8);box-shadow:3px 4px 6px rgba(0,0,0,.25)"></div>
    ${sheet(`<div style="padding:22px 26px;font-size:15px">
        <div style="text-align:center;font-weight:700;font-size:20px;margin-bottom:12px">ВАЖНИ ТЕЛЕФОНИ</div>
        <div class="ring" style="display:flex;justify-content:space-between;padding:7px 12px;border-radius:10px;font-weight:700;font-size:20px;margin-bottom:12px"><span>Спешна помощ</span><span>112</span></div>
        ${[["Личен лекар", "0888 123 456"], ["Аптека", "0888 234 567"], ["Близък роднина", "0888 345 678"], ["Съсед", "0888 456 789"]].map(([a, b]) => `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #cfd6df"><span>${a}</span><b style="font-variant-numeric:tabular-nums">${b}</b></div>`).join("")}
        <div style="font-size:11.5px;color:#64748b;margin-top:12px;text-align:center">(примерни номера)</div>
      </div>`, "left:80px;top:90px;width:360px;height:320px;transform:rotate(-1.2deg)")}
    <i style="position:absolute;left:112px;top:84px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ff6b5e,#c62828 70%);box-shadow:0 4px 6px rgba(0,0,0,.4)"></i>
    <i style="position:absolute;left:370px;top:82px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#5b9bff,#1a4fb3 70%);box-shadow:0 4px 6px rgba(0,0,0,.4)"></i>
    ${tip("Включете: 112, личен лекар, аптека,<br>близък роднина, съсед", "left:50%;top:455px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "40%" })}
    ${tip("Залепете го на хладилника или до телефона", "left:50%;top:535px;transform:translateX(-50%);width:max-content")}
  </div>`, { pad: 30 });

// d-podredba-vazhni-dokumenti — класьори с етикети по теми
const binder = (label, color, i) => `<div style="position:relative;width:64px;height:300px;border-radius:5px 5px 3px 3px;background:linear-gradient(90deg,rgba(0,0,0,.25),rgba(255,255,255,.18) 18%,rgba(0,0,0,.05) 60%,rgba(0,0,0,.22));background-color:${color};box-shadow:3px 6px 10px rgba(0,0,0,.35);margin-left:${i ? 3 : 0}px">
  <div style="position:absolute;left:8px;right:8px;top:48px;height:190px;background:#fbfbf6;border-radius:3px;box-shadow:inset 0 0 0 1px #c8c8bd"><div style="writing-mode:vertical-rl;transform:rotate(180deg);height:100%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;color:#1f2937;letter-spacing:.5px">${label}</div></div>
  <div style="position:absolute;left:24px;top:12px;width:16px;height:16px;border-radius:50%;background:#0003;box-shadow:inset 0 2px 3px rgba(0,0,0,.5)"></div></div>`;
SHOTS["dom-podredba-dokumenti"] = () => scene(`
  <div style="position:relative;width:560px;height:520px;border-radius:18px;overflow:hidden;background:linear-gradient(180deg,#d9c4a0 0%,#cdb48a 100%);box-shadow:0 18px 40px rgba(15,23,42,.28)">
    <div style="position:absolute;left:0;right:0;top:340px;height:20px;background:#a9835a;box-shadow:0 8px 14px rgba(0,0,0,.35)"></div>
    <div style="position:absolute;left:0;right:0;top:360px;bottom:0;background:#8a6a47"></div>
    <div style="position:absolute;left:112px;top:56px;display:flex;align-items:flex-end;height:286px">${[["Лични", "#2f5d8c"], ["Здравни", "#b23a3a"], ["Имот", "#3f7d4e"], ["Банка", "#7a5aa6"], ["Сметки", "#c78a1f"]].map(([l, c], i) => binder(l, c, i)).join("")}</div>
    <div class="ring" style="position:absolute;left:100px;top:116px;width:350px;height:210px;border-radius:14px"></div>
    ${tip("Разделете по теми: лични, здравни,<br>имот, банка, сметки", "left:50%;top:410px;transform:translateX(-50%);width:max-content", { arrow: "u", at: "35%" })}
    ${tip("Сложете етикети, за да се ориентирате бързо", "left:50%;top:470px;transform:translateX(-50%);width:max-content")}
  </div>`, { pad: 30 });

// d-celeva-pomosht — молба-декларация (измислен образец) + документ за доходи
SHOTS["dom-celeva-pomosht"] = () => deskScene(`
  ${sheet(`<div style="padding:18px 20px;font-size:12px"><b style="font-size:14px">Служебна бележка за доходи</b><div style="height:10px"></div>${line("Име:", "Иван Петров (пример)", { fs: 12 })}${line("Месец:", "септември 2026", { fs: 12 })}${line("Сума:", "540,00 €", { fs: 12 })}</div>`, "left:330px;top:96px;width:240px;height:170px;transform:rotate(5deg)")}
  ${sheet(`<div style="padding:26px 28px">
      <div style="text-align:center;font-weight:700;font-size:17px;letter-spacing:.3px">МОЛБА-ДЕКЛАРАЦИЯ</div>
      <div style="text-align:center;font-size:12.5px;color:#4b5563;margin:4px 0 18px">за целева помощ за отопление (примерен образец)</div>
      ${line("Трите имена:", "Иван Петров Георгиев (пример)", { fs: 13 })}${line("Адрес:", "гр. Бобов дол, ул. „Примерна“ 1", { fs: 13 })}${line("Телефон:", "0888 123 456", { fs: 13 })}${line("Доходи за месеца:", "540,00 €", { fs: 13 })}
      <div style="font-size:12px;color:#4b5563;line-height:1.5;margin:12px 0 22px">Декларирам, че данните са верни. Приложени документи: документ за самоличност, документ за доходи.</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;font-size:13px"><div class="ring" style="padding:6px 12px;border-radius:10px;background:#fff7d6;font-weight:600">Срок: до 31 октомври</div><div style="width:120px;border-top:1px solid #6b7280;text-align:center;color:#6b7280;padding-top:3px;font-size:12px">подпис</div></div>
    </div>`, "left:30px;top:130px;width:390px;height:370px;transform:rotate(-1.5deg)")}
  ${biro("left:440px;top:470px;width:140px;transform:rotate(-24deg)")}
  ${tip("Попълнете молбата-декларация<br>(помагат на място)", "left:24px;top:30px;width:max-content", { arrow: "d", at: "30%" })}
  ${tip("Пазете копие<br>от документите", "left:400px;top:28px;width:max-content", { arrow: "d", at: "40%" })}
  ${tip("Подайте я в срока<br>(обикновено до 31 октомври)", "left:60px;top:590px;width:max-content", { arrow: "u", at: "30%" })}
`, 600, 690);


SHOTS["dom-tablo-predpazitel"] = { file: "fuse-panel.jpg", credit: CC0("Koefbac"), below: 70,
  blur: [[0.355, 0.2, 0.1, 0.04], [0.46, 0.2, 0.045, 0.04], [0.575, 0.2, 0.09, 0.04], [0.66, 0.2, 0.08, 0.04], [0.74, 0.2, 0.1, 0.04], [0.29, 0.605, 0.1, 0.04], [0.41, 0.605, 0.05, 0.04]],
  rings: [[0.31, 0.15, 0.58, 0.17]],
  tips: [["Проверете предпазителите (таблото):<br>върнете изключен бутон нагоре", 0.5, 1.1, "u", "50%"]] };

SHOTS["dom-detektor-dim"] = { file: "smoke-alarm.jpg", credit: CC0("Sweetie candykim"), below: 70,
  rings: [[0.30, 0.20, 0.32, 0.50, true]],
  tips: [["Тествайте го веднъж месечно с бутона за тест", 0.5, 1.1, "u", "46%"]] };

SHOTS["dom-vaglerod-detektor"] = { file: "co-alarm.jpg", credit: CC0("The EnergySmart Academy, Santa Fe"), below: 70,
  blur: [[0.495, 0.28, 0.07, 0.13], [0.515, 0.54, 0.05, 0.05]],
  rings: [[0.15, 0.17, 0.68, 0.68]],
  tips: [["Сложете детектор за въглероден окис,<br>ако ползвате печка/камина", 0.5, 1.1, "u", "50%"]] };

SHOTS["dom-miris-gaz"] = { file: "gas-burner.jpg", credit: CC0("Lisafern"), below: 70,
  tips: [["НЕ палете огън, цигара или ключ за лампа", 0.5, 1.1, "", ""]] };


(async () => {
  const S = {};
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;
  for (const [name, o] of Object.entries(SHOTS)) {
    if (only && !only.has(name)) continue;
    S[name] = typeof o === "function" ? await o() : await shot(o);
  }
  await render(S);
})().catch((e) => { console.error(e); process.exit(1); });
