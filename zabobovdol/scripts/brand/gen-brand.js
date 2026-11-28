// Генератор на знака и иконите на „За Бобов дол“ — растерни PNG (без SVG).
//
// Защо (27.11.2026): гербът на Община Бобов дол беше лице на сайта (горната
// лента, иконата на приложението, картинката за споделяне, печатът). Правният
// разбирач: не можем да го ползваме така — сайтът е независим, има реклами,
// а гербът внушава, че е официалният на общината (Дир. 2005/29, чл. 6(1)(c)/(f));
// наредбата на общината за символите не е проверена. Затова собствен знак:
// монограм „БД“ (като favicon.svg) в цветовете на логото — тъмносиньо, Bitter,
// златна черта и трикольорна лента.
//
//   node scripts/brand/gen-brand.js          (от zabobovdol/)
//
// Пише: public/brand/za-bobov-dol-mark.png (512, заоблени ъгли, прозрачен фон),
// public/icon-192.png, public/icon-512.png (пълен квадрат — iOS не обича
// прозрачност), public/icon-512-maskable.png (съдържанието в безопасната зона 80 %),
// public/og.png (1200×630), android/store/feature-graphic.png (1024×500, Google Play).
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "../..");
const FONTS = path.join(ROOT, "scripts/howto-mockups/assets/fonts");
const furl = (...p) => pathToFileURL(path.join(FONTS, ...p)).href;
const CYR = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
const LAT = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const face = (family, dir, prefix, w) =>
  [["cyrillic", CYR], ["latin", LAT]]
    .map(([s, r]) => `@font-face{font-family:'${family}';font-weight:${w};src:url('${furl(dir, `${prefix}-${s}-${w}-normal.woff2`)}') format('woff2');unicode-range:${r}}`)
    .join("");
const FONT_CSS = [face("Bitter", "bitter", "bitter", 800), ...[400, 600, 700].map((w) => face("Inter", "inter", "inter", w))].join("");

// Цветовете на логото (public/brand/za-bobov-dol-logo.png) и на tailwind.config.ts.
const NAVY = "#1a2575"; // brand-800
const NAVY_DEEP = "#141b57"; // brand-900
const GOLD = "#fbc94a"; // gold-300
const FLAG = "linear-gradient(90deg,#ffffff 0 33.34%,#00966e 33.34% 66.67%,#d62612 66.67% 100%)";

/** Знакът в квадрат със страна s: лента, „БД“, златна черта. `pad` — вътрешно поле (за maskable). */
function mark(s, { radius = 0.22, pad = 0, bg = NAVY, ring = "" } = {}) {
  const inner = s * (1 - 2 * pad);
  return `<div class="m" style="width:${s}px;height:${s}px;border-radius:${s * radius}px;background:${bg};position:relative;overflow:hidden;${ring}">
    <div style="position:absolute;left:0;right:0;top:0;height:${(s * 0.07).toFixed(1)}px;background:${FLAG}"></div>
    <div style="position:absolute;left:${s * pad}px;top:${s * pad}px;width:${inner}px;height:${inner}px;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div style="font:800 ${(inner * 0.46).toFixed(1)}px/1 Bitter;color:#fff;letter-spacing:${(-inner * 0.012).toFixed(1)}px;margin-top:${(inner * 0.06).toFixed(1)}px">БД</div>
      <div style="width:${(inner * 0.36).toFixed(1)}px;height:${(inner * 0.055).toFixed(1)}px;border-radius:${inner}px;background:${GOLD};margin-top:${(inner * 0.07).toFixed(1)}px"></div>
    </div>
  </div>`;
}

const page = (body, w, h, bg = "transparent") =>
  `<!doctype html><html lang="bg"><head><meta charset="utf-8"><style>${FONT_CSS}html,body{margin:0;background:${bg}}#c{width:${w}px;height:${h}px;position:relative;overflow:hidden}</style></head><body><div id="c">${body}</div></body></html>`;

