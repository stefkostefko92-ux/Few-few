// Генерира самостоятелен HTML за печатната А5 брошура (лого, QR код и шрифтове
// са вградени като data URI — нула външни заявки), после render-brochure.mjs
// го превръща в PDF/PNG. Всички данни са от сайта — не измисляй цени/часове.
//
// За регенериране:  npm i qrcode playwright   после
//   node print/build-brochure.mjs && node print/render-brochure.mjs
import QRCode from "qrcode";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const URL = "https://evanita-bg.com";

const qr = await QRCode.toDataURL(URL + "/", {
  errorCorrectionLevel: "H",
  margin: 2,
  scale: 16,
  color: { dark: "#3D0F18ff", light: "#FFFFFFff" },
});

const logo = `data:image/png;base64,${readFileSync(join(ROOT, "images/logo_full.png")).toString("base64")}`;

// Вградени брандови шрифтове (OFL): Cormorant Garamond носи кирилица,
// Outfit е само латиница (за „EVANITA SPORT“/цифри) — кирилският текст
// в Outfit контексти пада към DejaVu Sans (наличен в Chromium).
const CYR = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const font = (file, fam, weight, style, range) =>
  `@font-face{font-family:'${fam}';font-style:${style};font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(join(HERE, "fonts", file)).toString("base64")}) format('woff2');unicode-range:${range};}`;
const fonts = [
  font("CormorantGaramond-300-normal-cyrillic.woff2", "Cormorant Garamond", 300, "normal", CYR),
  font("CormorantGaramond-300-normal-latin.woff2", "Cormorant Garamond", 300, "normal", LAT),
  font("CormorantGaramond-400-normal-cyrillic.woff2", "Cormorant Garamond", 400, "normal", CYR),
  font("CormorantGaramond-400-normal-latin.woff2", "Cormorant Garamond", 400, "normal", LAT),
  font("CormorantGaramond-400-italic-cyrillic.woff2", "Cormorant Garamond", 400, "italic", CYR),
  font("CormorantGaramond-400-italic-latin.woff2", "Cormorant Garamond", 400, "italic", LAT),
  font("CormorantGaramond-500-normal-cyrillic.woff2", "Cormorant Garamond", 500, "normal", CYR),
  font("CormorantGaramond-500-normal-latin.woff2", "Cormorant Garamond", 500, "normal", LAT),
  font("CormorantGaramond-500-italic-cyrillic.woff2", "Cormorant Garamond", 500, "italic", CYR),
  font("CormorantGaramond-500-italic-latin.woff2", "Cormorant Garamond", 500, "italic", LAT),
  font("Outfit-300-normal-latin.woff2", "Outfit", 300, "normal", LAT),
  font("Outfit-500-normal-latin.woff2", "Outfit", 500, "normal", LAT),
  font("Outfit-600-normal-latin.woff2", "Outfit", 600, "normal", LAT),
].join("\n");

const phoneIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1 .37 1.96.72 2.88a2 2 0 0 1-.45 2.11L8.09 10.09a16 16 0 0 0 6 6l1.38-1.38a2 2 0 0 1 2.11-.45c.92.35 1.88.59 2.88.72A2 2 0 0 1 22 16.92z"/></svg>`;
const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;
const pin = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
const clock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const car = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9 17V7h4.5a3 3 0 0 1 0 6H9"/></svg>`;

const perks = [
  ["Само за жени", "Без напрегнати погледи — само ти и момичетата."],
  ["Канго обувки включени", "Всички размери те чакат на рафта."],
  ["Нула болка в коленете", "Пружината поглъща 80% от удара."],
];
const perksHtml = perks
  .map(([t, d]) => `<div class="perk"><span class="pk-ic">${check}</span><div><div class="pk-t">${t}</div><div class="pk-d">${d}</div></div></div>`)
  .join("\n      ");

