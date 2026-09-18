// tools/project-shots.mjs — реалните скрийншоти на нашите проекти за секция „Проекти“ и брошурата →
// public/img/projects/<id>.webp (1920×1200) + <id>-sm.webp (960×600). Снима се при 1200 CSS px ширина
// (не 1440: в карта от ~400 px текстът на пълен десктоп става нечетим) с DPR 2 — остро и на Retina.
// Източник за всеки проект: живият сайт (URL от src/projects.mjs) или, когато той не е достижим от
// машината, локален източник: статична папка / вече пуснат локален сървър / готов PNG. Нула зависимости
// освен sharp (devDependency) и Chromium. Проследени в git — пусни го след промяна по сайт.
//
//   node tools/project-shots.mjs                      # всички; живият URL, освен ако има локален източник
//   node tools/project-shots.mjs vizitka mastilko     # само подадените
//   node tools/project-shots.mjs --live               # само живите URL-и (напр. от VPS-а/твоята машина)
//   node tools/project-shots.mjs --url vizitka=http://127.0.0.1:4190/   # изричен източник за един проект
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import sharp from "sharp";
import { PROJECTS } from "../src/projects.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(ROOT, "..");
const OUT = join(ROOT, "public", "img", "projects");
const CHROME = process.env.CHROME || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"].find(existsSync);
const W = 1200, H = 750, DPR = 2, BIG = [1920, 1200], SM = [960, 600];

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
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const pair = a.startsWith("--url=") ? a.slice(6) : a === "--url" ? argv[++i] || "" : null;
  if (pair === null) continue;
  const eq = pair.indexOf("="); if (eq > 0) urls[pair.slice(0, eq)] = pair.slice(eq + 1);
}
const ids = argv.filter((a) => !a.startsWith("--") && !a.includes("=") && PROJECTS.some((p) => p.id === a));
const todo = PROJECTS.filter((p) => !ids.length || ids.includes(p.id));

if (!CHROME) { console.error("✗ Няма Chromium (CHROME=/път/до/chrome)."); process.exit(2); }
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
    await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
    const shot = async (url) => {
      const nav = await send("Page.navigate", { url });
      if (nav.result?.errorText) throw new Error(nav.result.errorText);
      await sleep(2500);
      // Оставя reveal анимациите да се изиграят (лек скрол надолу и обратно за IntersectionObserver),
      // после спира преходите и скрива cookie банери, за да е кадърът чист и стабилен.
      await send("Runtime.evaluate", { expression: `(async()=>{window.scrollTo(0,400);await new Promise(r=>setTimeout(r,500));window.scrollTo(0,0);await new Promise(r=>setTimeout(r,900));const s=document.createElement("style");s.textContent="*,*::before,*::after{transition:none!important;caret-color:transparent}";document.head.appendChild(s);document.querySelectorAll("[class*=cookie],[id*=cookie],[class*=consent],[id*=consent]").forEach(e=>{const p=getComputedStyle(e).position;if(p==="fixed"||p==="sticky")e.style.setProperty("display","none","important")});return 1})()`, awaitPromise: true });
      await sleep(600);
      const r = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
      if (!r.result?.data) throw new Error("празен кадър");
      return Buffer.from(r.result.data, "base64");
    };
    try { await fn(shot); } finally { ws.close(); }
  } finally { ch.kill(); }
}

async function save(id, png) {
  const img = sharp(png);
  await img.clone().resize(BIG[0], BIG[1], { fit: "cover", position: "top" }).webp({ quality: 82 }).toFile(join(OUT, `${id}.webp`));
  await img.clone().resize(SM[0], SM[1], { fit: "cover", position: "top" }).webp({ quality: 80 }).toFile(join(OUT, `${id}-sm.webp`));
  const kb = (f) => Math.round(statSync(join(OUT, f)).size / 1024);
  return `${id}.webp ${kb(`${id}.webp`)} KB · ${id}-sm.webp ${kb(`${id}-sm.webp`)} KB`;
}

let ok = 0, failed = [];
await withChrome(async (shot) => {
  for (const p of todo) {
    const local = !live && LOCAL[p.id];
    let srv = null;
    try {
      let png;
      if (urls[p.id]) { png = await shot(urls[p.id]); }
      else if (local?.file) { png = readFileSync(local.file); if (local.crop) png = await sharp(png).extract({ left: 0, top: 0, width: local.crop[0], height: local.crop[1] }).png().toBuffer(); }
      else if (local?.dir) { const s = await serveDir(local.dir); srv = s.srv; png = await shot(s.base + local.path); }
      else { png = await shot(p.url); }
      console.log(`✓ ${p.id}: ${await save(p.id, png)}  ← ${urls[p.id] || (local?.file ? local.file.replace(REPO, "..") : local?.dir ? local.dir.replace(REPO, "..") : p.url)}`);
      ok++;
    } catch (e) {
      failed.push(p.id);
      console.error(`✗ ${p.id}: ${e.message}${!local && !urls[p.id] ? "  (живият сайт не се достига оттук — пусни инструмента от машина с интернет: --live, или подай --url)" : ""}`);
    } finally { if (srv) srv.close(); }
  }
});
console.log(`\n${ok}/${todo.length} снимки → public/img/projects/${failed.length ? ` · без снимка: ${failed.join(", ")}` : ""}`);
