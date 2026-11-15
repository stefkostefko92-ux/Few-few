#!/usr/bin/env node
// mascot-icons3d.mjs — малките икони на агентите като кадри от 3D маскота (собственика, 2026-09-24:
// „3D навсякъде вместо SVG“). 28 живи WebGL контекста биха сринали браузъра, затова иконите са
// ПРЕДВАРИТЕЛНО рендерирани: всеки агент → agents-dashboard/mascots/<id>-icon3d.webp (128 px),
// в неговия акцент, през същия бъндъл, който профилът монтира (agents-dashboard/mascot3d.js).
// SVG иконите остават резерв; build-artifact.mjs предпочита .webp, ако го има.
//
//   node tools/agents/mascot-icons3d.mjs            # регенерира всички
//   node tools/agents/mascot-icons3d.mjs seo kodadjiyata
//
// Иска Playwright + Chromium (/opt/pw-browsers) и мрежа до cdn.jsdelivr.net (three). Не е в CI:
// изходът се комитва, а стойностите не зависят от часовника (статичен кадър, reducedMotion).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASH = join(ROOT, "agents-dashboard");
// `--portrait`: кадър за профила (резервът, когато живият 3D не тръгне — вместо стария SVG).
const PORTRAIT = process.argv.includes("--portrait");
const SIZE = PORTRAIT ? 464 : 128;
const RENDER = PORTRAIT ? 464 : 256; // иконата: рендер 2× и смаляване — по-чист ръб
const SUFFIX = PORTRAIT ? "portrait3d" : "icon3d";
// Chromium: изричен CHROME_PATH → стабилната връзка на средата → браузърът на самия Playwright.
// Твърд път с номер на билда (старият сочеше chromium-<номер>/chrome-linux) остарява при всяко
// обновяване на средата — 2026-11-14 вече го нямаше и изпичането падаше.
const STABLE_CHROME = "/opt/pw-browsers/chromium";
const CHROME = process.env.CHROME_PATH || (existsSync(STABLE_CHROME) ? STABLE_CHROME : undefined);
const THREE_VER = JSON.parse(readFileSync(join(ROOT, "mascot", "cinematic", "package.json"), "utf8")).devDependencies.three.replace(/^[^\d]*/, "");

// ESM `import("playwright")` не вижда глобално инсталиран пакет (NODE_PATH важи само за require),
// затова при липса падаме на require от същото място — така инструментът тръгва и извън пакет.
async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) return import(process.env.PLAYWRIGHT_MODULE);
  try { return await import("playwright"); } catch (e) {
    if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
    return createRequire(import.meta.url)("playwright");
  }
}
const { chromium } = await loadPlaywright();
const agents = JSON.parse(readFileSync(join(DASH, "agents.json"), "utf8")).agents;
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const list = only.length ? agents.filter((a) => only.includes(a.id)) : agents;
if (!list.length) { console.error("✗ няма такива агенти"); process.exit(1); }

const page0 = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>
<style>html,body{margin:0;background:${PORTRAIT ? "transparent" : "#05070c"}}#m{width:${RENDER}px;height:${RENDER}px;position:relative}</style></head>
<body><div id="m"></div><script type="module">import * as M from "./mascot3d.js"; window.M = M;</script></body></html>`;

const browser = await chromium.launch({
  executablePath: CHROME,
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
// deviceScaleFactor 2 = суперсемплинг: кадърът се снима в двойна разделителна способност и се смалява
// до SIZE (иконата 4×, портретът 2×) — по-чист ръб на очилата и лещите, без ресни.
const ctx = await browser.newContext({ viewport: { width: RENDER, height: RENDER }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
if (process.env.DEBUG) { page.on("pageerror", (e) => console.error("PAGE", e.message)); page.on("console", (m) => console.error("CON", m.text().slice(0, 200))); page.on("requestfailed", (r) => console.error("FAIL", r.url(), r.failure()?.errorText)); }
// Chromium през проксито на средата понякога реже CDN-а (ERR_TOO_MANY_RETRIES) — curl минава. Само тук, не в продукта.
const { execFileSync } = await import("node:child_process");
await page.route("https://cdn.jsdelivr.net/**", (r) => r.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" },
  body: execFileSync("curl", ["-sSf", r.request().url()], { maxBuffer: 1 << 26 }) }));
await page.route("https://icons.test/**", (r) => r.request().url().endsWith("mascot3d.js")
  ? r.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(join(DASH, "mascot3d.js")) })
  : r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: page0 }));
// three идва от CDN през прокси — понякога засича; три опита, преди да се откажем.
for (let i = 1; ; i++) {
  try {
    await page.goto("https://icons.test/index.html");
    await page.waitForFunction(() => window.M && window.M.mount, null, { timeout: 60_000 });
    break;
  } catch (e) {
    if (i >= 3) throw e;
    console.error(`… three.js не се зареди (опит ${i}/3), пробвам пак`);
  }
}

for (const a of list) {
  await page.evaluate(({ accent, framing }) => {
    window.inst?.dispose();
    // framing: иконата е близка рамка (глава + шапка + папийонка), за да се чете на 128 px;
    // quality "ultra": печеният кадър е офлайн, затова MSAA 4 и пълен DOF — без бюджет за FPS.
    window.inst = window.M.mount(document.getElementById("m"), { accent, framing, quality: "ultra", reducedMotion: true });
  }, { accent: a.accent, framing: PORTRAIT ? "portrait" : "icon" });
  await page.waitForTimeout(6000); // PMREM + пост; ultra в 2× под swiftshader е няколко пъти по-бавен от high
  const png = await page.locator("#m").screenshot({ omitBackground: PORTRAIT });
  const webp = await page.evaluate(async ({ b64, size }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, size, size);
    return c.toDataURL("image/webp", 0.86).split(",")[1];
  }, { b64: png.toString("base64"), size: SIZE });
  const out = join(DASH, "mascots", `${a.id}-${SUFFIX}.webp`);
  writeFileSync(out, Buffer.from(webp, "base64"));
  console.log(`✓ ${a.id.padEnd(22)} ${(Buffer.from(webp, "base64").length / 1024).toFixed(1)} KB`);
}
await browser.close();
