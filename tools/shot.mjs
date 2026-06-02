// Visual QA harness: screenshots a route from the dev server (or a static HTML
// file) so we can verify the look of what we build. Uses the globally-installed
// Playwright + the /opt/pw-browsers chromium.
//
// Usage:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/shot.mjs <url> <out.png> [w] [h]
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

const [, , url, out = "/tmp/shot.png", w = "1280", h = "900"] = process.argv;
if (!url) {
  console.error("usage: shot.mjs <url> <out.png> [width] [height]");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
// Give fonts + any entry animation a beat to settle.
await page.waitForTimeout(900);
await page.screenshot({ path: out });
await browser.close();
console.log(`shot -> ${out}`);
