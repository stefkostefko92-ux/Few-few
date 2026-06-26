// Dev-only: screenshot the WebGL dice demo. From repo root:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/dice-shots.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;

const PORT = 5601;
const URL = `http://localhost:${PORT}/dice-demo.html`;

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
    viewport: { width: 900, height: 1400 },
    reducedMotion: "no-preference",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__diceReady === true", { timeout: 20000 });
  await sleep(600);
  await page.locator(".ab").screenshot({ path: "/tmp/dice-ab.png" });
  await page.screenshot({ path: "/tmp/dice-all.png", fullPage: true });
  console.log("OK: wrote /tmp/dice-*.png");
  await browser.close();
} finally {
  vite.kill("SIGTERM");
}
