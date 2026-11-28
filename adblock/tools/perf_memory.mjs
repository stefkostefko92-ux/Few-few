// perf_memory.mjs — колко памет струва блокерът: процесите на самото разширение (service worker,
// offscreen) и процесите на страниците (там тичат content scripts и CSS-ът), за нас и за други
// блокери, при едни и същи условия. Linux (чете /proc/<pid>/smaps_rollup — PSS, споделената памет
// се дели между процесите, затова сборът е честен).
//
//   PW_ROOT=$(npm root -g) node tools/perf_memory.mjs [--ext "Име=/папка" …] [--settle 60] [--rounds 2]
//
// Всеки блокер: свеж профил, настройки по подразбиране, onboarding-ът, който трябва да се потвърди
// (Ghostery), се потвърждава, после --settle секунди, за да си свали и компилира листите; после
// същите 5 локални страници (голям DOM + 120 рекламни „кутии“ + рамки) в отделни раздели, 5 s,
// и мерене. Страниците са локални (loopback) — числата сравняват блокерите помежду им, не са
// „колко памет ще ви изяде браузърът“.
import http from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : def; };
const SETTLE = Number(arg("settle", 60));
const ROUNDS = Number(arg("rounds", 1));
const EXTS = [];
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === "--ext") { const [n, p] = process.argv[i + 1].split("="); EXTS.push([n, p]); }
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.error("Няма playwright (задай PW_ROOT=$(npm root -g))."); process.exit(2); }

// Страница „като новинарски сайт“: голям DOM, кутии с рекламни класове/размери, рамки — всичко локално.
const page = (n) => {
  let h = `<!doctype html><meta charset=utf-8><title>mem ${n}</title><main>`;
  for (let i = 0; i < 300; i++) h += `<article class="card item-${i}"><h2>Story ${i}</h2><p>Text ${i} of page ${n}.</p></article>`;
  for (let i = 0; i < 120; i++) h += `<div class="ad-slot adsbygoogle banner-${i}" id="div-gpt-ad-${i}" style="width:300px;height:250px">ad</div>`;
  for (let i = 0; i < 6; i++) h += `<iframe width="728" height="90" src="/frame?i=${i}"></iframe>`;
  return h + "</main>";
};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  res.writeHead(200, { "content-type": "text/html" });
  res.end(u.pathname === "/frame" ? "<!doctype html><p>frame</p>" : page(u.searchParams.get("n") || "0"));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---- /proc: дървото от процеси на браузъра и PSS на всеки ----
const ppidOf = (pid) => { try { return Number(readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ")[1]); } catch { return 0; } };
// Децата на Chromium презаписват argv в един низ с интервали (setproctitle) — делим и по двете.
const cmdOf = (pid) => { try { return readFileSync(`/proc/${pid}/cmdline`, "utf8").split(/[\0\s]+/).filter(Boolean); } catch { return []; } };
const pssKb = (pid) => { try { return Number(/^Pss:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/smaps_rollup`, "utf8"))[1]); } catch { return 0; } };
function memory(profileDir) {
  const pids = readdirSync("/proc").filter((d) => /^\d+$/.test(d)).map(Number);
  const root = pids.find((p) => { const c = cmdOf(p); return !c.some((a) => a.startsWith("--type=")) && c.includes(`--user-data-dir=${profileDir}`); });
  if (!root) return null;
  const kids = new Map();
  for (const p of pids) { const pp = ppidOf(p); if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(p); }
  const all = [], stack = [root];
  while (stack.length) { const p = stack.pop(); all.push(p); stack.push(...(kids.get(p) || [])); }
  const sum = { extension: 0, pages: 0, total: 0 };
  for (const p of all) {
    const c = cmdOf(p), kb = pssKb(p);
    sum.total += kb;
    if (c.includes("--type=renderer")) { if (c.includes("--extension-process")) sum.extension += kb; else sum.pages += kb; }
  }
  return sum;
}

async function confirmOnboarding(ctx) {
  for (const p of ctx.pages()) {
    if (!p.url().startsWith("chrome-extension://")) continue;
    for (const re of [/enable ghostery/i, /^(accept|agree|continue|get started|enable|start)$/i]) {
      try { await p.getByRole("button", { name: re }).first().click({ timeout: 2000 }); await p.waitForTimeout(1500); } catch {}
    }
  }
}

async function measure(label, ext) {
  const dir = mkdtempSync(join(tmpdir(), "sa-mem-"));
  const args = ["--no-sandbox"];
  if (ext) args.push(`--disable-extensions-except=${ext}`, `--load-extension=${ext}`);
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chromium", headless: true, args });
  try {
    if (ext) { await new Promise((r) => setTimeout(r, 9000)); await confirmOnboarding(ctx); await new Promise((r) => setTimeout(r, Math.max(0, SETTLE - 9) * 1000)); }
    for (const p of ctx.pages()) if (p.url().startsWith("chrome-extension://")) await p.close().catch(() => {});
    const idle = memory(dir);
    const tabs = [];
    for (let n = 1; n <= 5; n++) { const p = await ctx.newPage(); await p.goto(`${origin}/?n=${n}`); tabs.push(p); }
    await new Promise((r) => setTimeout(r, 5000));
    const busy = memory(dir);
    const mb = (kb) => (kb / 1024).toFixed(0).padStart(4);
    console.log(`${label.padEnd(34)} разширение ${idle ? mb(idle.extension) : "   ?"} MB (без раздели) → ${busy ? mb(busy.extension) : "   ?"} MB · страниците ${busy ? mb(busy.pages) : "   ?"} MB · общо ${busy ? mb(busy.total) : "   ?"} MB`);
  } finally {
    await ctx.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`date ${new Date().toISOString().slice(0, 10)} · headless Chromium · настройки по подразбиране · ${SETTLE} s за настройка · 5 локални страници · PSS (MB) · rounds ${ROUNDS}`);
for (let i = 0; i < ROUNDS; i++) {
  await measure("Без блокер", null);
  await measure("Supreme AdBlock", ROOT);
  for (const [n, p] of EXTS) await measure(n, resolve(p));
}
server.close();
