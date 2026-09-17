#!/usr/bin/env node
// render-images.mjs — генерира og.png (1200×630) и apple-touch-icon.png (180×180) от HTML през
// headless Chromium в бранд езика на carbonstealth.eu (черно · cyan · Inter Tight).
//
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

const FONTS = `file://${join(ROOT, "public")}`;
const fontCss = `@font-face{font-family:'Inter Tight';font-weight:100 900;src:url(${FONTS}/fonts/inter-tight-100-900-latin.woff2) format('woff2')}@font-face{font-family:'Inter Tight';font-weight:100 900;src:url(${FONTS}/fonts/inter-tight-100-900-cyrillic.woff2) format('woff2');unicode-range:U+0400-045F}@font-face{font-family:'Space Mono';font-weight:400;src:url(${FONTS}/fonts/space-mono-400-latin.woff2) format('woff2')}`;
const logo = (h) => `<img src="${FONTS}/logo.png" style="height:${h}px;filter:drop-shadow(0 0 12px rgba(0,229,255,.35))">`;

// og.png — в дизайн езика на carbonstealth.eu: черно, Inter Tight 900 uppercase, cyan, HUD моно ъгли.
const og = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
body{margin:0;width:1200px;height:630px;background:#000;color:#f5f5f0;font-family:'Space Mono',monospace;position:relative;overflow:hidden}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(0,229,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,.06) 1px,transparent 1px);background-size:60px 60px;-webkit-mask-image:radial-gradient(ellipse at 80% 40%,#000 10%,transparent 65%)}
.glow{position:absolute;right:-120px;top:-160px;width:640px;height:640px;background:radial-gradient(circle,rgba(0,229,255,.28),transparent 60%)}
.corner{position:absolute;width:28px;height:28px;border:0 solid rgba(0,229,255,.7)}.tl{top:28px;left:28px;border-top-width:1px;border-left-width:1px}.tr{top:28px;right:28px;border-top-width:1px;border-right-width:1px}.bl{bottom:28px;left:28px;border-bottom-width:1px;border-left-width:1px}.br{bottom:28px;right:28px;border-bottom-width:1px;border-right-width:1px}
.in{position:absolute;left:80px;top:78px;right:80px}
.tag{font-size:12px;letter-spacing:.5em;color:#00e5ff;text-transform:uppercase}
h1{font-family:'Inter Tight',sans-serif;font-weight:900;font-size:96px;line-height:.92;margin:26px 0 24px;letter-spacing:-.04em;text-transform:uppercase}
h1 em{font-style:normal;color:#00e5ff}
p{font-size:16px;color:#ccc;margin:0;max-width:860px;line-height:1.8;letter-spacing:.02em}
.tags{position:absolute;left:80px;bottom:64px;display:flex;gap:10px}
.tags span{border:1px solid rgba(0,229,255,.3);padding:9px 16px;font-size:11px;letter-spacing:.2em;color:#00e5ff;text-transform:uppercase}
.hud{position:absolute;right:80px;bottom:72px;font-size:10px;letter-spacing:.3em;color:rgba(0,229,255,.7)}
</style></head><body><div class="grid"></div><div class="glow"></div><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i><div class="in"><div class="tag">// Carbon Stealth VCC · Portfolio · BG · EN · IT</div><h1>10 демо сайта.<br><em>Изберете своя.</em></h1><p>Сервиз · Фитнес · Мебели · Адвокати · Салон · Хотел · Счетоводство · Автокъща · Дрехи · Бързо хранене</p></div><div class="tags"><span>Lighthouse 95+</span><span>≥15% под пазара</span><span>Reverse charge · ЕС</span></div><div class="hud">portfolio.carbonstealth.eu · CS CORE · ONLINE</div></body></html>`;

const icon = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}body{margin:0;width:180px;height:180px;background:#000;display:grid;place-items:center;font-family:'Inter Tight',sans-serif;font-weight:900;font-size:86px;color:#00e5ff;letter-spacing:-.06em;text-shadow:0 0 28px rgba(0,229,255,.45)}i{position:absolute;inset:14px;border:1px solid rgba(0,229,255,.35)}</style></head><body><i></i>CS</body></html>`;

function shot(name, html, w, h) {
  const src = join(TMP, `${name}.html`);
  writeFileSync(src, html);
  execFileSync(CHROME, ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--allow-file-access-from-files", `--window-size=${w},${h}`, `--screenshot=${join(OUT, name)}`, `file://${src}`], { stdio: "ignore" });
  console.log(`✓ public/${name} (${w}×${h})`);
}
shot("og.png", og, 1200, 630);
shot("apple-touch-icon.png", icon, 180, 180);
