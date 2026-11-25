// Global Privacy Control с истинското разширение в реален Chromium (Playwright): сървърът
// получава Sec-GPC: 1 (рулсетът rules/gpc.json) за страницата И за заявките ѝ, страницата
// вижда navigator.globalPrivacyControl === true (gpc.js), а на разрешен сайт, на пауза и
// при изключен превключвател — нищо от двете.
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

const seen = [];
const srv = http.createServer((q, r) => {
  seen.push({ host: (q.headers.host || "").split(":")[0], url: q.url, gpc: q.headers["sec-gpc"] || null });
  if (q.url.startsWith("/api")) { r.setHeader("content-type", "application/json"); return r.end("{}"); }
  r.setHeader("content-type", "text/html");
  r.end(`<!doctype html><title>g</title><script>
    fetch("/api/x").then(() => { document.title = JSON.stringify({ gpc: navigator.globalPrivacyControl === true }); });
  </script>`);
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const port = srv.address().port;

const profile = mkdtempSync(join(tmpdir(), "sa-gpc-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`,
    `--host-resolver-rules=MAP www.news-site.org 127.0.0.1:${port}, MAP www.allowed-site.org 127.0.0.1:${port}`, "--no-proxy-server"],
});
const visit = async (host) => {
  seen.length = 0;
  const p = await ctx.newPage();
  await p.goto(`http://${host}:${port}/`);
  await p.waitForFunction(() => document.title.startsWith("{"), null, { timeout: 8000 });
  const t = JSON.parse(await p.title());
  await p.close();
  return { page: t.gpc, doc: seen.find((s) => s.url === "/")?.gpc, api: seen.find((s) => s.url.startsWith("/api"))?.gpc };
};
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
  // the page script is registered once the rulesets and lists are read — wait for it, not a fixed delay
  for (let i = 0; i < 50; i++) {
    const ids = await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((c) => c.id));
    if (ids.includes("sa-gpc")) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await new Promise((r) => setTimeout(r, 300));
  const on = await visit("www.news-site.org");
  ok("Sec-GPC: 1 on the page request", on.doc === "1");
  ok("Sec-GPC: 1 on the page's own requests (fetch)", on.api === "1");
  ok("navigator.globalPrivacyControl === true in the page", on.page === true);

  // the options page path: allowlist edits and setFeatures go through the SW (rules + script sync)
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${sw.url().split("/")[2]}/options/options.html`);
  await opt.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ type: "setAllow", host: "allowed-site.org", allow: true }, r)));
  await opt.waitForTimeout(800);
  const allowed = await visit("www.allowed-site.org");
  ok("allowed site: no Sec-GPC header and no navigator flag", allowed.doc === null && allowed.page === false);

  await opt.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ type: "setFeatures", features: { gpc: false } }, r)));
  await opt.waitForTimeout(800);
  const off = await visit("www.news-site.org");
  ok("switch off: neither the header nor the flag", off.doc === null && off.api === null && off.page === false);
  await opt.close();
} finally {
  await ctx.close();
  srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
