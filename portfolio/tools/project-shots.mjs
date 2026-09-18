// tools/project-shots.mjs — реалните скрийншоти на нашите проекти за секция „Проекти“ и брошурата →
// public/img/projects/<id>.webp (1920×1200) + <id>-sm.webp (960×600). Снима се при 1200 CSS px ширина
// (не 1440: в карта от ~400 px текстът на пълен десктоп става нечетим); двата размера идват направо от
// Chromium (DPR 1.6 и 0.8, формат webp) — единствената зависимост е Chromium. `sharp` (devDependency)
// трябва само за източник-PNG файл (Nexus).
// Източник за всеки проект: живият сайт (URL от src/projects.mjs) или, когато той не е достижим от
// машината, локален източник: статична папка / вече пуснат локален сървър / готов PNG.
//
//   node tools/project-shots.mjs                      # всички; живият URL, освен ако има локален източник
//   node tools/project-shots.mjs vizitka mastilko     # само подадените
//   node tools/project-shots.mjs --live               # само живите URL-и (от VPS-а/твоята машина)
//   node tools/project-shots.mjs --url vizitka=http://127.0.0.1:4190/   # изричен източник за един проект
//   node tools/project-shots.mjs --out /opt/portfolio/img-projects      # друга изходна папка (на VPS-а —
//       постоянна; deploy.sh я налива в public/img/projects/ преди билда, за да не се губи при нов архив)
//   CHROME=/път/до/chrome node tools/project-shots.mjs                  # ако Chromium не се намери сам
//   Chromium на сървър без браузър:  npx --yes playwright@latest install --with-deps chromium
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { PROJECTS } from "../src/projects.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(ROOT, "..");
const W = 1200, H = 750;
const SIZES = [["", 1.6], ["-sm", 0.8]]; // суфикс → DPR при 1200×750 → 1920×1200 и 960×600

/** Chromium: env CHROME, системните пътища, Playwright кешовете (/opt/pw-browsers, ~/.cache/ms-playwright). */
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const fixed = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/lib/chromium/chromium", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/snap/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  for (const p of fixed) if (existsSync(p)) return p;
  for (const base of ["/opt/pw-browsers", join(homedir(), ".cache", "ms-playwright")]) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      for (const rel of ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-win/chrome.exe"]) {
        const p = join(base, d, rel); if (existsSync(p)) return p;
      }
    }
  }
  return null;
}
const CHROME = findChrome();

// Локални източници (когато живият сайт не се достига): статична папка в монорепото или готов PNG.
const LOCAL = {
  nexus: { file: join(REPO, "Nexus/screenshots-final/01-hero-dashboard.png"), crop: [2016, 1260] }, // PNG @1.5× → горният ляв ъгъл (1344×840 CSS px): четим UI, хедърът и героят цели
  evanita: { dir: join(REPO, "evanitasport"), path: "/index.html" },
  ospedali: { dir: join(REPO, "ospedalitrasparenti/site"), path: "/index.html" },
  panev: { dir: join(REPO, "panev"), path: "/index.html" },
};

const argv = process.argv.slice(2);
const live = argv.includes("--live");
const urls = {};
let OUT = join(ROOT, "public", "img", "projects");
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--out=")) { OUT = a.slice(6); continue; }
  if (a === "--out") { OUT = argv[++i] || OUT; continue; }
  const pair = a.startsWith("--url=") ? a.slice(6) : a === "--url" ? argv[++i] || "" : null;
  if (pair === null) continue;
  const eq = pair.indexOf("="); if (eq > 0) urls[pair.slice(0, eq)] = pair.slice(eq + 1);
}
const ids = argv.filter((a) => !a.startsWith("--") && !a.includes("=") && PROJECTS.some((p) => p.id === a));
const todo = PROJECTS.filter((p) => !ids.length || ids.includes(p.id));

