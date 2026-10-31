// Renders a proof sheet PNG of the built fonts in headless Chromium.
// Usage: node tools/proof.mjs <fontsDir> <out.png> [text]
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// require() (not import) so a globally installed Playwright is found via NODE_PATH.
const { chromium } = createRequire(import.meta.url)("playwright");

const [fontsDir, out, text] = process.argv.slice(2);
if (!fontsDir || !out) {
  process.stderr.write("usage: node tools/proof.mjs <fontsDir> <out.png> [text]\n");
  process.exit(2);
}
const face = (style) =>
  `data:font/woff2;base64,${readFileSync(resolve(fontsDir, `Pismo-${style}.woff2`)).toString("base64")}`;
const sample =
  text ??
  "abcdefghijklmnopqrstuvwxyz\nhamburgefontsiv nonono hohoho\nThe quick brown fox jumps over the lazy dog.";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const lang = process.env.PROOF_LANG ?? "en";
const html = `<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>
@font-face{font-family:P;src:url(${face("Regular")});font-weight:400}
@font-face{font-family:P;src:url(${face("Bold")});font-weight:700}
body{margin:24px;font-family:P;background:#fff;color:#111;width:1400px}
.big{font-size:96px;line-height:1.15;white-space:pre-wrap}
.txt{font-size:20px;line-height:1.5;white-space:pre-wrap;margin-top:16px}
.b{font-weight:700}
</style>
<div class="big">${esc(sample)}</div><div class="big b">${esc(sample)}</div>
<div class="txt">${esc(sample)}</div><div class="txt b">${esc(sample)}</div>`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1450, height: 800 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, fullPage: true });
} finally {
  await browser.close();
}
