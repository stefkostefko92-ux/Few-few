// render.mjs — клипът за Facebook (4:5, 1080×1350): кадър по кадър в истински Chromium → MP4.
//
//   PW_ROOT=$(npm root -g) node promo/render.mjs [--from 0 --to 36 --every 1 --only-frames --no-music]
//
// 1) снимките — от живия сайт (timeline.json → site), кеш в dist/promo/site
// 2) живият сайт на телефон: /bg на 390 px, на ленти (дългата страница не се събира
//    в една екранна снимка) + къде започва всяка секция
// 3) шрифтовете на сайта (Sofia Sans, Sofia Sans Extra Condensed — OFL), кеш
// 4) бодът на сайта (film-lib.ts → esbuild) и film.html на контролиран часовник:
//    window.renderAt(t) → екранна снимка, 30 fps
// 5) музиката (music.mjs) и ffmpeg → dist/qui-bulgaria-facebook-4x5.mp4 (H.264 + AAC,
//    yuv420p, faststart) + корица PNG
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes("--" + n);
const TL = JSON.parse(readFileSync(join(HERE, "timeline.json"), "utf8"));
const OUT = join(ROOT, "dist", "promo"), SITE = join(OUT, "site"), FONTS = join(OUT, "fonts"), FR = join(OUT, "frames");
for (const d of [SITE, FONTS, FR]) mkdirSync(d, { recursive: true });
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
const { chromium } = require("playwright");
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

