#!/usr/bin/env node
// render-images.mjs — генерира og.png (1200×630) и apple-touch-icon.png (180×180) от HTML през
// headless Chromium. Пуска се РЪЧНО при промяна на бранда; резултатът е проследен в public/.
//   CHROME_BIN=/path/to/chrome node tools/render-images.mjs
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "public");
const TMP = join(ROOT, ".tmp-render");
const CHROME = process.env.CHROME_BIN || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
mkdirSync(TMP, { recursive: true });

const hexUrl = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='97' viewBox='0 0 56 97'%3E%3Cpath d='M28 1 55 16v32L28 64 1 48V16zM28 65l27 15v16M28 65 1 80v16' fill='none' stroke='%23c8dda6' stroke-opacity='.14'/%3E%3C/svg%3E")`;
const logo = (s) => `<span style="display:inline-block;width:${s}px;height:${s}px;background:linear-gradient(135deg,#99E72A,#5AB60D 60%,#0D4A02);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);box-shadow:0 0 ${s / 2}px rgba(153,231,42,.5)"></span>`;

const og = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;background:#050706;color:#f4faea;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;position:relative;overflow:hidden}
.hex{position:absolute;inset:0;background-image:${hexUrl};-webkit-mask-image:radial-gradient(ellipse at 25% 30%,#000 10%,transparent 60%)}
.glow{position:absolute;right:-200px;top:-200px;width:700px;height:700px;background:radial-gradient(circle,rgba(90,182,13,.35),transparent 60%)}
.in{position:absolute;left:80px;top:90px;right:80px}
.brand{display:flex;align-items:center;gap:16px;font-weight:700;font-size:28px;letter-spacing:-.01em}
h1{font-size:82px;line-height:1.02;margin:56px 0 24px;letter-spacing:-.03em;font-weight:800}
h1 em{font-style:normal;color:#99e72a}
p{font-size:28px;color:#a3ad98;margin:0;max-width:900px}
.tags{position:absolute;left:80px;bottom:70px;display:flex;gap:12px}
.tags span{border:1px solid rgba(200,221,166,.25);border-radius:999px;padding:10px 20px;font-size:20px;color:#c8dda6}
</style></head><body><div class="hex"></div><div class="glow"></div><div class="in"><div class="brand">${logo(34)} Carbon Stealth VCC <span style="color:#a3ad98;font-weight:500">· Portfolio</span></div><h1>10 демо сайта.<br><em>Изберете своя.</em></h1><p>Сервиз · Фитнес · Мебели · Адвокати · Салон · Хотел · Счетоводство · Автокъща · Дрехи · Бързо хранене</p></div><div class="tags"><span>BG · EN · IT</span><span>Lighthouse 95+</span><span>≥15% под пазара</span><span>portfolio.carbonstealth.eu</span></div></body></html>`;

const icon = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;width:180px;height:180px;background:#050706;display:grid;place-items:center}</style></head><body>${logo(120)}</body></html>`;

function shot(name, html, w, h) {
  const src = join(TMP, `${name}.html`);
  writeFileSync(src, html);
  execFileSync(CHROME, ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${w},${h}`, `--screenshot=${join(OUT, name)}`, `file://${src}`], { stdio: "ignore" });
  console.log(`✓ public/${name} (${w}×${h})`);
}
shot("og.png", og, 1200, 630);
shot("apple-touch-icon.png", icon, 180, 180);
