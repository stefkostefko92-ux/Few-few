// Генерира самостоятелен HTML за брошурата (с вграден истински QR код и герб),
// после render-brochure.mjs го превръща в PDF/PNG.
//
// За регенериране:  npm i qrcode playwright   после
//   node print/build-brochure.mjs && node print/render-brochure.mjs
import QRCode from "qrcode";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const URL = "https://zabobovdol.carbonstealth.eu";

const qrDataUrl = await QRCode.toDataURL(URL, {
  errorCorrectionLevel: "H",
  margin: 2,
  scale: 16,
  color: { dark: "#141b57ff", light: "#ffffffff" },
});

const crest = `data:image/png;base64,${readFileSync(
  join(ROOT, "public/brand/bobov-dol-grb.png"),
).toString("base64")}`;

const nfcWaves = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 8a10 10 0 0 1 0 8M9.5 6.5a14 14 0 0 1 0 11"/><path d="M14 4.5a18 18 0 0 1 0 15"/></svg>`;
const camIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L18 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`;

const features = [
  ["Важни телефони и услуги", "Община, ГРАО, данъци, полиция, аптека"],
  ["„Как да…“ стъпка по стъпка", "Е-услуги и документи, обяснени просто"],
  ["Дежурна аптека и лекар", "Кой работи сега и до колко часа"],
  ["Пенсии и помощи", "Отопление, ТЕЛК, документи"],
  ["Пази се от измами", "Как да разпознаеш телефонните измами"],
  ["Еврото — въпроси и отговори", "Всичко за прехода към еврото"],
  ["Транспорт", "Такси, влак, автобуси, споделено пътуване"],
  ["Дигитален помощник", "Питай на прост език — отговаря веднага"],
];
const featuresHtml = features
  .map(
    ([t, d]) => `
      <div class="feat"><span class="feat-ic">${check}</span>
        <div><div class="feat-t">${t}</div><div class="feat-d">${d}</div></div></div>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="bg"><head><meta charset="utf-8">