const html = `<!doctype html>
<html lang="bg"><head><meta charset="utf-8">
<title>Evanita Sport · Рекламна брошура А5</title>
<meta name="keywords" content="Evanita Sport, Kangoo Jumps Дупница, кангу джъмп, дамско студио Дупница, брошура А5, Carbon Stealth">
<style>
${fonts}
  :root{--cream:#FAF6F0;--cream2:#F2EBDF;--blush-bg:#F7E8E2;--blush:#E8C5C0;--blush-soft:#F4D8D0;
    --rose:#9E2A3D;--wine:#5A1722;--wine-deep:#3D0F18;--ink:#1F141C;--gold:#C9A876;--viber:#7360F2;
    --line:rgba(31,20,28,.16);}
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  html,body{font-family:'Outfit','DejaVu Sans',sans-serif;font-weight:300;color:var(--ink);}
  .serif{font-family:'Cormorant Garamond',serif;}
  @page{size:148mm 210mm;margin:0;}
  .page{position:relative;width:148mm;height:210mm;overflow:hidden;background:var(--cream);}
  .page.front{page-break-after:always;}

  /* ── ЛИЦЕ ── */
  .front::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 12%,var(--blush-soft) 0%,transparent 52%);opacity:.6;}
  .frame{position:absolute;inset:5mm;border:.25mm solid rgba(158,42,61,.4);pointer-events:none;}
  .frame::before,.frame::after{content:"";position:absolute;width:9mm;height:9mm;border:.45mm solid var(--rose);}
  .frame::before{top:-.45mm;left:-.45mm;border-right:none;border-bottom:none;}
  .frame::after{bottom:-.45mm;right:-.45mm;border-left:none;border-top:none;}
  .f-inner{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;text-align:center;padding:13mm 12mm 0;}
  .logo{height:36mm;width:auto;}
  .eyebrow{display:inline-flex;align-items:center;gap:3mm;margin-top:5mm;font-size:2.7mm;letter-spacing:.9mm;text-transform:uppercase;color:var(--wine);font-weight:500;font-family:'Outfit','DejaVu Sans',sans-serif;}
  .eyebrow::before,.eyebrow::after{content:"";width:9mm;height:.25mm;background:var(--rose);}
  h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:13.6mm;line-height:.94;letter-spacing:-.2mm;color:var(--wine-deep);margin-top:5.5mm;}
  h1 .it{font-style:italic;font-weight:400;color:var(--rose);display:block;}
  .lede{font-size:3.5mm;line-height:1.5;color:var(--ink);max-width:98mm;margin-top:5mm;}
  .lede em{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.12em;color:var(--wine);}
  .perks{margin-top:6.5mm;display:flex;flex-direction:column;gap:3.2mm;text-align:left;}
  .perk{display:flex;gap:2.8mm;align-items:flex-start;width:88mm;}
  .pk-ic{flex:none;width:5.6mm;height:5.6mm;border-radius:50%;background:var(--rose);color:var(--cream);display:flex;align-items:center;justify-content:center;margin-top:.3mm;}
  .pk-ic svg{width:3.2mm;height:3.2mm;}
  .pk-t{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:4.6mm;color:var(--wine-deep);line-height:1.1;}
  .pk-d{font-size:3mm;color:var(--ink);opacity:.75;margin-top:.5mm;}
  .f-foot{position:absolute;left:0;right:0;bottom:0;background:var(--wine-deep);color:var(--cream);padding:5.5mm 10mm 6mm;text-align:center;}
  .f-foot .call{font-size:3mm;letter-spacing:.8mm;text-transform:uppercase;color:var(--blush);font-weight:500;}
  .f-foot .tel{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:8.6mm;line-height:1.15;margin-top:1.2mm;display:flex;align-items:center;justify-content:center;gap:2.6mm;}
  .f-foot .tel svg{width:5.4mm;height:5.4mm;color:var(--blush);}
  .f-foot .sub{font-size:3mm;color:var(--blush);margin-top:1.6mm;}
  .f-foot .sub b{color:#fff;font-weight:500;}
  .viber-pill{display:inline-block;background:var(--viber);color:#fff;border-radius:10mm;padding:.7mm 3mm;font-size:2.7mm;font-weight:500;letter-spacing:.3mm;vertical-align:middle;}

  /* ── ГРЪБ ── */
  .back{padding:9mm 10mm 0;}
  .b-h{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:8.4mm;line-height:1;color:var(--wine-deep);}
  .b-h .it{font-style:italic;color:var(--rose);}
  .progs{display:flex;gap:4mm;margin-top:4.5mm;}
  .prog{flex:1;border:.3mm solid var(--line);border-radius:3mm;padding:4mm 4mm 3.6mm;background:#fff;}
  .prog.feat{background:linear-gradient(165deg,#FFFBF6,#F9EAE5);border-color:var(--blush);}
  .prog .num{font-family:'Cormorant Garamond',serif;font-size:2.8mm;letter-spacing:.5mm;color:var(--wine);margin-bottom:1.6mm;}
  .prog .nm{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:6mm;line-height:1;color:var(--wine-deep);}
  .prog .nm .it{font-style:italic;color:var(--rose);}
  .prog .tag{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:3.3mm;color:var(--rose);margin-top:1.4mm;line-height:1.2;}
  .prog .meta{display:flex;gap:4mm;margin-top:2.6mm;padding-top:2.2mm;border-top:.25mm solid var(--line);font-size:2.4mm;letter-spacing:.3mm;text-transform:uppercase;color:var(--wine);}
  .prog .meta b{display:block;font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:500;font-size:3.4mm;color:var(--wine-deep);text-transform:none;letter-spacing:0;margin-top:.4mm;}
  .sched{width:100%;border-collapse:collapse;margin-top:4.5mm;border:.3mm solid var(--line);border-radius:3mm;overflow:hidden;font-size:2.9mm;background:#fff;}
  .sched th{background:var(--wine-deep);color:var(--cream);font-family:'Cormorant Garamond',serif;font-style:italic;font-weight:400;font-size:3.1mm;padding:2.4mm 2mm;text-align:left;}
  .sched th:first-child{color:var(--blush);}
  .sched td{padding:2.4mm 2mm;border-top:.25mm solid var(--line);border-right:.25mm solid var(--line);vertical-align:top;}
  .sched td:last-child{border-right:none;}
  .sched td.time{background:rgba(232,197,192,.18);font-family:'Cormorant Garamond',serif;font-weight:500;font-size:3.6mm;color:var(--wine-deep);white-space:nowrap;}
  .sched td.k{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:3.3mm;color:var(--rose);}
  .sched td.s{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:3.3mm;color:var(--wine-deep);}
  .sched td.e{color:rgba(31,20,28,.35);text-align:center;font-family:'Cormorant Garamond',serif;font-style:italic;}
  .price{margin-top:4.5mm;background:linear-gradient(165deg,#FFFBF6,#F9EAE5);border:.3mm solid var(--blush);border-radius:3mm;padding:3.6mm 5mm;text-align:center;}
  .price .p1{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:4.4mm;color:var(--wine-deep);line-height:1.3;}
  .price .p1 b{font-style:normal;font-weight:500;color:var(--rose);}
  .price .p2{font-size:2.9mm;color:var(--ink);opacity:.75;margin-top:1.2mm;}
  .b-foot{position:absolute;left:0;right:0;bottom:0;background:var(--blush-bg);border-top:.3mm solid var(--line);padding:4.5mm 10mm 4mm;display:flex;gap:5mm;align-items:center;}
  .qr-box{flex:none;text-align:center;}
  .qr{width:26mm;height:26mm;display:block;border:.3mm solid var(--line);border-radius:2mm;background:#fff;padding:1mm;}
  .qr-note{font-size:2.4mm;color:var(--wine);margin-top:1.2mm;font-weight:500;letter-spacing:.2mm;}
  .contacts{flex:1;}
  .c-row{display:flex;gap:2.4mm;align-items:flex-start;margin-bottom:1.8mm;}
  .c-row svg{flex:none;width:3.6mm;height:3.6mm;color:var(--rose);margin-top:.3mm;}
  .c-row .t{font-size:3mm;line-height:1.3;color:var(--ink);}
  .c-row .t b{font-weight:500;color:var(--wine-deep);}
  .c-url{font-family:'Cormorant Garamond',serif;font-weight:500;font-size:3.8mm;color:var(--wine-deep);margin-top:.8mm;}
  .c-credit{font-size:2.1mm;color:rgba(31,20,28,.5);margin-top:1.6mm;letter-spacing:.2mm;white-space:nowrap;}
  .c-credit b{color:var(--wine);font-weight:500;}
</style></head>
<body>

  <section class="page front">
    <div class="frame"></div>
    <div class="f-inner">
      <img class="logo" src="${logo}" alt="Evanita Sport">
      <span class="eyebrow">Дамско студио · Дупница</span>
      <h1>Тук жените<br>не тренират.<span class="it">Тук жените летят.</span></h1>
      <p class="lede">Обуваш Канго обувките, пускаш музиката и <em>просто скачаш</em> — без болка, без напрежение, без извинения. Kangoo Jumps и силови тренировки, водени лично от лицензирания инструктор <em>Евелина Георгиева</em>.</p>
      <div class="perks">
      ${perksHtml}
      </div>
    </div>
    <div class="f-foot">
      <div class="call">Обади се и ела</div>
      <div class="tel">${phoneIcon} +359 88 504 5112</div>
      <div class="sub">телефон &amp; <span class="viber-pill">Viber</span> · <b>ул. Рилски Езера 1, Дупница</b> · Пон–Пет 08:00–20:00</div>
    </div>
  </section>

  <section class="page back">
    <div class="b-h">Две тренировки.<br>Един <span class="it">нов начин</span> да се чувстваш добре.</div>
    <div class="progs">
      <div class="prog feat">
        <div class="num">/ 01 — визитна картичка</div>
        <div class="nm">Kangoo<span class="it"> Jumps</span></div>
        <div class="tag">кардиото, за което ще разказваш на приятелките</div>
        <div class="meta"><div>Времетраене<b>60 мин</b></div><div>Калории<b>~800</b></div><div>Обувки<b>включени</b></div></div>
      </div>
      <div class="prog">
        <div class="num">/ 02</div>
        <div class="nm">Силова<span class="it"> тренировка</span></div>
        <div class="tag">гири, TRX, дъмбели — тонизираш и стягаш</div>
        <div class="meta"><div>Времетраене<b>60 мин</b></div><div>Оборудване<b>пълно</b></div><div>Ниво<b>всяко</b></div></div>
      </div>
    </div>
    <table class="sched">
      <tr><th>Час</th><th>Пон</th><th>Вт</th><th>Ср</th><th>Чет</th><th>Пет</th></tr>
      <tr><td class="time">08:00</td><td class="e">—</td><td class="k">Kangoo</td><td class="e">—</td><td class="k">Kangoo</td><td class="e">—</td></tr>
      <tr><td class="time">17–20 ч.</td><td class="s">Силова</td><td class="e">—</td><td class="s">Силова</td><td class="e">—</td><td class="s">Силова</td></tr>
      <tr><td class="time">19:00</td><td class="k">Kangoo</td><td class="k">Kangoo</td><td class="e">—</td><td class="k">Kangoo</td><td class="e">—</td></tr>
    </table>
    <div class="price">
      <div class="p1">Без готови пакети — Евелина ти прави <b>индивидуална комбинация</b>.</div>
      <div class="p2">Обади се, разкажи какво искаш да постигнеш, и ще получиш оферта, която има смисъл за теб.</div>
    </div>
    <div class="b-foot">
      <div class="qr-box">
        <img class="qr" src="${qr}" alt="QR код към сайта">
        <div class="qr-note">Сканирай и виж залата</div>
      </div>
      <div class="contacts">
        <div class="c-row">${pin}<div class="t"><b>ул. Рилски Езера 1</b>, 2600 Дупница</div></div>
        <div class="c-row">${phoneIcon}<div class="t"><b>+359 88 504 5112</b> · телефон и Viber</div></div>
        <div class="c-row">${clock}<div class="t">Понеделник – Петък · <b>08:00 – 20:00</b></div></div>
        <div class="c-row">${car}<div class="t">Безплатен паркинг пред входа</div></div>
        <div class="c-url">evanita-bg.com</div>
        <div class="c-credit">© 2026 Еванита Спорт ЕООД · Design &amp; Development: <b>Carbon Stealth VCC</b></div>
      </div>
    </div>
  </section>

</body></html>
`;

writeFileSync(join(HERE, "brochure-a5.html"), html);
console.log(`Написах brochure-a5.html (${(html.length / 1024) | 0}K, шрифтове+лого+QR вградени)`);
