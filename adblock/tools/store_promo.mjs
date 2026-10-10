#!/usr/bin/env node
// store_promo.mjs — промо графиките за Chrome Web Store: малката плочка 440×280 (задължителна) и
// marquee 1400×560 (без нея разширението не може да е в голямата витрина на магазина).
// Правилата на Google („Supplying Images“): без текст (промо графиките не са по езици), наситени
// цветове, без много бяло и светлосиво (магазинът ги слага на светлосив фон), запълнена площ, ясни
// ръбове, да работят и на половин размер, да говорят за марката — не скрийншот.
// Езикът е този на popup-а и клиповете: 3D щитът (tools/popup_shield3d.mjs --hero), ударен от
// мълнията на бурята от server/index.html (единственият ѝ източник), на наситен циан/син фон.
//
//   PW_ROOT=$(npm root -g) node tools/store_promo.mjs          # → store/promo_small_440x280.png + store/marquee_1400x560.png
//   ... --hero <png>       готов щит (иначе: dist/promo/shield-hero.png, рендерира се, ако липсва)
//   ... --probe <dir>      няколко кадъра около удара за избор на момента (нищо в store/ не се пише)
//
// Не е в CI и не влиза в пакета (tools/ се изключва). Иска ffmpeg ($FFMPEG или в PATH).
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i > 0 ? process.argv[i + 1] : d; };
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const PROBE = arg("probe", null);
const HERO = arg("hero", join(ROOT, "dist", "promo", "shield-hero.png"));
if (!existsSync(HERO)) {
  console.log("щитът липсва — рендерирам го (three.js, ~1 min)…");
  execFileSync("node", [join(ROOT, "tools", "popup_shield3d.mjs"), "--hero", HERO], { stdio: "inherit" });
}

// the storm, straight from the landing page, on a controlled clock (as in tools/promo/render.mjs)
const page = readFileSync(join(ROOT, "server", "index.html"), "utf8");
let storm = page.slice(page.indexOf("  function glStorm(grid) {"), page.indexOf("  // 3b) Fallback"));
const patch = (a, b) => { if (!storm.includes(a)) throw new Error("storm patch failed: " + a); storm = storm.replace(a, b); };
patch("preserveDrawingBuffer: false", "preserveDrawingBuffer: true");
patch("var dt = Math.min(0.05, now - (frame.p || now));", "F = Math.max(F, window.__amb || 0);\n      var dt = Math.min(0.05, now - (frame.p || now));");
patch("if (!strikes.length && !sparks.length) {", "if (!strikes.length && !sparks.length && !(window.__amb > 0)) {");
patch("      el: cv,\n", "      el: cv,\n      kick: function () { if (!running) { running = true; requestAnimationFrame(frame); } },\n");

// Each image: the shield (img size, centre), where the bolt lands, and when the frame is taken
// (seconds after the strike call — the leader takes ~0.1 s, then the return stroke lights up).
// The blade tip sits at (0.855, 0.136) of the hero image: that is where the bolt lands.
const tip = (S) => ({ x: Math.round(S.cx - S.size / 2 + 0.855 * S.size), y: Math.round(S.cy - S.size / 2 + 0.136 * S.size) });
const SHOTS = [
  { file: "promo_small_440x280.png", w: 440, h: 280, size: 268, cx: 220, cy: 150, p: 0.9, at: 0.12 },
  { file: "marquee_1400x560.png", w: 1400, h: 560, size: 500, cx: 700, cy: 292, p: 1.0, at: 0.12 },
].map((S) => ({ ...S, strike: { ...tip(S), p: S.p } }));

