// /test (server/test.html) с истинското разширение в реален Chromium: всеки ред стига до „работи“, а при
// изключена защита редовете за мрежата и за скриването показват „Not blocked“. Сайтът се сервира от
// server/ на локален http сървър; хостът adblock.carbonstealth.eu се мапва към него (--host-resolver-rules).
// Не е в `npm test` (CI няма Playwright) — `PW_ROOT=$(npm root -g) node tests/browser/testpage.browser.mjs`.
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
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

const SRV = join(ROOT, "server");
const seen = [];
const srv = http.createServer((q, r) => {
  const path = new URL(q.url, "http://x").pathname;
  seen.push(q.url);
  const file = path === "/test" ? "test.html" : path.slice(1);
  const full = join(SRV, file);
  if (!full.startsWith(SRV + "/") || !existsSync(full) || file.endsWith("/")) { r.statusCode = 404; return r.end("not found"); }
  r.setHeader("content-type", file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".js") ? "text/javascript" : "application/octet-stream");
  r.end(readFileSync(full));
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const port = srv.address().port;
const HOST = "adblock.carbonstealth.eu";
const URL_ = `http://${HOST}:${port}/test`;

const profile = mkdtempSync(join(tmpdir(), "sa-testpage-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: ["--no-sandbox", "--no-proxy-server", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    `--host-resolver-rules=MAP ${HOST} 127.0.0.1:${port}`],
});
const state = (p, row) => p.locator(`#st-${row}`).getAttribute("data-state");
const settled = (p, row, want) => p.waitForFunction(([r, w]) => document.getElementById("st-" + r).getAttribute("data-state") === w, [row, want], { timeout: 15000 }).then(() => true, () => false);
try {
  const isOurs = (w) => w.url().startsWith("chrome-extension://") && w.url().endsWith("/background.js");
  const sw = ctx.serviceWorkers().find(isOurs) || await ctx.waitForEvent("serviceworker", { timeout: 20000, predicate: isOurs });
  console.log("  sw:", sw.url());
  // ready = the rulesets are on and the GPC page script is registered (by state, not by a delay)
  const ready = (on) => sw.evaluate(async (want) => {
    for (let i = 0; i < 100; i++) {
      const rs = await chrome.declarativeNetRequest.getEnabledRulesets();
      const cs = (await chrome.scripting.getRegisteredContentScripts()).map((c) => c.id);
      if (want ? rs.includes("ad_rules") && rs.includes("removeparam") && cs.includes("sa-gpc") : !rs.includes("ad_rules")) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  }, on);
  ok("extension ready: rulesets on, GPC script registered", await ready(true));

  // ---- protection on: every row reaches „working“ ----
  // warm-up: the very first navigation after install can precede the MAIN-world script registration taking effect
  const warm = await ctx.newPage();
  await warm.goto(URL_);
  await warm.waitForFunction(() => navigator.globalPrivacyControl === true, null, { timeout: 15000 }).catch(() => {});
  await warm.close();
  const p = await ctx.newPage();
  await p.goto(URL_);
  for (const row of ["network", "hiding", "gpc", "cmp"]) ok(`on: row ${row} → working (“${await p.locator("#st-" + row).textContent()}”)`, await settled(p, row, "working"));
  ok("on: the control file loaded, the ad-like file was asked for and refused", seen.includes("/test/page-check.js") && !seen.includes("/test/ad-banner.js"));
  ok("on: the sample box is really not displayed", await p.evaluate(() => getComputedStyle(document.getElementById("ad-banner-top")).display === "none"));
  ok("on: the demo banner was pressed by script (isTrusted false), not by us", (await p.locator("#st-cmp").textContent()).startsWith("Reject pressed"));
  ok("on: params row waits for the link", (await state(p, "params")) === "todo");
  await p.click("#trk-link");
  await p.waitForURL(/\/test(\?.*)?$/);
  ok(`on: after the link the address is ${new URL(p.url()).pathname + new URL(p.url()).search || "/test"} (parameters stripped)`, new URL(p.url()).search === "");
  ok("on: row params → working", await settled(p, "params", "working"));
  ok("on: the summary counts 5 of 5", await p.waitForFunction(() => /^5 of 5 checks pass, and Supreme AdBlock is active/.test(document.getElementById("summary").textContent), null, { timeout: 15000 }).then(() => true, () => false));
  // nothing left this origin
  ok("the page only asked its own server (no other host in the request log)", seen.every((u) => u.startsWith("/")));

  // ---- no extension marker: the page must not credit Supreme AdBlock ----
  const z = await ctx.newPage();
  await z.goto(URL_);
  ok("marker: on, rows reach working first", await settled(z, "hiding", "working"));
  await z.evaluate(() => {
    document.documentElement.removeAttribute("data-tbab-on");
    const st = document.createElement("style"); st.textContent = "#ad-banner-top{display:none!important}"; document.head.appendChild(st);
  });
  ok("no marker + foreign CSS hiding: hiding row → unclear", await settled(z, "hiding", "unclear"));
  ok("no marker: the summary says Supreme AdBlock is not active", await z.waitForFunction(() => /Supreme AdBlock is not active/.test(document.getElementById("summary").textContent), null, { timeout: 15000 }).then(() => true, () => false));

  // ---- protection off: network and hiding show „Not blocked“ ----
  await sw.evaluate(async () => { await chrome.storage.local.set({ enabled: false }); await applyState(); });
  ok("off: rulesets are off", await ready(false));
  seen.length = 0;
  const q = await ctx.newPage();
  await q.goto(URL_);
  const net = await settled(q, "network", "off");
  ok(`off: row network → not blocked (“${await q.locator("#st-network").textContent()}”)`, net && /^Not blocked/.test(await q.locator("#st-network").textContent()));
  const hid = await settled(q, "hiding", "off");
  ok(`off: row hiding → not blocked (“${await q.locator("#st-hiding").textContent()}”)`, hid && /^Not blocked/.test(await q.locator("#st-hiding").textContent()));
  ok("off: the ad-like file reached the server", seen.includes("/test/ad-banner.js"));
  await q.click("#trk-link");
  ok("off: row params → not blocked (the parameters stay in the address)", await settled(q, "params", "off") && /utm_source=demo/.test(q.url()));
  ok("off: the summary no longer says 5 of 5", !/^5 of 5/.test(await q.locator("#summary").textContent()));
  await sw.evaluate(async () => { await chrome.storage.local.set({ enabled: true }); await applyState(); });
} finally {
  await ctx.close();
  srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
