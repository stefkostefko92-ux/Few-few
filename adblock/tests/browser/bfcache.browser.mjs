// Back/forward cache с истинското разширение в реален Chromium (Playwright). Best practices на
// Chrome Web Store: разширение, което пречи на bfcache, забавя всяко „Назад“ на потребителя —
// „make sure you test if your extension invalidates the cache“. Чести причини: unload обработчик,
// WebSocket/WebRTC в content script, отворен канал за съобщения към service worker-а.
//   страница с реклама (блокирана заявка + козметика + банер за бисквитки) → друг сайт → Назад:
//   страницата трябва да се ВЪЗСТАНОВИ от bfcache (pageshow.persisted), без notRestoredReasons —
//   и когато потребителят напусне 30 ms след началото (content script-овете още пишат на SW).
// Не е в `npm test` (CI няма Playwright) — `PW_ROOT=$(npm root -g) npm run test:browser`.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(process.env.PW_REQUIRED ? 1 : 0);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };

const PAGE = (next) => `<!doctype html><title>A</title>
<img src="https://doubleclick.net/pixel.gif" alt=""><div class="ad-container">ad</div>
<div id="onetrust-banner-sdk"><p>We use cookies</p><button id="onetrust-reject-all-handler">Reject all</button></div>
<script>addEventListener("pageshow", (e) => { window.__ps = (window.__ps || []).concat(e.persisted); });</script>
<a id="next" href="${next}">next</a>`;
const srv = http.createServer((q, r) => {
  r.setHeader("content-type", "text/html");
  // the other page is on a different site (localhost vs 127.0.0.1), as a real "go elsewhere, come back" would be
  r.end(q.url.startsWith("/b") ? "<!doctype html><title>B</title><p>B</p>" : PAGE(`http://localhost:${srv.address().port}/b`));
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${srv.address().port}`;

const profile = mkdtempSync(join(tmpdir(), "sa-bf-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  // Playwright turns bfcache off by default; low-memory heuristics would too in a container
  ignoreDefaultArgs: ["--disable-back-forward-cache"],
  args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    "--enable-features=BackForwardCache", "--disable-features=BackForwardCacheMemoryControls"],
});
try {
  await (ctx.serviceWorkers()[0] || ctx.waitForEvent("serviceworker", { timeout: 20000 }));
  await new Promise((r) => setTimeout(r, 2500));
  for (const [label, wait] of [["after the page settled", 1200], ["leaving 30 ms after it started", 30]]) {
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p); await cdp.send("Page.enable");
    const reasons = []; cdp.on("Page.backForwardCacheNotUsed", (e) => reasons.push(...e.notRestoredExplanations.map((x) => x.reason)));
    await p.goto(origin + "/a", { waitUntil: "commit" }); await p.waitForTimeout(wait);
    await p.click("#next"); await p.waitForURL(/\/b$/); await p.waitForTimeout(400);
    await p.goBack({ waitUntil: "commit" }); await p.waitForTimeout(1000);
    const ps = await p.evaluate(() => window.__ps || []);
    ok(`bfcache: page restored on Back, ${label} (${reasons.join(", ") || "no blocking reason"})`, ps[ps.length - 1] === true && reasons.length === 0);
    await p.close();
  }
} finally {
  await ctx.close(); srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
