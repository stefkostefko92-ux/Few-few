// render.mjs — промо клипът на Supreme AdBlock: кадър по кадър в истински Chromium → MP4.
//
//   PW_ROOT=$(npm root -g) PYTHONPATH=<numpy> node tools/promo/render.mjs [--from 0 --to 43 --only-frames]
//
// 1) assets.py — реалният popup и панелите от генератора на store екраните
// 2) шрифтовете (Archivo · Alegreya Sans SC · Martian Mono, OFL) — кеш в dist/promo/fonts
// 3) film.html с бурята от server/index.html (единственият ѝ източник) на контролиран
//    часовник: window.renderAt(t) → екранна снимка, 30 fps
// 4) audio.py — дъжд, гръмотевици точно след ударите, нисък дрон (генерирани, като в boy/)
// 5) ffmpeg (imageio-ffmpeg или $FFMPEG) → dist/supreme-adblock-promo-<версия>.mp4 (H.264 + AAC,
//    yuv420p, faststart — за YouTube и за видеото в Chrome Web Store) + миниатюра 1280×720.
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..", "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const TL = JSON.parse(readFileSync(join(HERE, "timeline.json"), "utf8"));
const ver = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version;
const OUT = join(ROOT, "dist", "promo"), FR = join(OUT, "frames"), FONTS = join(OUT, "fonts");
mkdirSync(FR, { recursive: true }); mkdirSync(FONTS, { recursive: true });

// 1) assets
execFileSync("python3", [join(HERE, "assets.py")], { stdio: "inherit" });

// 2) fonts (cached)
if (!existsSync(join(FONTS, "fonts.css"))) {
  const url = "https://fonts.googleapis.com/css2?family=Archivo:wght@800;900&family=Alegreya+Sans+SC:wght@500&family=Martian+Mono:wght@300;400&display=block";
  let css = await (await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36" } })).text();
  let n = 0;
  for (const m of [...css.matchAll(/url\((https:[^)]+\.woff2)\)/g)]) {
    const f = `f${n++}.woff2`;
    writeFileSync(join(FONTS, f), Buffer.from(await (await fetch(m[1])).arrayBuffer()));
    css = css.replace(m[1], f);
  }
  writeFileSync(join(FONTS, "fonts.css"), css);
}

// 3) the storm: taken from the landing page itself, then put on the film clock
const page = readFileSync(join(ROOT, "server", "index.html"), "utf8");
let storm = page.slice(page.indexOf("  function glStorm(grid) {"), page.indexOf("  // 3b) Fallback"));
const patch = (a, b) => { if (!storm.includes(a)) throw new Error("storm patch failed: " + a); storm = storm.replace(a, b); };
patch("preserveDrawingBuffer: false", "preserveDrawingBuffer: true");
patch("var dt = Math.min(0.05, now - (frame.p || now));", "F = Math.max(F, window.__amb || 0);\n      var dt = Math.min(0.05, now - (frame.p || now));");
patch("if (!strikes.length && !sparks.length) {", "if (!strikes.length && !sparks.length && !(window.__amb > 0)) {");
patch("      el: cv,\n", "      el: cv,\n      kick: function () { if (!running) { running = true; requestAnimationFrame(frame); } },\n");
const film = readFileSync(join(HERE, "film.html"), "utf8").replace("/*__STORM__*/", () => "window.PROMO_TIMELINE = " + JSON.stringify(TL) + ";\n" + storm);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2" };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split("?")[0]);
  if (u === "/tools/promo/film.html") { r.setHeader("content-type", "text/html"); return r.end(film); }
  const p = join(ROOT, u);
  if (!p.startsWith(ROOT) || !existsSync(p)) { r.writeHead(404); return r.end(); }
  r.setHeader("content-type", TYPES[extname(p)] || "application/octet-stream"); r.end(readFileSync(p));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
const { chromium } = require("playwright");
const browser = await chromium.launch({ channel: "chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const pg = await browser.newPage({ viewport: { width: TL.width, height: TL.height }, deviceScaleFactor: 1 });
const errors = [];
pg.on("pageerror", (e) => errors.push(e.message));
pg.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(r.status() + " " + r.url()); });
await pg.goto(`http://127.0.0.1:${srv.address().port}/tools/promo/film.html`);
await pg.waitForFunction(() => window.__ready === true && document.fonts.status === "loaded", null, { timeout: 30000 });
if (errors.length) throw new Error("film errors: " + errors.join(" | "));

const from = Number(arg("from", 0)), to = Number(arg("to", TL.duration));
const f0 = Math.round(from * TL.fps), f1 = Math.round(to * TL.fps);
if (f0 === 0) for (const f of readdirSync(FR)) rmSync(join(FR, f));
// the storm needs its history (bolts in flight): warm up silently from 0 when starting later
for (let f = 0; f < f0; f++) await pg.evaluate((t) => window.renderAt(t), f / TL.fps);
const t0 = Date.now();
for (let f = f0; f < f1; f++) {
  await pg.evaluate((t) => window.renderAt(t), f / TL.fps);
  await pg.screenshot({ path: join(FR, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 94 });
  if (f % 60 === 0) console.log(`frame ${f}/${f1} · ${((Date.now() - t0) / 1000 / Math.max(1, f - f0 + 1)).toFixed(2)} s/frame`);
}
await browser.close(); srv.close();
if (errors.length) throw new Error("film errors: " + errors.join(" | "));
if (process.argv.includes("--only-frames")) process.exit(0);

// 4) audio  5) encode
const wav = join(OUT, "audio.wav");
execFileSync("python3", [join(HERE, "audio.py"), wav], { stdio: "inherit" });
let ffmpeg = process.env.FFMPEG;
if (!ffmpeg) ffmpeg = execFileSync("python3", ["-c", "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())"]).toString().trim();
const mp4 = join(ROOT, "dist", `supreme-adblock-promo-${ver}.mp4`);
execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(TL.fps), "-i", join(FR, "%05d.jpg"), "-i", wav,
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(TL.fps),
  "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", mp4], { stdio: "inherit" });
const thumb = join(ROOT, "dist", `supreme-adblock-promo-${ver}-thumb.png`);
execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", join(FR, `${String(Math.round(3.2 * TL.fps)).padStart(5, "0")}.jpg`), "-vf", "scale=1280:720", thumb], { stdio: "inherit" });
console.log("→", mp4, "\n→", thumb);
