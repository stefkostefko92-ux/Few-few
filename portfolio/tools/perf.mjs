#!/usr/bin/env node
// perf.mjs — лабораторно измерване на всяко демо (и хъба) с tools/seo/prelaunch-audit.mjs (същият Chromium,
// същите log-normal криви и тежести като Lighthouse v10; без Speed Index и без полеви данни — казано е в
// отчета). Резултатът е perf/lab.json (проследен в git) → баджовете в картите на хъба + страницата с
// проекти. Пуска се РЪЧНО след промяна по демо: node build.mjs && node tools/perf.mjs [demoId] [--runs 3]
// Изисква playwright-core (npm i --no-save playwright-core в корена на репото) и Chromium в /opt/pw-browsers.
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMOS } from "../src/demos/index.mjs";
import { demoPath, PATHS } from "../src/lib/html.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "perf", "lab.json");
const AUDIT = join(ROOT, "..", "tools", "seo", "prelaunch-audit.mjs");
const argv = process.argv.slice(2);
const RUNS = (() => { const i = argv.indexOf("--runs"); return i >= 0 ? Number(argv[i + 1]) || 3 : 3; })();
const only = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--runs")[0];
const PORT = 4281 + Math.floor(Math.random() * 100);
if (!existsSync(join(ROOT, "dist", "bg", "index.html"))) throw new Error("първо node build.mjs");
mkdirSync(join(ROOT, "perf"), { recursive: true });
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { pages: {} };
const server = spawn(process.execPath, [join(ROOT, "serve.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function audit(url, desktop) {
  const out = execFileSync(process.execPath, [AUDIT, url, "--json", "--runs", String(RUNS), ...(desktop ? ["--desktop"] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
  const j = JSON.parse(out);
  return { score: j.score, FCP: Math.round(j.metrics.FCP), LCP: Math.round(j.metrics.LCP), TBT: Math.round(j.metrics.TBT), CLS: +Number(j.metrics.CLS).toFixed(3), requests: j.requests, spread: j.spread };
}
try {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${PORT}/bg/`); break; } catch { await sleep(150); } }
  const targets = [["hub", PATHS.hub.bg], ...DEMOS.map((d) => [d.id, demoPath("bg", d)])].filter(([id]) => !only || id === only);
  for (const [id, path] of targets) {
    const url = `http://127.0.0.1:${PORT}${path}`;
    let mobile, desktop;
    try { mobile = audit(url, false); desktop = audit(url, true); } catch (e) { console.error(`✗ ${id}: ${e.message.split("\n")[0]}`); continue; }
    prev.pages[id] = { path, mobile, desktop };
    console.log(`${id.padEnd(14)} mobile ${String(mobile.score).padStart(3)}  desktop ${String(desktop.score).padStart(3)}   CLS ${mobile.CLS}  LCP ${mobile.LCP}ms  TBT ${mobile.TBT}ms`);
  }
  prev.tool = "tools/seo/prelaunch-audit.mjs (Lighthouse v10 криви; без Speed Index; лабораторно, не CrUX)";
  prev.runs = RUNS; prev.date = new Date().toISOString().slice(0, 10);
  writeFileSync(OUT, JSON.stringify(prev, null, 2) + "\n");
  console.log(`✓ perf/lab.json (${Object.keys(prev.pages).length} страници, ${RUNS} рана, ${prev.date})`);
} finally { server.kill(); }