// 1) снимките от живия сайт
const IMAGES = [
  "photos/comunita-in-costume.webp", "photos/festa-della-scuola.webp", "photos/horo.webp", "photos/gruppo-veselie.webp",
  "brand/logo.webp", "icons/kids.webp", "icons/adults.webp", "icons/culture.webp",
  ...["gergana-hristova", "krasimira-dimitrova", "darina-naumova", "asya-maria-daskalova", "iliana-nikolova", "daniela-vukovska", "angelina-velinova",
    "elza-milenova", "mariana-velikova", "assia-assenova", "kristina-grozeva", "ana-dimitrova", "lora-hadjidimieva", "stanimir-minev"].map((n) => `teachers/${n}.webp`),
];
for (const p of IMAGES) {
  const f = join(SITE, p);
  if (existsSync(f)) continue;
  mkdirSync(dirname(f), { recursive: true });
  const r = await fetch(`${TL.site}/assets/img/${p}`, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${TL.site}/assets/img/${p}`);
  writeFileSync(f, Buffer.from(await r.arrayBuffer()));
}

// зад корпоративен прокси: HTTPS_PROXY + PROXY_SPKI (SHA-256 на ключа на CA на проксито —
// доверява се само на него, проверката на сертификатите остава включена)
const browser = await chromium.launch({ channel: "chromium", args: [
  ...(process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=localhost;127.0.0.1"] : []),
  ...(process.env.PROXY_SPKI ? [`--ignore-certificate-errors-spki-list=${process.env.PROXY_SPKI}`] : []),
] });

// 2) сайтът на телефон
const phoneMeta = join(SITE, "phone.json");
if (!existsSync(phoneMeta) || has("refresh")) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: "reduce", userAgent: UA.replace("X11; Linux x86_64", "Linux; Android 14; Pixel 8") + " Mobile" });
  // бисквитките: „само необходимите“ — банерът не закрива сайта
  await ctx.addInitScript(() => { try { localStorage.setItem("qb-cookie-ack", "necessary"); } catch {} });
  const pg = await ctx.newPage();
  await pg.goto(`${TL.site}/bg`, { waitUntil: "networkidle", timeout: 60000 });
  await pg.evaluate(async () => { await document.fonts.ready; });
  // мързеливите снимки: минаваме през цялата страница веднъж
  const H0 = await pg.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H0; y += 600) { await pg.evaluate((v) => window.scrollTo(0, v), y); await pg.waitForTimeout(60); }
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.waitForLoadState("networkidle");
  await pg.waitForTimeout(800);
  const meta = await pg.evaluate(() => {
    const header = document.querySelector(".header")?.getBoundingClientRect().height || 76;
    const ids = ["chi-siamo", "alfabeto", "scuola", "insegnanti", "corsi", "danza", "galleria", "documenti", "contatti"];
    const anchors = Object.fromEntries(ids.map((id) => [id, Math.round((document.getElementById(id)?.getBoundingClientRect().top ?? 0) + scrollY)]));
    return { width: innerWidth, height: document.documentElement.scrollHeight, header, anchors };
  });
  const CH = 2400; // CSS px на лента
  meta.chunks = [];
  for (let y = 0, i = 0; y < meta.height; y += CH, i++) {
    const h = Math.min(CH, meta.height - y), f = `phone-${i}.jpg`;
    await pg.screenshot({ path: join(SITE, f), type: "jpeg", quality: 90, fullPage: true, clip: { x: 0, y, width: meta.width, height: h } });
    meta.chunks.push({ f, y, h });
  }
  await pg.screenshot({ path: join(SITE, "phone-header.jpg"), type: "jpeg", quality: 92, clip: { x: 0, y: 0, width: meta.width, height: meta.header } });
  writeFileSync(phoneMeta, JSON.stringify(meta, null, 1));
  await ctx.close();
}

// 3) шрифтовете
if (!existsSync(join(FONTS, "fonts.css"))) {
  const url = "https://fonts.googleapis.com/css2?family=Sofia+Sans:ital,wght@0,300..900;1,300..900&family=Sofia+Sans+Extra+Condensed:wght@300..900&display=block";
  let css = await (await fetch(url, { headers: { "user-agent": UA } })).text();
  let n = 0;
  for (const m of [...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)]) {
    const f = `f${n++}.woff2`;
    writeFileSync(join(FONTS, f), Buffer.from(await (await fetch(m[1])).arrayBuffer()));
    css = css.replace(m[1], f);
  }
  writeFileSync(join(FONTS, "fonts.css"), css);
}

// 4) бодът + филмът
const esbuild = join(ROOT, "node_modules", ".bin", "esbuild");
execFileSync(esbuild, [join(HERE, "film-lib.ts"), "--bundle", "--format=iife", "--global-name=QB", "--target=chrome120", "--log-level=warning", `--outfile=${join(OUT, "film-lib.js")}`], { stdio: "inherit" });
const film = readFileSync(join(HERE, "film.html"), "utf8")
  .replace("/*__DATA__*/", () => `window.TL = ${JSON.stringify(TL)};\nwindow.PHONE = ${readFileSync(phoneMeta, "utf8")};`);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  if (u === "/" || u === "/film.html") { r.setHeader("content-type", "text/html"); return r.end(film); }
  if (u === "/favicon.ico") { r.writeHead(204); return r.end(); }
  const p = join(OUT, u);
  if (!p.startsWith(OUT) || !existsSync(p)) { r.writeHead(404); return r.end(); }
  r.setHeader("content-type", TYPES[extname(p)] || "application/octet-stream"); r.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const pg = await browser.newPage({ viewport: { width: TL.width, height: TL.height }, deviceScaleFactor: 1 });
const errors = [];
pg.on("pageerror", (e) => errors.push(e.message));
pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
pg.on("response", (r) => { if (r.status() >= 400) errors.push(r.status() + " " + r.url()); });
await pg.goto(`http://127.0.0.1:${srv.address().port}/film.html`);
await pg.waitForFunction(() => window.__ready === true && document.fonts.status === "loaded", null, { timeout: 60000 });
if (errors.length) throw new Error("film errors: " + errors.join(" | "));

const from = Number(arg("from", 0)), to = Number(arg("to", TL.duration)), EVERY = Math.max(1, Number(arg("every", 1)));
if (EVERY > 1 && !has("only-frames")) throw new Error("--every е за преглед: добави --only-frames");
const f0 = Math.round(from * TL.fps), f1 = Math.round(to * TL.fps);
if (f0 === 0 && EVERY === 1) for (const f of readdirSync(FR)) rmSync(join(FR, f));
const t0 = Date.now();
for (let f = f0; f < f1; f += EVERY) {
  await pg.evaluate((t) => window.renderAt(t), f / TL.fps);
  await pg.screenshot({ path: join(FR, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 95 });
  if (f % 90 === 0) console.log(`кадър ${f}/${f1} · ${((Date.now() - t0) / 1000 / Math.max(1, (f - f0) / EVERY + 1)).toFixed(2)} с/кадър`);
}
const COVER = join(ROOT, "dist", "qui-bulgaria-facebook-cover.png");
await pg.evaluate((t) => window.renderAt(t), TL.cover);
await pg.screenshot({ path: COVER, type: "png" });
await browser.close(); srv.close();
if (errors.length) throw new Error("film errors: " + errors.join(" | "));
if (has("only-frames")) process.exit(0);

// 5) музика и видео
const WAV = join(OUT, "music.wav");
if (!has("no-music") || !existsSync(WAV)) execFileSync("node", [join(HERE, "music.mjs"), WAV], { stdio: "inherit" });
const MP4 = join(ROOT, "dist", "qui-bulgaria-facebook-4x5.mp4");
execFileSync(process.env.FFMPEG || "ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(TL.fps), "-i", join(FR, "%05d.jpg"), "-i", WAV,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(TL.fps),
  "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-movflags", "+faststart", "-shortest", MP4], { stdio: "inherit" });
console.log("→", MP4, "\n→", COVER);
