// Dev-only: screenshot the МАГНАТ 3D board. From repo root:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/magnat-shots.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import pw from "/opt/node22/lib/node_modules/playwright/index.js";
const { chromium } = pw;

const PORT = 5603;
const URL = `http://localhost:${PORT}/magnat-demo.html`;

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
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 900, height: 820 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("[console]", m.text()));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__magnatReady === true", { timeout: 20000 });
  await sleep(800);
  await page.locator(".board").screenshot({ path: "/tmp/magnat.png" });
  console.log("OK: wrote /tmp/magnat.png");
  await browser.close();
} finally {
  vite.kill("SIGTERM");
}
