#!/usr/bin/env node
// render-og.mjs — рендира images/og.jpg (1200×630) и images/apple-touch-icon.png (180×180) от HTML
// шаблон с истинските шрифтове на сайта през headless Chromium (playwright-core + локалния Chromium
// от PLAYWRIGHT_BROWSERS_PATH; никога не сваля браузър). Пуска се при промяна на бранда/заглавието.
//
//   cd vfr && npm i && npm run og

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Шрифтовете се вграждат като data: URI — <link> към file:// не се зарежда от about:blank (setContent).
const font = async (f) => `url(data:font/woff2;base64,${(await readFile(join(ROOT, "fonts", f))).toString("base64")}) format("woff2")`;
const FONT_CSS = `@font-face{font-family:Sora;font-weight:100 800;src:${await font("sora-latin.woff2")}}@font-face{font-family:Inter;font-weight:100 900;src:${await font("inter-latin.woff2")}}`;

const OG_HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<style>${FONT_CSS}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#131416;color:#f4f1eb;font-family:Inter,system-ui,sans-serif}
.wrap{position:relative;width:1200px;height:630px;padding:72px 80px;box-sizing:border-box;
background:radial-gradient(circle at 82% 30%,rgba(227,154,76,.35),transparent 42%),
repeating-linear-gradient(0deg,rgba(255,255,255,.045) 0 1px,transparent 1px 60px),
repeating-linear-gradient(90deg,rgba(255,255,255,.045) 0 1px,transparent 1px 60px),#131416}
.eyebrow{font-family:Sora;font-size:18px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#e39a4c;display:flex;align-items:center;gap:14px}
.eyebrow::before{content:"";width:34px;height:3px;background:#c9772b;border-radius:2px}
h1{font-family:Sora;font-size:76px;font-weight:800;line-height:1.02;letter-spacing:-.035em;margin:34px 0 0;max-width:820px}
h1 span{color:#e39a4c}
.lede{font-size:26px;color:#a3a8b1;margin-top:28px;max-width:720px;line-height:1.35}
.foot{position:absolute;left:80px;right:80px;bottom:60px;display:flex;justify-content:space-between;align-items:flex-end;font-size:22px;color:#a3a8b1}
.brand{display:flex;align-items:center;gap:16px;font-family:Sora;font-weight:800;font-size:30px;letter-spacing:.08em;color:#f4f1eb}
.brand svg{width:56px;height:56px}
.coil{position:absolute;right:88px;top:90px;width:250px;height:250px;border-radius:50%;background:radial-gradient(circle at 38% 34%,#f0b06a,#c9772b 45%,#7a4416);box-shadow:0 40px 80px -30px rgba(0,0,0,.9)}
.coil::before{content:"";position:absolute;inset:22px;border-radius:50%;border:3px solid rgba(122,68,22,.55);box-shadow:inset 0 0 0 20px transparent,0 0 0 22px rgba(247,197,138,.35) inset}
.coil::after{content:"";position:absolute;inset:100px;border-radius:50%;background:#2a1a0c}
.plate{position:absolute;right:-60px;bottom:-120px;width:520px;height:220px;background:linear-gradient(135deg,#5b616b,#2c3036 45%,#15171a);transform:rotate(-28deg);border-radius:14px;box-shadow:0 30px 60px -20px rgba(0,0,0,.8)}
</style></head><body><div class="wrap">
<div class="plate"></div><div class="coil"></div>
<div class="eyebrow">Fino Mornasco · Provincia di Como</div>
<h1>Rottami, sgomberi<br>e imbiancature.<br><span>Una sola chiamata.</span></h1>
<p class="lede">Ritiro rottami e metalli, sgomberi di case e uffici, tinteggiature di interni. Preventivo gratuito.</p>
<div class="foot"><div class="brand"><svg viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="12" fill="#1b1d21" stroke="#c9772b" stroke-width="2"/><path d="M13 15 24 36 35 15" fill="none" stroke="#f4f1eb" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 11h10" stroke="#e39a4c" stroke-width="5" stroke-linecap="round"/></svg>V.F.R.</div><div>+39 377 442 3899</div></div>
</div></body></html>`;

const ICON_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:180px;height:180px;background:#1b1d21}svg{display:block;width:180px;height:180px}</style></head>
<body><svg viewBox="0 0 48 48"><rect width="48" height="48" fill="#1b1d21"/><path d="M12 15 24 37 36 15" fill="none" stroke="#f4f1eb" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M27 10h11" stroke="#e39a4c" stroke-width="5.5" stroke-linecap="round"/></svg></body></html>`;

async function main() {
  const { chromium } = await import("playwright-core");
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  const exe = [join(base, "chromium")].find((p) => { try { return require("node:fs").statSync(p).isFile(); } catch { return false; } });
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], ...(exe ? { executablePath: exe } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.setContent(OG_HTML, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const og = await page.screenshot({ type: "jpeg", quality: 88 });
    await writeFile(join(ROOT, "images", "og.jpg"), og);

    const icon = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
    await icon.setContent(ICON_HTML, { waitUntil: "load" });
    await writeFile(join(ROOT, "images", "apple-touch-icon.png"), await icon.screenshot({ type: "png" }));
    console.log("✓ images/og.jpg (1200×630) и images/apple-touch-icon.png (180×180)");
  } finally { await browser.close(); }
}

// `require` в ESM — само за statSync без да внасяме целия fs горе.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
