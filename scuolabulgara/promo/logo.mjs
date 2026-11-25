// logo.mjs — логото на Qui Bulgaria, избродирано с кръстат бод, като снимка (logo.html).
//
//   PW_ROOT=$(npm root -g) node promo/logo.mjs [--out 2160 --stitches 112 --tiltX 9]
//
// Логото идва от живия сайт (timeline.json → site), страницата рисува платното в Chromium,
// екранната снимка отива в dist/qui-bulgaria-logo-embroidered.png (+ .jpg за качване).
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const TL = JSON.parse(readFileSync(join(HERE, "timeline.json"), "utf8"));
const OUT = join(ROOT, "dist", "promo"), LOGO = join(OUT, "site", "brand", "logo.webp");
const CFG = {
  out: arg("out", 2160), stitches: arg("stitches", 112), fill: arg("fill", 0.8), lift: arg("lift", 0),
  tiltX: arg("tiltX", 9), tiltZ: arg("tiltZ", -1.5), logo: "site/brand/logo.webp",
};
if (!existsSync(LOGO)) {
  mkdirSync(dirname(LOGO), { recursive: true });
  const r = await fetch(`${TL.site}/assets/img/brand/logo.webp`);
  if (!r.ok) throw new Error(`${r.status} logo`);
  writeFileSync(LOGO, Buffer.from(await r.arrayBuffer()));
}
const page = readFileSync(join(HERE, "logo.html"), "utf8").replace("/*__DATA__*/", () => `window.CFG = ${JSON.stringify(CFG)};`);
const TYPES = { ".webp": "image/webp", ".png": "image/png" };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  if (u === "/") { r.setHeader("content-type", "text/html"); return r.end(page); }
  if (u === "/favicon.ico") { r.writeHead(204); return r.end(); }
  const p = join(OUT, u);
  if (!p.startsWith(OUT) || !existsSync(p)) { r.writeHead(404); return r.end(); }
  r.setHeader("content-type", TYPES[extname(p)] || "application/octet-stream"); r.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chromium" });
const pg = await browser.newPage({ viewport: { width: CFG.out, height: CFG.out }, deviceScaleFactor: 1 });
const errors = [];
pg.on("pageerror", (e) => errors.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "commit" }); // рисуването блокира страницата за десетки секунди
await pg.waitForFunction(() => window.__ready === true || window.__error, null, { timeout: 900000 });
const failed = await pg.evaluate(() => window.__error);
if (failed) errors.push(failed);
if (errors.length) throw new Error("logo errors: " + errors.join(" | "));
console.log(await pg.evaluate(() => window.__stats));
const PNG = join(ROOT, "dist", "qui-bulgaria-logo-embroidered.png");
await pg.screenshot({ path: PNG, type: "png" });
await browser.close(); srv.close();
execFileSync(process.env.FFMPEG || "ffmpeg", ["-y", "-loglevel", "error", "-i", PNG, "-q:v", "2", PNG.replace(/\.png$/, ".jpg")], { stdio: "inherit" });
console.log("→", PNG);
