// perf_speedtest.mjs — колко сваля разширението скоростта на тест „като Speedtest".
//
// Защо (5.0.5): Speedtest by Ookla мери през WebSocket-и, чиито съобщения се
// обработват на ГЛАВНАТА нишка на страницата, докато стрелката и числата се
// анимират. Всичко, което нашите content scripts и CSS правят на тази нишка, идва
// направо от измерената скорост: 5.0.4 сваляше ~1000 → ~560 Mbps (генеричният CSS
// като неиндексируеми :is() списъци + пълни сканирания на документа при всяка
// промяна на текст). Този инструмент го възпроизвежда локално, без интернет:
// Node сървър (HTTP + минимален WebSocket) → страница с голям DOM и „стрелка",
// която се обновява всеки кадър → N паралелни връзки → Mbps и заетост на нишката.
//
// Употреба:
//   PW_ROOT=$(npm root -g) node tools/perf_speedtest.mjs                # без / с разширението
//   PW_ROOT=$(npm root -g) node tools/perf_speedtest.mjs --old <папка>  # + стара версия (разархивиран zip)
//   … --modes ws,fetch,xhr  --secs 6  --rounds 2
// Числата са лабораторни (loopback, headless) — сравнявай вариантите помежду им,
// не с реалната ти линия.
import http from "node:http";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : def; };
const SECS = Number(arg("secs", 6));
const ROUNDS = Number(arg("rounds", 1));
const MODES = arg("modes", "ws").split(",");
const OLD = arg("old", "");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.error("Няма playwright (задай PW_ROOT=$(npm root -g))."); process.exit(2); }

const PAGE = `<!doctype html><meta charset=utf-8><title>perf</title>
<div id=root><main class="app"><div class="gauge"><span id=g>0</span></div><div id=list></div><div id=big></div></main></div>
<script>
const q = new URLSearchParams(location.search), MODE = q.get("mode"), PAR = 6;
let bytes = 0, stop = false;
let h = ""; for (let i = 0; i < 250; i++) { h += '<section class="MuiBox-root css-' + i + ' flex items-center card"><header class="MuiTypography-root title"><span class="badge">b</span></header><ul class="list">';
  for (let j = 0; j < 6; j++) h += '<li class="item px-2"><a class="link" href="#">L' + j + '</a></li>'; h += '</ul></section>'; }
document.getElementById("big").innerHTML = h;
(function frame() { if (stop) return; // като стрелката и числата на Speedtest
  const g = document.getElementById("g"); g.textContent = (bytes / 1e6).toFixed(1); g.style.transform = "rotate(" + (bytes % 360) + "deg)";
  const d = document.createElement("div"); d.textContent = Date.now(); const l = document.getElementById("list"); l.appendChild(d); if (l.children.length > 50) l.firstChild.remove();
  requestAnimationFrame(frame); })();
const loops = {
  ws() { const w = new WebSocket("ws://" + location.host + "/ws"); w.binaryType = "arraybuffer"; w.onmessage = (e) => { bytes += e.data.byteLength; if (stop) w.close(); }; },
  async fetch() { while (!stop) { const r = await fetch("/dl?r=" + Math.random()); const rd = r.body.getReader();
    for (;;) { const { done, value } = await rd.read(); if (done) break; bytes += value.byteLength; if (stop) { rd.cancel(); break; } } } },
  xhr() { if (stop) return; const x = new XMLHttpRequest(); let last = 0; x.open("GET", "/dl?r=" + Math.random()); x.responseType = "arraybuffer";
    x.onprogress = (e) => { bytes += e.loaded - last; last = e.loaded; }; x.onload = () => { bytes += x.response.byteLength - last; loops.xhr(); }; x.send(); },
};
window.run = (secs) => new Promise((res) => {
  for (let i = 0; i < PAR; i++) loops[MODE]();
  setTimeout(() => { const b0 = bytes, t1 = performance.now();
    setTimeout(() => { stop = true; res((bytes - b0) * 8 / ((performance.now() - t1) / 1000) / 1e6); }, secs * 1000); }, 1500);
});
</script>`;

const CHUNK = Buffer.alloc(1 << 20, 7);
const DL = 25 << 20;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(PAGE); }
  if (u.pathname !== "/dl") { res.writeHead(404); return res.end(); }
  let left = DL;
  res.writeHead(200, { "content-type": "application/octet-stream", "content-length": left, "cache-control": "no-store" });
  req.on("close", () => { left = 0; });
  const pump = () => { while (left > 0) { const n = Math.min(left, CHUNK.length); left -= n; if (!res.write(CHUNK.subarray(0, n))) return res.once("drain", pump); } res.end(); };
  pump();
});
// Минимален WebSocket сървър (RFC 6455): само изпраща бинарни кадри по 64 KB.
const FRAME = (() => { const len = 1 << 16, h = Buffer.alloc(10); h[0] = 0x82; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return Buffer.concat([h, Buffer.alloc(len, 5)]); })();
server.on("upgrade", (req, sock) => {
  const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  let open = true;
  sock.on("close", () => { open = false; }); sock.on("error", () => { open = false; }); sock.on("data", () => {});
  const pump = () => { while (open) if (!sock.write(FRAME)) return sock.once("drain", pump); };
  pump();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

async function measure(label, ext) {
  const dir = mkdtempSync(join(tmpdir(), "sa-perf-"));
  const args = ["--no-sandbox"];
  if (ext) args.push(`--disable-extensions-except=${ext}`, `--load-extension=${ext}`);
  const ctx = await chromium.launchPersistentContext(dir, { channel: "chromium", headless: true, args });
  try {
    if (ext) { if (!ctx.serviceWorkers()[0]) await ctx.waitForEvent("serviceworker", { timeout: 20000 }); await new Promise((r) => setTimeout(r, 1500)); }
    const out = [];
    for (const mode of MODES) {
      const p = await ctx.newPage();
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Performance.enable");
      await p.goto(`${origin}/?mode=${mode}`);
      const m = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      const a = await m();
      const mbps = await p.evaluate((s) => window.run(s), SECS);
      const b = await m();
      out.push(`${mode} ${mbps.toFixed(0).padStart(5)} Mbps · стил ${(b.RecalcStyleDuration - a.RecalcStyleDuration).toFixed(2)} s`);
      await p.close();
    }
    console.log(label.padEnd(18), out.join("   "));
  } finally {
    await ctx.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`${MODES.join(",")} · ${SECS} s · 6 връзки · голям DOM + анимация всеки кадър`);
for (let i = 0; i < ROUNDS; i++) {
  await measure("без разширение", null);
  if (OLD) await measure("стара версия", resolve(OLD));
  await measure("това разширение", ROOT);
}
server.close();
