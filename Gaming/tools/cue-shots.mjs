// Dev-only: boot the web Vite server, render the cue demo, screenshot the
// WebGL output via headless Chromium (swiftshader). Run from repo root:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/cue-shots.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;

const PORT = 5599;
const URL = `http://localhost:${PORT}/cue-demo.html`;

const vite = spawn("pnpm", ["--filter", "@aso/web", "exec", "vite", "--port", String(PORT), "--strictPort"], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("vite did not start");
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  });
  const ctx = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 860, height: 2200 },
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();
  page.on("console", (m) => console.log("[page]", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__cueReady === true", { timeout: 20000 });
  await sleep(600); // let textures settle

  await page.locator(".ab").screenshot({ path: "/tmp/cue-ab.png" });
  const shots = page.locator(".rim.shot");
  const names = ["8ball", "9ball", "spread", "snooker", "sink"];
  const n = await shots.count();
  for (let i = 0; i < n; i++) {
    await shots.nth(i).screenshot({ path: `/tmp/cue-${names[i] ?? i}.png` });
  }
  await page.screenshot({ path: "/tmp/cue-all.png", fullPage: true });
  console.log("OK: wrote /tmp/cue-*.png");
  await browser.close();
} finally {
  vite.kill("SIGTERM");
}
