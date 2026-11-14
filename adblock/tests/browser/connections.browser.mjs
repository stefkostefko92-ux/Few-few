// „Връзки на страницата“ с истинското разширение в реален Chromium (Playwright): popup-ът
// показва другите сайтове, от които страницата е заредила нещо, „Блокирай тук“ ги спира на
// този сайт (и само там), блокираното остава в списъка, а Настройки го връщат.
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

let port = 0;
const seen = [];
const srv = http.createServer((q, r) => {
  const host = (q.headers.host || "").split(":")[0];
  seen.push(host + q.url);
  if (q.url.startsWith("/img")) { r.setHeader("content-type", "image/gif"); return r.end(Buffer.from("R0lGODlhAQABAAAAACw=", "base64")); }
  if (q.url.startsWith("/lib.js")) { r.setHeader("content-type", "text/javascript"); return r.end("window.libLoaded = true;"); }
  r.setHeader("content-type", "text/html");
  r.end(`<!doctype html><title>${host}</title>
    <img src="http://img.cdn-other.org:${port}/img1.gif"><img src="http://img.cdn-other.org:${port}/img2.gif">
    <img src="http://px.tracker-third.net:${port}/img-pixel.gif"><script src="http://js.tracker-third.net:${port}/lib.js"></script>
    <img src="http://static.${host.replace(/^www\./, "")}:${port}/img-own.gif">`);
});
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
port = srv.address().port;
const hosts = ["www.news-site.org", "static.news-site.org", "www.shop-site.org", "static.shop-site.org", "img.cdn-other.org", "px.tracker-third.net", "js.tracker-third.net"];

const profile = mkdtempSync(join(tmpdir(), "sa-conn-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium", headless: true,
  args: ["--no-sandbox", `--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, `--host-resolver-rules=${hosts.map((h) => `MAP ${h} 127.0.0.1:${port}`).join(", ")}`],
});
try {
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker", { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2000));
  const id = sw.url().split("/")[2];
  await sw.evaluate(() => chrome.storage.local.set({ review: { never: true } }));
  const site = await ctx.newPage();
  await site.goto(`http://www.news-site.org:${port}/`);
  await site.waitForTimeout(800);
  const popup = async () => {
    const p = await ctx.newPage(); await p.setViewportSize({ width: 320, height: 600 });
    await p.goto(`chrome-extension://${id}/popup/popup.html`); await p.waitForTimeout(200);
    await site.bringToFront(); await p.reload(); await p.waitForTimeout(700);
    await p.click("#logBox summary"); await p.waitForTimeout(700);
    return p;
  };
  const rows = (p) => p.evaluate(() => [...document.querySelectorAll("#connList li")].map((li) => ({
    host: li.querySelector(".host").textContent, n: (li.querySelector(".type") || {}).textContent || "", pressed: li.querySelector("button").getAttribute("aria-pressed") })));

  let p = await popup();
  let r = await rows(p);
  ok(`the popup lists the other sites the page loaded from (${r.map((x) => x.host + x.n).join(", ")})`,
    r.some((x) => x.host === "img.cdn-other.org" && x.n === "×2") && r.some((x) => x.host === "px.tracker-third.net") && r.some((x) => x.host === "js.tracker-third.net"));
  ok("…but not the site's own hosts (static.news-site.org)", !r.some((x) => x.host.endsWith("news-site.org")));
  await p.evaluate(() => [...document.querySelectorAll("#connList li")].find((li) => li.querySelector(".host").textContent === "px.tracker-third.net").querySelector("button").click());
  await p.waitForTimeout(700);
  ok("“Block here” → stored for this site", JSON.stringify((await sw.evaluate(() => chrome.storage.local.get("siteBlocks"))).siteBlocks) === '{"news-site.org":["px.tracker-third.net"]}');
  r = await rows(p);
  ok("…and the button says so (aria-pressed)", r.find((x) => x.host === "px.tracker-third.net").pressed === "true");
  await p.close();

  seen.length = 0;
  await site.reload();
  await site.waitForTimeout(800);
  ok("reloaded: the blocked host is not contacted from this site, the rest still loads",
    !seen.some((s) => s.startsWith("px.tracker-third.net")) && seen.some((s) => s.startsWith("js.tracker-third.net")) && seen.some((s) => s.startsWith("img.cdn-other.org")));
  const other = await ctx.newPage();
  seen.length = 0;
  await other.goto(`http://www.shop-site.org:${port}/`);
  await other.waitForTimeout(800);
  ok("…another site still loads it (blocked on that site only)", seen.some((s) => s.startsWith("px.tracker-third.net")));
  await other.close();

  p = await popup();
  r = await rows(p);
  ok(`the popup keeps the blocked host in the list, marked blocked (${JSON.stringify(r.find((x) => x.host === "px.tracker-third.net"))})`, r.some((x) => x.host === "px.tracker-third.net" && x.pressed === "true"));
  await p.close();

  const opt = await ctx.newPage(); await opt.setViewportSize({ width: 1280, height: 900 });
  await opt.goto(`chrome-extension://${id}/options/options.html`);
  await opt.waitForTimeout(800);
  ok("Settings lists it under “Connections you blocked”", (await opt.textContent("#connBlocks")).includes("px.tracker-third.net") && (await opt.textContent("#connBlocks")).includes("news-site.org"));
  await opt.click("#connBlocks .remove");
  await opt.waitForTimeout(700);
  ok("× unblocks it", JSON.stringify((await sw.evaluate(() => chrome.storage.local.get("siteBlocks"))).siteBlocks) === "{}");
  await opt.close();
  seen.length = 0;
  await site.reload();
  await site.waitForTimeout(800);
  ok("…and the site loads it again", seen.some((s) => s.startsWith("px.tracker-third.net")));
} finally {
  await ctx.close();
  srv.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