if (!CHROME) { console.error("✗ Няма Chromium. Инсталирай: npx --yes playwright@latest install --with-deps chromium   (или CHROME=/път/до/chrome)"); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".avif": "image/avif" };
function serveDir(dir) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let f = join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
      if (!f.startsWith(dir)) { res.writeHead(403); res.end(); return; }
      if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
      if (!existsSync(f) && existsSync(f + ".html")) f += ".html";
      if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[extname(f)] || "application/octet-stream" });
      res.end(readFileSync(f));
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withChrome(fn) {
  const port = 9500 + Math.floor(Math.random() * 400);
  const ch = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--window-size=${W},${H}`, `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
  try {
    let tabs; for (let i = 0; i < 60; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs?.length) break; } catch { /* чака */ } await sleep(250); }
    if (!tabs?.length) throw new Error("Chromium не отговори на CDP");
    const ws = new WebSocket(tabs[0].webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    await send("Page.enable"); await send("Network.enable");
    const capture = async (dpr) => {
      await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: dpr, mobile: false });
      await sleep(250);
      const r = await send("Page.captureScreenshot", { format: "webp", quality: 82, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
      if (!r.result?.data) throw new Error("празен кадър");
      return Buffer.from(r.result.data, "base64");
    };
    /** Зарежда страницата и връща {суфикс → webp} за двата размера. */
    const shot = async (url) => {
      await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: SIZES[0][1], mobile: false });
      const nav = await send("Page.navigate", { url });
      if (nav.result?.errorText) throw new Error(nav.result.errorText);
      await sleep(2500);
      // Оставя reveal анимациите да се изиграят (лек скрол надолу и обратно за IntersectionObserver),
      // после спира преходите и скрива фиксираните cookie банери, за да е кадърът чист и стабилен.
      await send("Runtime.evaluate", { expression: `(async()=>{window.scrollTo(0,400);await new Promise(r=>setTimeout(r,500));window.scrollTo(0,0);await new Promise(r=>setTimeout(r,900));const s=document.createElement("style");s.textContent="*,*::before,*::after{transition:none!important;caret-color:transparent}";document.head.appendChild(s);document.querySelectorAll("[class*=cookie],[id*=cookie],[class*=consent],[id*=consent]").forEach(e=>{const p=getComputedStyle(e).position;if(p==="fixed"||p==="sticky")e.style.setProperty("display","none","important")});return 1})()`, awaitPromise: true });
      await sleep(600);
      const out = {};
      for (const [suffix, dpr] of SIZES) out[suffix] = await capture(dpr);
      return out;
    };
    try { await fn(shot); } finally { ws.close(); }
  } finally { ch.kill(); }
}

/** Готов PNG (напр. Nexus): изрязва и мащабира със sharp — единственият случай, който го иска. */
async function fromFile(local) {
  let sharp;
  try { sharp = (await import("sharp")).default; } catch { throw new Error("източник-файл иска sharp: npm install в portfolio/"); }
  let img = sharp(readFileSync(local.file));
  if (local.crop) img = img.extract({ left: 0, top: 0, width: local.crop[0], height: local.crop[1] });
  const png = await img.png().toBuffer();
  const out = {};
  for (const [suffix, dpr] of SIZES) out[suffix] = await sharp(png).resize(Math.round(W * dpr), Math.round(H * dpr), { fit: "cover", position: "top" }).webp({ quality: 82 }).toBuffer();
  return out;
}

function save(id, imgs) {
  return Object.entries(imgs).map(([suffix, buf]) => { const f = `${id}${suffix}.webp`; writeFileSync(join(OUT, f), buf); return `${f} ${Math.round(buf.length / 1024)} KB`; }).join(" · ");
}

let ok = 0, failed = [];
await withChrome(async (shot) => {
  for (const p of todo) {
    const local = !live && LOCAL[p.id];
    let srv = null;
    try {
      let imgs;
      if (urls[p.id]) imgs = await shot(urls[p.id]);
      else if (local?.file) imgs = await fromFile(local);
      else if (local?.dir) { const s = await serveDir(local.dir); srv = s.srv; imgs = await shot(s.base + local.path); }
      else imgs = await shot(p.url);
      console.log(`✓ ${p.id}: ${save(p.id, imgs)}  ← ${urls[p.id] || (local?.file ? local.file.replace(REPO, "..") : local?.dir ? local.dir.replace(REPO, "..") : p.url)}`);
      ok++;
    } catch (e) {
      failed.push(p.id);
      console.error(`✗ ${p.id}: ${e.message}${!local && !urls[p.id] ? "  (живият сайт не се достига оттук — пусни от машина с интернет: --live, или подай --url)" : ""}`);
    } finally { if (srv) srv.close(); }
  }
});
console.log(`\n${ok}/${todo.length} снимки → ${OUT}${failed.length ? ` · без снимка: ${failed.join(", ")}` : ""}`);
if (failed.length) process.exit(1);
