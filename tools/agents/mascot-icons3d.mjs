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
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DASH = join(ROOT, "agents-dashboard");
const SIZE = 128;
const RENDER = 256; // рендер 2× и смаляване — по-чист ръб от директен 128 px кадър
const CHROME = process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const THREE_VER = JSON.parse(readFileSync(join(ROOT, "mascot", "cinematic", "package.json"), "utf8")).devDependencies.three.replace(/^[^\d]*/, "");

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const agents = JSON.parse(readFileSync(join(DASH, "agents.json"), "utf8")).agents;
const only = process.argv.slice(2);
const list = only.length ? agents.filter((a) => only.includes(a.id)) : agents;
if (!list.length) { console.error("✗ няма такива агенти"); process.exit(1); }

const page0 = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${THREE_VER}/examples/jsm/"}}</script>
<style>html,body{margin:0;background:#05070c}#m{width:${RENDER}px;height:${RENDER}px;position:relative}</style></head>
<body><div id="m"></div><script type="module">import * as M from "./mascot3d.js"; window.M = M;</script></body></html>`;

const browser = await chromium.launch({
  executablePath: CHROME,
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const ctx = await browser.newContext({ viewport: { width: RENDER, height: RENDER }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
if (process.env.DEBUG) { page.on("pageerror", (e) => console.error("PAGE", e.message)); page.on("console", (m) => console.error("CON", m.text().slice(0, 200))); page.on("requestfailed", (r) => console.error("FAIL", r.url(), r.failure()?.errorText)); }
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
  await page.evaluate(({ accent }) => {
    window.inst?.dispose();
    window.inst = window.M.mount(document.getElementById("m"), { accent, quality: "high", reducedMotion: true });
  }, { accent: a.accent });
  await page.waitForTimeout(2500); // PMREM + няколко кадъра на поста
  const png = await page.locator("#m").screenshot();
  const webp = await page.evaluate(async ({ b64, size }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, size, size);
    return c.toDataURL("image/webp", 0.86).split(",")[1];
  }, { b64: png.toString("base64"), size: SIZE });
  const out = join(DASH, "mascots", `${a.id}-icon3d.webp`);
  writeFileSync(out, Buffer.from(webp, "base64"));
  console.log(`✓ ${a.id.padEnd(22)} ${(Buffer.from(webp, "base64").length / 1024).toFixed(1)} KB`);
}
await browser.close();
