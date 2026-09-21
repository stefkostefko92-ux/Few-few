// E2E: зарежда разширението в истински Chromium (Playwright, new headless) и
// проверява, че DNR redirect към resources/* работи за <script src> (resourceType
// script) — с и без use_dynamic_url в manifest-а.
// Употреба: PW_ROOT=$(npm root -g) node e2e_redirect.mjs <ext-dir> <script-url> <global-marker>
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const require = createRequire(path.join(process.env.PW_ROOT, "/"));
const { chromium } = require("playwright");

const [extDir, target, marker] = process.argv.slice(2);

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(`<!doctype html><html><body><script>
    window.__done = new Promise((resolve) => {
      var s = document.createElement("script");
      s.src = ${JSON.stringify(target)};
      s.onload = function () { resolve("load"); };
      s.onerror = function () { resolve("error"); };
      document.head.appendChild(s);
    });
  </script></body></html>`);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-ext-"));
const ctx = await chromium.launchPersistentContext(userDir, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, "--no-sandbox"],
});
try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  const page = await ctx.newPage();
  const seen = [];
  page.on("request", (r) => { if (r.url() !== origin + "/") seen.push({ url: r.url(), from: r.redirectedFrom()?.url() || null }); });
  await page.goto(origin + "/", { waitUntil: "load" });
  const ev = await page.evaluate(() => window.__done);
  const markerType = await page.evaluate((m) => typeof window[m], marker);
  const extId = new URL(sw.url()).host;
  const redirected = seen.some((r) => r.url.startsWith("chrome-extension://") || (r.from && r.from === target));
  const ok = ev === "load" && markerType !== "undefined";
  console.log(JSON.stringify({ extId, ev, marker: markerType, redirected, seen, ok }));
  process.exitCode = ok ? 0 : 2;
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}
