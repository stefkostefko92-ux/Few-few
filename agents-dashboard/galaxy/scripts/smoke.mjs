// smoke.mjs — headless Chromium smoke: сервира agents-dashboard/, зарежда index.html, проверява
// нула грешки на страницата, галактиката е готова (WebGL2 или 2D резерв), reduced-motion спира warp-а,
// и снима кадри в OUT_DIR (по подразбиране /tmp/dizayner-galaxy — виж процеса в CLAUDE.md/frontend-design).
import { chromium } from "playwright-core";
import http from "node:http";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT = process.env.SMOKE_OUT || "/tmp/dizayner-galaxy";
const PORT = Number(process.env.SMOKE_PORT || 8199);
mkdirSync(OUT, { recursive: true });

const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".css": "text/css", ".webp": "image/webp", ".svg": "image/svg+xml" };
const server = http
  .createServer((req, res) => {
    const rel = path.normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    const file = path.join(ROOT, rel === "/" || rel === "" ? "index.html" : rel);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(readFileSync(file));
  })
  .listen(PORT);

const CHROME = process.env.SMOKE_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const problems = [];
try {
  for (const [label, viewport, colorScheme, reducedMotion] of [
    ["aaa-wide", { width: 1600, height: 900 }, "dark", "no-preference"],
    ["aaa-mobile", { width: 390, height: 844 }, "dark", "no-preference"],
    ["aaa-reduced", { width: 1600, height: 900 }, "dark", "reduce"],
  ]) {
    const page = await browser.newPage({ viewport, colorScheme, reducedMotion });
    page.on("pageerror", (e) => problems.push(`${label}: page error: ${e.message}`));
    // favicon.ico липсва нарочно (не е част от галактическия рендер) — единственият очакван 404;
    // засичаме го по URL (response), не по текста на конзолата (генеричен "Failed to load resource").
    page.on("response", (r) => { if (r.status() === 404 && !/favicon/i.test(r.url())) problems.push(`${label}: 404 ${r.url()}`); });
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`${label}: console error: ${m.text()}`); });
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const ready = await page.evaluate(() => !!window.__GALAXY_READY__);
    if (!ready) problems.push(`${label}: window.__GALAXY_READY__ не се вдигна`);
    // swiftshader (software WebGL2, headless без реален GPU) е бавен за readback на HDR FBO-та —
    // 30s подразбиране не стига; реалният браузър на потребителя няма това ограничение.
    await page.screenshot({ path: path.join(OUT, `${label}.png`), timeout: 120000 });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (problems.length) {
  process.stderr.write(`${problems.map((p) => `✘ ${p}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`✓ smoke: нула грешки на страницата, кадри в ${OUT}/\n`);