const OG = page(
  `<div style="position:absolute;inset:0;background:${NAVY}"></div>
   <div style="position:absolute;left:0;right:0;top:0;height:14px;background:${FLAG}"></div>
   <div style="position:absolute;left:-10%;right:-10%;bottom:-150px;height:230px;border-radius:50%;background:${NAVY_DEEP};opacity:.9"></div>
   <div style="position:absolute;left:84px;top:100px">${mark(150, { bg: NAVY_DEEP, ring: "box-shadow:0 0 0 3px rgba(255,255,255,.22),0 10px 30px rgba(0,0,0,.35)" })}</div>
   <div style="position:absolute;left:268px;top:84px;right:60px">
     <div style="font:800 112px/1.05 Bitter;color:#fff;letter-spacing:-1px">За Бобов дол</div>
     <div style="width:120px;height:8px;border-radius:8px;background:${GOLD};margin:26px 0 30px"></div>
     <div style="font:700 40px/1.3 Inter;color:#fff">Независим граждански портал —</div>
     <div style="font:700 40px/1.3 Inter;color:${GOLD}">не е сайтът на Община Бобов дол</div>
     <div style="font:400 28px/1.4 Inter;color:#d9e0f6;margin-top:22px">Важни телефони · „Как да…“ · Дежурна аптека · Събития</div>
   </div>
   <div style="position:absolute;left:84px;bottom:36px;font:600 30px/1 Inter;color:#d9e0f6">zabobovdol.carbonstealth.eu</div>`,
  1200,
  630,
);

// Графиката за Google Play (1024×500) — без герба, с уговорката за независимост.
const chip = (t) => `<span style="display:inline-block;padding:8px 18px;margin:0 10px 12px 0;border-radius:999px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);font:700 22px/1.2 Inter;color:#fff">${t}</span>`;
const FEATURE = page(
  `<div style="position:absolute;inset:0;background:linear-gradient(135deg,#2a3da6 0%,${NAVY} 55%,${NAVY_DEEP} 100%)"></div>
   <div style="position:absolute;left:0;right:0;top:0;height:10px;background:${FLAG}"></div>
   <div style="position:absolute;left:0;right:0;bottom:0;height:10px;background:${GOLD}"></div>
   <div style="position:absolute;left:84px;top:140px">${mark(220, { bg: NAVY_DEEP, ring: "box-shadow:0 0 0 3px rgba(255,255,255,.22),0 14px 36px rgba(0,0,0,.4)" })}</div>
   <div style="position:absolute;left:360px;top:96px;right:40px">
     <div style="font:800 76px/1.05 Bitter;color:#fff">За Бобов дол</div>
     <div style="font:700 28px/1.3 Inter;color:${GOLD};margin:14px 0 22px">Независим граждански портал —<br>не е сайтът на Общината</div>
     <div>${["Телефони", "Дежурна аптека", "Как да…", "Обяви"].map(chip).join("")}</div>
   </div>`,
  1024,
  500,
);

const JOBS = [
  { out: "public/brand/za-bobov-dol-mark.png", html: page(mark(512), 512, 512), w: 512, h: 512, transparent: true },
  { out: "public/icon-512.png", html: page(mark(512, { radius: 0 }), 512, 512), w: 512, h: 512 },
  { out: "public/icon-192.png", html: page(mark(192, { radius: 0 }), 192, 192), w: 192, h: 192 },
  // Maskable: платформата реже кръг/капка — съдържанието е в безопасната зона (кръг с радиус 40 %).
  { out: "public/icon-512-maskable.png", html: page(mark(512, { radius: 0, pad: 0.16 }), 512, 512), w: 512, h: 512 },
  { out: "public/og.png", html: OG, w: 1200, h: 630 },
  { out: "android/store/feature-graphic.png", html: FEATURE, w: 1024, h: 500 },
];

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "brand-"));
  const browser = await chromium.launch();
  for (const j of JOBS) {
    const p = await browser.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });
    const f = path.join(tmp, "b.html");
    fs.writeFileSync(f, j.html);
    await p.goto(pathToFileURL(f).href, { waitUntil: "load" });
    // Всички @font-face изрично (иначе се зарежда само ползваното) — после проверка.
    await p.evaluate(() => Promise.all([...document.fonts].map((f) => f.load())));
    const ok = await p.evaluate(() => document.fonts.check("800 40px Bitter", "БД") && document.fonts.check("700 20px Inter", "Бобов"));
    if (!ok) throw new Error("шрифтовете не са заредени — провери scripts/howto-mockups/assets/fonts/");
    await (await p.$("#c")).screenshot({ path: path.join(ROOT, j.out), omitBackground: !!j.transparent });
    await p.close();
    console.log("✔", j.out);
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
