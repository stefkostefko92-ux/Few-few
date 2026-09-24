// Истинското разширение (unpacked) в истински Chromium — поведение, което unit
// тестовете не виждат: manifest-ът зарежда scriptlets/policy.js преди content.js
// в изолирания свят, procedural правилата минават политиката, вградените рекламни
// селектори не хващат „thread-container", allowlist-ът спира cookies.js.
// Не е в `npm test` (CI няма Playwright): `npm run test:browser`, с
// PW_ROOT=$(npm root -g), когато Playwright е глобален.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(join(process.env.PW_ROOT || join(ROOT, "node_modules"), "/"));
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.log("SKIP: playwright not available (PW_ROOT)"); process.exit(0); }

const PAGES = {
  "/cosmetic": `<!doctype html><html><body style="min-height:2000px">
    <div class="ad-container" id="ad">AD</div>
    <div class="thread-container" id="thread">forum thread</div>
    <div class="download-container" id="dl">download</div>
    <p class="styled" id="styled">styled</p>
    <p class="beacon" id="beacon">beacon</p>
    <iframe class="boxed" id="box" sandbox="allow-scripts" srcdoc="<p>x</p>"></iframe>
    <iframe class="boxed2" id="box2" sandbox="allow-scripts" data-x="1" srcdoc="<p>y</p>"></iframe>
  </body></html>`,
  "/cookie": `<!doctype html><html><body style="min-height:2000px">
    <script>window.__clicks=[];</script>
    <div id="onetrust-consent-sdk" style="position:fixed;left:0;right:0;bottom:0;background:#fff"><div id="onetrust-banner-sdk"><p>We use cookies</p>
      <button id="onetrust-reject-all-handler" onclick="__clicks.push('reject')">Reject all</button></div></div>
  </body></html>`,
};
const server = http.createServer((req, res) => {
  const html = PAGES[req.url.split("?")[0]];
  if (!html) { res.statusCode = 404; return res.end(); }
  res.setHeader("content-type", "text/html"); res.end(html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const ok = (name, cond) => { console.log(`  ${cond ? "PASS" : "FAIL"} ${name}`); cond ? pass++ : fail++; };

const userDir = mkdtempSync(join(tmpdir(), "sa-ext-"));
const ctx = await chromium.launchPersistentContext(userDir, {
  channel: "chromium", headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-sandbox"],
});
try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 1500));
  const setStore = (obj) => sw.evaluate((o) => chrome.storage.local.set(o), obj);

  // ---- procedural policy in the isolated world (every source, here "My filters") ----
  await setStore({
    enabled: true, allowlist: [],
    userFilters: [
      "127.0.0.1##.styled:style(color: rgb(255, 0, 0) !important)",
      "127.0.0.1##.beacon:style(background-image: url(http://127.0.0.1:1/beacon.gif))",
      "127.0.0.1##.boxed:remove-attr(sandbox)",
      "127.0.0.1##.boxed2:remove-attr(data-x)",
    ].join("\n"),
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/cosmetic");
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const cs = (id) => getComputedStyle(document.getElementById(id));
    return {
      ad: cs("ad").display, thread: cs("thread").display, dl: cs("dl").display,
      styled: cs("styled").color, beacon: cs("beacon").backgroundImage,
      sandbox: document.getElementById("box").getAttribute("sandbox"),
      dataX: document.getElementById("box2").getAttribute("data-x"),
      sandbox2: document.getElementById("box2").getAttribute("sandbox"),
    };
  });
  ok("bundled ad selector hides class=ad-container", r.ad === "none");
  ok("…but NOT thread-container / download-container (token match, not substring)", r.thread !== "none" && r.dl !== "none");
  ok(":style() applied from My filters (policy loaded in the isolated world)", r.styled === "rgb(255, 0, 0)");
  ok(":style(url(...)) refused — a cosmetic rule cannot beacon", r.beacon === "none");
  ok(":remove-attr(sandbox) refused — sandbox stays", r.sandbox === "allow-scripts");
  ok(":remove-attr(data-x) still works", r.dataX === null && r.sandbox2 === "allow-scripts");
  ok("no page errors from our content scripts", errors.length === 0);
  await page.close();

  // ---- cookies.js honours the allowlist (it used to ignore it) ----
  await setStore({ allowlist: ["127.0.0.1"] });
  const p2 = await ctx.newPage();
  await p2.goto(origin + "/cookie");
  await p2.waitForTimeout(2500);
  const c1 = await p2.evaluate(() => ({ clicks: window.__clicks.slice(), cloak: document.documentElement.classList.contains("tbab-cookies") }));
  ok("allowlisted site: cookie banner NOT touched (no click, no cloak)", c1.clicks.length === 0 && !c1.cloak);
  await setStore({ allowlist: [] });
  await p2.waitForTimeout(2500);
  const c2 = await p2.evaluate(() => window.__clicks.slice());
  ok("removed from the allowlist → handled again without a reload", c2.join() === "reject");
  await p2.close();
} finally {
  await ctx.close();
  server.close();
  rmSync(userDir, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
