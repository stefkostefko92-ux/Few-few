#!/usr/bin/env node
// render-og.mjs — рендира images/og.jpg (1200×630) от HTML
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

const LOGO_B64 = (await readFile(join(ROOT, "images", "logo.png"))).toString("base64");

const OG_HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<style>${FONT_CSS}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#050505;color:#f7f7f7;font-family:Inter,system-ui,sans-serif}
.wrap{position:relative;width:1200px;height:630px;padding:72px 80px;box-sizing:border-box;
background:radial-gradient(circle at 82% 30%,rgba(216,16,15,.35),transparent 42%),
repeating-linear-gradient(0deg,rgba(255,255,255,.045) 0 1px,transparent 1px 60px),
repeating-linear-gradient(90deg,rgba(255,255,255,.045) 0 1px,transparent 1px 60px),#050505}
.eyebrow{font-family:Sora;font-size:18px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#f0262b;display:flex;align-items:center;gap:14px}
.eyebrow::before{content:"";width:34px;height:3px;background:#d8100f;border-radius:2px}
h1{font-family:Sora;font-size:58px;font-weight:800;line-height:1.04;letter-spacing:-.035em;margin:30px 0 0;max-width:540px}
h1 span{color:#f0262b}
.lede{font-size:22px;color:#a7a7ae;margin-top:24px;max-width:520px;line-height:1.35}
.foot{position:absolute;left:80px;right:80px;bottom:44px;display:flex;justify-content:space-between;align-items:flex-end;font-size:22px;color:#a7a7ae}
.brand{display:flex;align-items:center;gap:16px;font-family:Sora;font-weight:800;font-size:30px;letter-spacing:.08em;color:#f7f7f7}
.brand svg{width:56px;height:56px}
.logo{position:absolute;right:70px;top:80px;width:470px;height:470px;object-fit:contain;filter:drop-shadow(0 30px 50px rgba(0,0,0,.8))}
</style></head><body><div class="wrap">
<img class="logo" src="data:image/png;base64,${LOGO_B64}" alt="">
<div class="eyebrow">Fino Mornasco · Provincia di Como</div>
<h1>Rottami, sgomberi<br>e imbiancature.<br><span>Una sola chiamata.</span></h1>
<p class="lede">Ritiro rottami e metalli, sgomberi di case e uffici, tinteggiature di interni. Preventivo gratuito.</p>
<div class="foot"><div>vfr.carbonstealth.eu</div><div>+39 377 442 3899</div></div>
</div></body></html>`;


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

    console.log("✓ images/og.jpg (1200×630)");
  } finally { await browser.close(); }
}

// `require` в ESM — само за statSync без да внасяме целия fs горе.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