const html = (S) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${S.w}px;height:${S.h}px;overflow:hidden;background:#041a2a}
  /* saturated brand ground: deep blue → teal, lit from behind the shield */
  #bg{position:fixed;inset:0;background:
    radial-gradient(${S.size * 0.62}px ${S.size * 0.62}px at ${S.cx}px ${S.cy}px, rgba(0,229,255,.55), rgba(0,229,255,0) 72%),
    radial-gradient(${S.w * 0.9}px ${S.h * 1.3}px at 100% 0%, #0b7c96 0%, rgba(11,124,150,0) 62%),
    radial-gradient(${S.w * 0.8}px ${S.h * 1.2}px at 0% 100%, #0d3f99 0%, rgba(13,63,153,0) 64%),
    linear-gradient(135deg, #072a55 0%, #05425a 52%, #024957 100%)}
  #weave{position:fixed;inset:0;opacity:.5;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px),repeating-linear-gradient(-45deg,rgba(0,0,0,.08) 0 1px,transparent 1px 3px)}
  #ring{position:fixed;left:${S.cx - S.size * 0.36}px;top:${S.cy + S.size * 0.26}px;width:${S.size * 0.72}px;height:${S.size * 0.16}px;border-radius:50%;
    border:${Math.max(1.5, S.size / 220)}px solid #00e5ff;box-shadow:0 0 ${S.size / 12}px rgba(0,229,255,.75),inset 0 0 ${S.size / 18}px rgba(0,229,255,.5);opacity:.85}
  #shield{position:fixed;left:${S.cx - S.size / 2}px;top:${S.cy - S.size / 2}px;width:${S.size}px;height:${S.size}px;filter:drop-shadow(0 ${S.size / 30}px ${S.size / 14}px rgba(0,0,0,.5))}
  #storm{position:fixed;inset:0;width:${S.w}px;height:${S.h}px;mix-blend-mode:screen;z-index:5}
  #vig{position:fixed;inset:0;z-index:6;background:radial-gradient(ellipse at 55% 50%,transparent 62%,rgba(2,10,20,.35) 100%)}
</style></head><body><div id="bg"></div><div id="weave"></div><div id="ring"></div><img id="shield" src="/hero.png" alt=""><div id="vig"></div>
<script>
  (function () { var s = 0x5a17a3;
    Math.random = function () { s |= 0; s = (s + 0x6d2b79f5) | 0; var t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    window.__now = 0; window.__q = []; performance.now = function () { return window.__now; };
    window.requestAnimationFrame = function (cb) { window.__q.push(cb); return window.__q.length; }; window.cancelAnimationFrame = function () {}; })();
</script>
<script>${storm}</script>
<script>
  var st = glStorm(null); document.body.insertBefore(st.el, document.getElementById("vig")); st.el.style.visibility = "visible";
  window.__amb = 0.22; st.kick(); var fired = false;
  window.renderAt = function (t) { window.__now = t * 1000;
    if (!fired && t >= 0.3) { fired = true; st.strike(${S.strike.p}, ${S.strike.x}, ${S.strike.y}); }
    var q = window.__q; window.__q = []; q.forEach(function (cb) { cb(window.__now); }); };
  window.__ready = true;
</script></body></html>`;

const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
const { chromium } = require("playwright");
const heroPng = readFileSync(HERO);
let current = "";
const srv = http.createServer((q, r) => {
  if (q.url === "/hero.png") { r.setHeader("content-type", "image/png"); return r.end(heroPng); }
  r.setHeader("content-type", "text/html; charset=utf-8"); r.end(current);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chromium", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const tmp = join(ROOT, "dist", "promo"); mkdirSync(tmp, { recursive: true });
for (const S of SHOTS) {
  current = html(S);
  const pg = await browser.newPage({ viewport: { width: S.w, height: S.h }, deviceScaleFactor: 2 });
  const errors = []; pg.on("pageerror", (e) => errors.push(e.message));
  await pg.goto(`http://127.0.0.1:${srv.address().port}/`);
  await pg.waitForFunction(() => window.__ready === true && document.getElementById("shield").complete, null, { timeout: 30000 });
  if (errors.length) throw new Error(S.file + ": " + errors.join(" | "));
  const times = PROBE ? [0.08, 0.12, 0.16, 0.2, 0.26, 0.32].map((d) => 0.3 + d) : [0.3 + S.at];
  let t = 0;
  for (const target of times) {
    for (; t <= target + 1e-9; t += 1 / 60) await pg.evaluate((x) => window.renderAt(x), t);
    const raw = join(tmp, `raw-${S.w}x${S.h}-${target.toFixed(2)}.png`);
    await pg.screenshot({ path: raw, type: "png" });
    // 2× → exact size (Lanczos): crisp edges, no blur from the browser's own scaling
    const out = PROBE ? join(PROBE, `${S.w}x${S.h}-${(target - 0.3).toFixed(2)}.png`) : join(ROOT, "store", S.file);
    if (PROBE) mkdirSync(PROBE, { recursive: true });
    execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", raw, "-vf", `scale=${S.w}:${S.h}:flags=lanczos`, "-frames:v", "1", out]);
    console.log("✓", out);
  }
  await pg.close();
}
await browser.close(); srv.close();