<style>
  :root{--navy:#141b57;--brand:#212f8a;--brand2:#1a2575;--gold:#f3b01f;--gold-soft:#fff8e6;--crimson:#d11f1f;--ink:#1f2430;--muted:#5a6172;--line:#e3e6ef;}
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  html,body{font-family:'DejaVu Sans','Segoe UI',system-ui,Arial,sans-serif;color:var(--ink);}
  @page{size:148mm 210mm;margin:0;}
  .page{position:relative;width:148mm;height:210mm;overflow:hidden;background:#fff;}
  .page.front{page-break-after:always;}
  .hero{height:58mm;background:linear-gradient(160deg,#2a3da6 0%,var(--brand) 45%,var(--brand2) 100%);color:#fff;position:relative;padding:8mm 10mm 0;text-align:center;}
  .hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2.6mm;background:var(--gold);}
  .crest{height:24mm;width:auto;background:#fff;border-radius:3.2mm;padding:2.2mm;box-shadow:0 2mm 6mm rgba(0,0,0,.25);}
  .wordmark{font-size:8.6mm;font-weight:800;letter-spacing:.2mm;margin-top:3.4mm;line-height:1;}
  .slogan{font-size:3.5mm;color:#cdd6f5;margin-top:2.2mm;letter-spacing:.3mm;text-transform:uppercase;}
  .body{padding:6mm 10mm 0;text-align:center;}
  .kicker{display:inline-block;font-size:3mm;font-weight:700;letter-spacing:1.2mm;color:var(--brand);text-transform:uppercase;background:var(--gold-soft);border:.3mm solid #f6e2ad;padding:1.4mm 3.4mm;border-radius:20mm;}
  .headline{font-size:9mm;font-weight:800;color:var(--navy);line-height:1.05;margin-top:4mm;letter-spacing:-.2mm;}
  .headline b{color:var(--brand);}
  .lead{font-size:3.9mm;color:var(--muted);margin-top:3mm;line-height:1.4;max-width:115mm;margin-left:auto;margin-right:auto;}
  .cta{display:flex;gap:6mm;padding:5mm 10mm 0;align-items:stretch;}
  .card{flex:1;border:.4mm solid var(--line);border-radius:4mm;padding:4.5mm 4mm;text-align:center;display:flex;flex-direction:column;align-items:center;background:#fff;box-shadow:0 1mm 4mm rgba(20,27,87,.06);}
  .card .tag{display:flex;align-items:center;gap:1.6mm;font-size:3.5mm;font-weight:800;color:var(--brand);text-transform:uppercase;letter-spacing:.5mm;margin-bottom:3mm;}
  .card .tag svg{width:5mm;height:5mm;}
  .qr{width:38mm;height:38mm;display:block;}
  .qr-note{font-size:3.1mm;color:var(--muted);margin-top:2.6mm;line-height:1.3;}
  .url{font-size:3mm;font-weight:800;color:var(--navy);margin-top:1.5mm;white-space:nowrap;letter-spacing:-.1mm;}
  .nfc{background:linear-gradient(160deg,#fffdf6,#fff8e6);border-color:#f3d98f;}
  .nfc .big{font-size:4.4mm;font-weight:800;color:var(--brand2);line-height:1.15;margin-bottom:3mm;}
  .nfc-spot{width:34mm;height:34mm;border-radius:50%;border:.7mm dashed var(--gold);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--gold);background:rgba(243,176,31,.06);}
  .nfc-spot svg{width:11mm;height:11mm;}
  .nfc-spot .lbl{font-size:3mm;font-weight:800;color:#9a6a00;letter-spacing:.6mm;margin-top:1mm;}
  .nfc-hint{font-size:3mm;color:#8a6a1a;margin-top:3mm;line-height:1.3;}
  .front-foot{position:absolute;left:0;right:0;bottom:0;height:13mm;background:var(--navy);color:#cdd6f5;display:flex;align-items:center;justify-content:center;gap:2mm;font-size:3.1mm;text-align:center;padding:0 8mm;}
  .front-foot b{color:#fff;}
  .back{padding:11mm 10mm 0;}
  .back-h{font-size:7.2mm;font-weight:800;color:var(--navy);line-height:1.1;}
  .back-h span{color:var(--brand);}
  .back-sub{font-size:3.6mm;color:var(--muted);margin-top:2.4mm;line-height:1.4;}
  .grid{margin-top:7mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm 5mm;}
  .feat{display:flex;gap:2.6mm;align-items:flex-start;}
  .feat-ic{flex:none;width:6mm;height:6mm;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;margin-top:.4mm;}
  .feat-ic svg{width:3.6mm;height:3.6mm;}
  .feat-t{font-size:3.7mm;font-weight:800;color:var(--ink);line-height:1.15;}
  .feat-d{font-size:3.1mm;color:var(--muted);line-height:1.25;margin-top:.6mm;}
  .promise{margin:8mm 0 0;background:var(--brand);color:#fff;border-radius:4mm;padding:5mm 6mm;text-align:center;}
  .promise .p1{font-size:4.6mm;font-weight:800;}
  .promise .p2{font-size:3.4mm;color:#cdd6f5;margin-top:1.6mm;line-height:1.4;}
  .er{display:flex;align-items:center;gap:3mm;margin-top:6mm;border:.5mm solid #f3b4b4;background:#fdeced;border-radius:3mm;padding:3.5mm 4.5mm;}
  .er .n{font-size:8mm;font-weight:800;color:var(--crimson);line-height:1;}
  .er .t{font-size:3.3mm;color:#7a1818;line-height:1.3;}
  .er .t b{color:var(--crimson);}
  .back-foot{position:absolute;left:0;right:0;bottom:0;height:26mm;border-top:.4mm solid var(--line);display:flex;align-items:center;gap:5mm;padding:0 10mm;}
  .back-foot .miniqr{width:20mm;height:20mm;}
  .back-foot .bf-t{flex:1;}
  .back-foot .bf-t .a{font-size:4mm;font-weight:800;color:var(--navy);}
  .back-foot .bf-t .b{font-size:3.2mm;color:var(--muted);margin-top:1mm;line-height:1.35;}
  .back-foot .bf-t .b b{color:var(--brand);}
</style></head>
<body>
  <section class="page front">
    <div class="hero">
      <img class="crest" src="${crest}" alt="Герб на Бобов дол">
      <div class="wordmark">За Бобов дол</div>
      <div class="slogan">Всичко за Бобов дол на едно място</div>
    </div>
    <div class="body">
      <span class="kicker">Граждански портал</span>
      <div class="headline">Целият Бобов дол —<br><b>в телефона ви</b></div>
      <div class="lead">Важни телефони, услуги и обяснения „как да…“ стъпка по стъпка. Лесно, безплатно и създадено за хората.</div>
    </div>
    <div class="cta">
      <div class="card">
        <div class="tag">${camIcon} Сканирай кода</div>
        <img class="qr" src="${qrDataUrl}" alt="QR код към сайта">
        <div class="qr-note">Насочете камерата на телефона към кода</div>
        <div class="url">zabobovdol.carbonstealth.eu</div>
      </div>
      <div class="card nfc">
        <div class="big">Доближи<br>телефона си</div>
        <div class="nfc-spot">${nfcWaves}<div class="lbl">NFC</div></div>
        <div class="nfc-hint">Допрете телефона тук —<br>сайтът се отваря сам</div>
      </div>
    </div>
    <div class="front-foot">
      <span>Независим граждански проект в полза на жителите на Бобов дол · <b>zabobovdol.carbonstealth.eu</b></span>
    </div>
  </section>
  <section class="page back-page">
    <div class="back">
      <div class="back-h">Какво ще намерите <span>в сайта</span></div>
      <div class="back-sub">Всичко важно за ежедневието в Бобов дол — на едно място, на разбираем език.</div>
      <div class="grid">${featuresHtml}</div>
      <div class="promise">
        <div class="p1">Безплатно. Без регистрация. Лесно.</div>
        <div class="p2">С едър текст, тъмен режим и помощ за достъпност — направено специално за възрастните хора.</div>
      </div>
      <div class="er">
        <div class="n">112</div>
        <div class="t"><b>При спешност</b> се обадете на единния европейски номер 112 — полиция, спешна помощ и пожарна, денонощно.</div>
      </div>
    </div>
    <div class="back-foot">
      <img class="miniqr" src="${qrDataUrl}" alt="QR код">
      <div class="bf-t">
        <div class="a">Отворете сайта сега</div>
        <div class="b">Сканирайте кода или допрете телефона до NFC стикера на лицевата страна. <b>zabobovdol.carbonstealth.eu</b></div>
        <div class="b" style="margin-top:2mm;">Изработка и поддръжка: Carbon Stealth VCC · carbonstealth.eu</div>
      </div>
    </div>
  </section>
</body></html>`;

writeFileSync(join(HERE, "brochure-a5.html"), html);
console.log("Wrote print/brochure-a5.html");
